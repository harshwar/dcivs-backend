const express = require('express');
const router = express.Router();
const multer = require('multer');
const { analyzeCertificate, verifyDocument } = require('../controllers/aiController');
const { authenticateToken, requireAdmin } = require('../middleware/authMiddleware');

// Configure multer for temporary uploads to analyze
const upload = multer({ dest: 'uploads/temp/' });

// POST /api/ai/analyze-certificate
router.post('/analyze-certificate', authenticateToken, requireAdmin, upload.single('file'), analyzeCertificate);

// POST /api/ai/verify-document
router.post('/verify-document', authenticateToken, requireAdmin, upload.single('file'), verifyDocument);

module.exports = router;
