/**
 * Batch Operations Controller
 * Handles CSV uploads for bulk student registration and certificate minting
 */
const fs = require('fs');
const { parse } = require('csv-parse/sync');
const bcrypt = require('bcryptjs');
const supabase = require('../db');
const { createEncryptedWallet } = require('../walletService');
const { sendWelcomeEmail, sendCertificateIssuedEmail } = require('../services/emailService');
const { pinFileToIPFS, pinJSONToIPFS } = require('../utils/pinataHelpers');
const { mintNFT } = require('../services/blockchainService');

/**
 * Parse CSV file and return records
 * @param {string} filePath - Path to CSV file
 * @returns {Array} Parsed records
 */
function parseCSV(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    return parse(content, {
        columns: true,
        skip_empty_lines: true,
        trim: true
    });
}

/**
 * POST /api/batch/students
 * Bulk register students from CSV
 * Expected CSV columns: email, full_name, student_id_number, course_name, year, password (optional)
 */
async function batchRegisterStudents(req, res) {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'CSV file is required' });
        }

        const records = parseCSV(req.file.path);
        fs.unlinkSync(req.file.path); // Clean up uploaded file

        if (records.length === 0) {
            return res.status(400).json({ error: 'CSV file is empty' });
        }

        const results = {
            total: records.length,
            success: 0,
            failed: 0,
            errors: [],
            registered: []
        };

        for (let i = 0; i < records.length; i++) {
            const row = records[i];
            const rowNum = i + 2; // +2 because row 1 is header, arrays are 0-indexed

            try {
                // Validate required fields
                if (!row.email || !row.full_name || !row.student_id_number || !row.course_name || !row.year) {
                    results.errors.push({ row: rowNum, error: 'Missing required fields', data: row });
                    results.failed++;
                    continue;
                }

                // Check if email already exists
                const { data: existing } = await supabase
                    .from('students')
                    .select('id')
                    .eq('email', row.email)
                    .single();

                if (existing) {
                    results.errors.push({ row: rowNum, error: 'Email already registered', email: row.email });
                    results.failed++;
                    continue;
                }

                // Generate default password if not provided
                const password = row.password || `Welcome${row.student_id_number.replace(/[^a-zA-Z0-9]/g, '')}`;
                
                // Create wallet
                const { address, encryptedJson } = await createEncryptedWallet(password);
                
                // Hash password
                const hashedPassword = await bcrypt.hash(password, 10);

                // Insert student
                const { data: newStudent, error: studentError } = await supabase
                    .from('students')
                    .insert([{
                        email: row.email,
                        password: hashedPassword,
                        full_name: row.full_name,
                        student_id_number: row.student_id_number,
                        course_name: row.course_name,
                        year: row.year,
                        ethereum_address: address
                    }])
                    .select()
                    .single();

                if (studentError) throw studentError;

                // Insert wallet
                await supabase
                    .from('wallets')
                    .insert([{
                        user_id: newStudent.id,
                        public_address: address,
                        encrypted_json: encryptedJson
                    }]);

                // Send welcome email (non-blocking)
                sendWelcomeEmail({ 
                    email: row.email, 
                    full_name: row.full_name,
                    password: password, // Pass to email (temp pass)
                    walletAddress: address
                });

                results.success++;
                results.registered.push({
                    id: newStudent.id,
                    email: row.email,
                    name: row.full_name,
                    wallet: address,
                    tempPassword: password // Admin can share this with student
                });

            } catch (err) {
                results.errors.push({ row: rowNum, error: err.message, email: row.email });
                results.failed++;
            }
        }

        res.json({
            message: `Batch registration complete: ${results.success}/${results.total} successful`,
            results
        });

    } catch (error) {
        console.error('Batch register error:', error);
        if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        res.status(500).json({ error: error.message || 'Batch registration failed' });
    }
}



/**
 * GET /api/batch/template/students
 * Download CSV template for student registration
 */
function getStudentTemplate(req, res) {
    const csvContent = 'email,full_name,student_id_number,course_name,year,password\nstudent@example.com,John Doe,ST12345,Computer Science,1,OptionalPassword123';
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=student_registration_template.csv');
    res.status(200).send(csvContent);
}

module.exports = {
    parseCSV,
    batchRegisterStudents,
    getStudentTemplate
};
