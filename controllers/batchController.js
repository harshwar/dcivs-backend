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
const { createJob, updateJobStep, completeJob, failJob } = require('../services/jobService');

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
                
                // Create wallet (encrypted with temporary key — student will re-encrypt with PIN on first login)
                const { address, encryptedJson } = await createEncryptedWallet('temporary-secure-wallet-key');
                
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
                        ethereum_address: address,
                        status: 'ACTIVE',
                        is_verified: true
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

/**
 * POST /api/batch/start-register (NEW — Async/Polling version)
 * Creates a background job, returns jobId immediately,
 * then runs the full batch registration loop asynchronously.
 */
async function startBatchRegister(req, res) {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'CSV file is required' });
        }

        const records = parseCSV(req.file.path);
        
        if (records.length === 0) {
            fs.unlinkSync(req.file.path);
            return res.status(400).json({ error: 'CSV file is empty' });
        }

        // Create a background job (1 step per record)
        const jobId = await createJob('batch_register', records.length, {
            fileName: req.file.originalname,
            totalRecords: records.length
        }, req.user ? req.user.id : null);

        // Return jobId immediately
        res.status(202).json({ 
            jobId, 
            message: `Batch registration started for ${records.length} students. Poll /api/job-status/${jobId}` 
        });

        // Fire pipeline async (no await!)
        runBatchRegistrationPipeline(jobId, {
            records,
            filePath: req.file.path
        }).catch(err => {
            console.error(`[Batch Pipeline] Unhandled error in job ${jobId}:`, err);
            failJob(jobId, err.message || 'Unexpected batch registration error');
        });

    } catch (error) {
        console.error('Start Batch Register Error:', error);
        if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        res.status(500).json({ error: error.message || 'Failed to start batch registration.' });
    }
}

/**
 * Runs the batch registration loop in the background.
 * Updates the jobs table after each student so the frontend can poll progress.
 */
async function runBatchRegistrationPipeline(jobId, params) {
    const { records, filePath } = params;
    
    // Clean up uploaded file immediately since we have the records in memory
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    const results = {
        total: records.length,
        success: 0,
        failed: 0,
        errors: [],
        registered: []
    };

    try {
        for (let i = 0; i < records.length; i++) {
            const row = records[i];
            const rowNum = i + 2; // +2 because row 1 is header, arrays are 0-indexed
            
            // Calculate percentage based on current step
            const currentStep = i + 1;
            const percentage = Math.round((currentStep / records.length) * 100);
            
            await updateJobStep(jobId, currentStep, `Registering student ${currentStep} of ${records.length} (${row.email})...`, percentage);

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
                    continue; // Skip to next record
                }

                // Generate default password if not provided
                const password = row.password || `Welcome${row.student_id_number.replace(/[^a-zA-Z0-9]/g, '')}`;
                
                // Create wallet (encrypted with temporary key)
                const { address, encryptedJson } = await createEncryptedWallet('temporary-secure-wallet-key');
                
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
                        ethereum_address: address,
                        status: 'ACTIVE',
                        is_verified: true
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
                    password: password, 
                    walletAddress: address
                }).catch(err => console.warn(`Batch Welcome email failed for ${row.email}:`, err.message));

                results.success++;
                results.registered.push({
                    id: newStudent.id,
                    email: row.email,
                    name: row.full_name,
                    wallet: address,
                    tempPassword: password
                });

            } catch (err) {
                console.error(`[Batch Pipeline ${jobId}] Error on row ${rowNum}:`, err.message);
                results.errors.push({ row: rowNum, error: err.message, email: row.email });
                results.failed++;
            }
        }

        // --- Complete! ---
        const finalStatus = results.failed > 0 && results.success === 0 ? 'failed' : 'completed';
        
        if (finalStatus === 'failed') {
             await failJob(jobId, `All ${results.total} registrations failed. Check result errors.`);
             // Still patch the result so they can see the errors array
             await supabase.from('jobs').update({ result: results }).eq('id', jobId);
        } else {
             await completeJob(jobId, results);
        }
        
        console.log(`[Batch Pipeline ${jobId}] ✅ Batch registration complete. Success: ${results.success}, Failed: ${results.failed}`);

    } catch (error) {
        console.error(`[Batch Pipeline ${jobId}] ❌ Fatal Error:`, error.message);
        await failJob(jobId, error.message || 'Batch registration pipeline encountered a fatal error');
    }
}


module.exports = {
    parseCSV,
    batchRegisterStudents,
    startBatchRegister,
    getStudentTemplate
};
