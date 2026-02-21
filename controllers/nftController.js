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

/**
 * Controller: issueNFT
 * Manages the entire lifecycle of creating an academic certificate NFT:
 * 1. File Upload to IPFS
 * 2. Metadata Creation & Upload
 * 3. Blockchain Minting
 * 4. Database Recording (linked across tables)
 */
async function issueNFT(req, res) {
    try {
        // --- 1. Extract Data from Request Body ---
        const { recipientId, title, description, department } = req.body;
        const file = req.file; // Provided by multer middleware

        // --- 2. Input Validation ---
        if (!file) {
            return res.status(400).json({ error: "Certificate file is required." });
        }
        if (!recipientId) {
            return res.status(400).json({ error: "Student (Recipient) is required." });
        }
        if (!title) {
            return res.status(400).json({ error: "Certificate Title is required." });
        }

        console.log(`[NFT Issue] Starting issuance for Student ID: ${recipientId}, Title: ${title}`);

        // --- 3. Retrieve Student's Wallet Address and Email ---
        // We fetch the 'ethereum_address' and email for notification.
        const { data: student, error: studentError } = await supabase
            .from('students')
            .select('ethereum_address, email, full_name')
            .eq('id', recipientId)
            .single();

        if (studentError || !student) {
            console.error("Student Lookup Error:", studentError);
            return res.status(404).json({ error: "Student not found." });
        }
        
        const toAddress = student.ethereum_address;

        if (!toAddress) {
            return res.status(400).json({ error: "Student does not have a wallet address set." });
        }

        // --- 4. Upload Certificate Image to Pinata (IPFS) ---
        // Pining ensures the file persists on the decentralized web.
        const imageHash = await pinFileToIPFS(file.path);
        // Delete the temporary local file once it's successfully uploaded to IPFS
        fs.unlinkSync(file.path); 
        console.log(`[NFT Issue] Image pinned: ${imageHash}`);

        // --- 5. Create and Upload Metadata JSON to Pinata ---
        // Following the OpenSea/ERC-711 Metadata Standard for interoperability.
        const metadata = {
            name: title,
            description: description || "Issued by University Management System",
            image: `ipfs://${imageHash}`, // Link to the image pinned in Step 4
            attributes: [
                { trait_type: "Issuer", value: "University Admin" },
                { trait_type: "Department", value: department || "General" },
                { trait_type: "Date", value: req.body.issueDate ? new Date(req.body.issueDate).toISOString() : new Date().toISOString() }
            ]
        };
        const metadataHash = await pinJSONToIPFS(metadata);
        const tokenURI = `ipfs://${metadataHash}`; // This URI is what gets stored on-chain
        console.log(`[NFT Issue] Metadata pinned: ${tokenURI}`);

        // --- 6. Minting Transaction on Blockchain ---
        // This process calls the smart contract and transfers ownership to the student.
        // It uses the administrative private key to authorize the transaction.
        const mintResult = await mintNFT(toAddress, tokenURI);
        console.log(`[NFT Issue] Minted Token ID: ${mintResult.tokenId} (Tx: ${mintResult.transactionHash})`);

        // --- 7. Save Records to Database ---
        
        // A. Insert human-readable certificate details
        const { data: cert, error: certError } = await supabase
            .from('certificates')
            .insert([{
                recipient_id: recipientId, 
                title, 
                description: description || "", 
                department: department || "General",
                issue_date: req.body.issueDate ? new Date(req.body.issueDate) : new Date()
            }])
            .select()
            .single();

        if (certError) throw new Error(`Certificate DB Error: ${certError.message}`);
        
        const certificateId = cert.id;

        // B. Link the minted NFT details (Transaction Hash, Token ID) to the Certificate record
        const { error: nftError } = await supabase
            .from('nfts')
            .insert([{
                certificate_id: certificateId,
                token_id: parseInt(mintResult.tokenId),
                transaction_hash: mintResult.transactionHash,
                ipfs_cid: tokenURI
            }]);

        if (nftError) throw new Error(`NFT DB Error: ${nftError.message}`);

        // Log Activity
        const { logActivity } = require('../services/activityLogger');
        logActivity({
            adminId: req.user ? req.user.id : null, // Assuming req.user is populated by middleware
            action: 'ISSUE_CERTIFICATE',
            details: `Issued '${title}' to student ID ${recipientId} (Token #${mintResult.tokenId})`,
            req
        });

        // --- 8. Send Certificate Notification Email (non-blocking) ---
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

        // --- 9. Final Success Response ---
        res.status(201).json({
            message: "NFT issued successfully!",
            certificate: {
                id: certificateId,
                title: title,
                recipientId: recipientId
            },
            nft: {
                tokenId: mintResult.tokenId,
                transactionHash: mintResult.transactionHash,
                ipfsCid: tokenURI
            }
        });

    } catch (error) {
        console.error("Issue NFT Error:", error);
        // Attempt to clean up temp file if an error occurs mid-process
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
module.exports = { issueNFT, getWalletInfo };

