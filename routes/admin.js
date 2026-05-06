const router = require("express").Router();
const { query } = require("../database/connection.js");
const bcrypt = require("bcrypt");
const { sign } = require("jsonwebtoken");
const adminValidator = require("../middlewares/admin.js");
const {
  validateEmail,
  getEnv,
  updateUserPlan,
  generateThumbnail,
  sendEmail,
  convertAndSaveVideo,
  getAdminResetEmailHtml,
} = require("../utils/common.js");
const path = require("path");
const fs = require("fs");
const randomstring = require("randomstring");
const crypto = require("crypto");

router.post("/login", async (req, res) => {
  try {
    const { email: emailRoute, password } = req.body;
    if (!emailRoute || !password) {
      return res.json({
        success: false,
        msg: "Please fill email and password",
      });
    }
    const env = getEnv();
    let email = emailRoute?.toLowerCase();

    if (!validateEmail(email)) {
      return res.json({ msg: "Please provide a valid email" });
    }

    const userFind = await query(`SELECT * FROM admin WHERE email = ?`, [
      email,
    ]);
    if (userFind.length < 1) {
      return res.json({ msg: "Invalid credentials found" });
    }

    const compare = await bcrypt.compare(password, userFind[0].password);
    if (!compare) {
      return res.json({ msg: "Invalid credentials" });
    }

    const token_version = crypto.randomUUID();
    await query(`UPDATE admin SET token_version = ? WHERE uid = ?`, [
      token_version,
      userFind[0].uid,
    ]);

    const token = sign(
      {
        uid: userFind[0].uid,
        role: "admin",
        email: userFind[0].email,
        token_version,
      },
      env?.jwt,
      {},
    );
    res.json({ success: true, token });
  } catch (err) {
    res.json({ success: false, msg: "something went wrong" });
    console.log(err);
  }
});

// get all users
router.get("/get_users", adminValidator, async (req, res) => {
  try {
    const users = await query(`SELECT * FROM user`, []);
    res.json({ data: users, success: true });
  } catch (err) {
    console.log(err);
    res.json({ msg: "Something went wrong", err, success: false });
  }
});

// delete users
router.post("/delete_users", adminValidator, async (req, res) => {
  try {
    const { userIds } = req.body;

    // Validate input
    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return res.json({
        success: false,
        msg: "Invalid user IDs provided",
      });
    }

    // Create placeholders for SQL IN clause
    const placeholders = userIds.map(() => "?").join(",");

    // Delete users from database
    const result = await query(
      `DELETE FROM user WHERE uid IN (${placeholders})`,
      userIds,
    );

    res.json({
      success: true,
      msg: `${result.affectedRows} user(s) deleted successfully`,
      deletedCount: result.affectedRows,
    });
  } catch (err) {
    console.log(err);
    res.json({
      success: false,
      msg: "Failed to delete users",
      error: err.message,
    });
  }
});

router.post("/update_user", adminValidator, async (req, res) => {
  try {
    const { name, email, newPassword, uid } = req.body;

    if (!email || !uid) {
      return res.json({ msg: "Email and UID are required fields" });
    }

    // Check if email is already taken by another user
    const findUserByEmail = await query(`SELECT * FROM user WHERE email = ?`, [
      email,
    ]);

    if (findUserByEmail.length > 0 && findUserByEmail[0].uid !== uid) {
      return res.json({ msg: "This email is already taken by another user" });
    }

    // Check if user exists
    const findUserByUid = await query(`SELECT * FROM user WHERE uid = ?`, [
      uid,
    ]);

    if (findUserByUid.length === 0) {
      return res.json({ msg: "User not found" });
    }

    // Update user with or without password
    if (newPassword) {
      const hashpass = await bcrypt.hash(newPassword, 10);
      await query(
        `UPDATE user SET name = ?, email = ?, password = ? WHERE uid = ?`,
        [name, email, hashpass, uid],
      );
    } else {
      await query(`UPDATE user SET name = ?, email = ? WHERE uid = ?`, [
        name,
        email,
        uid,
      ]);
    }

    res.json({ msg: "User was updated", success: true });
  } catch (err) {
    console.log(err);
    res.json({
      success: false,
      msg: "Failed to update user",
      error: err.message,
    });
  }
});

// auto user login
router.post("/auto_login", adminValidator, async (req, res) => {
  try {
    const { uid } = req.body;
    if (!uid) {
      return res.json({ success: false, msg: "Invalid input" });
    }

    const env = getEnv();
    const users = await query(`SELECT * FROM user WHERE uid = ?`, [uid]);
    if (!users.length) {
      return res.json({ success: false, msg: "User not found" });
    }

    const token_version = crypto.randomUUID();
    await query(`UPDATE user SET token_version = ? WHERE uid = ?`, [
      token_version,
      uid,
    ]);

    const token = sign(
      { uid: users[0].uid, role: "user", email: users[0].email, token_version },
      env?.jwt,
      {},
    );
    res.json({ success: true, token });
  } catch (err) {
    console.log(err);
    res.json({ msg: "Something went wrong", err });
  }
});

// update user plan
router.post("/update_user_plan", adminValidator, async (req, res) => {
  try {
    const { planId, uid } = req.body;
    if (!planId || !uid) {
      return res.json({ msg: "Plan id and uid is required" });
    }

    const d = await updateUserPlan({ planId, uid });

    res.json(d);
  } catch (err) {
    console.log(err);
    res.json({ msg: "Something went wrong", err });
  }
});

// update credits
router.post("/update_user_credits", adminValidator, async (req, res) => {
  try {
    const { credits, uid } = req.body;
    await query(`UPDATE user SET credits = ? WHERE uid = ?`, [
      parseInt(credits || 0),
      uid,
    ]);

    res.json({ msg: "Credits updated", success: true });
  } catch (err) {
    console.log(err);
    res.json({ msg: "Something went wrong", err });
  }
});

// add new category
router.post("/add_t_cate", adminValidator, async (req, res) => {
  try {
    const { name, color } = req.body;
    if (!name || !color) {
      return res.json({ msg: "Please fill colour and name" });
    }

    await query(`INSERT INTO templates_category (name, color) VALUES (?,?)`, [
      name,
      color,
    ]);

    res.json({ success: true, msg: "Catgeory was added" });
  } catch (err) {
    console.log(err);
    res.json({ msg: "Something went wrong", err });
  }
});

// get all category
router.get("/get_t_care", async (req, res) => {
  try {
    const data = await query(`SELECT * FROM templates_category`, []);
    res.json({ data, success: true });
  } catch (err) {
    console.log(err);
    res.json({ msg: "Something went wrong", err });
  }
});

// del cate
router.post("/del_t_cate", adminValidator, async (req, res) => {
  try {
    const { cateId } = req.body;
    if (!cateId) {
      return res.json({ msg: "Category id missing" });
    }
    const videos = await query(
      `SELECT * FROM templates_video WHERE cate_id = ?`,
      [cateId],
    );
    if (videos?.length > 0) {
      return res.json({
        msg: "This category has content in it. Please remove them before deleting this category",
      });
    }

    await query(`DELETE FROM templates_category WHERE id = ?`, [cateId]);

    res.json({ success: true, msg: "Category was deleted" });
  } catch (err) {
    console.log(err);
    res.json({ msg: "Something went wrong", err });
  }
});

// add video
router.post("/add_t_video", adminValidator, async (req, res) => {
  try {
    const { cate_id, des } = req.body;

    if (!cate_id || !des) {
      return res.json({
        success: false,
        msg: "Please select a category and enter a description",
      });
    }

    if (!req.files || !req.files.video) {
      return res.json({
        success: false,
        msg: "Please upload a video file",
      });
    }

    const videoFile = req.files.video;

    // Generate unique filenames
    const randomStr = randomstring.generate(8);
    const videoFilename = `video_${randomStr}.mp4`; // always .mp4 after conversion
    const thumbnailFilename = `thumb_${randomStr}.png`;

    // Define paths
    const mediaDir = path.join(__dirname, "../client/public/media");
    const videoPath = path.join(mediaDir, videoFilename);
    const thumbnailPath = path.join(mediaDir, thumbnailFilename);

    // Create media directory if it doesn't exist
    if (!fs.existsSync(mediaDir)) {
      fs.mkdirSync(mediaDir, { recursive: true });
    }

    // ✅ Convert and save video (replaces videoFile.mv())
    const convertResult = await convertAndSaveVideo(
      videoFile.data,
      videoPath,
    ).catch((err) => err);

    if (!convertResult.success) {
      return res.json({
        success: false,
        msg: convertResult.msg || "Video conversion failed",
        err: convertResult.error,
      });
    }

    // Generate thumbnail from the converted video
    await generateThumbnail(videoPath, thumbnailPath);

    // Save to database
    await query(
      "INSERT INTO templates_video (cate_id, des, video, video_thumbnail) VALUES (?, ?, ?, ?)",
      [cate_id, des, videoFilename, thumbnailFilename],
    );

    res.json({
      success: true,
      msg: "Video uploaded successfully",
      data: {
        video: videoFilename,
        thumbnail: thumbnailFilename,
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

// get videos with pagination
router.get("/get_t_video", adminValidator, async (req, res) => {
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

// Delete video(s) - handles single or multiple
router.post("/delete_t_video", adminValidator, async (req, res) => {
  try {
    const { ids } = req.body;

    if (!ids || ids.length === 0) {
      return res.json({ success: false, msg: "No videos selected" });
    }

    // Get all videos
    const videos = await query(
      `SELECT video, video_thumbnail FROM templates_video WHERE id IN (${ids.map(() => "?").join(",")})`,
      ids,
    );

    // Delete files
    const fs = require("fs");
    const path = require("path");
    const mediaDir = path.join(__dirname, "../client/public/media");

    videos.forEach((video) => {
      const videoPath = path.join(mediaDir, video.video);
      const thumbnailPath = path.join(mediaDir, video.video_thumbnail);

      if (fs.existsSync(videoPath)) fs.unlinkSync(videoPath);
      if (fs.existsSync(thumbnailPath)) fs.unlinkSync(thumbnailPath);
    });

    // Delete from database
    await query(
      `DELETE FROM templates_video WHERE id IN (${ids.map(() => "?").join(",")})`,
      ids,
    );

    res.json({
      success: true,
      msg: `${ids.length} video(s) deleted successfully`,
    });
  } catch (err) {
    console.log(err);
    res.json({ success: false, msg: "Something went wrong", err: err.message });
  }
});

// add new prompt template
router.post("/add_prmpt_temp", adminValidator, async (req, res) => {
  try {
    const { prompt, type } = req.body;
    const typeAll = ["new", "variation"];

    if (!typeAll?.includes(type)) {
      return res.json({ msg: "Prompt type is invalid" });
    }

    if (!prompt) {
      return res.json({ msg: "Prompt cant be empty" });
    }

    await query(`INSERT INTO prompt_templates (prompt, type) VALUES (?,?)`, [
      prompt,
      type,
    ]);

    res.json({ msg: "Prompt template was added", success: true });
  } catch (err) {
    console.log(err);
    res.json({ success: false, msg: "Something went wrong", err: err.message });
  }
});

// del a prompt templet
router.post("/del_prompt_t", adminValidator, async (req, res) => {
  try {
    const { id } = req.body;
    await query(`DELETE FROM prompt_templates WHERE id = ?`, [id]);
    res.json({ success: true, msg: "Prompt template was deleted" });
  } catch (err) {
    console.log(err);
    res.json({ success: false, msg: "Something went wrong", err: err.message });
  }
});

// get all prompt templates
router.get("/get_prompt_t", async (req, res) => {
  try {
    const data = await query(`SELECT * FROM prompt_templates`, []);
    res.json({ data, success: true });
  } catch (err) {
    console.log(err);
    res.json({ success: false, msg: "Something went wrong", err: err.message });
  }
});

// edit prompt templet
router.post("/update_prompt_t", adminValidator, async (req, res) => {
  try {
    const { id, prompt } = req.body;
    if (!prompt) {
      return res.json({ msg: "Prompt cant be empty" });
    }

    await query(`UPDATE prompt_templates SET prompt = ? WHERE id = ?`, [
      prompt,
      id,
    ]);

    res.json({ msg: "Prompt template was updated", success: true });
  } catch (err) {
    console.log(err);
    res.json({ success: false, msg: "Something went wrong", err: err.message });
  }
});

// ── GET SMTP CONFIG ──
router.get("/get_smtp", adminValidator, async (req, res) => {
  try {
    const rows = await query(
      `SELECT smtp_host, smtp_port, smtp_security, smtp_auth,
              smtp_username, smtp_email, smtp_password, smtp_from
       FROM web_private LIMIT 1`,
      [],
    );
    res.json({ success: true, data: rows[0] || {} });
  } catch (err) {
    console.log(err);
    res.json({ success: false, msg: "Something went wrong" });
  }
});

// ── SAVE SMTP CONFIG ──
router.post("/smtp_add", adminValidator, async (req, res) => {
  try {
    const {
      smtp_host,
      smtp_port,
      smtp_security,
      smtp_auth,
      smtp_username,
      smtp_email,
      smtp_password,
      smtp_from,
    } = req.body;

    if (!smtp_host || !smtp_port || !smtp_email) {
      return res.json({
        success: false,
        msg: "Host, Port and Sender Email are required",
      });
    }

    const existing = await query(`SELECT id FROM web_private LIMIT 1`, []);

    if (existing.length > 0) {
      await query(
        `UPDATE web_private SET
          smtp_host = ?, smtp_port = ?, smtp_security = ?,
          smtp_auth = ?, smtp_username = ?, smtp_email = ?,
          smtp_password = ?, smtp_from = ?
         WHERE id = ?`,
        [
          smtp_host,
          smtp_port,
          smtp_security || "tls",
          smtp_auth ? 1 : 0,
          smtp_username || null,
          smtp_email,
          smtp_password || null,
          smtp_from || null,
          existing[0].id,
        ],
      );
    } else {
      await query(
        `INSERT INTO web_private
          (smtp_host, smtp_port, smtp_security, smtp_auth,
           smtp_username, smtp_email, smtp_password, smtp_from)
         VALUES (?,?,?,?,?,?,?,?)`,
        [
          smtp_host,
          smtp_port,
          smtp_security || "tls",
          smtp_auth ? 1 : 0,
          smtp_username || null,
          smtp_email,
          smtp_password || null,
          smtp_from || null,
        ],
      );
    }

    res.json({ success: true, msg: "SMTP configuration saved successfully" });
  } catch (err) {
    console.log(err);
    res.json({ success: false, msg: "Something went wrong" });
  }
});

router.post("/smtp_test", adminValidator, async (req, res) => {
  try {
    const { to } = req.body;

    const now = new Date().toUTCString();

    const result = await sendEmail({
      to,
      subject: "✅ SMTP Test Email",
      html: `
        <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;border:1px solid #e0e0e0;border-radius:8px;overflow:hidden;">
          <div style="background:#4f46e5;padding:24px 32px;">
            <h2 style="color:#fff;margin:0;font-size:20px;">✅ SMTP Test Successful</h2>
          </div>
          <div style="padding:24px 32px;background:#ffffff;">
            <p style="margin:0 0 12px;color:#374151;font-size:15px;">
              Your SMTP configuration is working correctly.
              This is an automated test email sent from your admin panel.
            </p>
            <table style="width:100%;border-collapse:collapse;margin-top:16px;font-size:13px;">
              <tr style="background:#f9fafb;">
                <td style="padding:8px 12px;color:#6b7280;font-weight:600;width:40%;">Sent At</td>
                <td style="padding:8px 12px;color:#111827;">${now}</td>
              </tr>
              <tr>
                <td style="padding:8px 12px;color:#6b7280;font-weight:600;">Recipient</td>
                <td style="padding:8px 12px;color:#111827;">${to}</td>
              </tr>
            </table>
          </div>
          <div style="padding:16px 32px;background:#f9fafb;border-top:1px solid #e0e0e0;">
            <p style="margin:0;font-size:12px;color:#9ca3af;">
              This email was sent automatically. No action is required.
            </p>
          </div>
        </div>
      `,
    });

    res.json(result);
  } catch (err) {
    console.error("[smtp_test]", err.message);
    res.json({ success: false, msg: `Something went wrong: ${err.message}` });
  }
});

// ── GET EMAIL TEMPLATES ──
router.get("/get_email_templates", adminValidator, async (req, res) => {
  try {
    const rows = await query(
      `SELECT email_template_welcome, email_template_pass_recovery,
              email_template_usage_update, email_template_plan_activation
       FROM web_private LIMIT 1`,
      [],
    );
    res.json({ success: true, data: rows[0] || {} });
  } catch (err) {
    console.log(err);
    res.json({ success: false, msg: "Something went wrong" });
  }
});

// ── SAVE EMAIL TEMPLATES ──
router.post("/save_email_templates", adminValidator, async (req, res) => {
  try {
    const {
      email_template_welcome,
      email_template_pass_recovery,
      email_template_usage_update,
      email_template_plan_activation,
    } = req.body;

    const existing = await query(`SELECT id FROM web_private LIMIT 1`, []);

    if (existing.length > 0) {
      await query(
        `UPDATE web_private SET
           email_template_welcome = ?,
           email_template_pass_recovery = ?,
           email_template_usage_update = ?,
           email_template_plan_activation = ?
         WHERE id = ?`,
        [
          email_template_welcome || null,
          email_template_pass_recovery || null,
          email_template_usage_update || null,
          email_template_plan_activation || null,
          existing[0].id,
        ],
      );
    } else {
      await query(
        `INSERT INTO web_private
           (email_template_welcome, email_template_pass_recovery,
            email_template_usage_update, email_template_plan_activation)
         VALUES (?,?,?,?)`,
        [
          email_template_welcome || null,
          email_template_pass_recovery || null,
          email_template_usage_update || null,
          email_template_plan_activation || null,
        ],
      );
    }

    res.json({ success: true, msg: "Email templates saved successfully" });
  } catch (err) {
    console.log(err);
    res.json({ success: false, msg: "Something went wrong" });
  }
});

// get contact us leads
router.get("/get_contact_us_leads", adminValidator, async (req, res) => {
  try {
    const data = await query(
      `SELECT * FROM contact_us_leads ORDER BY createdAt DESC`,
      [],
    );
    res.json({ data, success: true });
  } catch (err) {
    console.log(err);
    res.json({ success: false, msg: "Something went wrong" });
  }
});

// delete contact us lead
router.delete("/delete_contact_lead/:id", adminValidator, async (req, res) => {
  try {
    const { id } = req.params;
    await query(`DELETE FROM contact_us_leads WHERE id = ?`, [id]);
    res.json({ success: true });
  } catch (err) {
    console.log(err);
    res.json({ success: false, msg: "Something went wrong" });
  }
});

router.get("/get_dashboard", adminValidator, async (req, res) => {
  try {
    // ── 1. User stats ─────────────────────────────────────
    const [{ total_users }] = await query(
      `SELECT COUNT(*) AS total_users FROM user`,
      [],
    );
    const [{ active_users }] = await query(
      `SELECT COUNT(*) AS active_users FROM user WHERE status = 'active'`,
      [],
    );
    const [{ new_users_today }] = await query(
      `SELECT COUNT(*) AS new_users_today FROM user
       WHERE DATE(createdAt) = CURDATE()`,
      [],
    );
    const [{ new_users_this_month }] = await query(
      `SELECT COUNT(*) AS new_users_this_month FROM user
       WHERE MONTH(createdAt) = MONTH(NOW()) AND YEAR(createdAt) = YEAR(NOW())`,
      [],
    );

    // ── 2. Influencer stats ───────────────────────────────
    const [{ total_influencers }] = await query(
      `SELECT COUNT(*) AS total_influencers FROM influencers`,
      [],
    );
    const [{ active_influencers }] = await query(
      `SELECT COUNT(*) AS active_influencers FROM influencers WHERE status = 'active'`,
      [],
    );

    // ── 3. Gallery stats ──────────────────────────────────
    const [{ total_gallery }] = await query(
      `SELECT COUNT(*) AS total_gallery FROM gallery`,
      [],
    );
    const [{ success_gallery }] = await query(
      `SELECT COUNT(*) AS success_gallery FROM gallery WHERE status = 'success'`,
      [],
    );

    // ── 4. Content video stats ────────────────────────────
    const [{ total_content }] = await query(
      `SELECT COUNT(*) AS total_content FROM content`,
      [],
    );
    const [{ success_content }] = await query(
      `SELECT COUNT(*) AS success_content FROM content WHERE status = 'success'`,
      [],
    );

    // ── 5. Product showcase stats ─────────────────────────
    const [{ total_showcase }] = await query(
      `SELECT COUNT(*) AS total_showcase FROM product_content`,
      [],
    );
    const [{ success_showcase }] = await query(
      `SELECT COUNT(*) AS success_showcase FROM product_content WHERE status = 'active'`,
      [],
    );

    // ── 6. Support messages ───────────────────────────────
    const [{ total_support }] = await query(
      `SELECT COUNT(*) AS total_support FROM support_msg`,
      [],
    );
    const [{ unanswered_support }] = await query(
      `SELECT COUNT(*) AS unanswered_support FROM support_msg WHERE ans IS NULL OR ans = ''`,
      [],
    );

    // ── 7. Leads ──────────────────────────────────────────
    const [{ total_leads }] = await query(
      `SELECT COUNT(*) AS total_leads FROM contact_us_leads`,
      [],
    );
    const [{ leads_today }] = await query(
      `SELECT COUNT(*) AS leads_today FROM contact_us_leads
       WHERE DATE(createdAt) = CURDATE()`,
      [],
    );

    // ── 8. Blogs ──────────────────────────────────────────
    const [{ total_blogs }] = await query(
      `SELECT COUNT(*) AS total_blogs FROM blog`,
      [],
    );
    const [{ published_blogs }] = await query(
      `SELECT COUNT(*) AS published_blogs FROM blog WHERE status = 'published'`,
      [],
    );

    // ── 9. Total credits spent (platform-wide) ────────────
    const [{ total_credits_spent }] = await query(
      `SELECT SUM(CAST(credits AS UNSIGNED)) AS total_credits_spent
       FROM usage_log WHERE status = 'success'`,
      [],
    );

    // ── 10. Credits spent per day (last 7 days) ───────────
    const creditChart = await query(
      `SELECT date, SUM(CAST(credits AS UNSIGNED)) AS credits_spent
       FROM usage_log
       WHERE status = 'success'
         AND createdAt >= DATE_SUB(NOW(), INTERVAL 7 DAY)
       GROUP BY date
       ORDER BY date ASC`,
      [],
    );

    // ── 11. Task breakdown (platform-wide) ────────────────
    const taskBreakdown = await query(
      `SELECT task,
              COUNT(*) AS count,
              SUM(CAST(credits AS UNSIGNED)) AS total_credits
       FROM usage_log
       WHERE status = 'success'
       GROUP BY task
       ORDER BY count DESC`,
      [],
    );

    // ── 12. New users per day (last 7 days) ───────────────
    const userGrowthChart = await query(
      `SELECT DATE(createdAt) AS date, COUNT(*) AS count
       FROM user
       WHERE createdAt >= DATE_SUB(NOW(), INTERVAL 7 DAY)
       GROUP BY DATE(createdAt)
       ORDER BY date ASC`,
      [],
    );

    // ── 13. Recent users ──────────────────────────────────
    const recentUsers = await query(
      `SELECT id, uid, name, email, status, credits, plan, createdAt
       FROM user
       ORDER BY createdAt DESC
       LIMIT 8`,
      [],
    );

    // ── 14. Recent usage logs (platform-wide) ─────────────
    const recentActivity = await query(
      `SELECT ul.uid, ul.task, ul.credits, ul.status, ul.des, ul.createdAt,
              u.name AS user_name, u.email AS user_email
       FROM usage_log ul
       LEFT JOIN user u ON u.uid = ul.uid
       ORDER BY ul.createdAt DESC
       LIMIT 10`,
      [],
    );

    // ── 15. Task pricing ──────────────────────────────────
    const [taskPricing] = await query(
      `SELECT inf_maker, inf_var_maker, content_video_maker, product_showcase_maker
       FROM web_private LIMIT 1`,
      [],
    );

    return res.json({
      success: true,
      data: {
        stats: {
          users: {
            total: total_users,
            active: active_users,
            new_today: new_users_today,
            new_this_month: new_users_this_month,
          },
          influencers: { total: total_influencers, active: active_influencers },
          gallery: { total: total_gallery, success: success_gallery },
          content: { total: total_content, success: success_content },
          showcase: { total: total_showcase, success: success_showcase },
          support: { total: total_support, unanswered: unanswered_support },
          leads: { total: total_leads, today: leads_today },
          blogs: { total: total_blogs, published: published_blogs },
          credits_spent: Number(total_credits_spent || 0),
        },
        credit_chart: creditChart,
        task_breakdown: taskBreakdown,
        user_growth: userGrowthChart,
        recent_users: recentUsers,
        recent_activity: recentActivity,
        task_pricing: taskPricing || null,
      },
    });
  } catch (err) {
    console.log(err);
    res.json({ success: false, msg: "Something went wrong", err });
  }
});

// get admin me
router.get("/get_me", adminValidator, async (req, res) => {
  try {
    const [data] = await query(`SELECT * FROM admin`, []);
    res.json({ data, success: true });
  } catch (err) {
    console.log(err);
    res.json({ success: false, msg: "Something went wrong", err });
  }
});

// update admin
router.post("/update_me", adminValidator, async (req, res) => {
  try {
    const { email, newPassword } = req.body;
    if (!email) {
      return res.json({ msg: "Email id required" });
    }

    if (!validateEmail(email)) {
      return res.json({ msg: "Please give it a valid email id" });
    }

    if (newPassword) {
      const hashPass = await bcrypt.hash(newPassword, 10);
      const token_version = crypto.randomUUID(); // ← rotate
      const env = getEnv();

      await query(
        `UPDATE admin SET email = ?, password = ?, token_version = ?`,
        [email, hashPass, token_version],
      );

      // ── Return fresh token so current admin session stays alive ──
      const newToken = sign(
        { uid: req.decode.uid, role: "admin", email, token_version },
        env?.jwt,
        {},
      );
      return res.json({
        msg: "Profile updated successfully",
        success: true,
        token: newToken,
      });
    } else {
      await query(`UPDATE admin SET email = ?`, [email]);
      return res.json({ msg: "Profile updated successfully", success: true });
    }
  } catch (err) {
    console.log(err);
    res.json({ success: false, msg: "Something went wrong", err });
  }
});

router.post("/send_recovery_email", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.json({ success: false, msg: "Please fill the email" });
    }

    const [admin] = await query(`SELECT * FROM admin WHERE email = ?`, [email]);

    if (admin) {
      const token = crypto.randomBytes(32).toString("hex");

      await query(`UPDATE admin SET forget_token = ? WHERE email = ?`, [
        token,
        email,
      ]);

      const env = getEnv();
      const resetLink =
        env?.frontendUrl + "/admin-password-recovery?token=" + token;

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
        subject: "Reset your admin password",
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

// ── Reset Admin Password Using Token ──────────────────────────────────────
router.post("/reset_password", async (req, res) => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return res.json({
        success: false,
        msg: "Token and password are required",
      });
    }

    const [admin] = await query(`SELECT * FROM admin WHERE forget_token = ?`, [
      token,
    ]);
    if (!admin) {
      return res.json({ success: false, msg: "Invalid or expired reset link" });
    }

    const hashed = await bcrypt.hash(password, 10);
    const token_version = crypto.randomUUID(); // ← invalidates all old sessions

    await query(
      `UPDATE admin SET password = ?, forget_token = NULL, token_version = ? WHERE forget_token = ?`,
      [hashed, token_version, token],
    );

    res.json({ success: true, msg: "Password reset successfully" });
  } catch (err) {
    console.log(err);
    res.json({ success: false, msg: "Something went wrong", err });
  }
});

module.exports = router;
