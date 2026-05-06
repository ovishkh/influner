const express = require("express");
const router = express.Router();
const fs = require("fs");
const path = require("path");
const { getQueries } = require("../database/init");
const randomstring = require("randomstring");

const configPath = path.join(__dirname, "../config.json");

// ─────────────────────────────────────────────
// 🧩 FIELD SCHEMA
// ─────────────────────────────────────────────
const CONFIG_FIELD_SCHEMA = [
  {
    key: "jwt",
    label: "JWT Secret Key",
    type: "text",
    placeholder: "Click Generate or enter manually...",
    defaultValue: "",
    required: true,
    group: "Security",
    generateBtn: true,
  },
  {
    key: "backendUrl",
    label: "Backend URL",
    type: "text",
    placeholder: "http://localhost:8001",
    defaultValue: "http://localhost:8001",
    required: true,
    group: "Server",
  },
  {
    key: "frontendUrl",
    label: "Frontend URL",
    type: "text",
    placeholder: "http://localhost:3000",
    defaultValue: "http://localhost:3000",
    required: true,
    group: "Server",
  },
];

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function readConfig() {
  if (!fs.existsSync(configPath)) return {};
  try {
    return JSON.parse(fs.readFileSync(configPath, "utf8"));
  } catch {
    return {};
  }
}

function isDatabaseConfigured() {
  const config = readConfig();
  return !!(
    config.database &&
    config.database.host &&
    config.database.user &&
    config.database.database
  );
}

function getMissingConfigFields() {
  const config = readConfig();
  return CONFIG_FIELD_SCHEMA.map((field) => ({
    ...field,
    defaultValue:
      config[field.key] !== undefined && config[field.key] !== null
        ? config[field.key]
        : field.defaultValue,
  }));
}

// ─────────────────────────────────────────────
// Middleware — block if already fully configured
// ─────────────────────────────────────────────
router.use((req, res, next) => {
  if (isDatabaseConfigured()) {
    return res.status(404).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>404 - Not Found</title>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { 
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            background: #0a0a0a; color: #fff;
            display: flex; justify-content: center; align-items: center;
            min-height: 100vh; padding: 20px;
          }
          .container { text-align: center; max-width: 600px; }
          .error-code {
            font-size: 120px; font-weight: 700;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            -webkit-background-clip: text; -webkit-text-fill-color: transparent;
            background-clip: text; margin-bottom: 20px; line-height: 1;
          }
          h1 { font-size: 32px; font-weight: 600; margin-bottom: 16px; }
          p { color: #888; font-size: 18px; line-height: 1.6; margin-bottom: 32px; }
          .btn {
            display: inline-block; padding: 14px 32px; background: #fff;
            color: #0a0a0a; text-decoration: none; border-radius: 8px;
            font-weight: 600; font-size: 16px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="error-code">404</div>
          <h1>Nothing to see here</h1>
          <p>The page you're looking for doesn't exist or has been moved.</p>
          <a href="/" class="btn">Go Home</a>
        </div>
      </body>
      </html>
    `);
  }
  next();
});

// ─────────────────────────────────────────────
// GET /setup
// ─────────────────────────────────────────────
router.get("/", (req, res) => {
  const missingFields = getMissingConfigFields();
  const config = readConfig();

  const groups = {};
  missingFields.forEach((field) => {
    if (!groups[field.group]) groups[field.group] = [];
    groups[field.group].push(field);
  });

  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <title>Setup — AI Influencer</title>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }

        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif;
          background: #0a0a0a;
          color: #fff;
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
        }

        .card {
          width: 100%;
          max-width: 440px;
          background: #111;
          border: 1px solid #1f1f1f;
          border-radius: 20px;
          padding: 40px;
        }

        .header {
          text-align: center;
          margin-bottom: 36px;
        }

        .logo {
          width: 44px;
          height: 44px;
          background: linear-gradient(135deg, #7c6af7, #a78bfa);
          border-radius: 12px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 18px;
          font-weight: 700;
          color: #fff;
          margin-bottom: 16px;
        }

        .header h1 {
          font-size: 20px;
          font-weight: 600;
          color: #fff;
          letter-spacing: -0.02em;
          margin-bottom: 6px;
        }

        .header p {
          font-size: 13px;
          color: #555;
        }

        .section-title {
          font-size: 10px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: #444;
          margin-bottom: 14px;
          margin-top: 28px;
        }

        .section-title:first-of-type { margin-top: 0; }

        .field { margin-bottom: 14px; }

        .field label {
          display: block;
          font-size: 12px;
          font-weight: 500;
          color: #888;
          margin-bottom: 6px;
        }

        .field input {
          width: 100%;
          padding: 10px 14px;
          background: #0a0a0a;
          border: 1px solid #222;
          border-radius: 10px;
          font-size: 13px;
          color: #fff;
          font-family: inherit;
          transition: border-color 0.15s, box-shadow 0.15s;
        }

        .field input:focus {
          outline: none;
          border-color: #7c6af7;
          box-shadow: 0 0 0 3px rgba(124, 106, 247, 0.12);
        }

        .field input::placeholder { color: #333; }

        .field input.input-error {
          border-color: #ef4444 !important;
          box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.12) !important;
        }

        /* ── JWT generate row ── */
        .input-with-btn {
          display: flex;
          gap: 8px;
          align-items: center;
        }

        .input-with-btn input {
          flex: 1;
          min-width: 0;
        }

        .btn-generate {
          flex-shrink: 0;
          padding: 10px 14px;
          background: #1a1a2e;
          border: 1px solid #7c6af7;
          border-radius: 10px;
          color: #a78bfa;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          font-family: inherit;
          white-space: nowrap;
          transition: background 0.15s, color 0.15s;
        }

        .btn-generate:hover {
          background: #7c6af7;
          color: #fff;
        }

        /* ── Field hint ── */
        .field-hint {
          font-size: 11px;
          color: #444;
          margin-top: 5px;
        }

        .field-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }

        .divider {
          height: 1px;
          background: #1a1a1a;
          margin: 28px 0;
        }

        .message {
          display: none;
          font-size: 12px;
          font-weight: 500;
          padding: 11px 14px;
          border-radius: 10px;
          margin-bottom: 20px;
          border: 1px solid;
        }

        .message.success {
          background: rgba(34, 197, 94, 0.07);
          color: #22c55e;
          border-color: rgba(34, 197, 94, 0.15);
        }

        .message.error {
          background: rgba(239, 68, 68, 0.07);
          color: #ef4444;
          border-color: rgba(239, 68, 68, 0.15);
        }

        .btn-row {
          display: flex;
          gap: 10px;
          margin-top: 6px;
        }

        .btn {
          flex: 1;
          padding: 11px 16px;
          border: none;
          border-radius: 10px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          font-family: inherit;
          transition: all 0.15s;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
        }

        .btn:disabled {
          opacity: 0.35;
          cursor: not-allowed;
          transform: none !important;
          box-shadow: none !important;
        }

        .btn-outline {
          background: transparent;
          color: #888;
          border: 1px solid #222;
        }

        .btn-outline:hover:not(:disabled) {
          border-color: #444;
          color: #ccc;
        }

        .btn-solid {
          background: #7c6af7;
          color: #fff;
        }

        .btn-solid:hover:not(:disabled) {
          background: #8f7ef9;
          transform: translateY(-1px);
          box-shadow: 0 4px 16px rgba(124, 106, 247, 0.3);
        }

        .spinner {
          width: 12px;
          height: 12px;
          border: 2px solid rgba(255,255,255,0.2);
          border-top-color: currentColor;
          border-radius: 50%;
          animation: spin 0.6s linear infinite;
        }

        @keyframes spin { to { transform: rotate(360deg); } }
      </style>
    </head>
    <body>
      <div class="card">

        <div class="header">
          <div class="logo">AI</div>
          <h1>Setup</h1>
          <p>Configure your app to get started</p>
        </div>

        <!-- ── Top message ── -->
        <div id="message" class="message"></div>

        <form id="setupForm" novalidate>

          <!-- ── DATABASE ── -->
          <div class="section-title">Database</div>

          <div class="field-grid">
            <div class="field">
              <label>Host</label>
              <input type="text" id="host" value="localhost" placeholder="localhost" required>
            </div>
            <div class="field">
              <label>Port</label>
              <input type="number" id="dbport" value="3306" placeholder="3306">
            </div>
          </div>

          <div class="field-grid">
            <div class="field">
              <label>Username</label>
              <input type="text" id="user" value="root" placeholder="root" required>
            </div>
            <div class="field">
              <label>Password</label>
              <input type="password" id="password" placeholder="">
            </div>
          </div>

          <div class="field">
            <label>Database Name</label>
            <input type="text" id="database" placeholder="my_database" required>
          </div>

          ${
            missingFields.length > 0
              ? `
            <div class="divider"></div>
            ${Object.entries(groups)
              .map(
                ([groupName, fields]) => `
              <div class="section-title">${groupName}</div>
              ${fields
                .map((field) => {
                  const val =
                    config[field.key] !== undefined
                      ? config[field.key]
                      : field.defaultValue;

                  if (field.generateBtn) {
                    return `
                      <div class="field">
                        <label>${field.label}${field.required ? ' <span style="color:#ef4444;">*</span>' : ""}</label>
                        <div class="input-with-btn">
                          <input
                            type="${field.type}"
                            id="cfg_${field.key}"
                            data-config-key="${field.key}"
                            value="${String(val).replace(/"/g, "&quot;")}"
                            placeholder="${field.placeholder}"
                            ${field.required ? "required" : ""}
                          >
                          <button type="button" class="btn-generate" onclick="generateJwt()">
                            ⚡ Generate
                          </button>
                        </div>
                        <div class="field-hint">A 128-character hex secret will be generated automatically.</div>
                      </div>
                    `;
                  }

                  return `
                    <div class="field">
                      <label>${field.label}${field.required ? ' <span style="color:#ef4444;">*</span>' : ""}</label>
                      <input
                        type="${field.type}"
                        id="cfg_${field.key}"
                        data-config-key="${field.key}"
                        value="${String(val).replace(/"/g, "&quot;")}"
                        placeholder="${field.placeholder}"
                        ${field.required ? "required" : ""}
                      >
                    </div>
                  `;
                })
                .join("")}
            `,
              )
              .join("")}
          `
              : ""
          }

          <!-- ── ADMIN CREDENTIALS ── -->
          <div class="divider"></div>
          <div class="section-title">Admin Account</div>

          <div class="field">
            <label>Admin Email <span style="color:#ef4444;">*</span></label>
            <input
              type="email"
              id="adminEmail"
              placeholder="admin@yourdomain.com"
              required
            >
            <div class="field-hint">This will replace the default admin@admin.com account.</div>
          </div>

          <div class="field">
            <label>Admin Password <span style="color:#ef4444;">*</span></label>
            <input
              type="password"
              id="adminPassword"
              placeholder="Choose a strong password"
              required
              minlength="6"
            >
            <div class="field-hint">Minimum 6 characters. Stored as a bcrypt hash.</div>
          </div>

          <div class="divider"></div>

          <div class="btn-row">
            <button type="button" id="testBtn" class="btn btn-outline" onclick="testConnection()">
              Test
            </button>
            <button type="submit" id="saveBtn" class="btn btn-solid" disabled title="Test connection first">
              Save & Continue
            </button>
          </div>

          <!-- ── Bottom message ── -->
          <div id="message-bottom" class="message" style="margin-top: 16px; margin-bottom: 0;"></div>

        </form>
      </div>

      <script>
        let connectionTested = false;

        // ── Re-lock save on any DB field change ──
        ['host', 'dbport', 'user', 'password', 'database'].forEach(id => {
          const el = document.getElementById(id);
          if (el) el.addEventListener('input', () => {
            connectionTested = false;
            document.getElementById('saveBtn').disabled = true;
            document.getElementById('saveBtn').title = 'Test connection first';
          });
        });

        // ── Show message in both top and bottom bars ──
        function showMessage(msg, type) {
          ['message', 'message-bottom'].forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            el.textContent = msg;
            el.className = 'message ' + type;
            el.style.display = 'block';
          });
          setTimeout(() => {
            ['message', 'message-bottom'].forEach(id => {
              const el = document.getElementById(id);
              if (el) el.style.display = 'none';
            });
          }, 5000);
        }

        // ── Mark a field as invalid with red border ──
        function markError(elId) {
          const el = document.getElementById(elId);
          if (!el) return;
          el.classList.add('input-error');
          el.focus();
          el.addEventListener('input', () => el.classList.remove('input-error'), { once: true });
        }

        // ── Generate a 128-char hex JWT secret via the server ──
        async function generateJwt() {
          try {
            const res = await fetch('/setup/generate-jwt');
            const data = await res.json();
            if (data.token) {
              const el = document.getElementById('cfg_jwt');
              el.value = data.token;
              el.classList.remove('input-error');
            }
          } catch (e) {
            // Fallback: generate client-side using crypto.getRandomValues
            const arr = new Uint8Array(64);
            crypto.getRandomValues(arr);
            const el = document.getElementById('cfg_jwt');
            el.value = Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
            el.classList.remove('input-error');
          }
        }

        function setLoading(id, loading, label) {
          const btn = document.getElementById(id);
          btn.disabled = loading;
          btn.innerHTML = loading
            ? '<span class="spinner"></span>' + label
            : label;
        }

        function getExtraConfig() {
          const extra = {};
          document.querySelectorAll('[data-config-key]').forEach(el => {
            extra[el.dataset.configKey] = el.type === 'number' ? Number(el.value) : el.value;
          });
          return extra;
        }

        async function testConnection() {
          setLoading('testBtn', true, 'Testing...');
          try {
            const res = await fetch('/setup/test-connection', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                host:     document.getElementById('host').value,
                user:     document.getElementById('user').value,
                password: document.getElementById('password').value,
                database: document.getElementById('database').value
              })
            });
            const r = await res.json();
            if (r.success) {
              connectionTested = true;
              const saveBtn = document.getElementById('saveBtn');
              saveBtn.disabled = false;
              saveBtn.title = '';
              showMessage('✓ ' + r.message, 'success');
            } else {
              connectionTested = false;
              document.getElementById('saveBtn').disabled = true;
              showMessage('✗ ' + (r.error || r.message), 'error');
            }
          } catch (e) {
            connectionTested = false;
            document.getElementById('saveBtn').disabled = true;
            showMessage('✗ ' + e.message, 'error');
          } finally {
            setLoading('testBtn', false, 'Test');
          }
        }

        document.getElementById('setupForm').onsubmit = async (e) => {
          e.preventDefault();

          if (!connectionTested) {
            showMessage('✗ Please test your connection first', 'error');
            return;
          }

          // ── Validate all required schema config fields ──
          const requiredConfigFields = [
            { id: 'cfg_jwt',         label: 'JWT Secret Key' },
            { id: 'cfg_backendUrl',  label: 'Backend URL' },
            { id: 'cfg_frontendUrl', label: 'Frontend URL' },
          ];

          for (const field of requiredConfigFields) {
            const el = document.getElementById(field.id);
            if (!el) continue;
            if (!el.value.trim()) {
              showMessage('✗ ' + field.label + ' is required', 'error');
              markError(field.id);
              return;
            }
          }

          // ── Validate admin fields ──
          const adminEmail    = document.getElementById('adminEmail').value.trim();
          const adminPassword = document.getElementById('adminPassword').value;

          if (!adminEmail) {
            showMessage('✗ Admin email is required', 'error');
            markError('adminEmail');
            return;
          }
          if (!adminPassword || adminPassword.length < 6) {
            showMessage('✗ Admin password must be at least 6 characters', 'error');
            markError('adminPassword');
            return;
          }

          setLoading('saveBtn', true, 'Installing...');
          document.getElementById('testBtn').disabled = true;

          try {
            const res = await fetch('/setup/save', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                host:          document.getElementById('host').value,
                user:          document.getElementById('user').value,
                password:      document.getElementById('password').value,
                database:      document.getElementById('database').value,
                extraConfig:   getExtraConfig(),
                adminEmail,
                adminPassword
              })
            });
            const r = await res.json();
            if (r.success) {
              showMessage('✓ Saved! Redirecting...', 'success');
              setTimeout(() => window.location.href = r.frontendUrl || '/', 1500);
            } else {
              showMessage('✗ ' + (r.error || r.message), 'error');
              setLoading('saveBtn', false, 'Save & Continue');
              document.getElementById('testBtn').disabled = false;
            }
          } catch (e) {
            showMessage('✗ ' + e.message, 'error');
            setLoading('saveBtn', false, 'Save & Continue');
            document.getElementById('testBtn').disabled = false;
          }
        };
      </script>
    </body>
    </html>
  `);
});

// ─────────────────────────────────────────────
// GET /setup/generate-jwt
// ─────────────────────────────────────────────
router.get("/generate-jwt", (req, res) => {
  const crypto = require("crypto");
  const token = crypto.randomBytes(64).toString("hex");
  res.json({ token });
});

// ─────────────────────────────────────────────
// POST /setup/test-connection
// ─────────────────────────────────────────────
router.post("/test-connection", async (req, res) => {
  const { host, user, password, database } = req.body;
  try {
    const mysql = require("mysql2/promise");
    const testPool = mysql.createPool({
      host,
      user,
      password,
      database,
      waitForConnections: true,
      connectionLimit: 1,
      connectTimeout: 10000,
    });
    const connection = await testPool.getConnection();
    await connection.ping();
    connection.release();
    await testPool.end();
    res.json({ success: true, message: "Connection successful" });
  } catch (error) {
    console.error("Database connection test failed:", error);
    res
      .status(400)
      .json({ success: false, error: error.message || "Connection failed" });
  }
});

// ─────────────────────────────────────────────
// POST /setup/save
// ─────────────────────────────────────────────
router.post("/save", async (req, res) => {
  const {
    host,
    user,
    password,
    database,
    extraConfig = {},
    adminEmail,
    adminPassword,
  } = req.body;

  // ── Basic DB field validation ──
  if (!host || !user || !database) {
    return res.status(400).json({
      success: false,
      error: "Host, username, and database name are required",
    });
  }

  // ── Admin field validation ──
  if (!adminEmail || !adminPassword) {
    return res.status(400).json({
      success: false,
      error: "Admin email and password are required",
    });
  }

  if (adminPassword.length < 6) {
    return res.status(400).json({
      success: false,
      error: "Admin password must be at least 6 characters",
    });
  }

  // ── Required schema fields validation (server-side safety net) ──
  const requiredExtraKeys = CONFIG_FIELD_SCHEMA.filter((f) => f.required).map(
    (f) => f.key,
  );
  for (const key of requiredExtraKeys) {
    const val = extraConfig[key];
    if (!val || String(val).trim() === "") {
      const label =
        CONFIG_FIELD_SCHEMA.find((f) => f.key === key)?.label || key;
      return res.status(400).json({
        success: false,
        error: `${label} is required`,
      });
    }
  }

  // ── Single pool for everything — init queries + admin UPDATE ──
  const mysql = require("mysql2/promise");
  const freshPool = mysql.createPool({
    host,
    user,
    password,
    database,
    waitForConnections: true,
    connectionLimit: 5,
    connectTimeout: 10000,
  });

  try {
    // 1. Verify connection
    const testConn = await freshPool.getConnection();
    await testConn.ping();
    testConn.release();

    // 2. Write config.json
    let config = readConfig();
    config.database = { host, user, password, database };

    const allowedKeys = CONFIG_FIELD_SCHEMA.map((f) => f.key);
    for (const [key, value] of Object.entries(extraConfig)) {
      if (allowedKeys.includes(key)) {
        config[key] = value;
      }
    }

    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

    // 3. Run all init queries sequentially on freshPool
    const allQueries = getQueries();
    for (const q of allQueries) {
      const conn = await freshPool.getConnection();
      try {
        const [rows] = await conn.query(q.check);
        if (rows.length === 0) {
          await conn.query(q.run);
        }
      } catch (err) {
        console.warn("Init query skipped:", err.message);
      } finally {
        conn.release();
      }
    }

    // 4. Bcrypt password & update admin row
    const bcrypt = require("bcrypt");
    const hashedPassword = await bcrypt.hash(adminPassword, 10);

    const adminConn = await freshPool.getConnection();
    try {
      const uid = randomstring.generate();
      const token_version = crypto.randomUUID();
      await adminConn.query(
        `INSERT INTO admin (uid, email, password, role, token_version) VALUES (?,?,?,?,?)`,
        [
          uid,
          adminEmail.toLowerCase().trim(),
          hashedPassword,
          "admin",
          token_version,
        ],
      );
    } finally {
      adminConn.release();
    }

    await freshPool.end();

    // 5. Reset the app's DB pool to pick up new config
    const db = require("../database/connection");
    db.resetPool();

    res.json({
      success: true,
      message: "Configuration saved successfully",
      frontendUrl: extraConfig.frontendUrl || "/",
    });
  } catch (error) {
    console.error("Save configuration failed:", error);
    try {
      await freshPool.end();
    } catch (_) {}
    res.status(400).json({
      success: false,
      error: error.message || "Failed to save configuration",
    });
  }
});

module.exports = router;
