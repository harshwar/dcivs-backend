const express = require('express');
const router = express.Router();
const multer = require('multer');
const { issueNFT } = require('../controllers/nftController');
const { authenticateToken } = require('../middleware/authMiddleware');
const { mintLimiter } = require('../middleware/rateLimiter');

// Configure multer with file size limit (5MB)
const upload = multer({ 
    dest: 'uploads/',
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// POST /api/nft/issue
// Authenticate token + rate limit minting (10/hour) + file upload
router.post('/issue', authenticateToken, mintLimiter, upload.single('file'), issueNFT);

module.exports = router;

