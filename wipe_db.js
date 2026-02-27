require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function wipeDatabase() {
    console.log("Starting database wipe (excluding admins)...");

    const tables = [
        'activity_logs',
        'passkeys',
        'nfts',
        'certificates',
        'wallets',
        'students'
    ];

    for (const table of tables) {
        console.log(`Wiping ${table}...`);
        const { error } = await supabase
            .from(table)
            .delete()
            .neq('id', 0) // Delete all rows where id is not 0 (which is all rows)
            .neq('id', -1); // For passkeys which are text strings (UUID/Base64), neq works but maybe it's better to use another filter

        // specifically for passkeys where id is text, .neq('id', '0')
        if (table === 'passkeys') {
            await supabase.from(table).delete().neq('id', '0');
        }

        if (error) {
            console.error(`Error wiping ${table}:`, error.message);
        } else {
            console.log(`Successfully wiped ${table}.`);
        }
    }

    console.log("\n✅ Database has been wiped. Admins were NOT deleted.");
}

wipeDatabase();
