/**
 * Verification Routes
 * Public endpoints for certificate verification
 */
const express = require('express');
const router = express.Router();
const { verifyCertificate, getTokenInfo, revokeNFT, reinstateNFT } = require('../services/blockchainService');
const { generateVerificationQR } = require('../services/qrService');
const { authenticateToken } = require('../middleware/authMiddleware');
const supabase = require('../db');

// ==========================================
// IMPORTANT: Specific routes MUST come before /:tokenId
// Otherwise Express will match /:tokenId first!
// ==========================================

/**
 * GET /api/verify/qr/:tokenId
 * Generate and return QR code for a token
 */
router.get('/qr/:tokenId', async (req, res) => {
    try {
        const { tokenId } = req.params;
        const qrCode = await generateVerificationQR(tokenId);
        res.json({ qrCode, tokenId });
    } catch (error) {
        console.error('QR generation error:', error);
        res.status(500).json({ error: 'QR generation failed' });
    }
});

/**
 * POST /api/verify/revoke/:tokenId
 * Admin-only - revoke a certificate
 */
router.post('/revoke/:tokenId', authenticateToken, async (req, res) => {
    try {
        const { tokenId } = req.params;
        
        if (!tokenId || isNaN(tokenId)) {
            return res.status(400).json({ error: 'Invalid token ID' });
        }

        const result = await revokeNFT(parseInt(tokenId));
        
        // Log the revocation
        await supabase.from('activity_logs').insert([{
            action: 'CERTIFICATE_REVOKED',
            details: { tokenId, revokedBy: req.user?.email || 'admin' },
            created_at: new Date().toISOString()
        }]);

        res.json({
            message: 'Certificate revoked successfully',
            ...result
        });

    } catch (error) {
        console.error('Revocation error:', error);
        res.status(500).json({ error: 'Revocation failed', message: error.message });
    }
});

/**
 * POST /api/verify/reinstate/:tokenId
 * Admin-only - reinstate a revoked certificate
 */
router.post('/reinstate/:tokenId', authenticateToken, async (req, res) => {
    try {
        const { tokenId } = req.params;
        
        if (!tokenId || isNaN(tokenId)) {
            return res.status(400).json({ error: 'Invalid token ID' });
        }

        const result = await reinstateNFT(parseInt(tokenId));
        
        // Log the reinstatement
        await supabase.from('activity_logs').insert([{
            action: 'CERTIFICATE_REINSTATED',
            details: { tokenId, reinstatedBy: req.user?.email || 'admin' },
            created_at: new Date().toISOString()
        }]);

        res.json({
            message: 'Certificate reinstated successfully',
            ...result
        });

    } catch (error) {
        console.error('Reinstatement error:', error);
        res.status(500).json({ error: 'Reinstatement failed', message: error.message });
    }
});

/**
 * GET /api/verify/:tokenId
 * Public endpoint - verify a certificate's authenticity
 * NOTE: This MUST be last because it matches any path!
 */
router.get('/:tokenId', async (req, res) => {
    try {
        const { tokenId } = req.params;
        
        if (!tokenId || isNaN(tokenId)) {
            return res.status(400).json({ error: 'Invalid token ID' });
        }

        // Get blockchain verification
        const verification = await verifyCertificate(parseInt(tokenId));
        
        if (!verification.valid && verification.reason === 'Certificate does not exist') {
            return res.status(404).json(verification);
        }

        // Get database info (certificate metadata)
        const { data: nftRecord } = await supabase
            .from('nfts')
            .select(`
                *,
                certificate:certificates (
                    *,
                    student:students (
                        full_name,
                        student_id_number,
                        course_name
                    )
                )
            `)
            .eq('token_id', parseInt(tokenId))
            .single();

        // Generate QR code
        const qrCode = await generateVerificationQR(tokenId);

        res.json({
            ...verification,
            certificate: nftRecord?.certificate || null,
            qrCode: qrCode,
            verifiedAt: new Date().toISOString()
        });

    } catch (error) {
        console.error('Verification error:', error);
        res.status(500).json({ error: 'Verification failed', message: error.message });
    }
});

module.exports = router;

