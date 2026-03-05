// Node.js file system module for handling local files
const fs = require('fs');
// Database connection (Supabase)
const supabase = require('../db');
// Helper functions for Pinata (IPFS) interaction
const { pinFileToIPFS, pinJSONToIPFS } = require('../utils/pinataHelpers');
// Service for blockchain interaction (using Ethers.js)
const { mintNFT } = require('../services/blockchainService');
// Email service for notifications
const { sendCertificateIssuedEmail } = require('../services/emailService');
// Job service for background job management
const { createJob, updateJobStep, completeJob, failJob } = require('../services/jobService');

/**
 * Controller: startIssuance (NEW — Async/Polling version)
 * Creates a background job, returns jobId immediately,
 * then runs the full pipeline asynchronously.
 */
async function startIssuance(req, res) {
    try {
        const { recipientId, title, description, department } = req.body;
        const file = req.file;

        // --- Input Validation ---
        if (!file) return res.status(400).json({ error: "Certificate file is required." });
        if (!recipientId) return res.status(400).json({ error: "Student (Recipient) is required." });
        if (!title) return res.status(400).json({ error: "Certificate Title is required." });

        // Create a background job (5 steps)
        const jobId = await createJob('issue_nft', 5, {
            recipientId, title, description, department,
            fileName: file.originalname
        }, req.user ? req.user.id : null);

        // Return jobId immediately — DON'T await the pipeline
        res.status(202).json({ jobId, message: 'Issuance started. Poll /api/job-status/' + jobId });

        // Fire the pipeline asynchronously (no await!)
        runIssuancePipeline(jobId, {
            recipientId, title, description, department,
            file, issueDate: req.body.issueDate,
            adminId: req.user ? req.user.id : null,
            req // pass for activity logging
        }).catch(err => {
            console.error(`[Pipeline] Unhandled error in job ${jobId}:`, err);
            failJob(jobId, err.message || 'Unexpected pipeline error');
        });

    } catch (error) {
        console.error("Start Issuance Error:", error);
        if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        res.status(500).json({ error: error.message || "Failed to start issuance." });
    }
}

/**
 * Runs the full NFT issuance pipeline in the background.
 * Updates the jobs table after each step so the frontend can poll progress.
 */
async function runIssuancePipeline(jobId, params) {
    const { recipientId, title, description, department, file, issueDate, adminId, req } = params;

    try {
        // --- Step 1: Fetch student wallet ---
        await updateJobStep(jobId, 1, 'Fetching student wallet...', 10);

        const { data: student, error: studentError } = await supabase
            .from('students')
            .select('ethereum_address, email, full_name')
            .eq('id', recipientId)
            .single();

        if (studentError || !student) throw new Error('Student not found.');
        const toAddress = student.ethereum_address;
        if (!toAddress) throw new Error('Student does not have a wallet address set.');

        // --- Step 2: Upload certificate to IPFS ---
        await updateJobStep(jobId, 2, 'Pinning certificate to IPFS...', 25);

        const imageHash = await pinFileToIPFS(file.path);
        fs.unlinkSync(file.path); // Cleanup temp file
        console.log(`[Pipeline ${jobId}] Image pinned: ${imageHash}`);

        // --- Step 3: Upload metadata to IPFS ---
        await updateJobStep(jobId, 3, 'Pinning metadata to IPFS...', 45);

        const metadata = {
            name: title,
            description: description || "Issued by University Management System",
            image: `ipfs://${imageHash}`,
            attributes: [
                { trait_type: "Issuer", value: "University Admin" },
                { trait_type: "Department", value: department || "General" },
                { trait_type: "Date", value: issueDate ? new Date(issueDate).toISOString() : new Date().toISOString() }
            ]
        };
        const metadataHash = await pinJSONToIPFS(metadata);
        const tokenURI = `ipfs://${metadataHash}`;
        console.log(`[Pipeline ${jobId}] Metadata pinned: ${tokenURI}`);

        // --- Step 4: Mint NFT on blockchain ---
        await updateJobStep(jobId, 4, 'Minting NFT on blockchain...', 65);

        const mintResult = await mintNFT(toAddress, tokenURI);
        console.log(`[Pipeline ${jobId}] Minted Token ID: ${mintResult.tokenId}`);

        // --- Step 5: Save to database + send email ---
        await updateJobStep(jobId, 5, 'Saving records & sending notification...', 85);

        // Insert certificate record
        const { data: cert, error: certError } = await supabase
            .from('certificates')
            .insert([{
                recipient_id: recipientId,
                title,
                description: description || "",
                department: department || "General",
                issue_date: issueDate ? new Date(issueDate) : new Date()
            }])
            .select()
            .single();

        if (certError) throw new Error(`Certificate DB Error: ${certError.message}`);

        // Insert NFT record
        const { error: nftError } = await supabase
            .from('nfts')
            .insert([{
                certificate_id: cert.id,
                token_id: parseInt(mintResult.tokenId),
                transaction_hash: mintResult.transactionHash,
                ipfs_cid: tokenURI
            }]);

        if (nftError) throw new Error(`NFT DB Error: ${nftError.message}`);

        // Log Activity
        const { logActivity } = require('../services/activityLogger');
        logActivity({
            adminId: adminId,
            action: 'ISSUE_CERTIFICATE',
            details: `Issued '${title}' to student ID ${recipientId} (Token #${mintResult.tokenId})`,
            req
        });

        // Send email (non-blocking)
        if (student.email) {
            sendCertificateIssuedEmail({
                email: student.email,
                studentName: student.full_name || 'Student',
                certificateTitle: title,
                tokenId: mintResult.tokenId,
                transactionHash: mintResult.transactionHash,
                department: department || 'General'
            }).catch(err => console.warn('Certificate email failed:', err));
        }

        // --- Complete! ---
        await completeJob(jobId, {
            certificateId: cert.id,
            tokenId: mintResult.tokenId,
            transactionHash: mintResult.transactionHash,
            ipfsCid: tokenURI
        });

        console.log(`[Pipeline ${jobId}] ✅ Issuance complete!`);

    } catch (error) {
        console.error(`[Pipeline ${jobId}] ❌ Failed:`, error.message);
        // Cleanup temp file if it still exists
        if (file && fs.existsSync(file.path)) fs.unlinkSync(file.path);
        await failJob(jobId, error.message || 'Pipeline failed');
    }
}

/**
 * Controller: issueNFT (LEGACY — Synchronous version)
 * Kept for backward compatibility with batch operations.
 * Manages the entire lifecycle synchronously in one request-response.
 */
async function issueNFT(req, res) {
    try {
        const { recipientId, title, description, department } = req.body;
        const file = req.file;

        if (!file) return res.status(400).json({ error: "Certificate file is required." });
        if (!recipientId) return res.status(400).json({ error: "Student (Recipient) is required." });
        if (!title) return res.status(400).json({ error: "Certificate Title is required." });

        console.log(`[NFT Issue] Starting issuance for Student ID: ${recipientId}, Title: ${title}`);

        const { data: student, error: studentError } = await supabase
            .from('students')
            .select('ethereum_address, email, full_name')
            .eq('id', recipientId)
            .single();

        if (studentError || !student) return res.status(404).json({ error: "Student not found." });
        const toAddress = student.ethereum_address;
        if (!toAddress) return res.status(400).json({ error: "Student does not have a wallet address set." });

        const imageHash = await pinFileToIPFS(file.path);
        fs.unlinkSync(file.path);

        const metadata = {
            name: title,
            description: description || "Issued by University Management System",
            image: `ipfs://${imageHash}`,
            attributes: [
                { trait_type: "Issuer", value: "University Admin" },
                { trait_type: "Department", value: department || "General" },
                { trait_type: "Date", value: req.body.issueDate ? new Date(req.body.issueDate).toISOString() : new Date().toISOString() }
            ]
        };
        const metadataHash = await pinJSONToIPFS(metadata);
        const tokenURI = `ipfs://${metadataHash}`;

        const mintResult = await mintNFT(toAddress, tokenURI);

        const { data: cert, error: certError } = await supabase
            .from('certificates')
            .insert([{
                recipient_id: recipientId, title,
                description: description || "",
                department: department || "General",
                issue_date: req.body.issueDate ? new Date(req.body.issueDate) : new Date()
            }])
            .select().single();

        if (certError) throw new Error(`Certificate DB Error: ${certError.message}`);

        const { error: nftError } = await supabase
            .from('nfts')
            .insert([{
                certificate_id: cert.id,
                token_id: parseInt(mintResult.tokenId),
                transaction_hash: mintResult.transactionHash,
                ipfs_cid: tokenURI
            }]);

        if (nftError) throw new Error(`NFT DB Error: ${nftError.message}`);

        const { logActivity } = require('../services/activityLogger');
        logActivity({
            adminId: req.user ? req.user.id : null,
            action: 'ISSUE_CERTIFICATE',
            details: `Issued '${title}' to student ID ${recipientId} (Token #${mintResult.tokenId})`,
            req
        });

        if (student.email) {
            sendCertificateIssuedEmail({
                email: student.email,
                studentName: student.full_name || 'Student',
                certificateTitle: title,
                tokenId: mintResult.tokenId,
                transactionHash: mintResult.transactionHash,
                department: department || 'General'
            }).then(result => {
                if (!result.success) console.warn('Certificate email failed:', result.error);
            });
        }

        res.status(201).json({
            message: "NFT issued successfully!",
            certificate: { id: cert.id, title, recipientId },
            nft: {
                tokenId: mintResult.tokenId,
                transactionHash: mintResult.transactionHash,
                ipfsCid: tokenURI
            }
        });

    } catch (error) {
        console.error("Issue NFT Error:", error);
        if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        res.status(500).json({ error: error.message || "Failed to issue NFT." });
    }
}

/**
 * Controller: getWalletInfo
 * Fetches the admin's blockchain wallet balance and gas estimates 
 * for UI warnings before minting operations.
 */
async function getWalletInfo(req, res) {
    try {
        const { getAdminWalletInfo } = require('../services/blockchainService');
        const info = await getAdminWalletInfo();
        res.status(200).json(info);
    } catch (error) {
        console.error("Wallet Info RPC Error:", error);
        res.status(500).json({ error: "Failed to load wallet data from blockchain network" });
    }
}

// Export function as a module
module.exports = { issueNFT, startIssuance, getWalletInfo };

