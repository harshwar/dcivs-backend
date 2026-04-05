/**
 * Two-Factor Authentication Controller (TOTP)
 * Handles 2FA setup, verification, validation during login, and disabling.
 * Uses speakeasy for TOTP and qrcode for QR generation.
 * Supports both students (students table) and admins (admins table).
 */
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const supabase = require('../db');
const { sendSecurityAlertEmail } = require('../services/emailService');

const JWT_SECRET = process.env.JWT_SECRET || 'change_this_secret';

/**
 * Helper: get the right table and password field based on role.
 */
function getTableConfig(role) {
  if (role === 'admin' || role === 'super_admin') {
    return { table: 'admins', passwordField: 'password_hash' };
  }
  return { table: 'students', passwordField: 'password' };
}

/**
 * POST /api/auth/2fa/setup
 * Generate TOTP secret and QR code for initial setup.
 * Requires: JWT auth (logged in)
 */
async function setup2FA(req, res) {
  try {
    const userId = req.user.id;
    const { table } = getTableConfig(req.user.role);

    const { data: user } = await supabase
      .from(table)
      .select('email, totp_enabled')
      .eq('id', userId)
      .single();

    if (!user) return res.status(404).json({ error: 'User not found.' });
    if (user.totp_enabled) return res.status(400).json({ error: '2FA is already enabled.' });

    // Generate secret
    const secret = speakeasy.generateSecret({
      name: `DCIVS:${user.email}`,
      issuer: 'DCIVS',
      length: 20
    });

    // Store secret temporarily (not enabled yet — will be saved on verify)
    await supabase
      .from(table)
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
 * Verify the first TOTP code and enable 2FA.
 * Body: { token: "123456" }
 * Requires: JWT auth
 */
async function verifySetup2FA(req, res) {
  try {
    const userId = req.user.id;
    const { token } = req.body;
    const { table } = getTableConfig(req.user.role);

    if (!token) return res.status(400).json({ error: 'Verification code is required.' });

    const { data: user } = await supabase
      .from(table)
      .select('email, totp_secret, totp_enabled')
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
      window: 1
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
      .from(table)
      .update({
        totp_enabled: true,
        recovery_codes: JSON.stringify(recoveryCodes)
      })
      .eq('id', userId);

    // Send Security Alert
    try {
      await sendSecurityAlertEmail({
        email: user.email,
        full_name: user.full_name || user.username || 'User',
        action: 'Two-Factor Authentication Enabled',
        details: 'TOTP-based 2FA has been successfully configured for your account.'
      });
    } catch (emailErr) {
      console.warn('[Security Alert] Failed to send email:', emailErr.message);
    }

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
 * Validate TOTP code during login (after password success).
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

    // Determine which table to check based on role in the temp token
    const { table } = getTableConfig(decoded.role);

    const selectFields = table === 'admins'
      ? 'id, email, username, totp_secret, recovery_codes, role'
      : 'id, email, full_name, totp_secret, recovery_codes, wallet_pin_set';

    const { data: user } = await supabase
      .from(table)
      .select(selectFields)
      .eq('id', decoded.id)
      .single();

    if (!user) return res.status(404).json({ error: 'User not found.' });

    let valid = false;

    if (code) {
      valid = speakeasy.totp.verify({
        secret: user.totp_secret,
        encoding: 'base32',
        token: code,
        window: 1
      });
    } else if (recoveryCode) {
      const codes = JSON.parse(user.recovery_codes || '[]');
      const upperCode = recoveryCode.toUpperCase().trim();
      const idx = codes.indexOf(upperCode);

      if (idx !== -1) {
        valid = true;
        codes.splice(idx, 1);
        await supabase
          .from(table)
          .update({ recovery_codes: JSON.stringify(codes) })
          .eq('id', user.id);
      }
    }

    if (!valid) {
      return res.status(401).json({ error: 'Invalid verification code.' });
    }

    // Issue real JWT — include role for admins
    const tokenPayload = table === 'admins'
      ? { id: user.id, email: user.email, role: user.role || 'admin' }
      : { id: user.id, email: user.email, role: 'student' };

    const realToken = jwt.sign(tokenPayload, JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '7d'
    });

    // Log activity
    try {
      const { logActivity } = require('../services/activityLogger');
      const logPayload = {
        action: 'LOGIN_2FA',
        details: recoveryCode ? 'Login via 2FA recovery code' : 'Login via 2FA TOTP code',
        req
      };
      if (table === 'admins') logPayload.adminId = user.id;
      else logPayload.userId = user.id;
      logActivity(logPayload);
    } catch (e) { /* non-critical */ }

    if (table === 'admins') {
      return res.json({
        message: 'Login successful.',
        token: realToken,
        user: {
          id: user.id,
          email: user.email,
          full_name: user.username || 'Admin',
          role: user.role || 'admin'
        }
      });
    }

    // Student path — check passkeys
    const { count: passkeyCount } = await supabase
      .from('passkeys')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id);

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
 * Disable 2FA (requires current password).
 * Body: { password }
 * Requires: JWT auth
 */
async function disable2FA(req, res) {
  try {
    const userId = req.user.id;
    const { password } = req.body;
    const { table, passwordField } = getTableConfig(req.user.role);

    if (!password) return res.status(400).json({ error: 'Password is required to disable 2FA.' });

    const { data: user } = await supabase
      .from(table)
      .select(`id, email, ${passwordField}, totp_enabled`)
      .eq('id', userId)
      .single();

    if (!user) return res.status(404).json({ error: 'User not found.' });
    if (!user.totp_enabled) return res.status(400).json({ error: '2FA is not enabled.' });

    // Verify password
    const isMatch = await bcrypt.compare(password, user[passwordField]);
    if (!isMatch) return res.status(401).json({ error: 'Incorrect password.' });

    // Disable 2FA
    await supabase
      .from(table)
      .update({
        totp_enabled: false,
        totp_secret: null,
        recovery_codes: null
      })
      .eq('id', userId);

    // Send Security Alert
    try {
      await sendSecurityAlertEmail({
        email: user.email,
        full_name: user.full_name || user.username || 'User',
        action: 'Two-Factor Authentication Disabled',
        details: 'Two-factor authentication has been deactivated for your account.'
      });
    } catch (emailErr) {
      console.warn('[Security Alert] Failed to send email:', emailErr.message);
    }

    res.json({ message: '2FA has been disabled.' });

  } catch (error) {
    console.error('2FA disable error:', error);
    res.status(500).json({ error: 'Failed to disable 2FA.' });
  }
}

module.exports = { setup2FA, verifySetup2FA, validate2FA, disable2FA };
