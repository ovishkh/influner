const path = require("path");
const fs = require("fs");
const { query } = require("../database/connection");
const { spawn } = require("child_process");
const ffmpegPath = require("ffmpeg-static");
const sharp = require("sharp");
const randomstring = require("randomstring");
const axios = require("axios");
const nodemailer = require("nodemailer");
const os = require("os");
const unzipper = require("unzipper");

async function sendEmail({ to, subject, html, text } = {}) {
  try {
    const rows = await query(
      `SELECT
         smtp_host, smtp_port, smtp_security, smtp_auth,
         smtp_username, smtp_email, smtp_password, smtp_from
       FROM web_private
       LIMIT 1`,
      [],
    );

    if (!rows || rows.length === 0) {
      return {
        success: false,
        msg: "SMTP credentials not found. Please save your Email Settings first.",
      };
    }

    const cfg = rows[0];

    if (!cfg.smtp_host)
      return {
        success: false,
        msg: "SMTP Host is missing. Please update Email Settings.",
      };
    if (!cfg.smtp_port)
      return {
        success: false,
        msg: "SMTP Port is missing. Please update Email Settings.",
      };
    if (!cfg.smtp_email)
      return {
        success: false,
        msg: "Sender Email is missing. Please update Email Settings.",
      };
    if (!to) return { success: false, msg: "Recipient email is required." };

    const finalSubject = subject || "(No Subject)";
    const finalHtml = html || "";
    const finalFrom = cfg.smtp_from
      ? `"${cfg.smtp_from}" <${cfg.smtp_email}>`
      : cfg.smtp_email;

    const transporter = nodemailer.createTransport({
      host: cfg.smtp_host,
      port: parseInt(cfg.smtp_port),
      secure: cfg.smtp_security === "ssl",
      ...(cfg.smtp_auth
        ? {
            auth: {
              user: cfg.smtp_username || cfg.smtp_email,
              pass: cfg.smtp_password,
            },
          }
        : {}),
      tls: { rejectUnauthorized: false },
    });

    await transporter.sendMail({
      from: finalFrom,
      to,
      subject: finalSubject,
      html: finalHtml,
      ...(text ? { text } : {}),
    });

    return { success: true, msg: "Email sent successfully" };
  } catch (err) {
    console.error("[sendEmail]", err.message);
    return { success: false, msg: `Failed to send email: ${err.message}` };
  }
}

async function uploadImage(
  file,
  uploadPath,
  allowedExtensions = ["jpeg", "jpg", "png", "webp"],
  maxSizeMB = 10,
  options = {}, // { convert: true, width: 300, height: 300, format: 'webp' }
) {
  try {
    if (!file) {
      return { success: false, msg: "No file uploaded" };
    }

    // Size check
    const maxSizeBytes = maxSizeMB * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      return {
        success: false,
        msg: `File size must be less than ${maxSizeMB}MB`,
      };
    }

    let metadata;
    try {
      metadata = await sharp(file.data).metadata();
      if (!allowedExtensions.includes(metadata.format)) {
        return {
          success: false,
          msg: `Only ${allowedExtensions.join(", ")} files are allowed`,
        };
      }
    } catch (err) {
      return { success: false, msg: "Invalid image file" };
    }

    const {
      convert = false,
      width = null,
      height = null,
      format = null, // jpeg | png | webp
      quality = 80,
    } = options;

    // Generate filename
    let fileExt = path.extname(file.name).replace(".", "");

    if (convert && format) {
      fileExt = format; // override extension if converting
    }

    const randomFileName =
      randomstring.generate({
        length: 20,
        charset: "alphanumeric",
      }) +
      "." +
      fileExt;

    const fullPath = path.join(uploadPath, randomFileName);

    // 🚀 MAIN LOGIC
    if (convert) {
      let image = sharp(file.data);

      // Resize if needed
      if (width || height) {
        image = image.resize(width, height, {
          fit: "inside", // keeps aspect ratio, prevents distortion
        });
      }

      // Convert format if provided
      if (format) {
        if (format === "jpeg" || format === "jpg") {
          image = image.jpeg({ quality });
        } else if (format === "png") {
          image = image.png({ quality });
        } else if (format === "webp") {
          image = image.webp({ quality });
        }
      }

      await image.toFile(fullPath);
    } else {
      // fallback to original move
      await file.mv(fullPath);
    }

    return {
      success: true,
      msg: "File uploaded successfully",
      filename: randomFileName,
    };
  } catch (err) {
    console.error("Upload error:", err);
    return {
      success: false,
      msg: "Failed to upload file",
    };
  }
}

const validateEmail = (email) => {
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email);
};

function getEnv() {
  const configPath = path.join(__dirname, "../config.json");
  if (!fs.existsSync(configPath)) {
    return {};
  } else {
    const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    return config;
  }
}

async function updateUserPlan({ planId, uid, trial = false }) {
  try {
    const [plan] = await query(`SELECT * FROM plan WHERE id = ?`, [planId]);
    if (!plan) return { success: false, msg: "Plan not available" };

    let totalCredit = 0;

    const [user] = await query(`SELECT * FROM user WHERE uid = ?`, [uid]);
    const oldPlan = user?.plan ? JSON.parse(user?.plan) : null;

    if (oldPlan) {
      totalCredit =
        parseInt(plan?.credits || 0) + parseInt(oldPlan?.credits || 0);
    } else {
      totalCredit = parseInt(plan?.credits || 0);
    }

    const expiryDays = parseInt(plan?.expiry_days || 0);
    const planEnding = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000);

    await query(
      `UPDATE user SET plan = ?, credits = ?, plan_ending = ?, trial_used = ? WHERE uid = ?`,
      [JSON.stringify(plan), totalCredit, planEnding, trial ? 1 : 0, uid],
    );

    // ── Send Plan Activation Email ─────────────────────────────────────────
    if (user?.email) {
      const [templateRow] = await query(
        `SELECT email_template_plan_activation FROM web_private LIMIT 1`,
        [],
      );

      let html = templateRow?.email_template_plan_activation || "";

      html = html
        .replace(/\{\{user_email\}\}/g, user.email)
        .replace(/\{\{plan_name\}\}/g, plan?.title || "")
        .replace(/\{\{plan_credits\}\}/g, totalCredit?.toString() || "0")
        .replace(/\{\{plan_expiry\}\}/g, planEnding.toLocaleDateString())
        .replace(/\{\{date\}\}/g, new Date().toLocaleDateString());

      await sendEmail({
        to: user.email,
        subject: "Your plan has been activated!",
        html,
      });
    }
    // ──────────────────────────────────────────────────────────────────────

    return { success: true, msg: "Plan updated" };
  } catch (err) {
    return { success: false, msg: err?.toString() };
  }
}

// async function updateUserPlan({ planId, uid, trial = false }) {
//   try {
//     const [plan] = await query(`SELECT * FROM plan WHERE id = ?`, [planId]);
//     if (!plan) return { success: false, msg: "Plan not available" };

//     let totalCredit = 0;

//     const [user] = await query(`SELECT * FROM user WHERE uid = ?`, [uid]);
//     const oldPlan = user?.plan ? JSON.parse(user?.plan) : null;

//     if (oldPlan) {
//       totalCredit =
//         parseInt(plan?.credits || 0) + parseInt(oldPlan?.credits || 0);
//     } else {
//       totalCredit = parseInt(plan?.credits || 0);
//     }

//     const expiryDays = parseInt(plan?.expiry_days || 0);
//     const planEnding = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000);

//     await query(
//       `UPDATE user SET plan = ?, credits = ?, plan_ending = ?, trial_used = ? WHERE uid = ?`,
//       [JSON.stringify(plan), totalCredit, planEnding, trial ? 1 : 0, uid],
//     );

//     return { success: true, msg: "Plan updated" };
//   } catch (err) {
//     return { success: false, msg: err?.toString() };
//   }
// }

function getDaysFromNow(timestamp) {
  if (!timestamp) return 0;
  const targetDate = new Date(timestamp);
  const now = new Date();
  targetDate.setHours(0, 0, 0, 0);
  now.setHours(0, 0, 0, 0);
  const diffInMs = targetDate - now;
  const diffInDays = Math.ceil(diffInMs / (1000 * 60 * 60 * 24));
  return diffInDays < 0 ? 0 : diffInDays;
}

function generateThumbnail(videoPath, thumbnailPath) {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn(ffmpegPath, [
      "-i",
      videoPath,
      "-ss",
      "00:00:01",
      "-vframes",
      "1",
      "-y",
      thumbnailPath,
    ]);

    ffmpeg.on("close", (code) => {
      if (code === 0) {
        resolve(thumbnailPath);
      } else {
        reject(new Error(`FFmpeg failed with code ${code}`));
      }
    });

    ffmpeg.on("error", (err) => reject(err));
  });
}

function deleteFile(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`File deleted: ${filePath}`);
    }
  } catch (err) {
    console.log("File did not exist");
  }
}

async function downloadImage(imageUrl, savePath) {
  // Extract the extension from the URL (handles query strings too)
  const urlPathname = new URL(imageUrl).pathname;
  const ext = path.extname(urlPathname); // e.g. ".jpg", ".png"

  if (!ext) {
    throw new Error(`Could not determine file extension from URL: ${imageUrl}`);
  }

  const rs = randomstring.generate(5);
  const fileName = `${rs}${ext}`; // e.g. "myrand.jpg"
  const fullPath = path.join(savePath, fileName); // e.g. "/uploads/myrand.jpg"

  // Ensure the save directory exists
  fs.mkdirSync(savePath, { recursive: true });

  // Download the image as a stream and pipe it to disk
  const response = await axios.get(imageUrl, { responseType: "stream" });

  await new Promise((resolve, reject) => {
    const writer = fs.createWriteStream(fullPath);
    response.data.pipe(writer);
    writer.on("finish", resolve);
    writer.on("error", reject);
  });

  return fileName; // e.g. "myrand.jpg"
}

async function logUsage({ uid = null, task, credits = null, status, des }) {
  try {
    const date = new Date().toISOString().slice(0, 10); // "2026-03-18"
    await query(
      `INSERT INTO usage_log (uid, task, credits, status, date, des) VALUES (?, ?, ?, ?, ?, ?)`,
      [uid, task, credits !== null ? String(credits) : null, status, date, des],
    );
  } catch (err) {
    console.error("❌ logUsage failed:", err.message);
  }
}

function renderTemplate(html, variables = {}) {
  return html.replace(/{{\s*([^}]+)\s*}}/g, (match, key) => {
    return variables[key] !== undefined ? variables[key] : match;
  });
}

async function sendUsageUpdateEmail({ emailTo, variables = {} }) {
  try {
    const [emailTemplate] = await query(
      `SELECT email_template_usage_update FROM web_private LIMIT 1`,
      [],
    );
    const send = await sendEmail({
      to: emailTo,
      subject: "Plan Usage",
      html: renderTemplate(
        emailTemplate?.email_template_usage_update,
        variables,
      ),
    });

    return send;
  } catch (err) {
    return { success: false, err, msg: err?.message || "Could not send email" };
  }
}

function convertAndSaveVideo(fileBuffer, outputPath) {
  return new Promise((resolve, reject) => {
    const tempInput = path.join(os.tmpdir(), `input-${Date.now()}.mp4`);

    try {
      fs.writeFileSync(tempInput, fileBuffer);
    } catch (err) {
      return reject({
        success: false,
        msg: "Failed to write temp input file",
        error: err.message,
      });
    }

    const args = [
      "-analyzeduration",
      "100M",
      "-probesize",
      "100M",

      "-i",
      tempInput,

      "-c:v",
      "libx264",
      "-profile:v",
      "high",
      "-level",
      "4.0",
      "-pix_fmt",
      "yuv420p",
      "-crf",
      "18",
      "-preset",
      "slow",
      "-vf",
      "fps=30",

      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-ar",
      "44100",

      "-movflags",
      "+faststart",
      "-map_metadata",
      "0",
      "-y",

      outputPath,
    ];

    const ffmpeg = spawn(ffmpegPath, args);

    let stderrOutput = "";
    ffmpeg.stderr.on("data", (data) => {
      stderrOutput += data.toString();
    });

    ffmpeg.on("close", (code) => {
      // cleanup temp file
      if (fs.existsSync(tempInput)) fs.unlinkSync(tempInput);

      if (code === 0) {
        resolve({ success: true, msg: "Video converted successfully" });
      } else {
        if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
        reject({
          success: false,
          msg: "Video conversion failed",
          error: stderrOutput,
        });
      }
    });

    ffmpeg.on("error", (err) => {
      if (fs.existsSync(tempInput)) fs.unlinkSync(tempInput);
      if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);

      reject({
        success: false,
        msg: "FFmpeg process error",
        error: err.message,
      });
    });
  });
}

function getResetEmailHtml(email, resetLink) {
  return [
    "<!DOCTYPE html>",
    '<html lang="en">',
    "<head>",
    '  <meta charset="UTF-8"/>',
    '  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>',
    "  <title>Reset Your Password</title>",
    "</head>",
    '<body style="margin:0;padding:0;background-color:#f8f8f8;font-family:Segoe UI,Roboto,Arial,sans-serif;">',
    '  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8f8f8;padding:40px 0;">',
    "    <tr>",
    '      <td align="center">',
    '        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);max-width:600px;width:100%;">',

    // Header — black with subtle purple tint
    "          <tr>",
    '            <td style="background:linear-gradient(135deg,#0f0f0f 0%,#1a1a2e 100%);padding:40px 48px;text-align:center;">',
    '              <div style="width:64px;height:64px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.12);border-radius:16px;display:inline-block;line-height:64px;margin-bottom:16px;">',
    '                <span style="font-size:32px;">&#128272;</span>',
    "              </div>",
    '              <h1 style="margin:0;color:#ffffff;font-size:26px;font-weight:600;letter-spacing:0.5px;">Reset Your Password</h1>',
    '              <p style="margin:10px 0 0;color:rgba(255,255,255,0.5);font-size:14px;">We received a request to reset your password</p>',
    "            </td>",
    "          </tr>",

    // Body — white background, dark text
    "          <tr>",
    '            <td style="padding:40px 48px;background:#ffffff;">',
    '              <p style="margin:0 0 12px;color:#111111;font-size:15px;line-height:1.7;">Hi there,</p>',
    '              <p style="margin:0 0 28px;color:#444444;font-size:15px;line-height:1.7;">',
    "                Someone requested a password reset for the account associated with",
    '                <strong style="color:#7C3AED;">' + email + "</strong>.",
    "                If this was you, click the button below to choose a new password.",
    "              </p>",

    // CTA Button — purple gradient
    '              <table width="100%" cellpadding="0" cellspacing="0">',
    "                <tr>",
    '                  <td align="center" style="padding-bottom:32px;">',
    '                    <a href="' +
      resetLink +
      '" style="display:inline-block;background:linear-gradient(135deg,#4F46E5 0%,#7C3AED 100%);color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:15px 44px;border-radius:10px;letter-spacing:0.3px;box-shadow:0 4px 16px rgba(124,58,237,0.35);">',
    "                      Reset My Password",
    "                    </a>",
    "                  </td>",
    "                </tr>",
    "              </table>",

    // Warning box — light grey with dark border
    '              <div style="background:#f9f9f9;border:1px solid #e0e0e0;border-left:4px solid #7C3AED;border-radius:10px;padding:16px 20px;margin-bottom:28px;">',
    '                <p style="margin:0;color:#555555;font-size:13px;line-height:1.6;">',
    '                  <strong style="color:#111111;">This link will expire once used.</strong>',
    "                  If you did not request a password reset, you can safely ignore this email.",
    "                </p>",
    "              </div>",

    // Fallback link
    '              <p style="margin:0 0 8px;color:#888888;font-size:13px;">If the button does not work, copy and paste this link into your browser:</p>',
    '              <p style="margin:0;word-break:break-all;">',
    '                <a href="' +
      resetLink +
      '" style="color:#7C3AED;font-size:13px;">' +
      resetLink +
      "</a>",
    "              </p>",
    "            </td>",
    "          </tr>",

    // Divider
    "          <tr>",
    '            <td style="padding:0 48px;">',
    '              <hr style="border:none;border-top:1px solid #eeeeee;margin:0;"/>',
    "            </td>",
    "          </tr>",

    // Footer
    "          <tr>",
    '            <td style="padding:24px 48px;text-align:center;background:#fafafa;">',
    '              <p style="margin:0;color:#aaaaaa;font-size:12px;line-height:1.6;">',
    "                This email was sent automatically. Please do not reply.<br/>",
    "                If you need help, contact our support team.",
    "              </p>",
    "            </td>",
    "          </tr>",

    "        </table>",
    "      </td>",
    "    </tr>",
    "  </table>",
    "</body>",
    "</html>",
  ].join("\n");
}

function getAdminResetEmailHtml(email, resetLink) {
  return [
    "<!DOCTYPE html>",
    '<html lang="en">',
    "<head>",
    '  <meta charset="UTF-8"/>',
    '  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>',
    "  <title>Reset Admin Password</title>",
    "</head>",
    '<body style="margin:0;padding:0;background-color:#0a0a0a;font-family:Segoe UI,Roboto,Arial,sans-serif;">',
    '  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0a0a0a;padding:40px 0;">',
    "    <tr>",
    '      <td align="center">',
    '        <table width="600" cellpadding="0" cellspacing="0" style="background:#111111;border-radius:16px;overflow:hidden;box-shadow:0 4px 32px rgba(0,0,0,0.6);border:1px solid rgba(255,255,255,0.06);max-width:600px;width:100%;">',

    // Header — pure black with purple accent line
    "          <tr>",
    '            <td style="background:#0a0a0a;border-bottom:3px solid #7C3AED;padding:40px 48px;text-align:center;">',
    '              <div style="width:64px;height:64px;background:rgba(124,58,237,0.12);border:1px solid rgba(124,58,237,0.3);border-radius:16px;display:inline-block;line-height:64px;margin-bottom:16px;">',
    '                <span style="font-size:32px;">&#128737;</span>',
    "              </div>",
    '              <h1 style="margin:0;color:#ffffff;font-size:26px;font-weight:600;letter-spacing:0.5px;">Admin Password Reset</h1>',
    '              <p style="margin:10px 0 0;color:rgba(255,255,255,0.4);font-size:14px;">A reset was requested for your admin account</p>',
    "            </td>",
    "          </tr>",

    // Body — dark background, light text
    "          <tr>",
    '            <td style="padding:40px 48px;background:#111111;">',
    '              <p style="margin:0 0 12px;color:#f1f1f1;font-size:15px;line-height:1.7;">Hi Admin,</p>',
    '              <p style="margin:0 0 28px;color:#aaaaaa;font-size:15px;line-height:1.7;">',
    "                A password reset was requested for the admin account associated with",
    '                <strong style="color:#a78bfa;">' + email + "</strong>.",
    "                If this was you, click the button below to set a new password.",
    "              </p>",

    // CTA — purple gradient button
    '              <table width="100%" cellpadding="0" cellspacing="0">',
    "                <tr>",
    '                  <td align="center" style="padding-bottom:32px;">',
    '                    <a href="' +
      resetLink +
      '" style="display:inline-block;background:linear-gradient(135deg,#4F46E5 0%,#7C3AED 100%);color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:15px 44px;border-radius:10px;letter-spacing:0.3px;box-shadow:0 4px 20px rgba(124,58,237,0.45);">',
    "                      Reset Admin Password",
    "                    </a>",
    "                  </td>",
    "                </tr>",
    "              </table>",

    // Warning box — dark with purple left border
    '              <div style="background:#1a1a1a;border:1px solid rgba(255,255,255,0.08);border-left:4px solid #7C3AED;border-radius:10px;padding:16px 20px;margin-bottom:28px;">',
    '                <p style="margin:0;color:#888888;font-size:13px;line-height:1.6;">',
    '                  <strong style="color:#ffffff;">&#9888; Security Notice:</strong> This link is single-use and will expire once clicked. ',
    "                  If you did not request this reset, please secure your account immediately.",
    "                </p>",
    "              </div>",

    // Fallback
    '              <p style="margin:0 0 8px;color:#555555;font-size:13px;">If the button does not work, copy and paste this link:</p>',
    '              <p style="margin:0;word-break:break-all;">',
    '                <a href="' +
      resetLink +
      '" style="color:#a78bfa;font-size:13px;">' +
      resetLink +
      "</a>",
    "              </p>",
    "            </td>",
    "          </tr>",

    // Divider
    "          <tr>",
    '            <td style="padding:0 48px;">',
    '              <hr style="border:none;border-top:1px solid rgba(255,255,255,0.06);margin:0;"/>',
    "            </td>",
    "          </tr>",

    // Footer
    "          <tr>",
    '            <td style="padding:24px 48px;text-align:center;background:#0d0d0d;">',
    '              <p style="margin:0;color:#444444;font-size:12px;line-height:1.6;">',
    "                This email was sent to the registered admin account.<br/>",
    "                Do not share this link with anyone.",
    "              </p>",
    "            </td>",
    "          </tr>",

    "        </table>",
    "      </td>",
    "    </tr>",
    "  </table>",
    "</body>",
    "</html>",
  ].join("\n");
}

async function downloadAndExtractFile(filesObject, outputFolderPath) {
  try {
    // Access the uploaded file from req.files
    const uploadedFile = filesObject.file;
    if (!uploadedFile) {
      return { success: false, msg: "No file data found in FormData" };
    }

    // Create a writable stream to save the file
    const outputPath = path.join(outputFolderPath, uploadedFile.name);

    // Move the file to the desired location
    await new Promise((resolve, reject) => {
      uploadedFile.mv(outputPath, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });

    // Extract the downloaded file
    await fs
      .createReadStream(outputPath)
      .pipe(unzipper.Extract({ path: outputFolderPath })) // Specify the output folder path for extraction
      .promise();

    // Delete the downloaded zip file after extraction
    fs.unlinkSync(outputPath);

    return { success: true, msg: "App was successfully installed/updated" };
  } catch (error) {
    console.error("Error downloading and extracting file:", error);
    return { success: false, msg: error.message };
  }
}

function injectMetaIntoHtml(data) {
  const indexPath = path.join(__dirname, "../client/public/index.html");
  let html = fs.readFileSync(indexPath, "utf8");

  const siteName = data.site_name || "";
  const metaTitle = data.meta_title || siteName;
  const metaDesc = data.meta_description || "";
  const metaKw = data.meta_keywords || "";
  const ogTitle = data.og_title || metaTitle;
  const ogDesc = data.og_description || metaDesc;
  const ogImage = data.og_image ? `/media/${data.og_image}` : "";

  const metaTags = `
    <!-- ── Server Injected Meta ── -->
    <title>${metaTitle}</title>
    <meta name="title"       content="${metaTitle}" />
    <meta name="description" content="${metaDesc}" />
    <meta name="keywords"    content="${metaKw}" />

    <!-- Open Graph -->
    <meta property="og:type"        content="website" />
    <meta property="og:title"       content="${ogTitle}" />
    <meta property="og:description" content="${ogDesc}" />
    ${ogImage ? `<meta property="og:image" content="${ogImage}" />` : ""}
    ${siteName ? `<meta property="og:site_name" content="${siteName}" />` : ""}

    <!-- Twitter Card -->
    <meta name="twitter:card"        content="summary_large_image" />
    <meta name="twitter:title"       content="${ogTitle}" />
    <meta name="twitter:description" content="${ogDesc}" />
    ${ogImage ? `<meta name="twitter:image" content="${ogImage}" />` : ""}
    <!-- ── End Injected ── -->
  `;

  // Remove the old <title> tag CRA put in, inject before </head>
  html = html.replace(/<title>.*?<\/title>/i, "");
  html = html.replace("</head>", `${metaTags}\n</head>`);

  return html;
}

module.exports = {
  getResetEmailHtml,
  downloadImage,
  validateEmail,
  getEnv,
  updateUserPlan,
  getDaysFromNow,
  generateThumbnail,
  uploadImage,
  deleteFile,
  logUsage,
  sendEmail,
  sendUsageUpdateEmail,
  convertAndSaveVideo,
  getAdminResetEmailHtml,
  downloadAndExtractFile,
  injectMetaIntoHtml,
};
