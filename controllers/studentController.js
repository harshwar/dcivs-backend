const supabase = require('../db');
const { ethers } = require('ethers');

// Initialize Provider
const RPC_URL = process.env.RPC_URL || 'http://127.0.0.1:8545';
const provider = new ethers.JsonRpcProvider(RPC_URL);

/**
 * GET /api/students/:id/details
 * Fetches comprehensive details for a single student:
 * - Profile (Personal & Academic)
 * - Wallet Status & Balance (Live from Blockchain)
 * - Issued Certificates
 * - Activity Logs (User's actions)
 */
async function getStudentDetails(req, res) {
    const { id } = req.params;
    
    if (!id) return res.status(400).json({ error: 'Student ID is required' });

    try {
        // 1. Fetch Profile
        const { data: student, error: studentError } = await supabase
            .from('students')
            .select('id, full_name, email, student_id_number, course_name, year, ethereum_address, created_at')
            .eq('id', id)
            .single();
        
        if (studentError || !student) {
            return res.status(404).json({ error: 'Student not found' });
        }

        // 2. Fetch Wallet Info (Creation Date)
        const { data: wallet } = await supabase
            .from('wallets')
            .select('created_at, public_address')
            .eq('user_id', id)
            .single();

        // 3. Fetch Certificates (Assets) joined with NFT data
        const { data: certsData } = await supabase
            .from('certificates')
            .select('*, nft:nfts(token_id)')
            .eq('recipient_id', id)
            .order('issue_date', { ascending: false });

        const certificates = (certsData || []).map(c => {
            // nft may be returned as an array or object depending on join cardinality
            const nft = Array.isArray(c.nft) ? c.nft[0] : c.nft;
            return {
                ...c,
                token_id: nft?.token_id || null
            };
        });

        // 4. Fetch Activity Logs (Actions performed BY the student)
        const { data: logs } = await supabase
            .from('activity_logs')
            .select('*')
            .eq('user_id', id)
            .order('created_at', { ascending: false })
            .limit(50);

        // 5. Fetch Live ETH Balance
        let balance = '0.0000';
        if (student.ethereum_address) {
            try {
                const balWei = await provider.getBalance(student.ethereum_address);
                // Reduce to 4 decimals for UI
                const balEth = ethers.formatEther(balWei);
                balance = parseFloat(balEth).toFixed(4);
            } catch (e) {
                console.error(`Balance fetch error for ${student.ethereum_address}:`, e.message);
                balance = 'Error';
            }
        }

        res.json({
            profile: {
                ...student,
                wallet_created_at: wallet?.created_at || null
            },
            wallet: {
                address: student.ethereum_address,
                balance: balance
            },
            certificates: certificates || [],
            logs: logs || []
        });

    } catch (error) {
        console.error('Error fetching student details:', error);
        res.status(500).json({ error: 'Failed to fetch student details' });
    }
}

module.exports = { getStudentDetails };
