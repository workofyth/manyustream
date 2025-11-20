const { query } = require('../db/database');

class Playlist {
  static async findAll(userId) {
    try {
      const result = await query(
        `SELECT p.*, 
         COUNT(pv.id) as video_count,
         STRING_AGG(v.thumbnail_path, ',') as thumbnails
         FROM playlists p 
         LEFT JOIN playlist_videos pv ON p.id = pv.playlist_id 
         LEFT JOIN videos v ON pv.video_id = v.id
         WHERE p.user_id = $1::uuid
         GROUP BY p.id
         ORDER BY p.updated_at DESC`,
        [userId]
      );
      return result.rows;
    } catch (error) {
      console.error('Error finding playlists:', error);
      throw error;
    }
  }

  static async findById(id) {
    try {
      const result = await query('SELECT * FROM playlists WHERE id = $1::uuid', [id]);
      return result.rows[0];
    } catch (error) {
      console.error('Error finding playlist:', error);
      throw error;
    }
  }

  static async findByIdWithVideos(id) {
    try {
      const playlistResult = await query('SELECT * FROM playlists WHERE id = $1::uuid', [id]);
      const playlist = playlistResult.rows[0];
      
      if (!playlist) {
        return null;
      }

      const videosResult = await query(
        `SELECT v.*, pv.position 
         FROM playlist_videos pv 
         JOIN videos v ON pv.video_id = v.id 
         WHERE pv.playlist_id = $1::uuid
         ORDER BY pv.position ASC`,
        [id]
      );
      
      playlist.videos = videosResult.rows;
      return playlist;
    } catch (error) {
      console.error('Error finding playlist with videos:', error);
      throw error;
    }
  }

  static async create(playlistData) {
    try {
      const result = await query(
        `INSERT INTO playlists (name, description, is_shuffle, user_id) 
         VALUES ($1, $2, $3, $4::uuid) 
         RETURNING *`,
        [
          playlistData.name, 
          playlistData.description || null, 
          playlistData.is_shuffle || false, 
          playlistData.user_id
        ]
      );
      return result.rows[0];
    } catch (error) {
      console.error('Error creating playlist:', error);
      throw error;
    }
  }

  static async update(id, playlistData) {
    try {
      const fields = [];
      const values = [];
      let paramCount = 1;
      
      Object.entries(playlistData).forEach(([key, value]) => {
        if (key !== 'id' && key !== 'user_id') {
          fields.push(`${key} = $${paramCount}`);
          values.push(value);
          paramCount++;
        }
      });
      
      fields.push('updated_at = CURRENT_TIMESTAMP');
      values.push(id);

      const sql = `UPDATE playlists SET ${fields.join(', ')} WHERE id = $${paramCount}::uuid RETURNING *`;
      
      const result = await query(sql, values);
      return result.rows[0];
    } catch (error) {
      console.error('Error updating playlist:', error);
      throw error;
    }
  }

  static async delete(id) {
    try {
      const result = await query('DELETE FROM playlists WHERE id = $1::uuid', [id]);
      return { deleted: result.rowCount > 0 };
    } catch (error) {
      console.error('Error deleting playlist:', error);
      throw error;
    }
  }

  static async addVideo(playlistId, videoId, position) {
    try {
      const result = await query(
        `INSERT INTO playlist_videos (playlist_id, video_id, position) 
         VALUES ($1::uuid, $2::uuid, $3) 
         RETURNING *`,
        [playlistId, videoId, position]
      );
      return result.rows[0];
    } catch (error) {
      console.error('Error adding video to playlist:', error);
      throw error;
    }
  }

  static async removeVideo(playlistId, videoId) {
    try {
      const result = await query(
        'DELETE FROM playlist_videos WHERE playlist_id = $1::uuid AND video_id = $2::uuid',
        [playlistId, videoId]
      );
      return { deleted: result.rowCount > 0 };
    } catch (error) {
      console.error('Error removing video from playlist:', error);
      throw error;
    }
  }

  static async updateVideoPositions(playlistId, videoPositions) {
    const { pool } = require('../db/database');
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      for (const { videoId, position } of videoPositions) {
        await client.query(
          'UPDATE playlist_videos SET position = $1 WHERE playlist_id = $2::uuid AND video_id = $3::uuid',
          [position, playlistId, videoId]
        );
      }
      
      await client.query('COMMIT');
      return { updated: true };
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error updating video positions:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  static async getNextPosition(playlistId) {
    try {
      const result = await query(
        'SELECT MAX(position) as max_position FROM playlist_videos WHERE playlist_id = $1::uuid',
        [playlistId]
      );
      return (result.rows[0].max_position || 0) + 1;
    } catch (error) {
      console.error('Error getting next position:', error);
      throw error;
    }
  }
}

module.exports = Playlist;