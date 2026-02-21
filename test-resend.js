require('dotenv').config();
const { verifyEmailConfig, sendTestEmail } = require('./services/emailService');

async function test() {
    console.log('--- Testing Resend Configuration ---');
    const configResult = await verifyEmailConfig();
    
    if (configResult.success) {
        console.log('✅ Configuration looks good!');
        // Uncomment to send an actual test email
        // await sendTestEmail('harsh15022003@gmail.com');
    } else {
        console.log('❌ Configuration failed:', configResult.error);
    }
}

test();
