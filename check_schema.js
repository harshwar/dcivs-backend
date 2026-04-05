const { createClient } = require('@supabase/supabase-client');
require('dotenv').config({ path: 'e:/NEWREPO/Project/backend/.env' });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function checkSchema() {
  console.log('Checking admins table...');
  const { data: adminCols, error: adminErr } = await supabase
    .from('admins')
    .select('*')
    .limit(1);
    
  if (adminErr) {
    console.error('Error fetching admins:', adminErr.message);
  } else if (adminCols && adminCols.length > 0) {
    console.log('Admin columns:', Object.keys(adminCols[0]));
  } else {
    console.log('Admins table is empty or inaccessible.');
  }

  console.log('\nChecking passkeys table...');
  const { data: passkeyCols, error: passErr } = await supabase
    .from('passkeys')
    .select('*')
    .limit(1);

  if (passErr) {
    console.error('Error fetching passkeys:', passErr.message);
  } else if (passkeyCols && passkeyCols.length > 0) {
    console.log('Passkey columns:', Object.keys(passkeyCols[0]));
  } else {
    // If empty, we can try to get column names via RPC if available, 
    // but just checking if it exists is a start.
    console.log('Passkeys table is empty or inaccessible.');
  }
}

checkSchema();
