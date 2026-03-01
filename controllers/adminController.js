const supabase = require('../db');
const { createEncryptedWallet } = require('../services/walletService');
const { sendAccountActivatedEmail, sendRejectionEmail } = require('../services/emailService');
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
            .select('email, status')
            .eq('id', id)
            .single();

        if (fetchErr) return res.status(404).json({ error: 'Student not found.' });

        if (student.status !== 'PENDING_APPROVAL') {
            return res.status(400).json({ error: 'Student is not in a pending approval state.' });
        }

        // Set status to REJECTED (keep record so login can show rejection message)
        const { error: updateErr } = await supabase
            .from('students')
            .update({ status: 'REJECTED' })
            .eq('id', id);

        if (updateErr) throw updateErr;

        logActivity({
            adminId: req.user.id,
            action: 'REJECT_STUDENT',
            details: `Rejected registration for ${student.email}. Reason: ${reason || 'Not specified'}`,
            req
        });

        // Notify student via email (non-blocking)
        sendRejectionEmail({
            email: student.email,
            full_name: student.full_name || 'Student',
            reason: reason || null
        }).catch(e => console.error('Rejection email failed:', e));

        res.json({ message: 'Student registration rejected.' });
    } catch (error) {
        console.error('Reject student error:', error);
        res.status(500).json({ error: 'Failed to reject student.' });
    }
}

/**
 * POST /api/admin/bulk-approve
 * Approves multiple students at once.
 */
async function bulkApproveStudents(req, res) {
    try {
        const { ids } = req.body; // Array of student IDs
        if (!Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ error: 'No student IDs provided.' });
        }

        const results = { approved: [], failed: [] };

        for (const id of ids) {
            try {
                const { data: student, error: fetchErr } = await supabase
                    .from('students').select('*').eq('id', id).single();

                if (fetchErr || !student || student.status !== 'PENDING_APPROVAL') {
                    results.failed.push(id);
                    continue;
                }

                const { address, encryptedJson } = await createEncryptedWallet('temporary-secure-wallet-key');

                const { error: updateErr } = await supabase.from('students')
                    .update({ status: 'ACTIVE', is_verified: true, ethereum_address: address })
                    .eq('id', id);
                if (updateErr) { results.failed.push(id); continue; }

                await supabase.from('wallets').insert([{ user_id: id, public_address: address, encrypted_json: encryptedJson }]);

                sendAccountActivatedEmail({ email: student.email, full_name: student.full_name })
                    .catch(e => console.error('Activation email failed:', e));

                results.approved.push(id);
            } catch (e) {
                results.failed.push(id);
            }
        }

        logActivity({
            adminId: req.user.id,
            action: 'BULK_APPROVE',
            details: `Bulk approved ${results.approved.length} students, ${results.failed.length} failed`,
            req
        });

        res.json({ message: `Approved ${results.approved.length} students.`, results });
    } catch (error) {
        console.error('Bulk approve error:', error);
        res.status(500).json({ error: 'Bulk approval failed.' });
    }
}

/**
 * PUT /api/admin/students/:id
 * Updates specific editable fields for a student (pending or active).
 */
async function updateStudentDetails(req, res) {
    try {
        const { id } = req.params;
        const { full_name, student_id_number, course_name, year } = req.body;

        // Basic validation
        if (!full_name || !student_id_number || !course_name || !year) {
            return res.status(400).json({ error: 'All fields are required.' });
        }

        const { data: updatedStudent, error } = await supabase
            .from('students')
            .update({ full_name, student_id_number, course_name, year })
            .eq('id', id)
            .select()
            .single();

        if (error) {
            console.error('Database update error:', error);
            return res.status(500).json({ error: 'Failed to update student details.' });
        }

        if (!updatedStudent) {
             return res.status(404).json({ error: 'Student not found.' });
        }

        logActivity({
            adminId: req.user.id,
            action: 'EDIT_STUDENT',
            details: `Updated details for student ${updatedStudent.email}`,
            req
        });

        res.json({ message: 'Student updated successfully.', student: updatedStudent });
    } catch (error) {
        console.error('Update student error:', error);
        res.status(500).json({ error: 'An unexpected error occurred while updating the student.' });
    }
}

module.exports = {
    getPendingStudents,
    approveStudent,
    rejectStudent,
    bulkApproveStudents,
    updateStudentDetails
};
