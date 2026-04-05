/**
 * Shared test fixtures — realistic mock data based on the DB schema.
 */

const bcrypt = require('bcryptjs');

// Pre-hashed password for "password123" (10 rounds)
const HASHED_PASSWORD = bcrypt.hashSync('password123', 10);

const students = {
  active: {
    id: 1,
    email: 'student@test.com',
    full_name: 'Test Student',
    password: HASHED_PASSWORD,
    student_id_number: '25TYBSCIT001',
    course_name: 'BSCIT',
    year: 'TY',
    status: 'ACTIVE',
    ethereum_address: '0x1234567890abcdef1234567890abcdef12345678',
    totp_enabled: false,
    wallet_pin_set: false,
    is_verified: true,
    created_at: '2025-01-01T00:00:00Z',
  },
  pendingEmail: {
    id: 2,
    email: 'pending@test.com',
    full_name: 'Pending Student',
    password: HASHED_PASSWORD,
    student_id_number: '25TYBSCIT002',
    course_name: 'BSCIT',
    year: 'TY',
    status: 'PENDING_EMAIL',
    ethereum_address: null,
    totp_enabled: false,
    wallet_pin_set: false,
    is_verified: false,
    verification_token: 'valid-verification-token-abc123',
    created_at: '2025-06-01T00:00:00Z',
  },
  pendingApproval: {
    id: 3,
    email: 'approval@test.com',
    full_name: 'Approval Student',
    password: HASHED_PASSWORD,
    student_id_number: '25TYBSCIT003',
    course_name: 'BSCIT',
    year: 'TY',
    status: 'PENDING_APPROVAL',
    ethereum_address: null,
    totp_enabled: false,
    wallet_pin_set: false,
    is_verified: true,
  },
  rejected: {
    id: 4,
    email: 'rejected@test.com',
    full_name: 'Rejected Student',
    password: HASHED_PASSWORD,
    student_id_number: '25TYBSCIT004',
    course_name: 'BSCIT',
    year: 'TY',
    status: 'REJECTED',
    ethereum_address: null,
    totp_enabled: false,
    wallet_pin_set: false,
    is_verified: true,
  },
  with2FA: {
    id: 5,
    email: 'twofactor@test.com',
    full_name: '2FA Student',
    password: HASHED_PASSWORD,
    student_id_number: '25TYBSCIT005',
    course_name: 'BSCIT',
    year: 'TY',
    status: 'ACTIVE',
    ethereum_address: '0xaabbccdd',
    totp_enabled: true,
    totp_secret: 'JBSWY3DPEHPK3PXP', // base32 test secret
    wallet_pin_set: true,
    is_verified: true,
  },
};

const admins = {
  default: {
    id: 100,
    email: 'admin@test.com',
    username: 'TestAdmin',
    password_hash: HASHED_PASSWORD,
    role: 'admin',
  },
  superAdmin: {
    id: 101,
    email: 'superadmin@test.com',
    username: 'SuperAdmin',
    password_hash: HASHED_PASSWORD,
    role: 'super_admin',
  },
};

const certificates = {
  valid: {
    id: 10,
    recipient_id: 1,
    title: 'Computer Science Award',
    description: 'For excellence in Computer Science',
    department: 'IT',
    issue_date: '2025-06-15T00:00:00Z',
    status: true,
  },
  revoked: {
    id: 11,
    recipient_id: 1,
    title: 'Revoked Certificate',
    description: 'This certificate was revoked',
    department: 'Science',
    issue_date: '2025-03-01T00:00:00Z',
    status: false,
  },
};

const nfts = {
  valid: {
    id: 20,
    certificate_id: 10,
    token_id: 1,
    transaction_hash: '0xabc123def456',
    ipfs_cid: 'ipfs://QmTestCID123',
    created_at: '2025-06-15T00:00:00Z',
  },
};

const wallets = {
  default: {
    id: 30,
    user_id: 1,
    public_address: '0x1234567890abcdef1234567890abcdef12345678',
    encrypted_json: JSON.stringify({ version: 3, crypto: {} }),
    created_at: '2025-01-02T00:00:00Z',
  },
};

const blockchainResponses = {
  mintSuccess: {
    tokenId: '1',
    transactionHash: '0xabc123def456789',
  },
  revokeSuccess: {
    transactionHash: '0xrevokehash123',
  },
  reinstateSuccess: {
    transactionHash: '0xreinstatehash123',
  },
  adminWalletInfo: {
    address: '0xAdminAddress',
    balance: '10.5',
    balanceWei: '10500000000000000000',
    network: 'localhost',
    estimatedGas: { mint: '0.002', revoke: '0.001' },
  },
};

const registrationInput = {
  valid: {
    email: 'newstudent@test.com',
    password: 'password123',
    full_name: 'New Student',
    student_id_number: '25TYBSCIT010',
    course_name: 'BSCIT',
    year: 'TY',
  },
  invalidId: {
    email: 'bad@test.com',
    password: 'password123',
    full_name: 'Bad Student',
    student_id_number: 'INVALID_FORMAT',
    course_name: 'BSCIT',
    year: 'TY',
  },
};

module.exports = {
  students,
  admins,
  certificates,
  nfts,
  wallets,
  blockchainResponses,
  registrationInput,
  HASHED_PASSWORD,
};
