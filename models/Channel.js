const { v4: uuidv4 } = require('uuid');
const { query } = require('../db/database');

class Channel {
  static async create(channelData) {
    const id = uuidv4();
    const {
      user_id,
      name,
      platform,
      platform_icon,
      rtmp_url,
      stream_key,
      is_active = true
    } = channelData;

    let determinedPlatform = platform;
    let determinedIcon = platform_icon;

    if (!determinedPlatform || determinedPlatform === 'Custom') {
      if (rtmp_url.includes('youtube.com')) {
        determinedPlatform = 'YouTube';
        determinedIcon = 'ti-brand-youtube';
      } else if (rtmp_url.includes('facebook.com')) {
        determinedPlatform = 'Facebook';
        determinedIcon = 'ti-brand-facebook';
      } else if (rtmp_url.includes('twitch.tv')) {
        determinedPlatform = 'Twitch';
        determinedIcon = 'ti-brand-twitch';
      } else if (rtmp_url.includes('tiktok.com')) {
        determinedPlatform = 'TikTok';
        determinedIcon = 'ti-brand-tiktok';
      } else if (rtmp_url.includes('instagram.com')) {
        determinedPlatform = 'Instagram';
        determinedIcon = 'ti-brand-instagram';
      } else if (rtmp_url.includes('shopee.io')) {
        determinedPlatform = 'Shopee Live';
        determinedIcon = 'ti-shopping-bag';
      } else if (rtmp_url.includes('restream.io')) {
        determinedPlatform = 'Restream.io';
        determinedIcon = 'ti-live-photo';
      } else {
        determinedPlatform = 'Custom';
        determinedIcon = 'ti-broadcast';
      }
    }

    try {
      const result = await query(
        `INSERT INTO channels (id, user_id, name, platform, platform_icon, rtmp_url, stream_key, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [id, user_id, name, determinedPlatform, determinedIcon, rtmp_url, stream_key, is_active]
      );

      return result.rows[0];
    } catch (error) {
      console.error('Error creating channel:', error);
      throw error;
    }
  }

  static async findById(id) {
    try {
      const result = await query('SELECT * FROM channels WHERE id = $1', [id]);
      return result.rows[0];
    } catch (error) {
      console.error('Error finding channel by id:', error);
      throw error;
    }
  }

  static async findByUserId(userId) {
    try {
      const result = await query(
        'SELECT * FROM channels WHERE user_id = $1 ORDER BY created_at DESC',
        [userId]
      );
      return result.rows;
    } catch (error) {
      console.error('Error finding channels by user id:', error);
      throw error;
    }
  }

  static async findActiveByUserId(userId) {
    try {
      const result = await query(
        'SELECT * FROM channels WHERE user_id = $1 AND is_active = true ORDER BY created_at DESC',
        [userId]
      );
      return result.rows;
    } catch (error) {
      console.error('Error finding active channels:', error);
      throw error;
    }
  }

  static async update(id, channelData) {
    const fields = [];
    const values = [];
    let paramCount = 1;

    Object.entries(channelData).forEach(([key, value]) => {
      fields.push(`${key} = $${paramCount}`);
      values.push(value);
      paramCount++;
    });

    fields.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);

    const sql = `UPDATE channels SET ${fields.join(', ')} WHERE id = $${paramCount} RETURNING *`;

    try {
      const result = await query(sql, values);
      return result.rows[0];
    } catch (error) {
      console.error('Error updating channel:', error);
      throw error;
    }
  }

  static async delete(id, userId) {
    try {
      const result = await query(
        'DELETE FROM channels WHERE id = $1 AND user_id = $2',
        [id, userId]
      );
      return { success: true, deleted: result.rowCount > 0 };
    } catch (error) {
      console.error('Error deleting channel:', error);
      throw error;
    }
  }

  static async toggleActive(id, userId) {
    try {
      const result = await query(
        `UPDATE channels 
         SET is_active = NOT is_active, updated_at = CURRENT_TIMESTAMP 
         WHERE id = $1 AND user_id = $2 
         RETURNING *`,
        [id, userId]
      );
      return result.rows[0];
    } catch (error) {
      console.error('Error toggling channel active status:', error);
      throw error;
    }
  }

  static async getStreamChannels(streamId) {
    try {
      const result = await query(
        `SELECT c.* FROM channels c
         INNER JOIN stream_channels sc ON c.id = sc.channel_id
         WHERE sc.stream_id = $1
         ORDER BY c.created_at`,
        [streamId]
      );
      return result.rows;
    } catch (error) {
      console.error('Error getting stream channels:', error);
      throw error;
    }
  }

  static async linkToStream(streamId, channelIds) {
    try {
      for (const channelId of channelIds) {
        await query(
          `INSERT INTO stream_channels (id, stream_id, channel_id)
           VALUES ($1, $2, $3)
           ON CONFLICT (stream_id, channel_id) DO NOTHING`,
          [uuidv4(), streamId, channelId]
        );
      }
      return { success: true };
    } catch (error) {
      console.error('Error linking channels to stream:', error);
      throw error;
    }
  }

  static async unlinkFromStream(streamId) {
    try {
      await query('DELETE FROM stream_channels WHERE stream_id = $1', [streamId]);
      return { success: true };
    } catch (error) {
      console.error('Error unlinking channels from stream:', error);
      throw error;
    }
  }
}

module.exports = Channel;
