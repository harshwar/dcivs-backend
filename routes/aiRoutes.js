const express = require('express');
const router = express.Router();
const multer = require('multer');
const { analyzeCertificate, verifyDocument, startVerification } = require('../controllers/aiController');
const { authenticateToken, requireAdmin } = require('../middleware/authMiddleware');

// Configure multer for temporary uploads to analyze
const upload = multer({ dest: 'uploads/temp/' });

// POST /api/ai/analyze-certificate
router.post('/analyze-certificate', authenticateToken, requireAdmin, upload.single('file'), analyzeCertificate);

// POST /api/ai/start-verify (NEW — Async polling version)
// Returns { jobId } immediately, runs OpenCV→OCR→Gemini in background
router.post('/start-verify', authenticateToken, requireAdmin, upload.single('file'), startVerification);

// POST /api/ai/verify-document (LEGACY — Synchronous version)
router.post('/verify-document', authenticateToken, requireAdmin, upload.single('file'), verifyDocument);

module.exports = router;

