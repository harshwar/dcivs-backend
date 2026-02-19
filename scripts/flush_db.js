const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '../.env' }); // Load from parent directory

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("❌ Missing Supabase credentials in .env");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function flushDatabase() {
    console.log("🧹 Starting Database Flush...");

    // 1. Delete Certificates (Foreign Key to NFTs)
    const { error: certError } = await supabase
        .from('certificates')
        .delete()
        .neq('id', 0); // Delete all rows
    
    if (certError) console.error("Error clearing certificates:", certError);
    else console.log("✅ Cleared 'certificates' table");

    // 2. Delete NFTs
    const { error: nftError } = await supabase
        .from('nfts')
        .delete()
        .neq('token_id', 0); // Delete all rows

    if (nftError) console.error("Error clearing NFTs:", nftError);
    else console.log("✅ Cleared 'nfts' table");

    // Optional: Wallets? Usually safe to keep unless full reset needed
    // const { error: walletError } = await supabase.from('wallets').delete().neq('id', 0);
    
    console.log("✨ Database flush complete. Restart your backend now.");
}

flushDatabase();
