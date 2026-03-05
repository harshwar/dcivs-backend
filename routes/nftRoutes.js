const express = require('express');
const router = express.Router();
const multer = require('multer');
const { issueNFT, startIssuance, getWalletInfo, startBatchIssuance } = require('../controllers/nftController');
const { authenticateToken, requireAdmin } = require('../middleware/authMiddleware');
const { mintLimiter } = require('../middleware/rateLimiter');

// Configure multer with file size limit (100MB for batch processing zip files)
const upload = multer({ 
    dest: 'uploads/',
    limits: { fileSize: 100 * 1024 * 1024 } // 100MB limit
});

// GET /api/nft/wallet-info
// Returns admin's ETH balance and estimated gas for confirmation screens
router.get('/wallet-info', authenticateToken, requireAdmin, getWalletInfo);

// POST /api/nft/start-issue (NEW — Async polling version)
// Returns { jobId } immediately, runs single issuance pipeline in background
router.post('/start-issue', authenticateToken, requireAdmin, mintLimiter, upload.single('file'), startIssuance);

// POST /api/nft/start-batch-issue (NEW — Async polling version for batch operations)
router.post('/start-batch-issue', authenticateToken, requireAdmin, upload.single('file'), startBatchIssuance);

// POST /api/nft/issue (LEGACY — Synchronous version)
// Kept for backward compatibility with older integrations
router.post('/issue', authenticateToken, requireAdmin, mintLimiter, upload.single('file'), issueNFT);

module.exports = router;

