const EdgeTTS = require('node-edge-tts');
const fs = require('fs');
const path = require('path');

// --- Tour Script Copy (Must match useTour.js) ---
const tourScript = [
  { id: 0, title: "The Platform Masterclass", content: "Welcome to the end-to-end platform demonstration. We will journey through the Perimeter Security, the Admin Command Center, the AI Registration Pipeline, and finally, the Student Web3 Vault. Let's begin." },
  { id: 1, title: "Perimeter Defense", content: "Before a packet even reaches our controllers, our perimeter deflects malicious actors. We strictly enforce Helmet security headers, like X-S-S and Clickjacking protection. We also use backend Rate Limiting for D-DoS prevention, and sanitize all strings against injections." },
  { id: 2, title: "Authentication", content: "Passwords are irreversibly hashed server-side using bcrypt before storage. Let's step through the firewall into the Node Control Center." },
  { id: 3, title: "The Command Center", content: "Welcome to the Admin Node. Our backend is connected directly to an R-P-C node on the Ethereum Sepolia testnet, anchoring all critical data globally." },
  { id: 4, title: "Live Telemetry", content: "Real-time aggregated cryptanalytics. We track total wallet generation, issuance throughput, and the overall accuracy rating of our proprietary AI pipeline." },
  { id: 5, title: "System Health", content: "Active telemetry continuously measures microsecond ping latencies against the Database, the I-P-F-S network, and the Ethereum Blockchain JSON-R-P-C endpoints." },
  { id: 6, title: "AI Pipeline: The Entry Point", content: "Documents undergo a powerful sequential pipeline. Step 1: An OpenCV visual daemon executes morphological erosion and dilation to strip physical gridlines from certificates for massive OCR accuracy improvements." },
  { id: 7, title: "Zero-Trust Processing", content: "Step 2. The local Tesseract engine extracts every character. Step 3. Crucially, our mathematical similarity algorithms scrub all sensitive information... like names and I-D numbers... before the sanitized data hits the Gemini A-I for final mapping." },
  { id: 8, title: "Immutable Ledger Anchoring", content: "Step 4. The finalized A-I data is recursively hashed and anchored directly into the Ethereum blockchain via Smart Contract... minting an absolutely tamper-proof N-F-T." },
  { id: 9, title: "The Master Registry", content: "A live query of every NFT currently existing on the smart contract. Our contract supports cryptographic \"Burning\"—allowing an admin to permanently invalidate and destroy a compromised credential across the global network." },
  { id: 10, title: "Asynchronous Bulk Upload", content: "Uploading hundreds of CSV records bypasses the main blocking thread via background worker processing, implementing robust, line-by-line error mapping for high-scale operations." },
  { id: 11, title: "Debounced Queries", content: "Searching the global student ledger triggers debounced, exact-match algorithmic queries secured by deep database Row Level Security (RLS) constraints." },
  { id: 12, title: "Identity Verification", content: "Let's select a verified identity to initiate the wallet issuance protocol." },
  { id: 13, title: "Asymmetric Wallet Generation", content: "Clicking Approve triggers the highest security subsystem. A unique Ethereum wallet is generated in-memory. The raw private key is instantly heavily encrypted with AES-256 before ever touching persistent storage." },
  { id: 14, title: "Immutable Audit Trail", content: "To prevent rogue administrative actions, every critical API call (Approval, Revocation, Deletion) is permanently locked into an append-only internal audit table." },
  { id: 15, title: "Emergency Protocols", content: "The, Reissue All Wallets system, acts as a nuclear failsafe. It batches new security keys and dispatches temporary recovery payloads via Amazon S-E-S... to all compromised users simultaneously." },
  { id: 16, title: "Departing Admin Node", content: "We are now departing the Admin Node. We will cryptographically log in to the Student Gateway to inspect the Web3 identity layer." },
  { id: 17, title: "Student Gateway", content: "Let's authenticate as a student to see the private secure vault. Notice the same security perimeter applies here." },
  { id: 18, title: "The Web3 Identity", content: "Welcome to the Student Vault. Here, the student controls their own Ethereum identity. Everything operates heavily in the browser engine, using P-B-K-D-F-2 derivation algorithms to decrypt their secure vault client-side." },
  { id: 19, title: "Zero-Trust Checklists", content: "To combat social engineering, students must conform to zero-trust standards... enforcing Time-Based One Time Passwords, and hardware-backed biometric, Web Auth-N, Pass-keys." },
  { id: 20, title: "Public Cryptographic Proof", content: "Our backend is entirely irrelevant here. Any employer worldwide can enter a Token ID into this public node to mathematically cross-reference the Ethereum Smart Contract against the IPFS Hash distribution, proving authenticity directly on-chain." }
];

const OUTPUT_DIR = path.join(__dirname, '..', 'Frontend', 'nft-viewer', 'public', 'audio', 'tour');

async function generateAll() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    console.log(`Created directory: ${OUTPUT_DIR}`);
  }

  const tts = new EdgeTTS();
  const voice = 'en-US-AriaNeural';

  console.log(`🚀 Starting Audio Generation for ${tourScript.length} steps...`);

  for (const step of tourScript) {
    const filename = `step_${step.id}.mp3`;
    const filepath = path.join(OUTPUT_DIR, filename);
    const text = `${step.title}. ${step.content}`;

    console.log(`🎙️ Generating [${filename}]...`);

    try {
      const buffer = await tts.ttsPromise(text, voice);
      fs.writeFileSync(filepath, buffer);
      console.log(`✅ Saved: ${filename} (${buffer.length} bytes)`);
    } catch (err) {
      console.error(`❌ Failed to generate ${filename}:`, err);
    }
  }

  console.log('✨ All narration files generated successfully!');
}

generateAll();
