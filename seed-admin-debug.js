const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const bcrypt = require('bcryptjs');

// Re-create client locally to be 100% sure of context
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function seed() {
    console.log("🚀 Starting Seed Script...");
    console.log("Testing Connection to:", process.env.SUPABASE_URL);

    const email = 'admin@example.com';
    const password = 'admin123';
    
    // 1. Check if user exists
    const { data: existing, error: checkErr } = await supabase
        .from('admins')
        .select('*')
        .eq('email', email);

    if (checkErr) {
        console.error("❌ Connection/Query Error:", checkErr);
        return;
    }

    if (existing && existing.length > 0) {
        console.log("⚠️ Admin already exists:", existing[0]);
        return;
    }

    // 2. Create User
    console.log("Creating new admin...");
    const hash = await bcrypt.hash(password, 10);
    
    const { data, error: insertErr } = await supabase
        .from('admins')
        .insert([{
            username: 'admin',
            email: email,
            password_hash: hash,
            role: 'super_admin'
        }])
        .select();

    if (insertErr) {
        console.error("❌ Insert Error:", insertErr);
    } else {
        console.log("✅ Admin Created:", data);
    }
}

seed().then(() => {
    console.log("Done.");
    process.exit(0);
}).catch(e => {
    console.error("Fatal:", e);
    process.exit(1);
});
