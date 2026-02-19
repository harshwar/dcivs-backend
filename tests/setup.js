/**
 * Test Setup File
 * Configures the test environment before running tests
 */

// Load environment variables
require('dotenv').config();

// Set test environment
process.env.NODE_ENV = 'test';

// Increase timeout for async operations
jest.setTimeout(30000);

// Global test cleanup
afterAll(async () => {
  // Close any open connections
  // Add cleanup logic here if needed
});

// Mock console.log in tests to reduce noise (optional)
// global.console = {
//   ...console,
//   log: jest.fn(),
// };
