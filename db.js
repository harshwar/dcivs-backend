const { createClient } = require('@supabase/supabase-js');
require('dotenv').config(); // Ensure env vars are loaded if this file is imported early

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

// Fail fast if config is missing
if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Supabase Configuration Missing! Check SUPABASE_URL and SUPABASE_KEY in .env');
    // We don't exit here to allow checking other things, but requests will fail.
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Simple health check logging
console.log(`✅ Supabase Client Initialized: ${supabaseUrl}`);

module.exports = supabase;
