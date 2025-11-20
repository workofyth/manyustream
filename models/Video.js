const path = require('path');
const fs = require('fs');
const { query } = require('../db/database');

class Video {
  static async create(data) {
    try {
      const result = await query(
        `INSERT INTO videos (
          title, filepath, thumbnail_path, file_size, 
          duration, format, resolution, bitrate, fps, user_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::uuid)
        RETURNING *`,
        [
          data.title, data.filepath, data.thumbnail_path, data.file_size,
          data.duration, data.format, data.resolution, data.bitrate, data.fps, data.user_id
        ]
      );
      return result.rows[0];
    } catch (error) {
      console.error('Error creating video:', error);
      throw error;
    }
  }

  static async findById(id) {
    try {
      const result = await query('SELECT * FROM videos WHERE id = $1::uuid', [id]);
      return result.rows[0];
    } catch (error) {
      console.error('Error finding video:', error);
      throw error;
    }
  }

  static async findAll(userId = null) {
    try {
      if (userId) {
        const result = await query(
          'SELECT * FROM videos WHERE user_id = $1::uuid ORDER BY upload_date DESC',
          [userId]
        );
        return result.rows;
      } else {
        const result = await query('SELECT * FROM videos ORDER BY upload_date DESC', []);
        return result.rows;
      }
    } catch (error) {
      console.error('Error finding videos:', error);
      throw error;
    }
  }

  static async update(id, videoData) {
    try {
      const fields = [];
      const values = [];
      let paramCount = 1;

      Object.entries(videoData).forEach(([key, value]) => {
        fields.push(`${key} = $${paramCount}`);
        values.push(value);
        paramCount++;
      });

      fields.push('updated_at = CURRENT_TIMESTAMP');
      values.push(id);

      const sql = `UPDATE videos SET ${fields.join(', ')} WHERE id = $${paramCount}::uuid RETURNING *`;

      const result = await query(sql, values);
      return result.rows[0];
    } catch (error) {
      console.error('Error updating video:', error);
      throw error;
    }
  }

  static async delete(id) {
    try {
      const video = await Video.findById(id);
      
      if (!video) {
        throw new Error('Video not found');
      }

      await query('DELETE FROM videos WHERE id = $1::uuid', [id]);

      // Delete physical files (if using local storage)
      if (video.filepath) {
        const fullPath = path.join(process.cwd(), 'public', video.filepath);
        try {
          if (fs.existsSync(fullPath)) {
            fs.unlinkSync(fullPath);
          }
        } catch (fileErr) {
          console.error('Error deleting video file:', fileErr);
        }
      }

      if (video.thumbnail_path) {
        const thumbnailPath = path.join(process.cwd(), 'public', video.thumbnail_path);
        try {
          if (fs.existsSync(thumbnailPath)) {
            fs.unlinkSync(thumbnailPath);
          }
        } catch (thumbErr) {
          console.error('Error deleting thumbnail:', thumbErr);
        }
      }

      return { success: true, id };
    } catch (error) {
      console.error('Error deleting video:', error);
      throw error;
    }
  }
}

module.exports = Video;