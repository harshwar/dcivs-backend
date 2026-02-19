const supabase = require('../db');
const { createEncryptedWallet } = require('../services/walletService');

/**
 * GET /api/wallet/me
 * Retrieves the encrypted wallet for the logged-in user.
 */
async function getWallet(req, res) {
  try {
    const userId = req.user.id;

    // 1. Try to find wallet in 'wallets' table
    let { data: wallet, error } = await supabase
      .from('wallets')
      .select('public_address, encrypted_json')
      .eq('user_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw error;
    }

    if (!wallet) {
      return res.status(404).json({ error: 'Wallet not found.' });
    }

    res.json(wallet);
  } catch (err) {
    console.error('Get wallet error:', err);
    res.status(500).json({ error: 'Failed to retrieve wallet.' });
  }
}

/**
 * POST /api/wallet/create
 * Creates a NEW wallet for the user (if one doesn't exist).
 */
async function createWallet(req, res) {
  try {
    const userId = req.user.id;
    const { password } = req.body;

    if (!password || password.length < 6) {
      return res.status(400).json({ error: 'Password min 6 chars required.' });
    }

    // 1. Check if wallet exists
    const { data: existing } = await supabase
      .from('wallets')
      .select('id')
      .eq('user_id', userId)
      .single();

    if (existing) {
      return res.status(400).json({ error: 'Wallet already exists.' });
    }

    // 2. Create Wallet
    const { address, encryptedJson } = await createEncryptedWallet(password);

    // 3. Save to DB
    const { error: insertError } = await supabase
      .from('wallets')
      .insert([{
        user_id: userId,
        public_address: address,
        encrypted_json: encryptedJson
      }]);

    if (insertError) throw insertError;

    // 4. Update student record with address (for easy lookup)
    await supabase
      .from('students')
      .update({ ethereum_address: address })
      .eq('id', userId);

    // Log
    const { logActivity } = require('../services/activityLogger');
    logActivity({ userId, action: 'CREATE_WALLET', details: `Created wallet ${address}`, req });

    res.status(201).json({ message: 'Wallet created.', address });

  } catch (err) {
    console.error('Create wallet error:', err);
    res.status(500).json({ error: 'Failed to create wallet.' });
  }
}

/**
 * POST /api/wallet/update
 * Updates the encrypted JSON (Re-Keying).
 * Used for changing password or setting a PIN.
 */
async function updateWallet(req, res) {
  try {
    const userId = req.user.id;
    const { encryptedJson, address } = req.body;
    console.log(`[Wallet Update] Updating for user ${userId}, address ${address}`);

    if (!encryptedJson || !address) {
      console.warn('[Wallet Update] Missing data:', { encryptedJson: !!encryptedJson, address: !!address });
      return res.status(400).json({ error: 'Encrypted JSON and address required.' });
    }

    // 1. Update DB (Wallets table)
    const { error: walletError } = await supabase
      .from('wallets')
      .update({ 
        encrypted_json: encryptedJson,
        public_address: address 
      })
      .eq('user_id', userId);

    if (walletError) throw walletError;

    // 2. Update Student Flag (to indicate PIN is now active)
    const { error: studentError } = await supabase
      .from('students')
      .update({ wallet_pin_set: true })
      .eq('id', userId);

    if (studentError) throw studentError;

    // Log
    const { logActivity } = require('../services/activityLogger');
    logActivity({ userId, action: 'UPDATE_WALLET_KEY', details: 'Re-encrypted wallet (PIN set)', req });

    res.json({ message: 'Wallet updated and PIN secured.' });

  } catch (err) {
    console.error('Update wallet error:', err);
    res.status(500).json({ error: 'Failed to update wallet.' });
  }
}

/**
 * POST /api/wallet/import
 * Imports a wallet from a recovery phrase (already encrypted on client).
 */
async function importWallet(req, res) {
  try {
    const userId = req.user.id;
    const { encryptedJson, address } = req.body;

    if (!encryptedJson || !address) {
      return res.status(400).json({ error: 'Data incomplete.' });
    }

    // Check if wallet exists
    const { data: existing } = await supabase
      .from('wallets')
      .select('id')
      .eq('user_id', userId)
      .single();

    let query;
    if (existing) {
       query = supabase
        .from('wallets')
        .update({ public_address: address, encrypted_json: encryptedJson })
        .eq('user_id', userId);
    } else {
       query = supabase
        .from('wallets')
        .insert([{ user_id: userId, public_address: address, encrypted_json: encryptedJson }]);
    }

    const { error } = await query;
    if (error) throw error;

    // Update student record
    await supabase.from('students').update({ ethereum_address: address }).eq('id', userId);

    const { logActivity } = require('../services/activityLogger');
    logActivity({ userId, action: 'IMPORT_WALLET', details: `Imported wallet ${address}`, req });

    res.json({ message: 'Wallet imported successfully.' });

  } catch (err) {
    console.error('Import wallet error:', err);
    res.status(500).json({ error: 'Failed to import wallet.' });
  }
}

/**
 * GET /api/wallet/assets
 * Fetches NFTs owned by the user.
 */
async function getAssets(req, res) {
    try {
        const userId = req.user.id;
        
        // Since 'nfts' has no 'owner' column, we join with 'certificates' 
        // to filter by 'recipient_id' (which is the student ID).
        const { data: assets, error } = await supabase
            .from('nfts')
            .select(`
                id,
                token_id,
                transaction_hash,
                ipfs_cid,
                created_at,
                certificate: certificate_id!inner (
                    title,
                    description,
                    issue_date,
                    department,
                    recipient_id
                )
            `)
            .eq('certificate.recipient_id', userId)
            .order('created_at', { ascending: false });

        if (error) throw error;

        // Transform for frontend
        const formatted = assets.map(a => ({
            tokenId: a.token_id,
            transactionHash: a.transaction_hash,
            title: a.certificate?.title || 'Untitled Certificate',
            description: a.certificate?.description,
            imageUrl: null, 
            ipfsCid: a.ipfs_cid,
            issueDate: a.certificate?.issue_date,
            department: a.certificate?.department
        }));

        res.json({ assets: formatted });

    } catch (err) {
        console.error('Get assets error:', err);
        res.status(500).json({ error: 'Failed to fetch assets' });
    }
}

module.exports = {
  getWallet,
  createWallet,
  updateWallet,
  importWallet,
  getAssets
};
