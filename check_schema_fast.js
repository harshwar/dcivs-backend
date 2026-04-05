const { createClient } = require('@supabase/supabase-client');
require('dotenv').config({ path: 'e:/NEWREPO/Project/backend/.env' });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function checkSchema() {
  const timeout = setTimeout(() => {
    console.log('TIMED OUT');
    process.exit(1);
  }, 5000);

  try {
    const { data: adminCols, error: adminErr } = await supabase.from('admins').select('*').limit(1);
    if (!adminErr && adminCols && adminCols.length > 0) {
      console.log('ADMIN_COLS:', Object.keys(adminCols[0]).join(','));
    } else if (adminErr) {
      console.log('ADMIN_ERR:', adminErr.message);
    }

    const { data: pkCols, error: pkErr } = await supabase.from('passkeys').select('*').limit(1);
    if (!pkErr && pkCols && pkCols.length > 0) {
      console.log('PK_COLS:', Object.keys(pkCols[0]).join(','));
    } else if (pkErr) {
      console.log('PK_ERR:', pkErr.message);
    }
  } catch (e) {
    console.log('EXCEPTION:', e.message);
  } finally {
    clearTimeout(timeout);
    process.exit(0);
  }
}

checkSchema();
