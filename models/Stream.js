const { query, pool } = require('../db/database');
const Channel = require('./Channel');

class Stream {
  static async create(streamData) {
    const {
      title,
      video_id,
      rtmp_url,
      stream_key,
      platform,
      platform_icon,
      channelIds = [],
      bitrate = 2500,
      resolution,
      fps = 30,
      orientation = 'horizontal',
      loop_video = true,
      schedule_time = null,
      recurrence_type = null,
      recurrence_value = null,
      duration = null,
      use_advanced_settings = false,
      user_id
    } = streamData;

    // Validate and format resolution before saving to database
    const formattedResolution = Stream.validateAndFormatResolution(resolution);

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Check for duplicate streams with same rtmp_url and stream_key for the same user
      const duplicateCheck = await client.query(
        `SELECT id FROM streams
         WHERE user_id = $1::uuid
         AND rtmp_url = $2
         AND stream_key = $3
         AND title = $4`,
        [user_id, rtmp_url, stream_key, title]
      );

      if (duplicateCheck.rows.length > 0) {
        throw new Error('A stream with the same title, RTMP URL, and stream key already exists');
      }

      const status = schedule_time ? 'scheduled' : 'offline';

      // Create stream with rtmp_url, stream_key, platform
      const streamResult = await client.query(
        `INSERT INTO streams (
          title, video_id, rtmp_url, stream_key, platform, platform_icon,
          bitrate, resolution, fps, orientation, loop_video,
          schedule_time, recurrence_type, recurrence_value, duration,
          status, use_advanced_settings, user_id
        ) VALUES ($1, $2::uuid, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18::uuid)
        RETURNING *`,
        [
          title, video_id, rtmp_url, stream_key, platform, platform_icon,
          bitrate, formattedResolution, fps, orientation, loop_video,
          schedule_time, recurrence_type, recurrence_value, duration,
          status, use_advanced_settings, user_id
        ]
      );

      const stream = streamResult.rows[0];

      // Link channels to stream
      if (channelIds && channelIds.length > 0) {
        for (const channelId of channelIds) {
          await client.query(
            `INSERT INTO stream_channels (stream_id, channel_id)
             VALUES ($1::uuid, $2::uuid)
             ON CONFLICT (stream_id, channel_id) DO NOTHING`,
            [stream.id, channelId]
          );
        }
      }

      await client.query('COMMIT');
      
      // Fetch stream with channels
      const streamWithChannels = await Stream.getStreamWithChannels(stream.id);
      return streamWithChannels;
      
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error creating stream:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  static validateAndFormatResolution(resolution) {
    // Common resolution patterns
    const commonResolutions = {
      '720': '1280x720',
      '480': '854x480',
      '360': '640x360',
      '1080': '1920x1080',
      '4k': '3840x2160',
      '2160': '3840x2160',
      '1440': '2560x1440'
    };

    if (!resolution) {
      return '1280x720'; // default
    }

    if (typeof resolution !== 'string') {
      resolution = String(resolution);
    }

    // Check if it's a common resolution format like "720" or "1080"
    if (commonResolutions[resolution.toLowerCase()]) {
      return commonResolutions[resolution.toLowerCase()];
    }

    // If it's already in the format "WIDTHxHEIGHT", validate it
    const resolutionRegex = /^(\d+)x(\d+)$|^(hd|fhd|uhd|4k)$/;
    if (resolutionRegex.test(resolution.toLowerCase())) {
      return resolution.toLowerCase() === 'hd' ? '1280x720' :
             resolution.toLowerCase() === 'fhd' ? '1920x1080' :
             resolution.toLowerCase() === 'uhd' ? '3840x2160' :
             resolution.toLowerCase() === '4k' ? '3840x2160' : resolution;
    }

    // If it's just a number followed by p, convert to standard format
    const heightRegex = /^(\d+)p?$/;
    const match = resolution.match(heightRegex);
    if (match) {
      const height = parseInt(match[1]);
      switch(height) {
        case 360: return '640x360';
        case 480: return '854x480';
        case 720: return '1280x720';
        case 1080: return '1920x1080';
        case 1440: return '2560x1440';
        case 2160: return '3840x2160';
        default:
          // For other heights, calculate width based on 16:9 aspect ratio
          const width = Math.round(height * 16 / 9);
          return `${width}x${height}`;
      }
    }

    // If none of the above, return default
    return '1280x720';
  }

  static async findById(id) {
    try {
      const result = await query('SELECT * FROM streams WHERE id = $1::uuid', [id]);
      return result.rows[0];
    } catch (error) {
      console.error('Error finding stream:', error);
      throw error;
    }
  }

  static async findAll(userId = null, filter = null) {
    try {
      let sql = `
        SELECT s.*, 
               v.title AS video_title, 
               v.filepath AS video_filepath,
               v.thumbnail_path AS video_thumbnail, 
               v.duration AS video_duration,
               v.resolution AS video_resolution,  
               v.bitrate AS video_bitrate,        
               v.fps AS video_fps,
               p.name AS playlist_name,
               CASE 
                 WHEN p.id IS NOT NULL THEN 'playlist'
                 WHEN v.id IS NOT NULL THEN 'video'
                 ELSE NULL
               END AS video_type,
               COUNT(DISTINCT sc.channel_id) as channel_count
        FROM streams s
        LEFT JOIN videos v ON s.video_id = v.id
        LEFT JOIN playlists p ON s.video_id = p.id
        LEFT JOIN stream_channels sc ON s.id = sc.stream_id
      `;
      
      const params = [];
      let paramCount = 1;
      
      if (userId) {
        sql += ` WHERE s.user_id = $${paramCount}::uuid`;
        params.push(userId);
        paramCount++;
        
        if (filter) {
          if (filter === 'live') {
            sql += " AND s.status = 'live'";
          } else if (filter === 'scheduled') {
            sql += " AND s.status = 'scheduled'";
          } else if (filter === 'offline') {
            sql += " AND s.status = 'offline'";
          }
        }
      }
      
      sql += ' GROUP BY s.id, v.id, v.title, v.filepath, v.thumbnail_path, v.duration, v.resolution, v.bitrate, v.fps, p.id, p.name';
      sql += ' ORDER BY s.created_at DESC';
      
      const result = await query(sql, params);
      return result.rows;
    } catch (error) {
      console.error('Error finding streams:', error);
      throw error;
    }
  }

  static async update(id, streamData) {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const fields = [];
      const values = [];
      let paramCount = 1;

      // Extract channelIds if provided
      const channelIds = streamData.channelIds;
      delete streamData.channelIds;

      // Process stream data, formatting resolution if present
      Object.entries(streamData).forEach(([key, value]) => {
        if (key === 'resolution') {
          value = Stream.validateAndFormatResolution(value);
        }
        fields.push(`${key} = $${paramCount}`);
        values.push(value);
        paramCount++;
      });

      fields.push('updated_at = CURRENT_TIMESTAMP');
      values.push(id);

      const sql = `UPDATE streams SET ${fields.join(', ')} WHERE id = $${paramCount}::uuid RETURNING *`;

      const result = await client.query(sql, values);

      // Update channel links if provided
      if (channelIds !== undefined) {
        // Remove existing links
        await client.query('DELETE FROM stream_channels WHERE stream_id = $1::uuid', [id]);

        // Add new links
        if (channelIds && channelIds.length > 0) {
          for (const channelId of channelIds) {
            await client.query(
              `INSERT INTO stream_channels (stream_id, channel_id)
               VALUES ($1::uuid, $2::uuid)`,
              [id, channelId]
            );
          }
        }
      }

      await client.query('COMMIT');

      return result.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error updating stream:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  static async delete(id, userId) {
    try {
      // stream_channels will be deleted automatically due to ON DELETE CASCADE
      const result = await query(
        'DELETE FROM streams WHERE id = $1::uuid AND user_id = $2::uuid',
        [id, userId]
      );
      return { success: true, deleted: result.rowCount > 0 };
    } catch (error) {
      console.error('Error deleting stream:', error);
      throw error;
    }
  }

  static async updateStatus(id, status, userId, options = {}) {
    try {
      const { startTimeOverride = null, endTimeOverride = null } = options;
      
      let start_time = null;
      let end_time = null;
      
      if (status === 'live') {
        start_time = startTimeOverride || new Date().toISOString();
      } else if (status === 'offline') {
        end_time = endTimeOverride || new Date().toISOString();
      }

      const result = await query(
        `UPDATE streams SET 
          status = $1, 
          status_updated_at = CURRENT_TIMESTAMP,
          start_time = CASE WHEN $2::timestamp IS NOT NULL THEN $2::timestamp ELSE start_time END, 
          end_time = CASE WHEN $3::timestamp IS NOT NULL THEN $3::timestamp ELSE end_time END,
          updated_at = CURRENT_TIMESTAMP
         WHERE id = $4::uuid AND user_id = $5::uuid
         RETURNING *`,
        [status, start_time, end_time, id, userId]
      );

      return result.rows[0];
    } catch (error) {
      console.error('Error updating stream status:', error);
      throw error;
    }
  }

  static async getStreamWithVideo(id) {
    try {
      const result = await query(
        `SELECT s.*, 
                v.title AS video_title, 
                v.filepath AS video_filepath, 
                v.thumbnail_path AS video_thumbnail, 
                v.duration AS video_duration,
                p.name AS playlist_name,
                CASE 
                  WHEN p.id IS NOT NULL THEN 'playlist'
                  WHEN v.id IS NOT NULL THEN 'video'
                  ELSE NULL
                END AS video_type
         FROM streams s
         LEFT JOIN videos v ON s.video_id = v.id
         LEFT JOIN playlists p ON s.video_id = p.id
         WHERE s.id = $1::uuid`,
        [id]
      );
      
      return result.rows[0];
    } catch (error) {
      console.error('Error fetching stream with video:', error);
      throw error;
    }
  }

  static async getStreamWithChannels(id) {
    try {
      const stream = await Stream.findById(id);
      
      if (!stream) {
        return null;
      }

      // Get associated channels
      const channels = await Channel.getStreamChannels(id);
      stream.channels = channels;
      
      return stream;
    } catch (error) {
      console.error('Error fetching stream with channels:', error);
      throw error;
    }
  }

  static async getStreamWithVideoAndChannels(id) {
    try {
      const stream = await Stream.getStreamWithVideo(id);
      
      if (!stream) {
        return null;
      }

      // Get associated channels
      const channels = await Channel.getStreamChannels(id);
      stream.channels = channels;
      
      return stream;
    } catch (error) {
      console.error('Error fetching stream with video and channels:', error);
      throw error;
    }
  }

  static async findScheduledInRange(startTime, endTime) {
    try {
      const result = await query(
        `SELECT s.*, 
               v.title AS video_title, 
               v.filepath AS video_filepath,
               v.thumbnail_path AS video_thumbnail, 
               v.duration AS video_duration,
               v.resolution AS video_resolution,
               v.bitrate AS video_bitrate,
               v.fps AS video_fps  
        FROM streams s
        LEFT JOIN videos v ON s.video_id = v.id
        WHERE s.status = 'scheduled'
        AND s.schedule_time IS NOT NULL
        AND s.schedule_time >= $1::timestamp
        AND s.schedule_time <= $2::timestamp
        ORDER BY s.schedule_time ASC`,
        [startTime.toISOString(), endTime.toISOString()]
      );
      
      return result.rows;
    } catch (error) {
      console.error('Error finding scheduled streams:', error);
      throw error;
    }
  }

  static async findRecurringStreams() {
    try {
      const result = await query(
        `SELECT s.*, 
               v.title AS video_title, 
               v.filepath AS video_filepath
        FROM streams s
        LEFT JOIN videos v ON s.video_id = v.id
        WHERE s.recurrence_type IS NOT NULL
        AND s.status != 'live'
        ORDER BY s.created_at DESC`
      );
      
      return result.rows;
    } catch (error) {
      console.error('Error finding recurring streams:', error);
      throw error;
    }
  }
}

module.exports = Stream;
