/**
 * Input Validation Middleware using Zod
 * Provides type-safe validation for all API inputs
 */
const { z } = require('zod');

// --- SCHEMA DEFINITIONS ---

// Registration schema
const registerSchema = z.object({
    email: z.string().email('Invalid email format'),
    password: z.string().min(6, 'Password must be at least 6 characters'),
    full_name: z.string().min(2, 'Full name is required'),
    student_id_number: z.string().min(1, 'Student ID is required'),
    course_name: z.string().min(1, 'Course name is required'),
    year: z.string().min(1, 'Year is required'),
});

// Login schema
const loginSchema = z.object({
    email: z.string().email('Invalid email format'),
    password: z.string().min(1, 'Password is required'),
});

// Wallet creation schema
const walletSchema = z.object({
    password: z.string().min(6, 'Wallet password must be at least 6 characters'),
});

// NFT issuance schema (for body fields, file handled by multer)
const nftIssueSchema = z.object({
    recipientId: z.string().min(1, 'Recipient ID is required'),
    title: z.string().min(1, 'Certificate title is required'),
    description: z.string().optional(),
    department: z.string().optional(),
});

// --- VALIDATION MIDDLEWARE FACTORY ---

/**
 * Creates a validation middleware for the given schema
 * @param {z.ZodSchema} schema - Zod schema to validate against
 * @returns {Function} Express middleware function
 */
function validate(schema) {
    return (req, res, next) => {
        try {
            // Parse and validate request body
            const validated = schema.parse(req.body);
            // Replace body with validated/cleaned data
            req.body = validated;
            next();
        } catch (error) {
            if (error instanceof z.ZodError) {
                // Format Zod errors into readable messages
                const messages = error.errors.map(e => `${e.path.join('.')}: ${e.message}`);
                return res.status(400).json({
                    error: 'Validation failed',
                    details: messages
                });
            }
            next(error);
        }
    };
}

// --- EXPORT VALIDATORS ---

module.exports = {
    validateRegister: validate(registerSchema),
    validateLogin: validate(loginSchema),
    validateWallet: validate(walletSchema),
    validateNftIssue: validate(nftIssueSchema),
    // Export schemas for testing
    schemas: {
        registerSchema,
        loginSchema,
        walletSchema,
        nftIssueSchema,
    }
};
