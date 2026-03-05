const express = require('express');
const router = express.Router();
const multer = require('multer');
const { issueNFT, startIssuance, getWalletInfo } = require('../controllers/nftController');
const { authenticateToken, requireAdmin } = require('../middleware/authMiddleware');
const { mintLimiter } = require('../middleware/rateLimiter');

// Configure multer with file size limit (5MB)
const upload = multer({ 
    dest: 'uploads/',
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// GET /api/nft/wallet-info
// Returns admin's ETH balance and estimated gas for confirmation screens
router.get('/wallet-info', authenticateToken, requireAdmin, getWalletInfo);

// POST /api/nft/start-issue (NEW — Async polling version)
// Returns { jobId } immediately, runs pipeline in background
// Frontend polls GET /api/job-status/:jobId for progress
router.post('/start-issue', authenticateToken, requireAdmin, mintLimiter, upload.single('file'), startIssuance);

// POST /api/nft/issue (LEGACY — Synchronous version)
// Kept for backward compatibility with batch operations
router.post('/issue', authenticateToken, requireAdmin, mintLimiter, upload.single('file'), issueNFT);

module.exports = router;

