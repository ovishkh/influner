const mysql = require("mysql2/promise");
const fs = require("fs");
const path = require("path");

let pool = null;

function getConfig() {
  const configPath = path.join(__dirname, "../config.json");
  if (fs.existsSync(configPath)) {
    const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    return config.database;
  }
  return null;
}

function createPool() {
  const config = getConfig();

  if (!config || !config.host || !config.user || !config.database) {
    // console.log("Database not configured yet");
    return null;
  }

  try {
    pool = mysql.createPool({
      host: config.host,
      user: config.user,
      password: config.password,
      database: config.database,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
    });

    console.log("Database pool created");
    return pool;
  } catch (error) {
    console.error("Failed to create database pool:", error);
    return null;
  }
}

function getPool() {
  if (!pool) {
    pool = createPool();
  }
  return pool;
}

function resetPool() {
  if (pool) {
    pool.end();
    pool = null;
  }
  pool = createPool();
  return pool;
}

function isConfigured() {
  const config = getConfig();
  return !!(config && config.host && config.user && config.database);
}

module.exports = {
  getConnection: async () => {
    const currentPool = getPool();
    if (!currentPool) {
      throw new Error("Database not configured");
    }
    return await currentPool.getConnection();
  },
  query: async (sql, params) => {
    const currentPool = getPool();
    if (!currentPool) {
      throw new Error("Database not configured");
    }
    // ✅ FIX: Destructure to get only rows
    const [rows] = await currentPool.query(sql, params);
    return rows;
  },
  resetPool,
  isConfigured,
  getConfig,
};
