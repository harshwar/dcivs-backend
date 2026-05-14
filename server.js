//For code rabbit 2
// Load environment variables from .env file
require("dotenv").config();
// Initialize Express framework
const express = require("express");
// Enable Cross-Origin Resource Sharing (allows frontend to access the API)
const cors = require("cors");
// Security headers middleware
const helmet = require("helmet");
// Middleware for handling file uploads
const multer = require('multer'); 
// HTTP client for making external requests (e.g. to IPFS)
const axios = require('axios');   
// Helper for formatting form data (used in IPFS uploads)
const FormData = require('form-data'); 
// Node.js file system module
const fs = require('fs');
// Cookie parsing middleware (required for CSRF protection)
const cookieParser = require('cookie-parser'); 

// Import Supabase client
const supabase = require("./db");
// Import wallet creation utility
const { createEncryptedWallet } = require("./services/walletService");
// Import authentication logic (registration and login)
const { register, verifyEmail, login, changePassword, forgotPassword, resetPassword, resendVerificationEmail } = require('./controllers/authController');
// Import middleware to protect private routes
const { authenticateToken, requireAdmin } = require("./middleware/authMiddleware");
// Import NFT-specific routes
const nftRoutes = require("./routes/nftRoutes");
// Import AI-specific routes
const aiRoutes = require("./routes/aiRoutes");
// Import rate limiters
const { authLimiter, apiLimiter, mintLimiter } = require("./middleware/rateLimiter");
// Import error handlers
const { errorHandler, notFoundHandler } = require("./middleware/errorHandler");
// Import CSRF protection
const { csrfProtection, getCsrfToken } = require("./middleware/csrfProtection");

// Import Wallet Controller
const walletController = require("./controllers/walletController");
// 🚨 REMOVED: Neural TTS Proxy (Using static assets instead)

// Create Express application instance
const app = express();
// Server port configuration
const port = 3001;

// Trust the first proxy (e.g., Render, Nginx, load balancer)
// This is required for express-rate-limit when deployed behind a proxy
app.set('trust proxy', 1);

// CORS configuration to allow local frontend access
// CORS CONFIGURATION
// Security headers (helmet)
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }, // Allow IPFS images
  contentSecurityPolicy: false // Disable CSP for development
}));

// CORS configuration
app.use(cors({
  origin: [
    'http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175',
    'http://127.0.0.1:5173', 'http://127.0.0.1:5174', 'http://127.0.0.1:5175',
    'http://localhost', 
    'capacitor://localhost',
    'https://dcivs.online',
    'https://www.dcivs.online',
    'https://dcivs-frontend.vercel.app', // Vercel Preview/Default
    /\.vercel\.app$/, // Allow all Vercel subdomins
    /\/\/192\.168\.\d+\.\d+(:[0-9]+)?$/ 
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token']
}));

// Parse cookies (required for CSRF protection)
app.use(cookieParser());

// Parse incoming JSON request bodies with security limit
// 100KB is sufficient for all JSON payloads (wallet keystores are ~3KB, metadata ~1KB)
// File uploads bypass this limit since they use multipart/form-data via multer
app.use(express.json({ limit: '100kb' }));

// Parse URL-encoded form data (with same security limit)
app.use(express.urlencoded({ extended: true, limit: '100kb' }));

// Apply general rate limiter to all API routes
app.use('/api/', apiLimiter);

// Apply CSRF protection to all state-changing routes
// Note: Routes using Bearer token auth are automatically exempt (see middleware)
app.use('/api/', csrfProtection);

// CSRF token endpoint - clients call this to get a token before making POST requests
app.get('/api/csrf-token', getCsrfToken);

// --- KEEP-ALIVE ENDPOINT (no auth, no rate limit) ---
// Lightweight health check to prevent free-tier hosting (Render) from sleeping
app.get('/api/ping', (req, res) => {
  res.json({ status: 'alive', timestamp: new Date().toISOString() });
});

// --- PUBLIC ASSETS ---
// (Narration is served directly as static files from the frontend /public directory)

// --- API ROUTES ---

// 1. NFT-related endpoints (Minting, Issuance)
app.use("/api/nft", nftRoutes);

// AI-related endpoints (Certificate auto-fill)
app.use("/api/ai", aiRoutes);

// 2. Verification endpoints (Public + Admin)
const verificationRoutes = require("./routes/verificationRoutes");
app.use("/api/verify", verificationRoutes);

// 3. Batch operations (CSV uploads for bulk registration/minting)
const batchRoutes = require("./routes/batchRoutes");
app.use("/api/batch", batchRoutes);
app.use("/api/admin", require("./routes/adminRoutes"));

// Job status polling endpoint (background jobs progress tracker)
const jobRoutes = require("./routes/jobRoutes");
app.use("/api/job-status", jobRoutes);

// 4. Passkey (WebAuthn) routes
const passkeyRoutes = require("./routes/passkeyRoutes");
app.use("/api/auth/passkey", passkeyRoutes);

// 2. Authentication endpoints (with stricter rate limit)
// Public registration route
app.post("/api/auth/register", authLimiter, register);
// Email verification route
app.get("/api/auth/verify-email", authLimiter, verifyEmail);
// Public login route
// Public login route
app.post("/api/auth/login", authLimiter, login);
// Change Password route
app.post("/api/auth/change-password", authenticateToken, authLimiter, changePassword);
// Forgot / Reset Password (public, rate-limited)
app.post('/api/auth/forgot-password', authLimiter, forgotPassword);
app.post('/api/auth/reset-password', authLimiter, resetPassword);
app.post('/api/auth/resend-verification', authLimiter, resendVerificationEmail);

// 5. Two-Factor Authentication routes
const { setup2FA, verifySetup2FA, validate2FA, disable2FA } = require("./controllers/twoFactorController");
app.post("/api/auth/2fa/setup", authenticateToken, setup2FA);
app.post("/api/auth/2fa/verify-setup", authenticateToken, verifySetup2FA);
app.post("/api/auth/2fa/validate", authLimiter, validate2FA);
app.post("/api/auth/2fa/disable", authenticateToken, disable2FA);

// Private route to get current user's profile
app.get("/api/auth/me", authenticateToken, async (req, res) => {
  try {
    const isAdmin = req.user.role === 'admin' || req.user.role === 'super_admin';

    if (isAdmin) {
      // Admin profile from admins table
      const { data: admin, error } = await supabase
        .from('admins')
        .select('id, username, email, role, totp_enabled, created_at')
        .eq('id', req.user.id)
        .single();

      if (error || !admin) return res.status(404).json({ error: 'Admin not found.' });

      // Count admin passkeys
      const { count: passkeyCount } = await supabase
        .from('passkeys')
        .select('id', { count: 'exact', head: true })
        .eq('admin_id', req.user.id);

      return res.json({
        ...admin,
        full_name: admin.username, // normalise key for frontend
        has_passkeys: (passkeyCount || 0) > 0
      });
    }

    // Student profile from students table
    const { data: fullProfile, error } = await supabase
        .from('students')
        .select('id, full_name, email, student_id_number, course_name, year, ethereum_address, totp_enabled, wallet_pin_set, is_verified, created_at')
        .eq('id', req.user.id)
        .single();

    if (error || !fullProfile) return res.status(404).json({ error: 'User not found.' });

    // Check if student has any passkeys
    const { count: passkeyCount } = await supabase
      .from('passkeys')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', req.user.id);

    res.json({
      ...fullProfile,
      has_passkeys: (passkeyCount || 0) > 0
    });
  } catch (error) {
    console.error("Error fetching me:", error);
    res.status(500).json({ error: "Failed to fetch profile." });
  }
});


// 3. User & Admin Helpers

// Admin route to get all certificates issued in the system
app.get("/api/certificates", authenticateToken, requireAdmin, async (req, res) => {
    try {
        // Fetch certificates with related student and nft data
        const { data, error } = await supabase
            .from('certificates')
            .select(`
                id, 
                title, 
                department,
                description,
                issue_date, 
                student:students (id, full_name, student_id_number, course_name),
                nft:nfts (token_id, transaction_hash, ipfs_cid)
            `)
            .order('issue_date', { ascending: false });

        if (error) throw error;

        // Map to structure expected by CertificatesRegistry
        const mappedResults = data.map(c => ({
            id: c.id,
            title: c.title,
            department: c.department,
            description: c.description,
            issue_date: c.issue_date,
            student: c.student || null,
            // Robustly handle single object vs array returned by PostgREST
            nft: Array.isArray(c.nft) ? c.nft[0] : (c.nft || null)
        }));

        res.json(mappedResults);
    } catch (error) {
        console.error("Error fetching certificates:", error);
        res.status(500).json({ error: "Failed to fetch certificates." });
    }
});

// Admin Analytics Route
const { getAnalytics } = require('./controllers/analyticsController');
app.get("/api/admin/analytics", authenticateToken, requireAdmin, async (req, res) => {
    await getAnalytics(req, res);
});

// System Health Route
const { getSystemHealth } = require('./controllers/healthController');
app.get("/api/admin/health", authenticateToken, requireAdmin, async (req, res) => {
    await getSystemHealth(req, res);
});

// Admin route to fetch all registered students (useful for dropdowns)
app.get("/api/students", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('students')
      .select('id, full_name, student_id_number, ethereum_address, course_name, year')
      .order('full_name', { ascending: true });

    if (error) throw error;

    // Map fields to match pre-existing aliases (name, roll, wallet)
    const mappedStudents = data.map(s => ({
        id: s.id,
        name: s.full_name,
        roll: s.student_id_number,
        wallet: s.ethereum_address,
        course: s.course_name,
        year: s.year
    }));
    
    res.json(mappedStudents);
  } catch (error) {
    console.error("Error fetching students:", error);
    res.status(500).json({ error: "Failed to fetch students." });
  }
});

// Helper function to fetch student by ID from database
// Student Details Route (Admin Only)
const { getStudentDetails } = require('./controllers/studentController');
app.get("/api/students/:id/details", authenticateToken, requireAdmin, async (req, res) => {
    await getStudentDetails(req, res);
});

// Helper function to fetch student by ID from database
async function getStudentById(id) {
  const { data, error } = await supabase
    .from('students')
    .select('id, full_name, email')
    .eq('id', id)
    .single();
    
  if (error) {
      console.error("getStudentById Error:", error);
      return null;
  }
  return data;
}

// 4. Custodial Wallet APIs (using modular controller)

app.post("/api/wallet/create", authenticateToken, walletController.createWallet);
app.post("/api/wallet/import", authenticateToken, walletController.importWallet);
app.post("/api/wallet/update", authenticateToken, walletController.updateWallet);
app.get("/api/wallet/me", authenticateToken, walletController.getWallet);
app.get("/api/wallet/assets", authenticateToken, walletController.getAssets);

// --- IPFS PROXY ---
// --- IPFS PROXY ---
// Relays IPFS requests to avoid CORS issues in the browser
// Fallback list of public gateways
const IPFS_GATEWAYS = [
    "https://gateway.pinata.cloud/ipfs/",
    "https://ipfs.io/ipfs/",
    "https://dweb.link/ipfs/",
    "https://w3s.link/ipfs/",
    "https://nftstorage.link/ipfs/"
];

app.get("/api/ipfs/:cid", async (req, res) => {
    const { cid } = req.params;
    if (!cid) return res.status(400).send("CID is required");

    // Add random delay to prevent hitting rate limits simultaneously
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    for (const gateway of IPFS_GATEWAYS) {
        try {
            const gatewayUrl = `${gateway}${cid}`;
            console.log(`[IPFS Proxy] Trying: ${gatewayUrl}`); 
            
            // Random delay between 100-500ms
            await sleep(100 + Math.random() * 400);

            const response = await axios.get(gatewayUrl, {
                responseType: 'stream',
                timeout: 8000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                }
            });
            
            // If successful, pipe and exit
            res.setHeader('Content-Type', response.headers['content-type']);
            response.data.pipe(res);
            return;
            
        } catch (error) {
            const status = error.response ? error.response.status : 'Network Error';
            console.warn(`[IPFS Proxy] Failed ${gateway}: ${status}`);
        }
    }

    // If all fail
    console.error(`[IPFS Proxy] All gateways failed for CID: ${cid}`);
    res.status(502).send(`Failed to fetch IPFS content for ${cid}`);
});

// --- ERROR HANDLING (must be last) ---
// 404 handler for undefined routes
app.use(notFoundHandler);
// Global error handler
app.use(errorHandler);

// Start the server and listen for incoming HTTP requests
app.listen(port, () => {
  console.log(`✅ Server running on http://localhost:${port}`);
  console.log(`🛡️  Security Features Active:`);
  console.log(`   • Helmet security headers`);
  console.log(`   • Rate limiting (auth: 10/15min, api: 100/15min, mint: 10/hr)`);
  console.log(`   • Body size limits (JSON: 100KB)`);
  console.log(`   • Input validation (Zod schemas)`);
  console.log(`   • CSRF protection (double-submit cookie)`);
});
