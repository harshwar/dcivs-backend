# Backend Tests

Comprehensive test suite for the University NFT Certificate System backend.

## Structure

```
tests/
├── setup.js              # Test environment configuration
├── auth.test.js          # Authentication tests (register, login)
├── verification.test.js  # Certificate verification tests
├── batch.test.js         # Batch operations tests (CSV processing)
├── email.test.js         # Email service tests
└── middleware.test.js    # Auth & CSRF middleware tests
```

## Running Tests

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run specific test file
npm test -- auth.test.js

# Run tests in watch mode
npm run test:watch
```

## Test Coverage

Tests cover:
- ✅ Student registration
- ✅ Student/Admin login
- ✅ JWT token validation
- ✅ Certificate verification
- ✅ QR code generation
- ✅ Revocation/Reinstatement
- ✅ Batch CSV operations
- ✅ Email notifications
- ✅ CSRF protection
- ✅ Auth middleware

## Mocking Strategy

All external services are mocked:
- **Supabase** - Database operations
- **Nodemailer** - Email sending
- **Blockchain Service** - NFT operations
- **IPFS/Pinata** - File storage
