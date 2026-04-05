const fs = require('fs');
const { ethers } = require('ethers'); 
const RPC_URL = process.env.RPC_URL || 'https://sepolia.infura.io/v3/2eabd64ed3ff4a41ae8411f4d2a2158a'; 

async function run() { 
  const provider = new ethers.JsonRpcProvider(RPC_URL); 
  const targetAddress = '0xb173e4E236d596C6D78D6183f28Bc75599c65cd8';
  
  const code = await provider.getCode(targetAddress);
  const balance = await provider.getBalance(targetAddress);
  const txCount = await provider.getTransactionCount(targetAddress);
  
  let out = 'Target Address: ' + targetAddress + '\n';
  out += 'Code length: ' + code.length + '\n';
  out += 'Code snippet: ' + code.slice(0, 50) + '\n';
  out += 'Balance (wei): ' + balance.toString() + '\n';
  out += 'Nonce (Transactions sent by this address): ' + txCount + '\n';
  fs.writeFileSync('logs.txt', out);
} 
run().catch(e => fs.writeFileSync('logs.txt', String(e)));
