/**
 * Passkey (WebAuthn) Controller
 * Handles passkey registration, login, listing, and deletion endpoints.
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

// ============================================
// REGISTRATION FLOW
// ============================================

/**
 * POST /api/auth/passkey/register-options
 * Generate WebAuthn registration options for the authenticated user.
 * Requires: JWT auth
 */
async function registerOptions(req, res) {
  try {
    const userId = req.user.id;

    // Get user info
    const { data: user, error: userError } = await supabase
      .from('students')
      .select('id, email, full_name')
      .eq('id', userId)
      .single();

    if (userError || !user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    // Get existing passkeys to exclude them
    const { data: existingKeys, error: keysError } = await supabase
      .from('passkeys')
      .select('id, transports')
      .eq('user_id', userId);

    if (keysError) throw keysError;

    const options = await passkeyService.getRegistrationOptions(
      user,
      existingKeys || []
    );

    res.json(options);
  } catch (error) {
    console.error('Passkey register-options error:', error);
    res.status(500).json({ error: 'Failed to generate registration options.' });
  }
}

/**
 * POST /api/auth/passkey/register-verify
 * Verify and store a new passkey credential.
 * Requires: JWT auth
 * Body: { attestationResponse, friendlyName }
 */
async function registerVerify(req, res) {
  try {
    const userId = req.user.id;
    const { attestationResponse, friendlyName } = req.body;

    if (!attestationResponse) {
      return res.status(400).json({ error: 'Attestation response is required.' });
    }

    // Verify the registration
    const origin = req.get('origin') || (req.get('referer') ? new URL(req.get('referer')).origin : undefined);
    const verification = await passkeyService.verifyRegistration(
      attestationResponse,
      userId,
      origin
    );

    if (!verification.verified || !verification.registrationInfo) {
      return res.status(400).json({ error: 'Passkey verification failed.' });
    }

    const { credential } = verification.registrationInfo;

    // In @simplewebauthn/server v13+, credential.id is already a base64url STRING
    // (not a Uint8Array), so store it directly — do NOT re-encode it!
    const credentialId = credential.id;
    
    // credential.publicKey IS a Uint8Array, convert to base64 for storage
    const publicKeyBase64 = Buffer.from(credential.publicKey).toString('base64');

    const { error: insertError } = await supabase
      .from('passkeys')
      .insert([{
        id: credentialId,
        user_id: userId,
        public_key: publicKeyBase64,
        counter: credential.counter || 0,
        device_type: credential.deviceType || 'singleDevice',
        backed_up: credential.backedUp || false,
        transports: credential.transports || [],
        friendly_name: friendlyName || 'My Passkey',
      }]);

    if (insertError) {
      console.error('Passkey insert error:', insertError);
      throw new Error('Failed to store passkey.');
    }

    // --- Send Security Alert ---
    try {
      const { data: user } = await supabase
        .from('students')
        .select('email, full_name')
        .eq('id', userId)
        .single();
      
      if (user) {
        await sendSecurityAlertEmail({
          email: user.email,
          full_name: user.full_name || 'User',
          action: 'New Passkey Added',
          details: `A new WebAuthn passkey ("${friendlyName || 'My Passkey'}") was successfully registered for your account.`
        });
      }
    } catch (emailErr) {
      console.warn('[Security Alert] Failed to send email:', emailErr.message);
    }

    res.status(201).json({
      message: 'Passkey registered successfully.',
      credentialId: credentialId,
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
 * Generate WebAuthn authentication options.
 * Public endpoint (no JWT required).
 * Body: {} (no email needed — uses discoverable credentials)
 */
async function loginOptions(req, res) {
  try {
    // Discoverable credentials: empty allowCredentials lets the browser
    // show all passkeys stored for this origin. No email needed!
    const options = await passkeyService.getAuthenticationOptions('_discoverable_', []);

    res.json(options);
  } catch (error) {
    console.error('Passkey login-options error:', error);
    res.status(500).json({ error: 'Failed to generate authentication options.' });
  }
}

/**
 * POST /api/auth/passkey/login-verify
 * Verify the WebAuthn assertion and issue a JWT.
 * Public endpoint (no JWT required).
 * Body: { assertionResponse }
 * No email needed — the credential ID in the assertion identifies the user.
 */
async function loginVerify(req, res) {
  try {
    const { assertionResponse } = req.body;

    if (!assertionResponse) {
      return res.status(400).json({ error: 'Assertion response is required.' });
    }

    // Look up the credential by ID — this tells us which user is logging in
    const credentialId = assertionResponse.id;

    const { data: credential, error: credError } = await supabase
      .from('passkeys')
      .select('id, user_id, public_key, counter, transports')
      .eq('id', credentialId)
      .single();

    if (credError || !credential) {
      return res.status(401).json({ error: 'Passkey not recognized.' });
    }

    // Get the user who owns this credential
    const { data: user, error: userError } = await supabase
      .from('students')
      .select('id, email, full_name, wallet_pin_set, totp_enabled')
      .eq('id', credential.user_id)
      .single();

    if (userError || !user) {
      return res.status(401).json({ error: 'User account not found.' });
    }

    // Convert stored base64 public key back to Uint8Array
    const publicKeyBuffer = Buffer.from(credential.public_key, 'base64');

    const dbCredential = {
      id: credential.id,
      public_key: new Uint8Array(publicKeyBuffer),
      counter: credential.counter,
      transports: credential.transports || [],
    };

    // Verify the assertion
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

    // Update the counter
    const { authenticationInfo } = verification;
    await supabase
      .from('passkeys')
      .update({ counter: authenticationInfo.newCounter })
      .eq('id', credentialId);

    // --- 2FA CHECK ---
    if (user.totp_enabled) {
      const tempToken = jwt.sign(
        { id: user.id, email: user.email, requires2FA: true },
        JWT_SECRET,
        { expiresIn: '5m' }
      );

      return res.json({
        requires2FA: true,
        tempToken,
        message: 'Passkey verified. Please enter your 2FA code.',
      });
    }

    // Issue JWT (same as password login)
    const token = signToken({ id: user.id, email: user.email });

    // Log activity
    try {
      const { logActivity } = require('../services/activityLogger');
      logActivity({
        userId: user.id,
        action: 'LOGIN_PASSKEY',
        details: 'Student logged in via passkey',
        req,
      });
    } catch (e) { /* non-critical */ }

    res.json({
      message: 'Login successful.',
      token,
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        wallet_pin_set: user.wallet_pin_set,
        has_passkeys: true // They just used one!
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
 * Get all passkeys for the authenticated user.
 * Requires: JWT auth
 */
async function listPasskeys(req, res) {
  try {
    const userId = req.user.id;

    const { data: passkeys, error } = await supabase
      .from('passkeys')
      .select('id, friendly_name, device_type, backed_up, created_at')
      .eq('user_id', userId)
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
 * Remove a passkey belonging to the authenticated user.
 * Requires: JWT auth
 */
async function deletePasskey(req, res) {
  try {
    const userId = req.user.id;
    const { credentialId } = req.params;

    if (!credentialId) {
      return res.status(400).json({ error: 'Credential ID is required.' });
    }

    // Verify ownership
    const { data: passkey, error: findError } = await supabase
      .from('passkeys')
      .select('id')
      .eq('id', credentialId)
      .eq('user_id', userId)
      .single();

    if (findError || !passkey) {
      return res.status(404).json({ error: 'Passkey not found or not owned by you.' });
    }

    const { error: deleteError } = await supabase
      .from('passkeys')
      .delete()
      .eq('id', credentialId)
      .eq('user_id', userId);

    if (deleteError) throw deleteError;

    // Log activity
    try {
      const { logActivity } = require('../services/activityLogger');
      logActivity({
        userId,
        action: 'DELETE_PASSKEY',
        details: `Deleted passkey ${credentialId.substring(0, 8)}...`,
        req,
      });
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
