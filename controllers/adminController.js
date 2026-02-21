const supabase = require('../db');
const { createEncryptedWallet } = require('../services/walletService');
const { sendAccountActivatedEmail } = require('../services/emailService');
const { logActivity } = require('../services/activityLogger');

/**
 * GET /api/admin/pending-students
 * Returns a list of students waiting for registration approval.
 */
async function getPendingStudents(req, res) {
    try {
        const { data: students, error } = await supabase
            .from('students')
            .select('id, full_name, email, student_id_number, course_name, year, created_at')
            .eq('status', 'PENDING_APPROVAL')
            .order('created_at', { ascending: true });

        if (error) throw error;
        res.json(students);
    } catch (error) {
        console.error('Fetch pending students error:', error);
        res.status(500).json({ error: 'Failed to fetch pending students' });
    }
}

/**
 * POST /api/admin/approve-student/:id
 * Approves a student, creates their blockchain wallet, and sends activation email.
 */
async function approveStudent(req, res) {
    try {
        const { id } = req.params;
        const { password_temporary } = req.body; // In case we need it, but usually students set their own during reg

        // 1. Fetch student details
        const { data: student, error: fetchErr } = await supabase
            .from('students')
            .select('*')
            .eq('id', id)
            .single();

        if (fetchErr || !student) {
            return res.status(404).json({ error: 'Student not found.' });
        }

        if (student.status !== 'PENDING_APPROVAL') {
            return res.status(400).json({ error: 'Student is not in a pending approval state.' });
        }

        // 2. Generate Blockchain Wallet
        // NOTE: During registration, the student provided a password. 
        // For the custodial wallet, we either need that password (securely stored or passed)
        // or we use a temporary one. 
        // Since we didn't store the raw password (only hash), we'll generate the wallet 
        // with a wallet-specific secure entropy or ask the user to provide it.
        // For this prototype, we'll create a wallet. 
        // In a real system, the student might provide their wallet password during the setup phase.
        
        const { address, encryptedJson } = await createEncryptedWallet('temporary-secure-wallet-key'); 

        // 3. Update Student Status & Set Wallet
        const { error: updateErr } = await supabase
            .from('students')
            .update({
                status: 'ACTIVE',
                is_verified: true,
                ethereum_address: address
            })
            .eq('id', id);

        if (updateErr) throw updateErr;

        // 4. Create Wallet Record
        const { error: walletErr } = await supabase
            .from('wallets')
            .insert([{
                user_id: id,
                public_address: address,
                encrypted_json: encryptedJson
            }]);

        if (walletErr) throw walletErr;

        // 5. Log Activity
        logActivity({
            adminId: req.user.id,
            action: 'APPROVE_STUDENT',
            details: `Approved registration for ${student.email}`,
            req
        });

        // 6. Send Activation Email (non-blocking)
        sendAccountActivatedEmail({ 
            email: student.email, 
            full_name: student.full_name 
        }).catch(e => console.error('Activation email failed:', e));

        res.json({ message: 'Student approved and wallet created successfully.' });

    } catch (error) {
        console.error('Approve student error:', error);
        res.status(500).json({ error: 'Failed to approve student.' });
    }
}

/**
 * POST /api/admin/reject-student/:id
 * Rejects a student registration.
 */
async function rejectStudent(req, res) {
    try {
        const { id } = req.params;
        const { reason } = req.body;

        const { data: student, error: fetchErr } = await supabase
            .from('students')
            .select('email')
            .eq('id', id)
            .single();

        if (fetchErr) return res.status(404).json({ error: 'Student not found.' });

        // Update status or delete? Deleting keeps DB clean.
        const { error: deleteErr } = await supabase
            .from('students')
            .delete()
            .eq('id', id);

        if (deleteErr) throw deleteErr;

        logActivity({
            adminId: req.user.id,
            action: 'REJECT_STUDENT',
            details: `Rejected registration for ${student.email}. Reason: ${reason || 'Not specified'}`,
            req
        });

        res.json({ message: 'Student registration rejected and removed.' });
    } catch (error) {
        console.error('Reject student error:', error);
        res.status(500).json({ error: 'Failed to reject student.' });
    }
}

module.exports = {
    getPendingStudents,
    approveStudent,
    rejectStudent
};
