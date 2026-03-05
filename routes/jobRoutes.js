const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/authMiddleware');
const { getJobStatus } = require('../services/jobService');

/**
 * GET /api/job-status/:jobId
 * Lightweight polling endpoint — frontend calls this every ~2.5s.
 * Returns the current step, percentage, status, and result of a background job.
 */
router.get('/:jobId', authenticateToken, async (req, res) => {
    try {
        const { jobId } = req.params;

        if (!jobId) {
            return res.status(400).json({ error: 'Job ID is required.' });
        }

        const job = await getJobStatus(jobId);

        if (!job) {
            return res.status(404).json({ error: 'Job not found.' });
        }

        res.json(job);
    } catch (error) {
        console.error('[Job Status] Error:', error);
        res.status(500).json({ error: 'Failed to fetch job status.' });
    }
});

module.exports = router;
