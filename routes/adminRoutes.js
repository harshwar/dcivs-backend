const express = require('express');
const router = express.Router();
const supabase = require('../db');
const { authenticateToken, requireAdmin } = require('../middleware/authMiddleware');
const { 
    getPendingStudents, 
    approveStudent, 
    rejectStudent,
    bulkApproveStudents,
    updateStudentDetails,
    reissueWallets
} = require('../controllers/adminController');

/**
 * GET /api/admin/pending-students
 * Fetch students waiting for identity approval
 */
router.get('/pending-students', authenticateToken, requireAdmin, getPendingStudents);

/**
 * POST /api/admin/approve-student/:id
 * Admin manual identity lock-in
 */
router.post('/approve-student/:id', authenticateToken, requireAdmin, approveStudent);

/**
 * POST /api/admin/reject-student/:id
 * Admin registration rejection
 */
router.post('/reject-student/:id', authenticateToken, requireAdmin, rejectStudent);

/**
 * PUT /api/admin/students/:id
 * Update student profile information
 */
router.put('/students/:id', authenticateToken, requireAdmin, updateStudentDetails);

/**
 * POST /api/admin/bulk-approve
 * Approve multiple students at once
 */
router.post('/bulk-approve', authenticateToken, requireAdmin, bulkApproveStudents);

/**
 * POST /api/admin/reissue-wallets
 * Reissue wallets for security upgrade (test mode: single account)
 */
router.post('/reissue-wallets', authenticateToken, requireAdmin, reissueWallets);

/**
 * GET /api/admin/last-login/:userId
 * Returns the last login timestamp for a student from activity logs
 */
router.get('/last-login/:userId', authenticateToken, async (req, res) => {
    try {
        const { userId } = req.params;
        const { data, error } = await supabase
            .from('activity_logs')
            .select('timestamp')
            .eq('user_id', userId)
            .in('action', ['LOGIN_STUDENT', 'LOGIN_PASSKEY'])
            .order('timestamp', { ascending: false })
            .limit(1)
            .maybeSingle();
        if (error) throw error;
        res.json({ last_login: data?.timestamp || null });
    } catch (err) {
        console.error('Last login fetch error:', err);
        res.status(500).json({ error: 'Failed to fetch last login' });
    }
});

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
