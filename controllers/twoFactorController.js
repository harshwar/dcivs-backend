/**
 * Two-Factor Authentication Controller (TOTP)
 * Handles 2FA setup, verification, validation during login, and disabling.
 * Uses speakeasy for TOTP and qrcode for QR generation.
 */
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const supabase = require('../db');

const JWT_SECRET = process.env.JWT_SECRET || 'change_this_secret';

/**
 * POST /api/auth/2fa/setup
 * Generate TOTP secret and QR code for initial setup
 * Requires: JWT auth (logged in)
 */
async function setup2FA(req, res) {
  try {
    const userId = req.user.id;

    // Check if 2FA is already enabled
    const { data: user } = await supabase
      .from('students')
      .select('email, totp_enabled')
      .eq('id', userId)
      .single();

    if (!user) return res.status(404).json({ error: 'User not found.' });
    if (user.totp_enabled) return res.status(400).json({ error: '2FA is already enabled.' });

    // Generate secret
    const secret = speakeasy.generateSecret({
      name: `UniNFT:${user.email}`,
      issuer: 'University NFT System',
      length: 20
    });

    // Store secret temporarily (not enabled yet — will be saved on verify)
    await supabase
      .from('students')
      .update({ totp_secret: secret.base32 })
      .eq('id', userId);

    // Generate QR code data URL
    const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url);

    res.json({
      secret: secret.base32,
      qrCode: qrCodeUrl,
      message: 'Scan the QR code with your authenticator app, then verify with a code.'
    });

  } catch (error) {
    console.error('2FA setup error:', error);
    res.status(500).json({ error: 'Failed to set up 2FA.' });
  }
}

/**
 * POST /api/auth/2fa/verify-setup
 * Verify the first TOTP code and enable 2FA
 * Body: { token: "123456" }
 * Requires: JWT auth
 */
async function verifySetup2FA(req, res) {
  try {
    const userId = req.user.id;
    const { token } = req.body;

    if (!token) return res.status(400).json({ error: 'Verification code is required.' });

    // Get stored secret
    const { data: user } = await supabase
      .from('students')
      .select('totp_secret, totp_enabled')
      .eq('id', userId)
      .single();

    if (!user) return res.status(404).json({ error: 'User not found.' });
    if (user.totp_enabled) return res.status(400).json({ error: '2FA is already enabled.' });
    if (!user.totp_secret) return res.status(400).json({ error: 'Please run 2FA setup first.' });

    // Verify the token
    const verified = speakeasy.totp.verify({
      secret: user.totp_secret,
      encoding: 'base32',
      token: token,
      window: 1 // Allow 1 step tolerance (30 sec before/after)
    });

    if (!verified) {
      return res.status(400).json({ error: 'Invalid code. Please try again.' });
    }

    // Generate recovery codes
    const recoveryCodes = [];
    for (let i = 0; i < 8; i++) {
      recoveryCodes.push(crypto.randomBytes(4).toString('hex').toUpperCase());
    }

    // Enable 2FA and save recovery codes
    await supabase
      .from('students')
      .update({
        totp_enabled: true,
        recovery_codes: JSON.stringify(recoveryCodes)
      })
      .eq('id', userId);

    // Log activity
    try {
      const { logActivity } = require('../services/activityLogger');
      logActivity({
        userId,
        action: 'ENABLE_2FA',
        details: 'Two-factor authentication enabled',
        req
      });
    } catch (e) { /* non-critical */ }

    res.json({
      message: '2FA has been enabled successfully.',
      recoveryCodes,
      warning: 'Save these recovery codes in a safe place. Each can only be used once.'
    });

  } catch (error) {
    console.error('2FA verify setup error:', error);
    res.status(500).json({ error: 'Failed to verify 2FA setup.' });
  }
}

/**
 * POST /api/auth/2fa/validate
 * Validate TOTP code during login (after password success)
 * Body: { tempToken, code } OR { tempToken, recoveryCode }
 */
async function validate2FA(req, res) {
  try {
    const { tempToken, code, recoveryCode } = req.body;

    if (!tempToken) return res.status(400).json({ error: 'Temp token is required.' });
    if (!code && !recoveryCode) return res.status(400).json({ error: 'Code or recovery code is required.' });

    // Decode temp token
    let decoded;
    try {
      decoded = jwt.verify(tempToken, JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ error: 'Session expired. Please login again.' });
    }

    if (!decoded.requires2FA) {
      return res.status(400).json({ error: 'Invalid token type.' });
    }

    // Get user with 2FA data
    const { data: user } = await supabase
      .from('students')
      .select('id, email, full_name, totp_secret, recovery_codes, wallet_pin_set')
      .eq('id', decoded.id)
      .single();

    if (!user) return res.status(404).json({ error: 'User not found.' });

    let valid = false;

    if (code) {
      // Verify TOTP code
      valid = speakeasy.totp.verify({
        secret: user.totp_secret,
        encoding: 'base32',
        token: code,
        window: 1
      });
    } else if (recoveryCode) {
      // Verify recovery code
      const codes = JSON.parse(user.recovery_codes || '[]');
      const upperCode = recoveryCode.toUpperCase().trim();
      const idx = codes.indexOf(upperCode);

      if (idx !== -1) {
        valid = true;
        // Remove used recovery code
        codes.splice(idx, 1);
        await supabase
          .from('students')
          .update({ recovery_codes: JSON.stringify(codes) })
          .eq('id', user.id);
      }
    }

    if (!valid) {
      return res.status(401).json({ error: 'Invalid verification code.' });
    }

    // Issue real JWT
    const realToken = jwt.sign(
      { id: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    // Log activity
    try {
      const { logActivity } = require('../services/activityLogger');
      logActivity({
        userId: user.id,
        action: 'LOGIN_2FA',
        details: recoveryCode ? 'Login via 2FA recovery code' : 'Login via 2FA TOTP code',
        req
      });
    } catch (e) { /* non-critical */ }

    // Check if user has any passkeys registered
    const { count: passkeyCount } = await supabase
      .from('passkeys')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id);

    // Get wallet_pin_set status (already selected in query below, but let's make sure it is in the select)
    // Wait, let's update the select on line 163 first.

    res.json({
      message: 'Login successful.',
      token: realToken,
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        wallet_pin_set: user.wallet_pin_set,
        has_passkeys: (passkeyCount || 0) > 0
      }
    });

  } catch (error) {
    console.error('2FA validate error:', error);
    res.status(500).json({ error: 'Failed to validate 2FA.' });
  }
}

/**
 * POST /api/auth/2fa/disable
 * Disable 2FA (requires current password)
 * Body: { password }
 * Requires: JWT auth
 */
async function disable2FA(req, res) {
  try {
    const userId = req.user.id;
    const { password } = req.body;

    if (!password) return res.status(400).json({ error: 'Password is required to disable 2FA.' });

    // Get user
    const { data: user } = await supabase
      .from('students')
      .select('id, password, totp_enabled')
      .eq('id', userId)
      .single();

    if (!user) return res.status(404).json({ error: 'User not found.' });
    if (!user.totp_enabled) return res.status(400).json({ error: '2FA is not enabled.' });

    // Verify password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ error: 'Incorrect password.' });

    // Disable 2FA
    await supabase
      .from('students')
      .update({
        totp_enabled: false,
        totp_secret: null,
        recovery_codes: null
      })
      .eq('id', userId);

    // Log activity
    try {
      const { logActivity } = require('../services/activityLogger');
      logActivity({
        userId,
        action: 'DISABLE_2FA',
        details: 'Two-factor authentication disabled',
        req
      });
    } catch (e) { /* non-critical */ }

    res.json({ message: '2FA has been disabled.' });

  } catch (error) {
    console.error('2FA disable error:', error);
    res.status(500).json({ error: 'Failed to disable 2FA.' });
  }
}

module.exports = { setup2FA, verifySetup2FA, validate2FA, disable2FA };
