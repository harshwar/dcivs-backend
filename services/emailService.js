/**
 * Email Service using Resend SDK
 * Handles all email notifications for the University NFT System
 */
const { Resend } = require('resend');

// Initialize Resend with API Key
const resend = new Resend(process.env.RESEND_API_KEY);

// Default sender - must be from the verified domain
const DEFAULT_FROM = process.env.EMAIL_FROM || 'University NFT System <noreply@dcivs.online>';

/**
 * Send welcome email after student registration
 * @param {Object} student - Student data { email, full_name }
 * @returns {Promise<Object>} Send result
 */
async function sendWelcomeEmail(student) {
    try {
        console.log(`📧 Resend Sending | From: ${DEFAULT_FROM} | To: ${student.email.toLowerCase()}`);
        const { data, error } = await resend.emails.send({
            from: DEFAULT_FROM,
            to: student.email.toLowerCase(),
            subject: 'Welcome to University NFT Certificate System',
            html: `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: 'Segoe UI', Arial, sans-serif; background: #0d1117; color: #c9d1d9; margin: 0; padding: 20px; }
        .container { max-width: 600px; margin: 0 auto; background: #161b22; border-radius: 12px; padding: 40px; border: 1px solid #30363d; }
        .header { text-align: center; margin-bottom: 30px; }
        .logo { font-size: 48px; }
        h1 { color: #58a6ff; margin: 10px 0; font-size: 24px; }
        .content { line-height: 1.8; color: #8b949e; }
        .highlight { color: #c9d1d9; font-weight: 600; }
        .cta { display: inline-block; background: linear-gradient(135deg, #238636, #2ea043); color: white; padding: 12px 32px; border-radius: 8px; text-decoration: none; margin: 20px 0; font-weight: 600; }
        .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #30363d; font-size: 12px; color: #6e7681; text-align: center; }
        .features { background: #0d1117; border-radius: 8px; padding: 20px; margin: 20px 0; }
        .feature { margin: 10px 0; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="logo">🎓</div>
            <h1>Welcome, ${student.full_name}!</h1>
        </div>
        
        <div class="content">
            <p>Your account has been successfully created on the <span class="highlight">University NFT Certificate System</span>.</p>
            
            <div class="features">
                <div class="feature">🔐 Secure blockchain-backed certificates</div>
                <div class="feature">💼 Your own crypto wallet has been created</div>
                <div class="feature">✅ Instantly verifiable by employers</div>
            </div>

            <div style="background: #21262d; padding: 15px; border-radius: 8px; margin: 20px 0; border: 1px solid #30363d;">
                <p style="margin: 0 0 10px 0; color: #8b949e; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">Your Login Credentials</p>
                <div style="margin-bottom: 5px;">
                    <span style="color: #6e7681;">Email:</span> 
                    <span style="color: #c9d1d9; font-family: monospace;">${student.email}</span>
                </div>
                <div style="margin-bottom: 5px;">
                    <span style="color: #6e7681;">Temporary Password:</span> 
                    <span style="color: #58a6ff; font-family: monospace; font-weight: bold;">${student.password || 'Provided by Admin'}</span>
                </div>
                <div>
                    <span style="color: #6e7681;">Wallet Address:</span> 
                    <span style="color: #8b949e; font-family: monospace; font-size: 11px;">${student.walletAddress || 'Generated on login'}</span>
                </div>
            </div>
            
            <p><strong>Important:</strong> Please log in immediately and change your password via the Settings menu.</p>
            
            <center>
                <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/login" class="cta">
                    Access Your Dashboard
                </a>
            </center>
        </div>
        
        <div class="footer">
            <p>This is an automated message from the University NFT Certificate System.</p>
            <p>If you did not create this account, please ignore this email.</p>
        </div>
    </div>
</body>
</html>
            `
        });

        if (error) throw error;

        console.log(`✉️  Welcome email sent to ${student.email} (ID: ${data.id})`);
        return { success: true, messageId: data.id };

    } catch (error) {
        console.error('Welcome email error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Send certificate issued notification
 * @param {Object} params - { email, studentName, certificateTitle, tokenId, transactionHash, department }
 * @returns {Promise<Object>} Send result
 */
async function sendCertificateIssuedEmail({ email, studentName, certificateTitle, tokenId, transactionHash, department }) {
    try {
        const verifyUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/verify/${tokenId}`;
        console.log(`📧 Resend Sending | From: ${DEFAULT_FROM} | To: ${email.toLowerCase()}`);
        
        const { data, error } = await resend.emails.send({
            from: DEFAULT_FROM,
            to: email.toLowerCase(),
            subject: `🎉 New Certificate Issued: ${certificateTitle}`,
            html: `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: 'Segoe UI', Arial, sans-serif; background: #0d1117; color: #c9d1d9; margin: 0; padding: 20px; }
        .container { max-width: 600px; margin: 0 auto; background: #161b22; border-radius: 12px; padding: 40px; border: 1px solid #30363d; }
        .header { text-align: center; margin-bottom: 30px; }
        .logo { font-size: 64px; }
        h1 { color: #58a6ff; margin: 10px 0; font-size: 24px; }
        .content { line-height: 1.8; color: #8b949e; }
        .certificate-card { background: linear-gradient(135deg, #1a1f2e, #0d1117); border: 2px solid #30363d; border-radius: 12px; padding: 24px; margin: 24px 0; text-align: center; }
        .cert-title { font-size: 20px; color: #58a6ff; font-weight: 700; margin-bottom: 8px; }
        .cert-dept { color: #8b949e; font-size: 14px; }
        .token-badge { display: inline-block; background: #238636; color: white; padding: 4px 12px; border-radius: 20px; font-size: 12px; margin-top: 12px; }
        .cta { display: inline-block; background: linear-gradient(135deg, #238636, #2ea043); color: white; padding: 12px 32px; border-radius: 8px; text-decoration: none; margin: 20px 0; font-weight: 600; }
        .details { background: #0d1117; border-radius: 8px; padding: 16px; margin: 20px 0; font-family: monospace; font-size: 12px; }
        .detail-row { margin: 8px 0; }
        .detail-label { color: #6e7681; }
        .detail-value { color: #c9d1d9; }
        .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #30363d; font-size: 12px; color: #6e7681; text-align: center; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="logo">🏆</div>
            <h1>Congratulations, ${studentName}!</h1>
        </div>
        
        <div class="content">
            <p>A new certificate has been issued to your blockchain wallet!</p>
            
            <div class="certificate-card">
                <div class="cert-title">${certificateTitle}</div>
                <div class="cert-dept">${department || 'University'}</div>
                <div class="token-badge">Token #${tokenId}</div>
            </div>
            
            <p>This certificate is permanently recorded on the blockchain and can be verified by anyone using the link below.</p>
            
            <center>
                <a href="${verifyUrl}" class="cta">
                    View & Verify Certificate
                </a>
            </center>
            
            <div class="details">
                <div class="detail-row">
                    <span class="detail-label">Token ID:</span>
                    <span class="detail-value">#${tokenId}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Transaction:</span>
                    <span class="detail-value">${transactionHash ? transactionHash.slice(0, 18) + '...' : 'Pending'}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Issued:</span>
                    <span class="detail-value">${new Date().toLocaleDateString()}</span>
                </div>
            </div>
        </div>
        
        <div class="footer">
            <p>This certificate is secured by blockchain technology.</p>
            <p>Employers can verify authenticity at: ${verifyUrl}</p>
        </div>
    </div>
</body>
</html>
            `
        });

        if (error) throw error;

        console.log(`✉️  Certificate email sent to ${email} for Token #${tokenId} (ID: ${data.id})`);
        return { success: true, messageId: data.id };

    } catch (error) {
        console.error('Certificate email error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Send a test email (for verification)
 * @param {string} toEmail - Recipient email address
 */
async function sendTestEmail(toEmail) {
    try {
        const { data, error } = await resend.emails.send({
            from: DEFAULT_FROM,
            to: toEmail,
            subject: 'Test Email - University NFT System',
            html: '<h1>Test Email</h1><p>If you received this, the email service is working correctly! 🎉</p>'
        });

        if (error) throw error;

        console.log('Test email sent (ID):', data.id);
        return { success: true, messageId: data.id };
    } catch (error) {
        console.error('Test email failed:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Verify email configuration
 */
async function verifyEmailConfig() {
    try {
        if (!process.env.RESEND_API_KEY) throw new Error('RESEND_API_KEY is missing');
        // We can check if we can list domains as a heartbeat
        const { data, error } = await resend.domains.list();
        if (error) throw error;
        
        console.log('✅ Resend configuration verified - API key is active');
        return { success: true };
    } catch (error) {
        console.error('❌ Resend configuration failed:', error.message);
        return { success: false, error: error.message };
    }
}
/**
 * Send password reset email
 * @param {Object} params - { email, full_name, resetUrl }
 * @returns {Promise<Object>} Send result
 */
async function sendPasswordResetEmail({ email, full_name, resetUrl }) {
    try {
        console.log(`📧 Resend Sending | From: ${DEFAULT_FROM} | To: ${email.toLowerCase()}`);
        const { data, error } = await resend.emails.send({
            from: DEFAULT_FROM,
            to: email.toLowerCase(),
            subject: '🔑 Reset Your Password - University NFT System',
            html: `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: 'Segoe UI', Arial, sans-serif; background: #0d1117; color: #c9d1d9; margin: 0; padding: 20px; }
        .container { max-width: 600px; margin: 0 auto; background: #161b22; border-radius: 12px; padding: 40px; border: 1px solid #30363d; }
        .header { text-align: center; margin-bottom: 30px; }
        .logo { font-size: 48px; }
        h1 { color: #58a6ff; margin: 10px 0; font-size: 24px; }
        .content { line-height: 1.8; color: #8b949e; }
        .cta { display: inline-block; background: linear-gradient(135deg, #6366f1, #8b5cf6); color: white; padding: 14px 36px; border-radius: 8px; text-decoration: none; margin: 24px 0; font-weight: 600; font-size: 16px; }
        .warning { background: #0d1117; border: 1px solid #30363d; border-radius: 8px; padding: 16px; margin: 20px 0; font-size: 13px; color: #6e7681; }
        .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #30363d; font-size: 12px; color: #6e7681; text-align: center; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="logo">🔑</div>
            <h1>Password Reset</h1>
        </div>
        
        <div class="content">
            <p>Hi <strong style="color: #c9d1d9;">${full_name}</strong>,</p>
            <p>We received a request to reset your password. Click the button below to set a new password:</p>
            
            <center>
                <a href="${resetUrl}" class="cta">
                    Reset My Password
                </a>
            </center>
            
            <div class="warning">
                <p style="margin: 0 0 8px 0;">⏰ This link expires in <strong style="color: #c9d1d9;">1 hour</strong></p>
                <p style="margin: 0;">🔒 If you didn't request this, you can safely ignore this email. Your password won't change.</p>
            </div>
        </div>
        
        <div class="footer">
            <p>University NFT Certificate System</p>
            <p style="font-size: 11px; color: #484f58;">If the button doesn't work, copy this link: ${resetUrl}</p>
        </div>
    </div>
</body>
</html>
            `
        });

        if (error) throw error;

        console.log(`✉️  Password reset email sent to ${email} (ID: ${data.id})`);
        return { success: true, messageId: data.id };

    } catch (error) {
        console.error('Password reset email error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * sendCertificateStatusEmail:
 * Notifies a student when their certificate is revoked or reinstated.
 */
async function sendCertificateStatusEmail({ email, full_name, certificateTitle, status, tokenId }) {
    try {
        const isRevoked = status.toLowerCase() === 'revoked';
        const statusColor = isRevoked ? '#ef4444' : '#10b981';
        const statusLabel = isRevoked ? 'REVOKED' : 'REINSTATED';
        const verifyUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/verify/${tokenId}`;

        console.log(`📧 Resend Status Update | From: ${DEFAULT_FROM} | To: ${email.toLowerCase()} | Status: ${statusLabel}`);

        const { data, error } = await resend.emails.send({
            from: DEFAULT_FROM,
            to: email.toLowerCase(),
            subject: `${isRevoked ? '⚠️' : '✅'} Certificate Status Update: ${certificateTitle}`,
            html: `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
        .container { max-width: 600px; margin: 20px auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px; }
        .header { text-align: center; padding-bottom: 20px; border-bottom: 2px solid #818cf8; }
        .content { padding: 30px 0; }
        .status-badge { display: inline-block; padding: 6px 12px; border-radius: 9999px; font-weight: bold; color: white; background-color: ${statusColor}; margin: 10px 0; }
        .footer { text-align: center; color: #64748b; font-size: 12px; padding-top: 20px; border-top: 1px solid #e2e8f0; }
        .button { display: inline-block; padding: 12px 24px; background-color: #4f46e5; color: white; text-decoration: none; border-radius: 8px; font-weight: bold; margin-top: 20px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1 style="color: #4f46e5;">Certificate Status Update</h1>
        </div>
        <div class="content">
            <p>Hello <strong>${full_name}</strong>,</p>
            <p>The status of your digital certificate has been updated by the institution:</p>
            <div style="background-color: #f8fafc; padding: 20px; border-radius: 8px; border-left: 4px solid #4f46e5;">
                <p style="margin: 0;"><strong>Certificate:</strong> ${certificateTitle}</p>
                <p style="margin: 5px 0;"><strong>Token ID:</strong> #${tokenId}</p>
                <p style="margin: 5px 0;"><strong>Status:</strong> <span class="status-badge">${statusLabel}</span></p>
            </div>
            ${isRevoked 
                ? `<p style="color: #ef4444; margin-top: 20px;"><strong>Notice:</strong> This certificate is no longer considered valid and will show as "Revoked" on the public verification page.</p>`
                : `<p style="color: #10b981; margin-top: 20px;"><strong>Good News:</strong> Your certificate has been reinstated and is now fully valid for public verification.</p>`
            }
            <div style="text-align: center;">
                <a href="${verifyUrl}" class="button">View Certificate Status</a>
            </div>
            <p style="margin-top: 30px;">If you believe this is an error, please contact the administration office.</p>
        </div>
        <div class="footer">
            <p>&copy; ${new Date().getFullYear()} University NFT Certificate System</p>
        </div>
    </div>
</body>
</html>
            `
        });

        if (error) throw error;
        return { success: true, data };
    } catch (error) {
        console.error('Certificate status email error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * sendSecurityAlertEmail:
 * Notifies a user of critical security changes like password or 2FA updates.
 */
async function sendSecurityAlertEmail({ email, full_name, action, details }) {
    try {
        console.log(`📧 Resend Security Alert | From: ${DEFAULT_FROM} | To: ${email.toLowerCase()} | Action: ${action}`);

        const { data, error } = await resend.emails.send({
            from: DEFAULT_FROM,
            to: email.toLowerCase(),
            subject: `🔒 Security Alert: Account ${action}`,
            html: `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
        .container { max-width: 600px; margin: 20px auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px; }
        .alert-header { background-color: #fef2f2; border: 1px solid #fee2e2; padding: 15px; border-radius: 8px; color: #991b1b; text-align: center; }
        .content { padding: 30px 0; }
        .footer { text-align: center; color: #64748b; font-size: 12px; padding-top: 20px; border-top: 1px solid #e2e8f0; }
    </style>
</head>
<body>
    <div class="container">
        <div class="alert-header">
            <h2 style="margin: 0;">Security Notification</h2>
        </div>
        <div class="content">
            <p>Hello <strong>${full_name}</strong>,</p>
            <p>This is an automated alert to inform you that a critical change was made to your account:</p>
            <div style="background-color: #f8fafc; padding: 20px; border-radius: 8px; border: 1px solid #e2e8f0;">
                <p style="margin: 0;"><strong>Action:</strong> ${action}</p>
                <p style="margin: 5px 0;"><strong>Details:</strong> ${details}</p>
                <p style="margin: 5px 0;"><strong>Time:</strong> ${new Date().toLocaleString()}</p>
            </div>
            <p style="margin-top: 20px; padding: 15px; background-color: #fffbeb; border: 1px solid #fef3c7; border-radius: 8px; color: #92400e;">
                <strong>Was this you?</strong> If you performed this action, you can safely ignore this email. If not, please <strong>change your password immediately</strong> and contact support.
            </p>
        </div>
        <div class="footer">
            <p>&copy; ${new Date().getFullYear()} University NFT Certificate System</p>
        </div>
    </div>
</body>
</html>
            `
        });

        if (error) throw error;
        return { success: true, data };
    } catch (error) {
        console.error('Security alert email error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * sendVerificationEmail:
 * Sends a link to the student to verify their email address.
 */
async function sendVerificationEmail({ email, full_name, token }) {
    try {
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
        const verifyUrl = `${frontendUrl}/verify-email?token=${token}`;

        console.log(`📧 Resend Verification | From: ${DEFAULT_FROM} | To: ${email.toLowerCase()}`);

        const { data, error } = await resend.emails.send({
            from: DEFAULT_FROM,
            to: email.toLowerCase(),
            subject: '✉️ Verify Your Email - University NFT System',
            html: `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
        .container { max-width: 600px; margin: 20px auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px; }
        .header { text-align: center; padding-bottom: 20px; border-bottom: 2px solid #818cf8; }
        .content { padding: 30px 0; }
        .footer { text-align: center; color: #64748b; font-size: 12px; padding-top: 20px; border-top: 1px solid #e2e8f0; }
        .button { display: inline-block; padding: 12px 24px; background-color: #4f46e5; color: white !important; text-decoration: none; border-radius: 8px; font-weight: bold; margin-top: 20px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1 style="color: #4f46e5;">Email Verification</h1>
        </div>
        <div class="content">
            <p>Hello <strong>${full_name}</strong>,</p>
            <p>Thank you for registering with the University NFT Certificate System! To complete your registration and protect your identity, please verify your email address by clicking the button below:</p>
            <div style="text-align: center;">
                <a href="${verifyUrl}" class="button">Verify Email Address</a>
            </div>
            <p style="margin-top: 30px;">This link will expire in 24 hours. After verifying, your account will be reviewed by the administration for final activation.</p>
            <p>If you did not register for this account, please ignore this email.</p>
        </div>
        <div class="footer">
            <p>&copy; ${new Date().getFullYear()} University NFT Certificate System</p>
        </div>
    </div>
</body>
</html>
            `
        });

        if (error) throw error;
        return { success: true, data };
    } catch (error) {
        console.error('Verification email error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * sendAccountActivatedEmail:
 * Sent after an admin approves a student.
 */
async function sendAccountActivatedEmail({ email, full_name }) {
    try {
        const loginUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/login`;

        console.log(`📧 Resend Activation | From: ${DEFAULT_FROM} | To: ${email.toLowerCase()}`);

        const { data, error } = await resend.emails.send({
            from: DEFAULT_FROM,
            to: email.toLowerCase(),
            subject: '🎉 Account Activated - University NFT System',
            html: `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
        .container { max-width: 600px; margin: 20px auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px; }
        .header { text-align: center; padding-bottom: 20px; border-bottom: 2px solid #818cf8; }
        .content { padding: 30px 0; }
        .footer { text-align: center; color: #64748b; font-size: 12px; padding-top: 20px; border-top: 1px solid #e2e8f0; }
        .button { display: inline-block; padding: 12px 24px; background-color: #10b981; color: white !important; text-decoration: none; border-radius: 8px; font-weight: bold; margin-top: 20px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1 style="color: #10b981;">Account Activated!</h1>
        </div>
        <div class="content">
            <p>Hello <strong>${full_name}</strong>,</p>
            <p>Great news! Your account has been reviewed and successfully approved by the administration.</p>
            <p>Your <strong>Blockchain Wallet</strong> has been created, and you can now log in to view your certificates, set up your wallet PIN, and register your passkeys for maximum security.</p>
            <div style="text-align: center;">
                <a href="${loginUrl}" class="button">Log In Now</a>
            </div>
            <p style="margin-top: 30px;">Welcome to the future of digital credentials!</p>
        </div>
        <div class="footer">
            <p>&copy; ${new Date().getFullYear()} University NFT Certificate System</p>
        </div>
    </div>
</body>
</html>
            `
        });

        if (error) throw error;
        return { success: true, data };
    } catch (error) {
        console.error('Account activation email error:', error);
        return { success: false, error: error.message };
    }
/**
 * sendLowBalanceAlertEmail:
 * Urgent alert for administrators when the issuance wallet runs low on gas.
 */
async function sendLowBalanceAlertEmail({ adminEmail, currentBalance, threshold, networkName = "Ethereum Network" }) {
    try {
        console.log(`📧 Resend Urgent Alert | From: ${DEFAULT_FROM} | To: ${adminEmail.toLowerCase()}`);

        const { data, error } = await resend.emails.send({
            from: DEFAULT_FROM,
            to: adminEmail.toLowerCase(),
            subject: `⚠️ URGENT: Low Wallet Balance (${currentBalance} ETH)`,
            html: `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
        .container { max-width: 600px; margin: 20px auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px; }
        .alert-header { background-color: #fee2e2; border: 1px solid #fca5a5; padding: 15px; border-radius: 8px; color: #991b1b; text-align: center; }
        .alert-icon { font-size: 32px; display: block; margin-bottom: 10px; }
        .content { padding: 30px 0; }
        .stats-box { background-color: #f8fafc; padding: 20px; border-radius: 8px; border: 1px solid #e2e8f0; border-left: 4px solid #ef4444; margin: 20px 0; font-family: monospace; font-size: 14px; }
        .footer { text-align: center; color: #64748b; font-size: 12px; padding-top: 20px; border-top: 1px solid #e2e8f0; }
        .cta-btn { display: inline-block; background-color: #ef4444; color: white !important; font-weight: bold; text-decoration: none; padding: 12px 24px; border-radius: 6px; margin-top: 20px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="alert-header">
            <span class="alert-icon">⚠️</span>
            <h2 style="margin: 0; text-transform: uppercase; letter-spacing: 1px;">Low Gas Balance Alert</h2>
        </div>
        <div class="content">
            <p>Administrator Action Required,</p>
            <p>The operational blockchain wallet used for issuing University NFT Certificates is running critically low on funds.</p>
            
            <div class="stats-box">
                <p style="margin: 5px 0;"><strong>Network:</strong> ${networkName}</p>
                <p style="margin: 5px 0;"><strong>Warning Threshold:</strong> ${threshold} ETH</p>
                <p style="margin: 5px 0; color: #ef4444; font-size: 18px;"><strong>Current Balance:</strong> <b>${currentBalance} ETH</b></p>
            </div>
            
            <p style="color: #991b1b; font-weight: bold;">If the balance reaches 0.00 ETH, the system will be completely unable to mint new certificates or execute revocations.</p>
            
            <p>Please top up the administrative wallet immediately to prevent service disruption during certificate issuance ceremonies.</p>
            
            <div style="text-align: center;">
                <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/admin/dashboard" class="cta-btn">Access Admin Dashboard</a>
            </div>
        </div>
        <div class="footer">
            <p>This is an automated operational alert from the University NFT System.</p>
            <p>You received this because your email is registered as an active system administrator.</p>
        </div>
    </div>
</body>
</html>
            `
        });

        if (error) throw error;
        return { success: true, data };
    } catch (error) {
        console.error('Low balance alert email error:', error);
        return { success: false, error: error.message };
    }
}

module.exports = {
    sendWelcomeEmail,
    sendCertificateIssuedEmail,
    sendPasswordResetEmail,
    sendCertificateStatusEmail,
    sendSecurityAlertEmail,
    sendVerificationEmail,
    sendAccountActivatedEmail,
    sendTestEmail,
    verifyEmailConfig,
    sendLowBalanceAlertEmail
};
