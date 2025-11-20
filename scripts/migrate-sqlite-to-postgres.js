#!/usr/bin/env node

require('dotenv').config();
const sqlite3 = require('sqlite3').verbose();
const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');

const SQLITE_DB_PATH = path.join(__dirname, '../db/streamflow.db');

const pgPool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://streamflow:streamflow_password@localhost:5432/streamflow',
});

const sqliteDb = new sqlite3.Database(SQLITE_DB_PATH, sqlite3.OPEN_READONLY, (err) => {
  if (err) {
    console.error('❌ Error opening SQLite database:', err.message);
    console.error('Make sure', SQLITE_DB_PATH, 'exists');
    process.exit(1);
  }
  console.log('✅ Connected to SQLite database');
});

function sqliteQuery(query, params = []) {
  return new Promise((resolve, reject) => {
    sqliteDb.all(query, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

async function migrateUsers() {
  console.log('\n📋 Migrating Users...');
  
  try {
    const users = await sqliteQuery('SELECT * FROM users');
    console.log(`   Found ${users.length} users to migrate`);
    
    for (const user of users) {
      await pgPool.query(
        `INSERT INTO users (id, username, password, avatar_path, gdrive_api_key, user_role, status, created_at, updated_at)
         VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (id) DO UPDATE SET
           username = EXCLUDED.username,
           password = EXCLUDED.password,
           avatar_path = EXCLUDED.avatar_path,
           gdrive_api_key = EXCLUDED.gdrive_api_key,
           user_role = EXCLUDED.user_role,
           status = EXCLUDED.status`,
        [
          user.id,
          user.username,
          user.password,
          user.avatar_path,
          user.gdrive_api_key,
          user.user_role || 'admin',
          user.status || 'active',
          user.created_at || new Date().toISOString(),
          user.updated_at || new Date().toISOString()
        ]
      );
      console.log(`   ✓ Migrated user: ${user.username}`);
    }
    
    console.log(`✅ Successfully migrated ${users.length} users`);
    return users.length;
  } catch (error) {
    console.error('❌ Error migrating users:', error);
    throw error;
  }
}

async function migrateVideos() {
  console.log('\n📋 Migrating Videos...');
  
  try {
    const videos = await sqliteQuery('SELECT * FROM videos');
    console.log(`   Found ${videos.length} videos to migrate`);
    
    for (const video of videos) {
      await pgPool.query(
        `INSERT INTO videos (id, title, filepath, thumbnail_path, file_size, duration, format, resolution, bitrate, fps, user_id, upload_date, created_at, updated_at)
         VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::uuid, $12, $13, $14)
         ON CONFLICT (id) DO UPDATE SET
           title = EXCLUDED.title,
           filepath = EXCLUDED.filepath,
           thumbnail_path = EXCLUDED.thumbnail_path`,
        [
          video.id,
          video.title,
          video.filepath,
          video.thumbnail_path,
          video.file_size,
          video.duration,
          video.format,
          video.resolution,
          video.bitrate,
          video.fps,
          video.user_id,
          video.upload_date || new Date().toISOString(),
          video.created_at || new Date().toISOString(),
          video.updated_at || new Date().toISOString()
        ]
      );
      console.log(`   ✓ Migrated video: ${video.title}`);
    }
    
    console.log(`✅ Successfully migrated ${videos.length} videos`);
    return videos.length;
  } catch (error) {
    console.error('❌ Error migrating videos:', error);
    throw error;
  }
}

async function migratePlaylists() {
  console.log('\n📋 Migrating Playlists...');
  
  try {
    const playlists = await sqliteQuery('SELECT * FROM playlists');
    console.log(`   Found ${playlists.length} playlists to migrate`);
    
    for (const playlist of playlists) {
      await pgPool.query(
        `INSERT INTO playlists (id, name, description, is_shuffle, user_id, created_at, updated_at)
         VALUES ($1::uuid, $2, $3, $4, $5::uuid, $6, $7)
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           description = EXCLUDED.description,
           is_shuffle = EXCLUDED.is_shuffle`,
        [
          playlist.id,
          playlist.name,
          playlist.description,
          playlist.is_shuffle === 1,
          playlist.user_id,
          playlist.created_at || new Date().toISOString(),
          playlist.updated_at || new Date().toISOString()
        ]
      );
      console.log(`   ✓ Migrated playlist: ${playlist.name}`);
    }
    
    console.log(`✅ Successfully migrated ${playlists.length} playlists`);
    return playlists.length;
  } catch (error) {
    console.error('❌ Error migrating playlists:', error);
    throw error;
  }
}

async function migratePlaylistVideos() {
  console.log('\n📋 Migrating Playlist Videos...');
  
  try {
    const playlistVideos = await sqliteQuery('SELECT * FROM playlist_videos');
    console.log(`   Found ${playlistVideos.length} playlist-video relationships to migrate`);
    
    for (const pv of playlistVideos) {
      await pgPool.query(
        `INSERT INTO playlist_videos (id, playlist_id, video_id, position, created_at)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5)
         ON CONFLICT (id) DO NOTHING`,
        [
          pv.id,
          pv.playlist_id,
          pv.video_id,
          pv.position,
          pv.created_at || new Date().toISOString()
        ]
      );
    }
    
    console.log(`✅ Successfully migrated ${playlistVideos.length} playlist-video relationships`);
    return playlistVideos.length;
  } catch (error) {
    console.error('❌ Error migrating playlist videos:', error);
    throw error;
  }
}

async function migrateStreamsAndCreateChannels() {
  console.log('\n📋 Migrating Streams and Creating Channels...');
  
  try {
    const streams = await sqliteQuery('SELECT * FROM streams');
    console.log(`   Found ${streams.length} streams to migrate`);
    
    const channelMap = new Map(); // Map to track created channels
    
    for (const stream of streams) {
      // Create a channel for each stream's RTMP destination
      if (stream.rtmp_url && stream.stream_key) {
        const channelKey = `${stream.user_id}-${stream.rtmp_url}-${stream.stream_key}`;
        
        let channelId;
        if (!channelMap.has(channelKey)) {
          // Create new channel
          const channelResult = await pgPool.query(
            `INSERT INTO channels (user_id, name, platform, platform_icon, rtmp_url, stream_key, is_active)
             VALUES ($1::uuid, $2, $3, $4, $5, $6, true)
             RETURNING id`,
            [
              stream.user_id,
              `${stream.platform || 'Custom'} - ${stream.title}`,
              stream.platform || 'Custom',
              stream.platform_icon || 'ti-broadcast',
              stream.rtmp_url,
              stream.stream_key
            ]
          );
          channelId = channelResult.rows[0].id;
          channelMap.set(channelKey, channelId);
          console.log(`   ✓ Created channel for: ${stream.platform || 'Custom'}`);
        } else {
          channelId = channelMap.get(channelKey);
        }
        
        // Insert stream (without rtmp_url, stream_key, platform fields)
        await pgPool.query(
          `INSERT INTO streams (id, title, video_id, bitrate, resolution, fps, orientation, loop_video, 
           schedule_time, duration, status, status_updated_at, start_time, end_time, 
           use_advanced_settings, user_id, created_at, updated_at)
           VALUES ($1::uuid, $2, $3::uuid, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16::uuid, $17, $18)
           ON CONFLICT (id) DO UPDATE SET
             title = EXCLUDED.title,
             status = EXCLUDED.status`,
          [
            stream.id,
            stream.title,
            stream.video_id,
            stream.bitrate || 2500,
            stream.resolution,
            stream.fps || 30,
            stream.orientation || 'horizontal',
            stream.loop_video === 1,
            stream.schedule_time,
            stream.duration,
            stream.status || 'offline',
            stream.status_updated_at,
            stream.start_time,
            stream.end_time,
            stream.use_advanced_settings === 1,
            stream.user_id,
            stream.created_at || new Date().toISOString(),
            stream.updated_at || new Date().toISOString()
          ]
        );
        
        // Link stream to channel
        await pgPool.query(
          `INSERT INTO stream_channels (stream_id, channel_id)
           VALUES ($1::uuid, $2::uuid)
           ON CONFLICT (stream_id, channel_id) DO NOTHING`,
          [stream.id, channelId]
        );
        
        console.log(`   ✓ Migrated stream: ${stream.title}`);
      } else {
        console.log(`   ⚠ Skipped stream without RTMP info: ${stream.title}`);
      }
    }
    
    console.log(`✅ Successfully migrated ${streams.length} streams and created ${channelMap.size} channels`);
    return { streams: streams.length, channels: channelMap.size };
  } catch (error) {
    console.error('❌ Error migrating streams:', error);
    throw error;
  }
}

async function migrateStreamHistory() {
  console.log('\n📋 Migrating Stream History...');
  
  try {
    const history = await sqliteQuery('SELECT * FROM stream_history');
    console.log(`   Found ${history.length} history records to migrate`);
    
    for (const record of history) {
      await pgPool.query(
        `INSERT INTO stream_history (id, stream_id, title, platform, platform_icon, video_id, 
         video_title, resolution, bitrate, fps, start_time, end_time, duration, 
         use_advanced_settings, user_id, created_at)
         VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6::uuid, $7, $8, $9, $10, $11, $12, $13, $14, $15::uuid, $16)
         ON CONFLICT (id) DO NOTHING`,
        [
          record.id,
          record.stream_id,
          record.title,
          record.platform,
          record.platform_icon,
          record.video_id,
          record.video_title,
          record.resolution,
          record.bitrate,
          record.fps,
          record.start_time,
          record.end_time,
          record.duration,
          record.use_advanced_settings === 1,
          record.user_id,
          record.created_at || new Date().toISOString()
        ]
      );
    }
    
    console.log(`✅ Successfully migrated ${history.length} history records`);
    return history.length;
  } catch (error) {
    console.error('❌ Error migrating stream history:', error);
    throw error;
  }
}

async function verifyMigration() {
  console.log('\n🔍 Verifying Migration...');
  
  try {
    const checks = [];
    
    // Count records in PostgreSQL
    const pgUsers = await pgPool.query('SELECT COUNT(*) FROM users');
    const pgVideos = await pgPool.query('SELECT COUNT(*) FROM videos');
    const pgPlaylists = await pgPool.query('SELECT COUNT(*) FROM playlists');
    const pgStreams = await pgPool.query('SELECT COUNT(*) FROM streams');
    const pgChannels = await pgPool.query('SELECT COUNT(*) FROM channels');
    const pgHistory = await pgPool.query('SELECT COUNT(*) FROM stream_history');
    
    // Count records in SQLite
    const sqliteUsers = await sqliteQuery('SELECT COUNT(*) as count FROM users');
    const sqliteVideos = await sqliteQuery('SELECT COUNT(*) as count FROM videos');
    const sqlitePlaylists = await sqliteQuery('SELECT COUNT(*) as count FROM playlists');
    const sqliteStreams = await sqliteQuery('SELECT COUNT(*) as count FROM streams');
    const sqliteHistory = await sqliteQuery('SELECT COUNT(*) as count FROM stream_history');
    
    console.log('\n📊 Migration Summary:');
    console.log('┌─────────────────┬──────────┬────────────┬──────────┐');
    console.log('│ Table           │ SQLite   │ PostgreSQL │ Status   │');
    console.log('├─────────────────┼──────────┼────────────┼──────────┤');
    
    const logRow = (table, sqlite, postgres) => {
      const status = sqlite === postgres ? '✅ OK' : '⚠️  Diff';
      console.log(`│ ${table.padEnd(15)} │ ${String(sqlite).padStart(8)} │ ${String(postgres).padStart(10)} │ ${status.padEnd(8)} │`);
    };
    
    logRow('Users', sqliteUsers[0].count, pgUsers.rows[0].count);
    logRow('Videos', sqliteVideos[0].count, pgVideos.rows[0].count);
    logRow('Playlists', sqlitePlaylists[0].count, pgPlaylists.rows[0].count);
    logRow('Streams', sqliteStreams[0].count, pgStreams.rows[0].count);
    logRow('Channels', 0, pgChannels.rows[0].count);
    logRow('History', sqliteHistory[0].count, pgHistory.rows[0].count);
    
    console.log('└─────────────────┴──────────┴────────────┴──────────┘');
    
    return true;
  } catch (error) {
    console.error('❌ Error verifying migration:', error);
    return false;
  }
}

async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  StreamFlow SQLite to PostgreSQL Migration Tool');
  console.log('═══════════════════════════════════════════════════════');
  
  // Check if SQLite database exists
  if (!fs.existsSync(SQLITE_DB_PATH)) {
    console.error(`\n❌ SQLite database not found at: ${SQLITE_DB_PATH}`);
    console.error('Please ensure the database file exists before running migration.');
    process.exit(1);
  }
  
  try {
    // Test PostgreSQL connection
    await pgPool.query('SELECT NOW()');
    console.log('✅ Connected to PostgreSQL database');
    
    // Run migrations in order (respecting foreign key constraints)
    console.log('\n🚀 Starting migration process...');
    
    const stats = {
      users: 0,
      videos: 0,
      playlists: 0,
      playlistVideos: 0,
      streams: 0,
      channels: 0,
      history: 0
    };
    
    stats.users = await migrateUsers();
    stats.videos = await migrateVideos();
    stats.playlists = await migratePlaylists();
    stats.playlistVideos = await migratePlaylistVideos();
    
    const streamResult = await migrateStreamsAndCreateChannels();
    stats.streams = streamResult.streams;
    stats.channels = streamResult.channels;
    
    stats.history = await migrateStreamHistory();
    
    // Verify migration
    await verifyMigration();
    
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('✅ Migration Completed Successfully!');
    console.log('═══════════════════════════════════════════════════════');
    console.log('\n📊 Total Records Migrated:');
    console.log(`   Users:              ${stats.users}`);
    console.log(`   Videos:             ${stats.videos}`);
    console.log(`   Playlists:          ${stats.playlists}`);
    console.log(`   Playlist Videos:    ${stats.playlistVideos}`);
    console.log(`   Streams:            ${stats.streams}`);
    console.log(`   Channels (new):     ${stats.channels}`);
    console.log(`   History Records:    ${stats.history}`);
    console.log('\n💡 Next Steps:');
    console.log('   1. Verify data in PostgreSQL');
    console.log('   2. Test application functionality');
    console.log('   3. If everything works, backup and archive SQLite files');
    console.log('   4. Start using the new system!');
    console.log('\n⚠️  Note: Physical files (videos, thumbnails, avatars) are NOT migrated.');
    console.log('   They remain in public/uploads/ directory.');
    console.log('   To use MinIO storage, you need to upload them separately.');
    
  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  } finally {
    sqliteDb.close();
    await pgPool.end();
  }
}

// Run migration
main();
