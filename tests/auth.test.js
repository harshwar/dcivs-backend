/**
 * Authentication Controller Tests
 * Tests for student registration, login, and admin authentication
 */

const request = require('supertest');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Mock dependencies before requiring the app
jest.mock('../db', () => ({
  from: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  insert: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  single: jest.fn()
}));

jest.mock('../walletService', () => ({
  createEncryptedWallet: jest.fn().mockResolvedValue({
    address: '0x1234567890abcdef1234567890abcdef12345678',
    encryptedJson: '{"encrypted": "wallet"}'
  })
}));

jest.mock('../services/emailService', () => ({
  sendWelcomeEmail: jest.fn().mockResolvedValue({ success: true })
}));

// Import after mocks
const express = require('express');
const { register, login } = require('../controllers/authController');

// Create test app
const app = express();
app.use(express.json());
app.post('/register', register);
app.post('/login', login);

const supabase = require('../db');

describe('Authentication Controller', () => {
  
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ============================================
  // REGISTRATION TESTS
  // ============================================
  
  describe('POST /register', () => {
    
    const validStudent = {
      email: 'test@example.com',
      password: 'password123',
      full_name: 'Test Student',
      student_id_number: '2024-001',
      course_name: 'Computer Science',
      year: '2024'
    };

    test('should register a new student successfully', async () => {
      // Mock: No existing user
      supabase.single.mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } });
      
      // Mock: Student insert
      supabase.single.mockResolvedValueOnce({
        data: { id: 1, email: validStudent.email, full_name: validStudent.full_name },
        error: null
      });
      
      // Mock: Wallet insert
      supabase.from.mockReturnValueOnce({
        insert: jest.fn().mockResolvedValue({ error: null })
      });

      const response = await request(app)
        .post('/register')
        .send(validStudent);

      expect(response.status).toBe(201);
      expect(response.body.message).toBe('Registered successfully.');
      expect(response.body.token).toBeDefined();
      expect(response.body.user).toBeDefined();
    });

    test('should reject registration with missing fields', async () => {
      const incompleteStudent = {
        email: 'test@example.com',
        password: 'password123'
        // Missing: full_name, student_id_number, course_name, year
      };

      const response = await request(app)
        .post('/register')
        .send(incompleteStudent);

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('required');
    });

    test('should reject duplicate email registration', async () => {
      // Mock: Existing user found
      supabase.single.mockResolvedValueOnce({
        data: { id: 1 },
        error: null
      });

      const response = await request(app)
        .post('/register')
        .send(validStudent);

      expect(response.status).toBe(409);
      expect(response.body.error).toBe('Email already registered.');
    });

  });

  // ============================================
  // LOGIN TESTS
  // ============================================
  
  describe('POST /login', () => {

    test('should login with valid credentials', async () => {
      const hashedPassword = await bcrypt.hash('password123', 10);
      
      // Mock: Admin check (not found)
      supabase.single.mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } });
      
      // Mock: Student found
      supabase.single.mockResolvedValueOnce({
        data: {
          id: 1,
          email: 'test@example.com',
          full_name: 'Test Student',
          password: hashedPassword
        },
        error: null
      });

      const response = await request(app)
        .post('/login')
        .send({ email: 'test@example.com', password: 'password123' });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Login successful.');
      expect(response.body.token).toBeDefined();
    });

    test('should reject login with invalid password', async () => {
      const hashedPassword = await bcrypt.hash('correctpassword', 10);
      
      // Mock: Admin check (not found)
      supabase.single.mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } });
      
      // Mock: Student found
      supabase.single.mockResolvedValueOnce({
        data: {
          id: 1,
          email: 'test@example.com',
          full_name: 'Test Student',
          password: hashedPassword
        },
        error: null
      });

      const response = await request(app)
        .post('/login')
        .send({ email: 'test@example.com', password: 'wrongpassword' });

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Invalid credentials.');
    });

    test('should reject login with missing credentials', async () => {
      const response = await request(app)
        .post('/login')
        .send({ email: 'test@example.com' }); // Missing password

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('required');
    });

    test('should reject login for non-existent user', async () => {
      // Mock: Admin check (not found)
      supabase.single.mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } });
      
      // Mock: Student not found
      supabase.single.mockResolvedValueOnce({
        data: null,
        error: { code: 'PGRST116' }
      });

      const response = await request(app)
        .post('/login')
        .send({ email: 'nonexistent@example.com', password: 'password123' });

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Invalid credentials.');
    });

    test('should allow backup admin login', async () => {
      const response = await request(app)
        .post('/login')
        .send({ email: 'backup_admin@test.com', password: 'admin_backup_123' });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Backup Admin Login successful.');
      expect(response.body.user.role).toBe('admin');
    });

  });

});
