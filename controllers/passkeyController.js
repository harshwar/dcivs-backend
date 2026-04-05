/**
 * Passkey (WebAuthn) Controller
 * Handles passkey registration, login, listing, and deletion endpoints.
 * Supports both students (user_id) and admins (admin_id) in the passkeys table.
 */
const supabase = require('../db');
const jwt = require('jsonwebtoken');
const passkeyService = require('../services/passkeyService');
const { sendSecurityAlertEmail } = require('../services/emailService');

const JWT_SECRET = process.env.JWT_SECRET || 'change_this_secret';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

/**
 * Helper: Is the JWT user an admin?
 */
function isAdmin(req) {
  return req.user.role === 'admin' || req.user.role === 'super_admin';
}

// ============================================
// REGISTRATION FLOW
// ============================================

/**
 * POST /api/auth/passkey/register-options
 * Requires: JWT auth
 */
async function registerOptions(req, res) {
  try {
    const userId = req.user.id;
    const admin = isAdmin(req);
    const table = admin ? 'admins' : 'students';
    const nameField = admin ? 'username' : 'full_name';
    const idField = admin ? 'admin_id' : 'user_id';

    // Get user info
    const { data: user, error: userError } = await supabase
      .from(table)
      .select(`id, email, ${nameField}`)
      .eq('id', userId)
      .single();

    if (userError || !user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    // Normalise to { id, email, full_name } for passkeyService
    const userObj = {
      id: user.id,
      email: user.email,
      full_name: user[nameField] || (admin ? 'Admin' : 'Student')
    };

    // Get existing passkeys to exclude them
    const { data: existingKeys, error: keysError } = await supabase
      .from('passkeys')
      .select('id, transports')
      .eq(idField, userId);

    if (keysError) throw keysError;

    const options = await passkeyService.getRegistrationOptions(userObj, existingKeys || []);
    res.json(options);

  } catch (error) {
    console.error('Passkey register-options error:', error);
    res.status(500).json({ error: 'Failed to generate registration options.' });
  }
}

/**
 * POST /api/auth/passkey/register-verify
 * Requires: JWT auth
 * Body: { attestationResponse, friendlyName }
 */
async function registerVerify(req, res) {
  try {
    const userId = req.user.id;
    const admin = isAdmin(req);
    const table = admin ? 'admins' : 'students';
    const nameField = admin ? 'username' : 'full_name';
    const idField = admin ? 'admin_id' : 'user_id';

    const { attestationResponse, friendlyName } = req.body;

    if (!attestationResponse) {
      return res.status(400).json({ error: 'Attestation response is required.' });
    }

    const origin = req.get('origin') || (req.get('referer') ? new URL(req.get('referer')).origin : undefined);
    const verification = await passkeyService.verifyRegistration(attestationResponse, userId, origin);

    if (!verification.verified || !verification.registrationInfo) {
      return res.status(400).json({ error: 'Passkey verification failed.' });
    }

    const { credential } = verification.registrationInfo;
    const credentialId = credential.id;
    const publicKeyBase64 = Buffer.from(credential.publicKey).toString('base64');

    // Build the insert row — set user_id or admin_id based on role
    const insertRow = {
      id: credentialId,
      public_key: publicKeyBase64,
      counter: credential.counter || 0,
      device_type: credential.deviceType || 'singleDevice',
      backed_up: credential.backedUp || false,
      transports: credential.transports || [],
      friendly_name: friendlyName || 'My Passkey',
    };
    insertRow[idField] = userId;
    // Explicitly null out the other ID field
    insertRow[admin ? 'user_id' : 'admin_id'] = null;

    const { error: insertError } = await supabase.from('passkeys').insert([insertRow]);

    if (insertError) {
      console.error('Passkey insert error:', insertError);
      throw new Error('Failed to store passkey.');
    }

    // Send Security Alert
    try {
      const { data: user } = await supabase
        .from(table)
        .select(`email, ${nameField}`)
        .eq('id', userId)
        .single();

      if (user) {
        await sendSecurityAlertEmail({
          email: user.email,
          full_name: user[nameField] || 'User',
          action: 'New Passkey Added',
          details: `A new WebAuthn passkey ("${friendlyName || 'My Passkey'}") was successfully registered for your account.`
        });
      }
    } catch (emailErr) {
      console.warn('[Security Alert] Failed to send email:', emailErr.message);
    }

    res.status(201).json({
      message: 'Passkey registered successfully.',
      credentialId,
    });

  } catch (error) {
    console.error('Passkey register-verify error:', error);
    res.status(500).json({ error: error.message || 'Failed to verify passkey registration.' });
  }
}

// ============================================
// AUTHENTICATION (LOGIN) FLOW
// ============================================

/**
 * POST /api/auth/passkey/login-options
 * Public endpoint — discoverable credentials.
 */
async function loginOptions(req, res) {
  try {
    const options = await passkeyService.getAuthenticationOptions('_discoverable_', []);
    res.json(options);
  } catch (error) {
    console.error('Passkey login-options error:', error);
    res.status(500).json({ error: 'Failed to generate authentication options.' });
  }
}

/**
 * POST /api/auth/passkey/login-verify
 * Public endpoint — looks up user from credential, then resolves admin vs student.
 * Body: { assertionResponse }
 */
async function loginVerify(req, res) {
  try {
    const { assertionResponse } = req.body;

    if (!assertionResponse) {
      return res.status(400).json({ error: 'Assertion response is required.' });
    }

    const credentialId = assertionResponse.id;

    const { data: credential, error: credError } = await supabase
      .from('passkeys')
      .select('id, user_id, admin_id, public_key, counter, transports')
      .eq('id', credentialId)
      .single();

    if (credError || !credential) {
      return res.status(401).json({ error: 'Passkey not recognized.' });
    }

    // Determine if this is an admin passkey or student passkey
    const credIsAdmin = !!credential.admin_id;

    // Resolve the user from the right table
    let user;
    if (credIsAdmin) {
      const { data, error } = await supabase
        .from('admins')
        .select('id, email, username, role, totp_enabled')
        .eq('id', credential.admin_id)
        .single();
      if (error || !data) return res.status(401).json({ error: 'Admin account not found.' });
      user = { ...data, full_name: data.username || 'Admin', _isAdmin: true };
    } else {
      const { data, error } = await supabase
        .from('students')
        .select('id, email, full_name, wallet_pin_set, totp_enabled')
        .eq('id', credential.user_id)
        .single();
      if (error || !data) return res.status(401).json({ error: 'Student account not found.' });
      user = { ...data, _isAdmin: false };
    }

    // Convert stored base64 public key back to Uint8Array
    const publicKeyBuffer = Buffer.from(credential.public_key, 'base64');
    const dbCredential = {
      id: credential.id,
      public_key: new Uint8Array(publicKeyBuffer),
      counter: credential.counter,
      transports: credential.transports || [],
    };

    const origin = req.get('origin') || (req.get('referer') ? new URL(req.get('referer')).origin : undefined);
    const verification = await passkeyService.verifyAuthentication(
      assertionResponse,
      dbCredential,
      '_discoverable_',
      origin
    );

    if (!verification.verified) {
      return res.status(401).json({ error: 'Passkey authentication failed.' });
    }

    // Update counter
    const { authenticationInfo } = verification;
    await supabase
      .from('passkeys')
      .update({ counter: authenticationInfo.newCounter })
      .eq('id', credentialId);

    // 2FA check
    if (user.totp_enabled) {
      const tokenPayload = credIsAdmin
        ? { id: user.id, email: user.email, role: user.role || 'admin', requires2FA: true }
        : { id: user.id, email: user.email, requires2FA: true };

      const tempToken = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: '5m' });
      return res.json({
        requires2FA: true,
        tempToken,
        message: 'Passkey verified. Please enter your 2FA code.',
      });
    }

    if (credIsAdmin) {
      // Admin passkey login
      const token = signToken({ id: user.id, email: user.email, role: user.role || 'admin' });

      try {
        const { logActivity } = require('../services/activityLogger');
        logActivity({ adminId: user.id, action: 'LOGIN_PASSKEY', details: 'Admin logged in via passkey', req });
      } catch (e) { /* non-critical */ }

      return res.json({
        message: 'Login successful.',
        token,
        user: {
          id: user.id,
          email: user.email,
          full_name: user.username || 'Admin',
          role: user.role || 'admin'
        }
      });
    }

    // Student passkey login
    const token = signToken({ id: user.id, email: user.email, role: 'student' });

    try {
      const { logActivity } = require('../services/activityLogger');
      logActivity({ userId: user.id, action: 'LOGIN_PASSKEY', details: 'Student logged in via passkey', req });
    } catch (e) { /* non-critical */ }

    res.json({
      message: 'Login successful.',
      token,
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        wallet_pin_set: user.wallet_pin_set,
        has_passkeys: true
      },
    });

  } catch (error) {
    console.error('Passkey login-verify error:', error);
    res.status(500).json({ error: error.message || 'Passkey login failed.' });
  }
}

// ============================================
// MANAGEMENT
// ============================================

/**
 * GET /api/auth/passkey/list
 * Requires: JWT auth
 */
async function listPasskeys(req, res) {
  try {
    const userId = req.user.id;
    const idField = isAdmin(req) ? 'admin_id' : 'user_id';

    const { data: passkeys, error } = await supabase
      .from('passkeys')
      .select('id, friendly_name, device_type, backed_up, created_at')
      .eq(idField, userId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json(passkeys || []);
  } catch (error) {
    console.error('List passkeys error:', error);
    res.status(500).json({ error: 'Failed to fetch passkeys.' });
  }
}

/**
 * DELETE /api/auth/passkey/:credentialId
 * Requires: JWT auth
 */
async function deletePasskey(req, res) {
  try {
    const userId = req.user.id;
    const { credentialId } = req.params;
    const idField = isAdmin(req) ? 'admin_id' : 'user_id';

    if (!credentialId) {
      return res.status(400).json({ error: 'Credential ID is required.' });
    }

    // Verify ownership
    const { data: passkey, error: findError } = await supabase
      .from('passkeys')
      .select('id')
      .eq('id', credentialId)
      .eq(idField, userId)
      .single();

    if (findError || !passkey) {
      return res.status(404).json({ error: 'Passkey not found or not owned by you.' });
    }

    const { error: deleteError } = await supabase
      .from('passkeys')
      .delete()
      .eq('id', credentialId)
      .eq(idField, userId);

    if (deleteError) throw deleteError;

    try {
      const { logActivity } = require('../services/activityLogger');
      const logPayload = {
        action: 'DELETE_PASSKEY',
        details: `Deleted passkey ${credentialId.substring(0, 8)}...`,
        req,
      };
      if (isAdmin(req)) logPayload.adminId = userId;
      else logPayload.userId = userId;
      logActivity(logPayload);
    } catch (e) { /* non-critical */ }

    res.json({ message: 'Passkey deleted successfully.' });

  } catch (error) {
    console.error('Delete passkey error:', error);
    res.status(500).json({ error: 'Failed to delete passkey.' });
  }
}

module.exports = {
  registerOptions,
  registerVerify,
  loginOptions,
  loginVerify,
  listPasskeys,
  deletePasskey,
};
