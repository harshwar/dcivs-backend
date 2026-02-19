const supabase = require('../db');
const { ethers } = require('ethers');
const axios = require('axios');

// RPC URL from env or default to local
const RPC_URL = process.env.RPC_URL || 'http://127.0.0.1:8545';

// List of IPFS Gateways to check (Hello World CID)
const TEST_CID = 'bafybeib36krhprhquz26k7wx52d47s84232w5f5o644y3552j635t3rdy';
const IPFS_GATEWAYS = [
  'https://cloudflare-ipfs.com/ipfs/',
  'https://ipfs.io/ipfs/',
  'https://gateway.pinata.cloud/ipfs/',
  'https://dweb.link/ipfs/'
];

/**
 * GET /api/admin/health
 * Checks status of:
 * 1. Database (Supabase)
 * 2. Blockchain (Local Hardhat Node)
 * 3. IPFS Gateway (Multi-gateway check)
 * 4. API Latency
 */
async function getSystemHealth(req, res) {
  const start = Date.now();
  const health = {
    status: 'healthy',
    checks: {},
    timestamp: new Date().toISOString()
  };

  // 1. Database Check
  try {
    const dbStart = Date.now();
    const { error } = await supabase.from('students').select('id').limit(1);
    if (error) throw error;
    health.checks.database = { 
      status: 'connected', 
      latency_ms: Date.now() - dbStart 
    };
  } catch (err) {
    health.status = 'degraded';
    health.checks.database = { status: 'disconnected', error: err.message };
  }

  // 2. Blockchain Check
  try {
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    // Set a short timeout for the check
    const blockNumber = await Promise.race([
        provider.getBlockNumber(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 2000))
    ]);
    
    health.checks.blockchain = { 
        status: 'connected', 
        blockHeight: blockNumber,
        network: (await provider.getNetwork()).name
    };
  } catch (err) {
    health.status = 'degraded';
    health.checks.blockchain = { status: 'disconnected', error: err.message || 'Unreachable' };
  }

  // 3. IPFS Service Check (Pinata Authentication)
  const ipfsStart = Date.now();
  try {
    const pinataApiKey = process.env.PINATA_API_KEY;
    const pinataSecretKey = process.env.PINATA_API_SECRET;
    
    if (!pinataApiKey || !pinataSecretKey) {
        throw new Error('Pinata keys missing in .env');
    }

    await axios.get('https://api.pinata.cloud/data/testAuthentication', {
        headers: {
            'pinata_api_key': pinataApiKey,
            'pinata_secret_api_key': pinataSecretKey
        },
        timeout: 5000
    });
    
    health.checks.ipfs = { 
      status: 'authenticated', 
      latency_ms: Date.now() - ipfsStart,
      service: 'Pinata API'
    };
  } catch (err) {
    console.error('Pinata Auth Failed:', err.message);
    health.checks.ipfs = { 
        status: 'unreachable', 
        error: err.response?.data?.error || err.message,
        service: 'Pinata API' 
    };
  }

  // 4. API Latency
  health.checks.api = {
    latency_ms: Date.now() - start
  };

  res.json(health);
}

module.exports = { getSystemHealth };
