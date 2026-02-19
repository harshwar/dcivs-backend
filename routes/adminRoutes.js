const express = require('express');
const router = express.Router();
const supabase = require('../db');
const { authenticateToken, requireAdmin } = require('../middleware/authMiddleware');

// Middleware to ensure user is an admin
// (requireAdmin removed - now imported from shared middleware)

/**
 * GET /api/admin/logs
 * Fetch recent activity logs
 */
router.get('/logs', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { data: logs, error } = await supabase
            .from('activity_logs')
            .select(`
                *,
                students (email, full_name),
                admins (email, username)
            `)
            .order('timestamp', { ascending: false })
            .limit(100);

        if (error) throw error;

        // Transform data for frontend
        const formattedLogs = logs.map(log => ({
            id: log.id,
            action: log.action,
            details: log.details,
            ip_address: log.ip_address,
            timestamp: log.timestamp,
            user: log.students ? `${log.students.full_name} (${log.students.email})` : 
                  log.admins ? `Admin: ${log.admins.username}` : 'System/Guest',
            auth_method: log.action.includes('PASSKEY') ? 'passkey' :
                         log.action === 'LOGIN' ? 'password' : null
        }));

        res.json(formattedLogs);
    } catch (err) {
        console.error('Fetch logs error:', err);
        res.status(500).json({ error: 'Failed to fetch logs' });
    }
});

module.exports = router;
