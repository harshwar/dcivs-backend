const express = require('express');
const router = express.Router();
const multer = require('multer');
const { issueNFT, getWalletInfo } = require('../controllers/nftController');
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

// POST /api/nft/issue
// Authenticate token + admin role + rate limit minting (10/hour) + file upload
router.post('/issue', authenticateToken, requireAdmin, mintLimiter, upload.single('file'), issueNFT);

module.exports = router;

