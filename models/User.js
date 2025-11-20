const { query } = require('../db/database');
const bcrypt = require('bcrypt');

class User {
  static async findByEmail(email) {
    try {
      const result = await query('SELECT * FROM users WHERE email = $1', [email]);
      return result.rows[0];
    } catch (error) {
      console.error('Database error in findByEmail:', error);
      throw error;
    }
  }

  static async findByUsername(username) {
    try {
      const result = await query('SELECT * FROM users WHERE username = $1', [username]);
      return result.rows[0];
    } catch (error) {
      console.error('Database error in findByUsername:', error);
      throw error;
    }
  }

  static async findById(id) {
    try {
      const result = await query('SELECT * FROM users WHERE id = $1::uuid', [id]);
      return result.rows[0];
    } catch (error) {
      console.error('Database error in findById:', error);
      throw error;
    }
  }

  static async create(userData) {
    try {
      const hashedPassword = await bcrypt.hash(userData.password, 10);
      
      console.log('[User.create] Creating user:', { username: userData.username });
      
      const result = await query(
        `INSERT INTO users (username, password, avatar_path, user_role, status)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [
          userData.username,
          hashedPassword,
          userData.avatar_path || null,
          userData.user_role || 'admin',
          userData.status || 'active'
        ]
      );
      
      const user = result.rows[0];
      console.log("[User.create] User created successfully with ID:", user.id);
      
      return {
        id: user.id,
        username: user.username,
        user_role: user.user_role,
        status: user.status
      };
    } catch (error) {
      console.error("[User.create] Error details:", {
        message: error.message,
        code: error.code,
        detail: error.detail,
        hint: error.hint
      });
      
      // Provide helpful error messages for common database issues
      if (error.code === '42704' || error.message.includes('gen_random_uuid')) {
        const helpMsg = 'Database error: pgcrypto extension not available. Please ensure PostgreSQL extension "pgcrypto" is installed.';
        console.error('[User.create]', helpMsg);
        throw new Error(helpMsg);
      }
      if (error.code === '42703' && error.message.includes('column')) {
        const helpMsg = 'Database schema error: missing column. The users table may be outdated. Try running: ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(255) UNIQUE;';
        console.error('[User.create]', helpMsg);
        throw new Error(helpMsg);
      }
      
      throw error;
    }
  }
  static async update(userId, userData) {
    try {
      const fields = [];
      const values = [];
      let paramCount = 1;

      Object.entries(userData).forEach(([key, value]) => {
        fields.push(`${key} = $${paramCount}`);
        values.push(value);
        paramCount++;
      });

      fields.push('updated_at = CURRENT_TIMESTAMP');
      values.push(userId);

      const sql = `UPDATE users SET ${fields.join(', ')} WHERE id = $${paramCount}::uuid RETURNING *`;

      const result = await query(sql, values);
      return result.rows[0];
    } catch (error) {
      console.error('Database error in update:', error);
      throw error;
    }
  }

  static async verifyPassword(plainPassword, hashedPassword) {
    return bcrypt.compare(plainPassword, hashedPassword);
  }

  static async findAll() {
    try {
      const result = await query('SELECT * FROM users ORDER BY created_at DESC', []);
      return result.rows;
    } catch (error) {
      console.error('Database error in findAll:', error);
      throw error;
    }
  }

  static async updateStatus(userId, status) {
    try {
      const result = await query(
        'UPDATE users SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2::uuid RETURNING *',
        [status, userId]
      );
      return result.rows[0];
    } catch (error) {
      console.error('Database error in updateStatus:', error);
      throw error;
    }
  }

  static async updateRole(userId, role) {
    try {
      const result = await query(
        'UPDATE users SET user_role = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2::uuid RETURNING *',
        [role, userId]
      );
      return result.rows[0];
    } catch (error) {
      console.error('Database error in updateRole:', error);
      throw error;
    }
  }

  static async delete(userId) {
    try {
      const Video = require('./Video');
      const Stream = require('./Stream');

      const userVideos = await Video.findAll(userId);
      const userStreams = await Stream.findAll(userId);

      for (const video of userVideos) {
        try {
          await Video.delete(video.id);
        } catch (videoDeleteError) {
          console.error(`Error deleting video ${video.id}:`, videoDeleteError);
        }
      }

      for (const stream of userStreams) {
        try {
          await Stream.delete(stream.id, userId);
        } catch (streamDeleteError) {
          console.error(`Error deleting stream ${stream.id}:`, streamDeleteError);
        }
      }

      await query('DELETE FROM users WHERE id = $1::uuid', [userId]);

      return {
        id: userId,
        deleted: true,
        videosDeleted: userVideos.length,
        streamsDeleted: userStreams.length
      };
    } catch (error) {
      console.error('Error in user deletion process:', error);
      throw error;
    }
  }

  static async updateProfile(userId, updateData) {
    try {
      const fields = [];
      const values = [];
      let paramCount = 1;

      if (updateData.username) {
        fields.push(`username = $${paramCount}`);
        values.push(updateData.username);
        paramCount++;
      }

      if (updateData.user_role) {
        fields.push(`user_role = $${paramCount}`);
        values.push(updateData.user_role);
        paramCount++;
      }

      if (updateData.status) {
        fields.push(`status = $${paramCount}`);
        values.push(updateData.status);
        paramCount++;
      }

      if (updateData.avatar_path) {
        fields.push(`avatar_path = $${paramCount}`);
        values.push(updateData.avatar_path);
        paramCount++;
      }

      if (updateData.password) {
        fields.push(`password = $${paramCount}`);
        values.push(updateData.password);
        paramCount++;
      }

      if (fields.length === 0) {
        return { id: userId, message: 'No fields to update' };
      }

      fields.push('updated_at = CURRENT_TIMESTAMP');
      values.push(userId);

      const sql = `UPDATE users SET ${fields.join(', ')} WHERE id = $${paramCount}::uuid RETURNING *`;

      const result = await query(sql, values);
      return result.rows[0];
    } catch (error) {
      console.error('Database error in updateProfile:', error);
      throw error;
    }
  }
}

module.exports = User;