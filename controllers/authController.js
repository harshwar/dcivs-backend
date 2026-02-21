// Library for password hashing
const bcrypt = require('bcryptjs');
// Library for JSON Web Token generation
const jwt = require('jsonwebtoken');
// Database connection (Supabase Client)
const supabase = require('../db');
// Wallet utility for creating wallets during registration
const { createEncryptedWallet } = require('../services/walletService');
// Email service for notifications
const { 
  sendWelcomeEmail, 
  sendPasswordResetEmail, 
  sendSecurityAlertEmail,
  sendVerificationEmail 
} = require('../services/emailService');
const crypto = require('crypto');

// Secret key for JWT signing (loaded from environment)
const JWT_SECRET = process.env.JWT_SECRET || 'change_this_secret';
// Token expiration time
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

/**
 * Helper: sign JWT
 * Creates a signed token for the given payload (user ID, etc.)
 */
function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

/**
 * POST /api/auth/register
 * Handles student registration with email verification and delayed wallet creation.
 */
async function register(req, res) {
  try {
    // Destructure input from request body
    const {
      email,
      password,
      full_name,
      student_id_number,
      course_name,
      year,
    } = req.body;

    // Validate that all required fields are present
    if (!email || !password || !full_name || !student_id_number || !course_name || !year) {
      return res.status(400).json({
        error: 'email, password, full_name, student_id_number, course_name, and year are required.',
      });
    }

    // --- DATA NORMALIZATION ---
    const normalizedID = student_id_number.trim().toUpperCase().replace(/\s+/g, '');
    const normalizedCourse = course_name.trim().toUpperCase();

    // --- FORMAT VALIDATION ---
    // Format: [Year][FY/SY/TY][Dept][RollNo] e.g. 25TYBSCIT006
    const idRegex = /^\d{2}(FY|SY|TY)[A-Z]+\d{3}$/;
    if (!idRegex.test(normalizedID)) {
      return res.status(400).json({ error: 'Invalid Student ID format. Expected: 25TYBSCIT001' });
    }

    // Check if a user with this email already exists (case-insensitive)
    const { data: existing, error: existError } = await supabase
        .from('students')
        .select('id')
        .ilike('email', email.trim())
        .maybeSingle();
    
    if (existing) {
      return res.status(409).json({ error: 'Email already registered.' });
    }

    // Check if roll number is already taken
    const { data: existingRoll } = await supabase
        .from('students')
        .select('id')
        .eq('student_id_number', normalizedID)
        .maybeSingle();

    if (existingRoll) {
      return res.status(409).json({ error: 'Student ID/Roll Number already registered.' });
    }

    // Hash the password before storing it
    const hashedPassword = await bcrypt.hash(password, 10);

    // Generate Verification Token
    const verificationToken = crypto.randomBytes(32).toString('hex');

    // Insert Student (Delayed Wallet Creation & PENDING status)
    const { data: user, error: studentError } = await supabase
        .from('students')
        .insert([{
            email: email.trim(), 
            password: hashedPassword, 
            full_name: full_name.trim(), 
            student_id_number: normalizedID, 
            course_name: normalizedCourse, 
            year, 
            status: 'PENDING_EMAIL',
            is_verified: false,
            verification_token: verificationToken
        }])
        .select()
        .single();

    if (studentError) {
        throw new Error(`Student Registration Failed: ${studentError.message}`);
    }

    // --- SEND VERIFICATION EMAIL ---
    try {
      await sendVerificationEmail({
        email: user.email,
        full_name: user.full_name,
        token: verificationToken
      });
    } catch (emailErr) {
      console.error('Failed to send verification email:', emailErr);
    }

    // Log Activity
    const { logActivity } = require('../services/activityLogger');
    logActivity({
        userId: user.id,
        action: 'REGISTER_STUDENT_PENDING',
        details: `Registered ${user.email} (Pending Email Verification)`,
        req
    });

    res.status(201).json({
      message: 'Registration successful! Please check your email to verify your account.',
      user: {
        email: user.email,
        full_name: user.full_name,
        status: user.status
      },
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: error.message || 'Registration failed.' });
  }
}

/**
 * GET /api/auth/verify-email?token=xyz
 * Validates the email verification token and moves student to PENDING_APPROVAL.
 */
async function verifyEmail(req, res) {
  try {
    const { token } = req.query;

    if (!token) {
      return res.status(400).json({ error: 'Verification token is required.' });
    }

    // Find student with this token
    const { data: user, error } = await supabase
      .from('students')
      .select('id, email, full_name, status')
      .eq('verification_token', token)
      .maybeSingle();

    if (error || !user) {
      return res.status(400).json({ error: 'Invalid or expired verification link.' });
    }

    if (user.status !== 'PENDING_EMAIL') {
      return res.status(400).json({ error: 'Email is already verified or account is in a different state.' });
    }

    // Update status to PENDING_APPROVAL
    const { error: updateError } = await supabase
      .from('students')
      .update({
        status: 'PENDING_APPROVAL',
        is_verified: true,
        verification_token: null // Token used
      })
      .eq('id', user.id);

    if (updateError) throw updateError;

    // Log activity
    const { logActivity } = require('../services/activityLogger');
    logActivity({
      userId: user.id,
      action: 'EMAIL_VERIFIED',
      details: 'Student verified their email address',
      req
    });

    res.json({ 
      message: 'Email verified successfully! Your account is now pending administrator approval.',
      nextStep: 'APPROVAL'
    });

  } catch (error) {
    console.error('Email verification error:', error);
    res.status(500).json({ error: 'Failed to verify email.' });
  }
}

/**
 * POST /api/auth/login
 * Validates credentials and returns a JWT token for session management.
 */
async function login(req, res) {
  try {
    const { email, password } = req.body;

    // Validate input presence
    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required.' });
    }

    // --- BACKUP ADMIN (Hardcoded — skip lockout) ---
    if (email === 'backup_admin@test.com' && password === 'admin_backup_123') {
        const adminToken = signToken({ id: 'backup-admin-id', email, role: 'admin' });
        return res.json({
             message: 'Backup Admin Login successful.',
             token: adminToken,
             user: {
               id: 'backup-admin-id',
               email: email,
               full_name: 'Backup Admin',
               role: 'admin'
             }
        });
    }

    // --- ACCOUNT LOCKOUT CHECK ---
    const { checkLockout, recordFailedAttempt, resetAttempts } = require('../middleware/rateLimiter');
    const lockoutStatus = checkLockout(email);
    if (lockoutStatus.locked) {
      const remainingMin = Math.ceil(lockoutStatus.remainingMs / 60000);
      // Log the blocked attempt
      try {
        const { logActivity } = require('../services/activityLogger');
        logActivity({ action: 'ACCOUNT_LOCKED', details: `Login blocked — account locked (${remainingMin} min remaining)`, req });
      } catch (e) { /* non-critical */ }

      return res.status(429).json({
        error: `Account locked due to too many failed attempts. Try again in ${remainingMin} minute${remainingMin !== 1 ? 's' : ''}.`,
        locked: true,
        remainingMs: lockoutStatus.remainingMs,
      });
    }

    // --- ADMIN LOGIN (DB Check) ---
    const { data: adminUser, error: adminError } = await supabase
        .from('admins')
        .select('id, email, password_hash, username, role')
        .ilike('email', email.trim())
        .maybeSingle();
    
    if (adminUser) {
        const isAdminMatch = await bcrypt.compare(password, adminUser.password_hash);
        
        if (isAdminMatch) {
            resetAttempts(email);
            const adminToken = signToken({ id: adminUser.id, email: adminUser.email, role: adminUser.role });
            
            const { logActivity } = require('../services/activityLogger');
            logActivity({
                adminId: adminUser.id,
                action: 'LOGIN_ADMIN',
                details: 'Admin login successful',
                req
            });

            return res.json({
                 message: 'Admin Login successful.',
                 token: adminToken,
                 user: {
                   id: adminUser.id,
                   email: adminUser.email,
                   full_name: adminUser.username || 'Admin',
                   role: adminUser.role
                 }
            });
        }
        // Admin exists but wrong password — record failure
        const result = recordFailedAttempt(email);
        try {
          const { logActivity } = require('../services/activityLogger');
          logActivity({ adminId: adminUser.id, action: 'LOGIN_FAILED', details: `Failed admin login (${result.attemptsRemaining} attempts left)`, req });
        } catch (e) { /* non-critical */ }

        if (result.locked) {
          return res.status(429).json({
            error: `Account locked after ${5} failed attempts. Try again in ${result.lockoutMinutes} minutes.`,
            locked: true,
            remainingMs: result.lockoutMinutes * 60000,
          });
        }
        return res.status(401).json({
          error: 'Invalid credentials.',
          attemptsRemaining: result.attemptsRemaining,
        });
    }
    // -------------------------

    const { data: user, error } = await supabase
        .from('students')
        .select('id, email, full_name, password, totp_enabled, wallet_pin_set, status')
        .ilike('email', email.trim())
        .maybeSingle();

    // Check if user was found
    if (error || !user) {
      // Still record attempt to prevent email enumeration timing attacks
      recordFailedAttempt(email);
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    // Compare provided password with stored hash
    const isMatch = await bcrypt.compare(password, user.password);

    // Validate password match
    if (!isMatch) {
      const result = recordFailedAttempt(email);

      try {
        const { logActivity } = require('../services/activityLogger');
        logActivity({ userId: user.id, action: 'LOGIN_FAILED', details: `Failed student login (${result.attemptsRemaining} attempts left)`, req });
      } catch (e) { /* non-critical */ }

      if (result.locked) {
        return res.status(429).json({
          error: `Account locked after 5 failed attempts. Try again in ${result.lockoutMinutes} minutes.`,
          locked: true,
          remainingMs: result.lockoutMinutes * 60000,
        });
      }
      return res.status(401).json({
        error: 'Invalid credentials.',
        attemptsRemaining: result.attemptsRemaining,
      });
    }

    // Successful password — reset lockout counter
    resetAttempts(email);

    // --- STATUS CHECK ---
    if (user.status === 'PENDING_EMAIL') {
      return res.status(403).json({ 
        error: 'Email not verified.', 
        code: 'PENDING_EMAIL',
        message: 'Please check your email and click the verification link to proceed.' 
      });
    }

    if (user.status === 'PENDING_APPROVAL') {
      return res.status(403).json({ 
        error: 'Account pending approval.', 
        code: 'PENDING_APPROVAL',
        message: 'Your registration is being reviewed by the administration. You will receive an email once activated.' 
      });
    }

    if (user.status === 'REJECTED') {
      return res.status(403).json({ 
        error: 'Account rejected.', 
        code: 'REJECTED',
        message: 'Your registration application was declined by the administration.' 
      });
    }

    // --- 2FA CHECK ---
    if (user.totp_enabled) {
      // Issue short-lived temp token (5 min) — only good for /api/auth/2fa/validate
      const tempToken = jwt.sign(
        { id: user.id, email: user.email, requires2FA: true },
        JWT_SECRET,
        { expiresIn: '5m' }
      );

      return res.json({
        requires2FA: true,
        tempToken,
        message: 'Password verified. Please enter your 2FA code.',
      });
    }

    // Generate JWT token for valid login (no 2FA)
    const token = signToken({ id: user.id, email: user.email });

    // Log Student Login
    const { logActivity } = require('../services/activityLogger');
    logActivity({
        userId: user.id,
        action: 'LOGIN_STUDENT',
        details: 'Student login successful',
        req
    });

    // Check if user has any passkeys registered
    const { count: passkeyCount } = await supabase
      .from('passkeys')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id);

    res.json({
      message: 'Login successful.',
      token,
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        wallet_pin_set: user.wallet_pin_set,
        has_passkeys: (passkeyCount || 0) > 0
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed.' });
  }
}

/**
 * POST /api/auth/change-password
 * Allows logged-in users to change their password
 */
async function changePassword(req, res) {
  try {
    const { oldPassword, newPassword } = req.body;
    const userId = req.user.id; // From middleware

    if (!oldPassword || !newPassword) {
      return res.status(400).json({ error: "Old and new passwords are required." });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: "New password must be at least 6 characters." });
    }

    // 1. Get current user (student or admin)
    // Try students table first
    let table = 'students';
    let { data: user, error } = await supabase
      .from(table)
      .select('id, password')
      .eq('id', userId)
      .single();

    // If not found, try admins table
    if (!user) {
      table = 'admins';
      const result = await supabase
        .from(table)
        .select('id, password_hash') // Admin table uses password_hash
        .eq('id', userId)
        .single();
      
      user = result.data;
      error = result.error;
    }

    if (error || !user) {
      return res.status(404).json({ error: "User not found." });
    }

    // 2. Verify Old Password
    const currentHash = user.password || user.password_hash;
    const isMatch = await bcrypt.compare(oldPassword, currentHash);

    if (!isMatch) {
      return res.status(401).json({ error: "Current password is incorrect." });
    }

    // 3. Hash New Password
    const newHashedPassword = await bcrypt.hash(newPassword, 10);

    // 4. Update Database
    const updatePayload = table === 'students' 
      ? { password: newHashedPassword } 
      : { password_hash: newHashedPassword };

    const { error: updateError } = await supabase
      .from(table)
      .update(updatePayload)
      .eq('id', userId);

    if (updateError) throw updateError;

    if (updateError) throw updateError;

    // Log Password Change
    const { logActivity } = require('../services/activityLogger');
    logActivity({
        userId: table === 'students' ? userId : null,
        adminId: table === 'admins' ? userId : null,
        action: 'CHANGE_PASSWORD',
        details: 'User changed their password',
        req
    });

    // --- Send Security Alert ---
    try {
        const email = table === 'admins' ? user.email : user.email; // both tables have email
        const full_name = table === 'admins' ? user.username : user.full_name;
        
        await sendSecurityAlertEmail({
            email,
            full_name: full_name || 'User',
            action: 'Password Changed',
            details: 'Your account password was successfully updated while you were logged in.'
        });
    } catch (emailErr) {
        console.warn('[Security Alert] Failed to send email:', emailErr.message);
    }

    res.json({ message: "Password changed successfully." });

  } catch (error) {
    console.error("Change password error:", error);
    res.status(500).json({ error: "Failed to change password." });
  }
}

// ──────────────────────────────────────────────────────────
// Forgot Password / Password Reset (Token-based)
// ──────────────────────────────────────────────────────────

// In-memory token store: Map<token, { email, expiresAt }>
const resetTokens = new Map();
const RESET_TOKEN_EXPIRY_MS = 60 * 60 * 1000; // 1 hour

// Cleanup expired tokens every 15 min
setInterval(() => {
  const now = Date.now();
  for (const [token, data] of resetTokens) {
    if (now > data.expiresAt) resetTokens.delete(token);
  }
}, 15 * 60 * 1000);

/**
 * POST /api/auth/forgot-password
 * Sends a password reset link to the user's email
 */
async function forgotPassword(req, res) {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email is required.' });
    }

    // Always return success to prevent email enumeration
    const successResponse = { message: 'If an account with that email exists, a reset link has been sent.' };

    console.log(`🔍 Forgot Password Request for: ${email}`);
    // Check if student exists (Case-Insensitive match via .ilike)
    const { data: user, error: userError } = await supabase
      .from('students')
      .select('id, email, full_name')
      .ilike('email', email.trim())
      .maybeSingle();

    if (userError) {
      console.log(`❌ Supabase lookup error for ${email}:`, userError.message);
    }

    if (!user) {
      console.log(`⚠️ User not found in 'students' table: ${email}`);
      // Still return success (don't reveal if email exists)
      return res.json(successResponse);
    }

    console.log(`✅ User found: ${user.full_name} (${user.id})`);

    // Generate secure reset token
    const token = crypto.randomBytes(32).toString('hex');
    resetTokens.set(token, {
      email: user.email,
      userId: user.id,
      full_name: user.full_name,
      expiresAt: Date.now() + RESET_TOKEN_EXPIRY_MS
    });

    // Build reset URL
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const resetUrl = `${frontendUrl}/reset-password/${token}`;

    console.log(`📨 Attempting to send reset email to: ${user.email}`);
    const emailResult = await sendPasswordResetEmail({
      email: user.email,
      full_name: user.full_name,
      resetUrl
    });

    if (!emailResult.success) {
      console.error('❌ Failed to send reset email:', emailResult.error);
    } else {
      console.log('✅ Reset email sent successfully!');
    }

    // Log activity
    try {
      const { logActivity } = require('../services/activityLogger');
      logActivity({
        userId: user.id,
        action: 'PASSWORD_RESET_REQUESTED',
        details: 'Password reset link sent via email',
        req
      });
    } catch (e) { /* non-critical */ }

    res.json(successResponse);

  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ error: 'Failed to process request.' });
  }
}

/**
 * POST /api/auth/reset-password
 * Sets a new password using a valid reset token
 */
async function resetPassword(req, res) {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({ error: 'Token and new password are required.' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    }

    // Validate token
    const tokenData = resetTokens.get(token);
    if (!tokenData) {
      return res.status(400).json({ error: 'Invalid or expired reset link. Please request a new one.' });
    }

    if (Date.now() > tokenData.expiresAt) {
      resetTokens.delete(token);
      return res.status(400).json({ error: 'Reset link has expired. Please request a new one.' });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password in DB
    const { error: updateError } = await supabase
      .from('students')
      .update({ password: hashedPassword })
      .eq('email', tokenData.email);

    if (updateError) {
      throw new Error('Failed to update password: ' + updateError.message);
    }

    // Delete used token (one-time use)
    resetTokens.delete(token);

    // Log activity
    try {
      const { logActivity } = require('../services/activityLogger');
      logActivity({
        userId: tokenData.userId,
        action: 'PASSWORD_RESET',
        details: 'Password reset via email link',
        req
      });
    } catch (e) { /* non-critical */ }

    // Reset lockout for this email (they just proved ownership)
    try {
      const { resetAttempts } = require('../middleware/rateLimiter');
      resetAttempts(tokenData.email);
    } catch (e) { /* non-critical */ }

    // --- Send Security Alert ---
    try {
      // We need the user's name for a nice email. We can get it from tokenData if we store it there, 
      // but if not, we can just use "User" or fetch it.
      // Let's assume full_name might not be in tokenData yet (I'll check forgotPassword)
      await sendSecurityAlertEmail({
        email: tokenData.email,
        full_name: tokenData.full_name || 'User',
        action: 'Password Reset',
        details: 'Your password was reset using a recovery link sent to your email.'
      });
    } catch (emailErr) {
      console.warn('[Security Alert] Failed to send email:', emailErr.message);
    }

    res.json({ message: 'Password has been reset successfully. You can now log in.' });

  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Failed to reset password.' });
  }
}

// Export the controller methods for use in routing
module.exports = {
  register,
  verifyEmail,
  login,
  changePassword,
  forgotPassword,
  resetPassword
};

