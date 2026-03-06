require('dotenv').config();
const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

async function test() {
    console.log('--- Testing Resend Connection directly ---');
    console.log('API Key present:', !!process.env.RESEND_API_KEY);
    console.log('From address:', process.env.EMAIL_FROM);

    try {
        console.log('\n1. Trying to send with custom domain...');
        const res1 = await resend.emails.send({
            from: process.env.EMAIL_FROM || 'onboarding@resend.dev',
            to: 'digitaldcivs@gmail.com',
            subject: 'Test Custom Domain',
            html: '<p>Testing custom domain delivery</p>'
        });
        console.log('Result 1:', res1);

        console.log('\n2. Trying to send with Resend sandbox (onboarding@resend.dev)...');
        const res2 = await resend.emails.send({
            from: 'onboarding@resend.dev',
            to: 'digitaldcivs@gmail.com',
            subject: 'Test Sandbox Domain',
            html: '<p>Testing sandbox domain delivery</p>'
        });
        console.log('Result 2:', res2);

    } catch (err) {
        console.error('Caught Exception:', err);
    }
}

test();
