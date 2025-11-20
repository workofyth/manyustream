const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');

const connectionString = process.env.DATABASE_URL || 'postgresql://streamflow:streamflow_password@localhost:5432/streamflow';

const pool = new Pool({
  connectionString,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

async function ensureExtensionAndMigrations() {
  const client = await pool.connect();
  try {
    // Ensure pgcrypto extension exists (must be outside transaction)
    try {
      await client.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
      console.log('[DB] pgcrypto extension ensured');
    } catch (extErr) {
      // If superuser is required, try to check if extension already exists
      try {
        await client.query('SELECT * FROM pg_extension WHERE extname = $1', ['pgcrypto']);
        console.log('[DB] pgcrypto extension already exists');
      } catch (checkErr) {
        console.warn('[DB] Warning: Could not verify pgcrypto extension:', extErr.message);
        // Don't fail here, let it fail on table creation if UUID function is missing
      }
    }

    // Ensure email column exists in users table (if table exists)
    try {
      await client.query(`
        ALTER TABLE IF EXISTS users 
        ADD COLUMN IF NOT EXISTS email VARCHAR(255) UNIQUE
      `);
      console.log('[DB] email column added to users table (if needed)');
    } catch (colErr) {
      console.warn('[DB] Could not add email column:', colErr.message);
      // Not fatal, table creation will handle it
    }

    // Create unique index on email if it doesn't exist
    try {
      await client.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email) 
        WHERE email IS NOT NULL
      `);
      console.log('[DB] email index ensured');
    } catch (idxErr) {
      console.warn('[DB] Could not create email index:', idxErr.message);
    }
  } catch (error) {
    console.error('[DB] Error in ensureExtensionAndMigrations:', error);
    throw error;
  } finally {
    client.release();
  }
}

async function createTables() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        username VARCHAR(255) UNIQUE NOT NULL,
        email VARCHAR(255) UNIQUE,
        password VARCHAR(255) NOT NULL,
        avatar_path TEXT,
        gdrive_api_key TEXT,
        user_role VARCHAR(50) DEFAULT 'admin',
        status VARCHAR(50) DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS videos (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title TEXT NOT NULL,
        filepath TEXT NOT NULL,
        thumbnail_path TEXT,
        file_size BIGINT,
        duration REAL,
        format VARCHAR(50),
        resolution VARCHAR(50),
        bitrate INTEGER,
        fps VARCHAR(20),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        upload_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS playlists (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        description TEXT,
        is_shuffle BOOLEAN DEFAULT false,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS playlist_videos (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        playlist_id UUID NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
        video_id UUID NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
        position INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(playlist_id, video_id)
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS channels (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        platform VARCHAR(100) NOT NULL,
        platform_icon VARCHAR(100),
        rtmp_url TEXT NOT NULL,
        stream_key TEXT NOT NULL,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_channels_user_id ON channels(user_id)
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS streams (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title TEXT NOT NULL,
        video_id UUID REFERENCES videos(id) ON DELETE SET NULL,
        rtmp_url TEXT,
        stream_key TEXT,
        platform VARCHAR(100),
        platform_icon VARCHAR(100),
        bitrate INTEGER DEFAULT 2500,
        resolution VARCHAR(50),
        fps INTEGER DEFAULT 30,
        orientation VARCHAR(50) DEFAULT 'horizontal',
        loop_video BOOLEAN DEFAULT true,
        schedule_time TIMESTAMP,
        recurrence_type VARCHAR(50),
        recurrence_value VARCHAR(100),
        duration INTEGER,
        status VARCHAR(50) DEFAULT 'offline',
        status_updated_at TIMESTAMP,
        start_time TIMESTAMP,
        end_time TIMESTAMP,
        use_advanced_settings BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        user_id UUID REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS stream_channels (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        stream_id UUID NOT NULL REFERENCES streams(id) ON DELETE CASCADE,
        channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(stream_id, channel_id)
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_stream_channels_stream_id ON stream_channels(stream_id)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_stream_channels_channel_id ON stream_channels(channel_id)
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS stream_history (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        stream_id UUID REFERENCES streams(id) ON DELETE SET NULL,
        title TEXT NOT NULL,
        platform VARCHAR(100),
        platform_icon VARCHAR(100),
        video_id UUID REFERENCES videos(id) ON DELETE SET NULL,
        video_title TEXT,
        resolution VARCHAR(50),
        bitrate INTEGER,
        fps INTEGER,
        start_time TIMESTAMP,
        end_time TIMESTAMP,
        duration INTEGER,
        use_advanced_settings BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        user_id UUID REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_streams_user_id ON streams(user_id)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_streams_status ON streams(status)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_streams_schedule_time ON streams(schedule_time)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_videos_user_id ON videos(user_id)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_stream_history_user_id ON stream_history(user_id)
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS user_sessions (
        sid VARCHAR(255) PRIMARY KEY,
        sess JSON NOT NULL,
        expire TIMESTAMP(6) NOT NULL
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_user_sessions_expire ON user_sessions(expire)
    `);

    // Add missing columns to streams table if they don't exist
    await client.query(`
      ALTER TABLE streams
      ADD COLUMN IF NOT EXISTS rtmp_url TEXT,
      ADD COLUMN IF NOT EXISTS stream_key TEXT,
      ADD COLUMN IF NOT EXISTS platform VARCHAR(100),
      ADD COLUMN IF NOT EXISTS platform_icon VARCHAR(100)
    `);

    await client.query('COMMIT');
    console.log('Database tables created successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creating tables:', error);
    throw error;
  } finally {
    client.release();
  }
}

async function checkIfUsersExist() {
  try {
    const result = await pool.query('SELECT COUNT(*) as count FROM users');
    const count = parseInt(result.rows[0].count);
    console.log(`[DEBUG] checkIfUsersExist - Count: ${count}, Result: ${count > 0}`);
    return count > 0;
  } catch (error) {
    console.error('Error checking users:', error);
    return false;
  }
}

async function initDatabase() {
  try {
    await pool.query('SELECT NOW()');
    console.log('[DB] PostgreSQL connected successfully');
    
    // Run migrations first (extension, add columns, indexes)
    console.log('[DB] Running migrations...');
    await ensureExtensionAndMigrations();
    
    // Then create tables (if they don't exist)
    console.log('[DB] Creating tables...');
    await createTables();
  } catch (error) {
    console.error('[DB] Error initializing database:', error);
    throw error;
  }
}

module.exports = {
  pool,
  query: (text, params) => pool.query(text, params),
  checkIfUsersExist,
  initDatabase
};
