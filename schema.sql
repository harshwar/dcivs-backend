-- Database Schema (Based on Live Project Structure)
-- 1. Students Table
CREATE TABLE IF NOT EXISTS students (
    id SERIAL PRIMARY KEY,
    full_name VARCHAR(255),
    student_id_number VARCHAR(100),
    course_name VARCHAR(100),
    year VARCHAR(10),
    ethereum_address VARCHAR(42),
    email VARCHAR(255) UNIQUE,
    password VARCHAR(255),
    totp_secret TEXT DEFAULT NULL,
    totp_enabled BOOLEAN DEFAULT FALSE,
    recovery_codes TEXT DEFAULT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
-- 2. Wallets Table
CREATE TABLE IF NOT EXISTS wallets (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES students(id) ON DELETE CASCADE,
    public_address TEXT NOT NULL,
    encrypted_json TEXT NOT NULL,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id)
);
-- 3. Admins Table
CREATE TABLE IF NOT EXISTS admins (
    id SERIAL PRIMARY KEY,
    username VARCHAR(255) UNIQUE,
    email VARCHAR(255) UNIQUE,
    password_hash VARCHAR(255),
    role VARCHAR(50) DEFAULT 'admin',
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
-- 4. Certificates Table
CREATE TABLE IF NOT EXISTS certificates (
    id SERIAL PRIMARY KEY,
    recipient_id INTEGER REFERENCES students(id) ON DELETE CASCADE,
    issuer_id INTEGER REFERENCES admins(id) ON DELETE
    SET NULL,
        title VARCHAR(255),
        description TEXT,
        department VARCHAR(255),
        issue_date TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        status BOOLEAN DEFAULT TRUE
);
-- 5. NFTs Table
CREATE TABLE IF NOT EXISTS nfts (
    id SERIAL PRIMARY KEY,
    certificate_id INTEGER REFERENCES certificates(id) ON DELETE CASCADE,
    token_id BIGINT,
    ipfs_cid VARCHAR(255),
    transaction_hash VARCHAR(255),
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
-- 6. Activity Logs Table
CREATE TABLE IF NOT EXISTS activity_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES students(id) ON DELETE
    SET NULL,
        admin_id INTEGER REFERENCES admins(id) ON DELETE
    SET NULL,
        action VARCHAR(255),
        details TEXT,
        ip_address VARCHAR(45),
        timestamp TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
-- 7. Passkeys Table (WebAuthn Credentials)
CREATE TABLE IF NOT EXISTS passkeys (
    id TEXT PRIMARY KEY,
    user_id INTEGER REFERENCES students(id) ON DELETE CASCADE,
    public_key TEXT NOT NULL,
    counter BIGINT DEFAULT 0,
    device_type VARCHAR(50),
    backed_up BOOLEAN DEFAULT FALSE,
    transports TEXT [],
    friendly_name VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
-- Indexes
CREATE INDEX IF NOT EXISTS idx_students_email ON students(email);
CREATE INDEX IF NOT EXISTS idx_wallets_userid ON wallets(user_id);
CREATE INDEX IF NOT EXISTS idx_passkeys_userid ON passkeys(user_id);