// Essential library for interacting with the Ethereum blockchain
const { ethers } = require('ethers');

// Connection URL for the blockchain node (local Hardhat by default)
const RPC_URL = process.env.RPC_URL || 'http://127.0.0.1:8545';
// Private key of the administrator account allowed to mint NFTs
const PRIVATE_KEY = process.env.ADMIN_PRIVATE_KEY;
// Deployment address of the University NFT smart contract
const CONTRACT_ADDRESS = process.env.NFT_CONTRACT_ADDRESS;

// Alert if essential configuration is missing
if (!PRIVATE_KEY || !CONTRACT_ADDRESS) {
    console.warn("⚠️ Blockchain configuration missing. Minting will fail.");
}

// Extended ABI for all contract interactions
const ABI = [
    // Minting
    "function safeMint(address to, string memory _tokenURI) public",
    // Revocation
    "function revoke(uint256 tokenId) public",
    "function reinstate(uint256 tokenId) public",
    "function isRevoked(uint256 tokenId) public view returns (bool)",
    // Token info
    "function tokenURI(uint256 tokenId) public view returns (string memory)",
    "function ownerOf(uint256 tokenId) public view returns (address)",
    "function getCurrentTokenId() public view returns (uint256)",
    // Events
    "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
    "event CertificateRevoked(uint256 indexed tokenId, address indexed revokedBy)",
    "event CertificateReinstated(uint256 indexed tokenId, address indexed reinstatedBy)"
];

// Shared provider and contract instances
function getProvider() {
    return new ethers.JsonRpcProvider(RPC_URL);
}

function getContract(withSigner = false) {
    const provider = getProvider();
    if (withSigner) {
        const signer = new ethers.Wallet(PRIVATE_KEY, provider);
        return new ethers.Contract(CONTRACT_ADDRESS, ABI, signer);
    }
    return new ethers.Contract(CONTRACT_ADDRESS, ABI, provider);
}

/**
 * Mint a new NFT certificate
 */
async function mintNFT(toAddress, tokenURI) {
    try {
        const contract = getContract(true);
        console.log(`Minting NFT to ${toAddress}...`);
        
        const tx = await contract.safeMint(toAddress, tokenURI);
        const receipt = await tx.wait();

        // Extract Token ID from Transfer event
        const transferEvent = receipt.logs.find(log => {
            try {
                const parsed = contract.interface.parseLog(log);
                return parsed.name === 'Transfer';
            } catch (e) { return false; }
        });

        const tokenId = transferEvent 
            ? contract.interface.parseLog(transferEvent).args.tokenId.toString() 
            : null;

        return {
            success: true,
            transactionHash: receipt.hash,
            tokenId: tokenId
        };
    } catch (error) {
        console.error("Blockchain Minting Error:", error);
        throw error;
    }
}

/**
 * Revoke a certificate NFT
 */
async function revokeNFT(tokenId) {
    try {
        const contract = getContract(true);
        console.log(`Revoking certificate #${tokenId}...`);
        
        const tx = await contract.revoke(tokenId);
        const receipt = await tx.wait();

        return {
            success: true,
            transactionHash: receipt.hash,
            tokenId: tokenId
        };
    } catch (error) {
        console.error("Blockchain Revocation Error:", error);
        throw error;
    }
}

/**
 * Reinstate a revoked certificate
 */
async function reinstateNFT(tokenId) {
    try {
        const contract = getContract(true);
        console.log(`Reinstating certificate #${tokenId}...`);
        
        const tx = await contract.reinstate(tokenId);
        const receipt = await tx.wait();

        return {
            success: true,
            transactionHash: receipt.hash,
            tokenId: tokenId
        };
    } catch (error) {
        console.error("Blockchain Reinstate Error:", error);
        throw error;
    }
}

/**
 * Check if a token is revoked (READ-ONLY, no gas)
 */
async function isTokenRevoked(tokenId) {
    try {
        const contract = getContract(false);
        return await contract.isRevoked(tokenId);
    } catch (error) {
        console.error("Revocation Check Error:", error);
        throw error;
    }
}

/**
 * Get full token info from blockchain (READ-ONLY)
 * Returns null if token doesn't exist
 */
async function getTokenInfo(tokenId) {
    try {
        const contract = getContract(false);
        
        const [owner, uri, revoked] = await Promise.all([
            contract.ownerOf(tokenId),
            contract.tokenURI(tokenId),
            contract.isRevoked(tokenId)
        ]);

        return {
            tokenId: tokenId,
            owner: owner,
            tokenURI: uri,
            isRevoked: revoked,
            contractAddress: CONTRACT_ADDRESS
        };
    } catch (error) {
        // Token doesn't exist on current blockchain
        // This happens after Hardhat node restart or if token was never minted
        if (error.code === 'CALL_EXCEPTION' || 
            error.message?.includes('ERC721') ||
            error.message?.includes('execution reverted')) {
            console.log(`Token ${tokenId} doesn't exist on blockchain (stale DB entry or wrong contract)`);
            return null;
        }
        console.error("getTokenInfo Error:", error);
        throw error;
    }
}

/**
 * Verify a certificate exists and get its status
 */
async function verifyCertificate(tokenId) {
    const info = await getTokenInfo(tokenId);
    if (!info) {
        return { valid: false, reason: 'Certificate does not exist' };
    }
    
    return {
        valid: !info.isRevoked,
        reason: info.isRevoked ? 'Certificate has been revoked' : 'Certificate is valid',
        ...info
    };
}

module.exports = { 
    mintNFT, 
    revokeNFT, 
    reinstateNFT,
    isTokenRevoked, 
    getTokenInfo,
    verifyCertificate
};


