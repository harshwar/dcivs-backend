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

module.exports = {
    sendWelcomeEmail,
    sendCertificateIssuedEmail,
    sendPasswordResetEmail,
    sendTestEmail,
    verifyEmailConfig
};
