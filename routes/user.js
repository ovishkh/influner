const express = require("express");
const router = express.Router();
const { query } = require("../database/connection");
const bcrypt = require("bcrypt");
const { getEnv, getResetEmailHtml } = require("../utils/common");
const { validateEmail, sendEmail } = require("../utils/common");
const randomstring = require("randomstring");
const { sign } = require("jsonwebtoken");
const validateUser = require("../middlewares/user");
const crypto = require("crypto");
const { OAuth2Client } = require("google-auth-library"); // ← ADD THIS

// ─────────────────────────────────────────────
// Google Login — verifies token against Google's public keys
// ─────────────────────────────────────────────
router.post("/login_with_google", async (req, res) => {
  try {
    const { token } = req.body;

    const [web] = await query(`SELECT google_login_id FROM web_public`, []);
    const clientId = web?.google_login_id;

    if (!token || !clientId) {
      return res.json({
        success: false,
        msg: "Token and clientId are required",
      });
    }

    const client = new OAuth2Client(clientId);
    let payload;
    try {
      const ticket = await client.verifyIdToken({
        idToken: token,
        audience: clientId,
      });
      payload = ticket.getPayload();
    } catch (verifyErr) {
      return res.json({ success: false, msg: "Invalid Google token" });
    }

    if (!payload?.email || !payload?.email_verified) {
      return res.json({ success: false, msg: "Google email not verified" });
    }

    const email = payload.email;
    const name = payload.name || email;
    const env = getEnv();
    const getUser = await query(`SELECT * FROM user WHERE email = ?`, [email]);

    if (getUser?.length < 1) {
      // ── New user ──
      const uid = randomstring.generate();
      const password = crypto.randomBytes(32).toString("hex");
      const hasPass = await bcrypt.hash(password, 10);
      const token_version = crypto.randomUUID();

      await query(
        `INSERT INTO user (name, uid, email, password, token_version) VALUES (?,?,?,?,?)`,
        [name, uid, email, hasPass, token_version],
      );

      const loginToken = sign(
        { uid, role: "user", email, token_version },
        env?.jwt,
        {},
      );
      return res.json({ token: loginToken, success: true });
    } else {
      // ── Existing user ──
      const token_version = crypto.randomUUID();
      await query(`UPDATE user SET token_version = ? WHERE uid = ?`, [
        token_version,
        getUser[0].uid,
      ]);

      const loginToken = sign(
        {
          uid: getUser[0].uid,
          role: "user",
          email: getUser[0].email,
          token_version,
        },
        env?.jwt,
        {},
      );
      return res.json({ success: true, token: loginToken });
    }
  } catch (err) {
    console.log(err);
    res.json({ success: false, msg: "Something went wrong", err });
  }
});

// ─────────────────────────────────────────────
// Login / Signup
// ─────────────────────────────────────────────
router.post("/login", async (req, res) => {
  try {
    const { email: emailBefore, password } = req.body;
    const env = getEnv();

    if (!emailBefore || !password) {
      return res.json({
        msg: "Email and password is required",
        success: false,
      });
    }

    const email = emailBefore?.toLowerCase();

    if (!validateEmail(email)) {
      return res.json({ msg: "Please enter a valid email", success: false });
    }

    const [user] = await query(`SELECT * FROM user WHERE email = ?`, [email]);

    if (!user) {
      // ── New User Signup ──
      const haspass = await bcrypt.hash(password, 10);
      const uid = randomstring.generate();
      const token_version = crypto.randomUUID();

      await query(
        `INSERT INTO user (uid, email, password, token_version) VALUES (?,?,?,?)`,
        [uid, email, haspass, token_version],
      );

      const token = sign(
        { uid, role: "user", email, token_version },
        env?.jwt,
        {},
      );

      // ── Send Welcome Email ──
      const [templateRow] = await query(
        `SELECT email_template_welcome FROM web_private LIMIT 1`,
        [],
      );
      let html = templateRow?.email_template_welcome || "";
      html = html
        .replace(/\{\{user_email\}\}/g, email)
        .replace(/\{\{date\}\}/g, new Date().toLocaleDateString());
      await sendEmail({
        to: email,
        subject: "Welcome! Your account has been created",
        html,
      });

      return res.json({ success: true, token });
    } else {
      // ── Existing User Login ──
      const compare = await bcrypt.compare(password, user?.password);
      if (!compare) {
        return res.json({ msg: "Invalid credentials" });
      }

      const token_version = crypto.randomUUID();
      await query(`UPDATE user SET token_version = ? WHERE uid = ?`, [
        token_version,
        user.uid,
      ]);

      const token = sign(
        { uid: user.uid, role: "user", email: user.email, token_version },
        env?.jwt,
        {},
      );
      return res.json({ success: true, token });
    }
  } catch (err) {
    console.log(err);
    res.json({ msg: "Something went wrong", err, success: false });
  }
});

// get videos with pagination
router.get("/get_t_video", validateUser, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 12;
    const search = req.query.search || "";
    const offset = (page - 1) * limit;

    // Build search query
    let searchQuery = "";
    let params = [];

    if (search) {
      searchQuery = `WHERE tv.des LIKE ? OR tc.name LIKE ?`;
      params = [`%${search}%`, `%${search}%`];
    }

    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total 
      FROM templates_video tv
      LEFT JOIN templates_category tc ON tv.cate_id = tc.cate_id
      ${searchQuery}
    `;

    let totalResult;
    try {
      totalResult = await query(countQuery, params);
    } catch (joinErr) {
      // If cate_id doesn't exist in templates_category, try with id
      const countQueryAlt = `
        SELECT COUNT(*) as total 
        FROM templates_video tv
        LEFT JOIN templates_category tc ON tv.cate_id = tc.id
        ${searchQuery}
      `;
      totalResult = await query(countQueryAlt, params);
    }

    const [{ total }] = totalResult;

    // Get videos with category info
    const dataQuery = `
      SELECT 
        tv.*,
        tc.name as category_name,
        tc.color as category_color
      FROM templates_video tv
      LEFT JOIN templates_category tc ON tv.cate_id = tc.id
      ${searchQuery}
      ORDER BY tv.created_at DESC
      LIMIT ? OFFSET ?
    `;
    const data = await query(dataQuery, [...params, limit, offset]);

    res.json({
      data,
      success: true,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasMore: page < Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.log(err);
    res.json({
      success: false,
      msg: "Something went wrong",
      err: err.message,
    });
  }
});

router.get("/get_me", validateUser, async (req, res) => {
  try {
    let [data] = await query(`SELECT * FROM user WHERE uid = ?`, [
      req.decode.uid,
    ]);
    data = {
      ...data,
      email_notificaion: data?.email_notificaion
        ? JSON.parse(data?.email_notificaion)
        : {},
    };
    res.json({ success: true, data });
  } catch (err) {
    res.json({ msg: "something went wrong", err });
    console.log(err);
  }
});

router.post("/update_email", validateUser, async (req, res) => {
  try {
    const { json } = req.body;

    await query(`UPDATE user SET email_notificaion = ? WHERE uid = ?`, [
      JSON.stringify(json),
      req.decode.uid,
    ]);

    res.json({ success: true, msg: "Email prefrence updated" });
  } catch (err) {
    res.json({ msg: "something went wrong", err });
    console.log(err);
  }
});

router.get("/get_usage_logs", validateUser, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const offset = parseInt(req.query.offset) || 0;

    // Total count for "has more" check
    const [{ total }] = await query(
      `SELECT COUNT(*) as total FROM usage_log WHERE uid = ?`,
      [req.decode.uid],
    );

    // Newest first via ORDER BY createdAt DESC
    const data = await query(
      `SELECT * FROM usage_log WHERE uid = ? ORDER BY createdAt DESC LIMIT ? OFFSET ?`,
      [req.decode.uid, limit, offset],
    );

    res.json({ data, total, success: true });
  } catch (err) {
    res.json({ msg: "something went wrong", err });
    console.log(err);
  }
});

router.post("/update_profile", validateUser, async (req, res) => {
  try {
    const { newPassword, email, name } = req.body;
    if (!name || !email) {
      return res.json({ msg: "Name, Email are required fields" });
    }

    const userFromToken = req.decode.user;

    if (userFromToken?.email !== email) {
      const [checkUser] = await query(`SELECT * FROM user WHERE email = ?`, [
        email,
      ]);
      if (checkUser) {
        return res.json({ msg: "This email is already reserved" });
      }
    }

    if (newPassword) {
      const hashPass = await bcrypt.hash(newPassword, 10);
      const token_version = crypto.randomUUID(); // ← rotate on password change
      const env = getEnv();

      await query(
        `UPDATE user SET name = ?, email = ?, password = ?, token_version = ? WHERE uid = ?`,
        [name, email, hashPass, token_version, req.decode.uid],
      );

      // ── Return a fresh token so current session stays alive ──
      const newToken = sign(
        { uid: req.decode.uid, role: "user", email, token_version },
        env?.jwt,
        {},
      );
      return res.json({
        success: true,
        msg: "Profile was updated",
        token: newToken,
      });
    } else {
      await query(`UPDATE user SET name = ?, email = ? WHERE uid = ?`, [
        name,
        email,
        req.decode.uid,
      ]);
      return res.json({ success: true, msg: "Profile was updated" });
    }
  } catch (err) {
    res.json({ msg: "something went wrong", err });
    console.log(err);
  }
});

router.get("/get_dashboard", validateUser, async (req, res) => {
  try {
    const uid = req.decode.uid;

    // ── 1. User info ──────────────────────────────────────
    const userRows = await query(
      `SELECT id, uid, name, email, credits, plan, plan_ending, status, createdAt
       FROM user WHERE uid = ? LIMIT 1`,
      [uid],
    );
    if (!userRows.length) {
      return res.json({ success: false, msg: "User not found" });
    }
    const user = userRows[0];

    // ── 2. Influencers ────────────────────────────────────
    const [{ total_influencers }] = await query(
      `SELECT COUNT(*) AS total_influencers FROM influencers WHERE uid = ?`,
      [uid],
    );
    const [{ active_influencers }] = await query(
      `SELECT COUNT(*) AS active_influencers FROM influencers WHERE uid = ? AND status = 'active'`,
      [uid],
    );

    // ── 3. Gallery ────────────────────────────────────────
    const [{ total_gallery }] = await query(
      `SELECT COUNT(*) AS total_gallery FROM gallery WHERE uid = ?`,
      [uid],
    );
    const [{ success_gallery }] = await query(
      `SELECT COUNT(*) AS success_gallery FROM gallery WHERE uid = ? AND status = 'success'`,
      [uid],
    );

    // ── 4. Content videos ─────────────────────────────────
    const [{ total_content }] = await query(
      `SELECT COUNT(*) AS total_content FROM content WHERE uid = ?`,
      [uid],
    );
    const [{ success_content }] = await query(
      `SELECT COUNT(*) AS success_content FROM content WHERE uid = ? AND status = 'success'`,
      [uid],
    );

    // ── 5. Product showcase ───────────────────────────────
    const [{ total_showcase }] = await query(
      `SELECT COUNT(*) AS total_showcase FROM product_content WHERE uid = ?`,
      [uid],
    );
    const [{ success_showcase }] = await query(
      `SELECT COUNT(*) AS success_showcase FROM product_content WHERE uid = ? AND status = 'active'`,
      [uid],
    );

    // ── 6. Recent usage logs ──────────────────────────────
    const usageLogs = await query(
      `SELECT task, credits, status, date, des, createdAt
       FROM usage_log
       WHERE uid = ?
       ORDER BY createdAt DESC
       LIMIT 10`,
      [uid],
    );

    // ── 7. Credits spent per day (last 7 days) ────────────
    const creditChart = await query(
      `SELECT date, SUM(CAST(credits AS UNSIGNED)) AS credits_spent
       FROM usage_log
       WHERE uid = ?
         AND status = 'success'
         AND createdAt >= DATE_SUB(NOW(), INTERVAL 7 DAY)
       GROUP BY date
       ORDER BY date ASC`,
      [uid],
    );

    // ── 8. Task breakdown ─────────────────────────────────
    const taskBreakdown = await query(
      `SELECT task, COUNT(*) AS count, SUM(CAST(credits AS UNSIGNED)) AS total_credits
       FROM usage_log
       WHERE uid = ? AND status = 'success'
       GROUP BY task`,
      [uid],
    );

    // ── 9. Recent influencers ─────────────────────────────
    const recentInfluencers = await query(
      `SELECT id, name, photo_url, status, created_at
       FROM influencers
       WHERE uid = ?
       ORDER BY created_at DESC
       LIMIT 5`,
      [uid],
    );

    return res.json({
      success: true,
      data: {
        user,
        stats: {
          influencers: { total: total_influencers, active: active_influencers },
          gallery: { total: total_gallery, success: success_gallery },
          content: { total: total_content, success: success_content },
          showcase: { total: total_showcase, success: success_showcase },
        },
        credit_chart: creditChart,
        task_breakdown: taskBreakdown,
        recent_influencers: recentInfluencers,
        usage_logs: usageLogs,
      },
    });
  } catch (err) {
    console.log(err);
    res.json({ success: false, msg: "Something went wrong", err });
  }
});

// ── Send Recovery Email ────────────────────────────────────────────────────
router.post("/send_recovery_email", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.json({ success: false, msg: "Please fill the email" });
    }

    const [user] = await query(`SELECT * FROM user WHERE email = ?`, [email]);

    if (user) {
      const token = crypto.randomBytes(32).toString("hex");

      await query(`UPDATE user SET forget_token = ? WHERE email = ?`, [
        token,
        email,
      ]);

      const env = getEnv();
      const resetLink = env?.frontendUrl + "/password-recovery?token=" + token;

      // ── Fetch template from DB ─────────────────────────────
      const [templateRow] = await query(
        `SELECT email_template_pass_recovery FROM web_private LIMIT 1`,
        [],
      );

      let html = templateRow?.email_template_pass_recovery || "";

      // ── Replace variables ──────────────────────────────────
      html = html
        .replace(/\{\{user_email\}\}/g, email)
        .replace(/\{\{reset_link\}\}/g, resetLink)
        .replace(/\{\{date\}\}/g, new Date().toLocaleDateString());

      const sendEm = await sendEmail({
        to: email,
        subject: "Reset your password",
        html,
      });

      if (!sendEm?.success) {
        return res.json({ success: false, msg: sendEm?.msg });
      }
    }

    res.json({
      success: true,
      msg: "If this email is registered, you will receive a reset link shortly.",
    });
  } catch (err) {
    console.log(err);
    res.json({ success: false, msg: "Something went wrong", err });
  }
});

router.post("/reset_password", async (req, res) => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return res.json({
        success: false,
        msg: "Token and password are required",
      });
    }

    const [user] = await query(`SELECT * FROM user WHERE forget_token = ?`, [
      token,
    ]);
    if (!user) {
      return res.json({ success: false, msg: "Invalid or expired reset link" });
    }

    const hashed = await bcrypt.hash(password, 10);
    const token_version = crypto.randomUUID(); // ← invalidates all old sessions

    await query(
      `UPDATE user SET password = ?, forget_token = NULL, token_version = ? WHERE forget_token = ?`,
      [hashed, token_version, token],
    );

    res.json({ success: true, msg: "Password reset successfully" });
  } catch (err) {
    console.log(err);
    res.json({ success: false, msg: "Something went wrong", err });
  }
});

module.exports = router;
