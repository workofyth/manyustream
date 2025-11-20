const { pool, query, checkIfUsersExist: pgCheckUsersExist, initDatabase } = require('./postgres');

const db = {
  get: async (sql, params, callback) => {
    try {
      const result = await query(sql, params);
      if (callback) {
        callback(null, result.rows[0]);
      }
      return result.rows[0];
    } catch (error) {
      if (callback) {
        callback(error);
      }
      throw error;
    }
  },

  all: async (sql, params, callback) => {
    try {
      const result = await query(sql, params);
      if (callback) {
        callback(null, result.rows);
      }
      return result.rows;
    } catch (error) {
      if (callback) {
        callback(error);
      }
      throw error;
    }
  },

  run: async (sql, params, callback) => {
    try {
      const result = await query(sql, params);
      if (callback) {
        callback.call({ changes: result.rowCount, lastID: result.rows[0]?.id }, null);
      }
      return result;
    } catch (error) {
      if (callback) {
        callback(error);
      }
      throw error;
    }
  }
};

async function checkIfUsersExist() {
  return await pgCheckUsersExist();
}

initDatabase().catch(err => {
  console.error('Failed to initialize database:', err);
});

module.exports = {
  db,
  pool,
  query,
  checkIfUsersExist,
  initDatabase
};