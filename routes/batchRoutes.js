/**
 * Batch Operations Routes
 * Endpoints for CSV-based bulk operations
 */
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { authenticateToken } = require('../middleware/authMiddleware');
const {
    batchRegisterStudents,
    startBatchRegister,
    getStudentTemplate
} = require('../controllers/batchController');
const { requireAdmin } = require('../middleware/authMiddleware');

// Configure multer for CSV uploads
const upload = multer({
    dest: 'uploads/',
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
    fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        if (ext !== '.csv') {
            return cb(new Error('Only CSV files are allowed'));
        }
        cb(null, true);
    }
});

// --- TEMPLATE DOWNLOADS (No auth required for templates) ---
// GET /api/batch/template/students - Download student registration CSV template
router.get('/template/students', getStudentTemplate);

// --- BATCH OPERATIONS (Admin only) ---
// POST /api/batch/start-register (NEW — Async polling version)
router.post('/start-register', authenticateToken, requireAdmin, upload.single('file'), startBatchRegister);

// POST /api/batch/students (LEGACY — Synchronous version)
router.post('/students', authenticateToken, requireAdmin, upload.single('file'), batchRegisterStudents);

module.exports = router;
