const supabase = require('../db');

/**
 * Log user activity to the database
 * @param {Object} params - Log parameters
 * @param {number|null} params.userId - Student ID (optional)
 * @param {number|null} params.adminId - Admin ID (optional)
 * @param {string} params.action - Short action name (e.g., 'LOGIN', 'MINT_CERT')
 * @param {string} params.details - Detailed description or JSON string
 * @param {Object} req - Express request object (to extract IP)
 */
async function logActivity({ userId = null, adminId = null, action, details, req }) {
    try {
        // Robust IP extraction
        // 1. Check 'x-forwarded-for' header (standard for proxies/load balancers)
        // 2. Check 'x-real-ip' (common alternative)
        // 3. Fallback to socket remote address (direct connection)
        let ipAddress = req.headers['x-forwarded-for'] || 
                        req.headers['x-real-ip'] || 
                        req.socket.remoteAddress || 
                        'Unknown';

        // If multiple IPs in x-forwarded-for (e.g. "client, proxy1, proxy2"), take the first one
        if (ipAddress.includes(',')) {
            ipAddress = ipAddress.split(',')[0].trim();
        }

        // Normalize IPv6 localhost
        if (ipAddress === '::1') {
            ipAddress = '127.0.0.1';
        }

        const { error } = await supabase
            .from('activity_logs')
            .insert([{
                user_id: userId,
                admin_id: adminId,
                action: action,
                details: typeof details === 'object' ? JSON.stringify(details) : details,
                ip_address: ipAddress,
                timestamp: new Date().toISOString()
            }]);

        if (error) {
            console.error('Failed to write activity log:', error.message);
        }
    } catch (err) {
        console.error('Activity logging sensitive error:', err.message);
        // Don't crash the main app flow for a logging error
    }
}

module.exports = { logActivity };
