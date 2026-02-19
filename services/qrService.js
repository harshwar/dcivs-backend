/**
 * QR Code Generation Service
 * Generates QR codes for certificate verification
 */
const QRCode = require('qrcode');

// Base URL for the verification page (frontend)
const VERIFICATION_BASE_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

/**
 * Generate a QR code as base64 data URL
 * @param {string|number} tokenId - The token ID to encode
 * @returns {Promise<string>} Base64 data URL of the QR code
 */
async function generateVerificationQR(tokenId) {
    const verificationUrl = `${VERIFICATION_BASE_URL}/verify/${tokenId}`;
    
    const options = {
        errorCorrectionLevel: 'H', // High error correction
        type: 'image/png',
        quality: 0.92,
        margin: 2,
        color: {
            dark: '#000000',
            light: '#FFFFFF'
        },
        width: 256
    };

    try {
        const dataUrl = await QRCode.toDataURL(verificationUrl, options);
        return dataUrl;
    } catch (error) {
        console.error('QR Code generation error:', error);
        throw error;
    }
}

/**
 * Generate QR code as buffer (for file saving)
 * @param {string|number} tokenId - The token ID to encode
 * @returns {Promise<Buffer>} PNG buffer of the QR code
 */
async function generateVerificationQRBuffer(tokenId) {
    const verificationUrl = `${VERIFICATION_BASE_URL}/verify/${tokenId}`;
    
    try {
        const buffer = await QRCode.toBuffer(verificationUrl, {
            errorCorrectionLevel: 'H',
            type: 'png',
            width: 256,
            margin: 2
        });
        return buffer;
    } catch (error) {
        console.error('QR Code buffer generation error:', error);
        throw error;
    }
}

module.exports = {
    generateVerificationQR,
    generateVerificationQRBuffer
};
