const fs = require("fs");
const axios = require("axios");
const { query } = require("../database/connection");
const {
  getDaysFromNow,
  downloadImage,
  logUsage,
  sendUsageUpdateEmail,
} = require("../utils/common");
const { fetchJobStatus, createJob } = require("./api");
const path = require("path");

// ============================================
// HELPERS
// ============================================

async function getUser(uid) {
  const [user] = await query(`SELECT * FROM user WHERE uid = ?`, [uid]);
  return user || null;
}

async function getCreditFee() {
  const [web] = await query(`SELECT * FROM web_private`);
  return parseInt(web?.inf_var_maker || 0);
}

function getUserCredits(user) {
  try {
    const days = getDaysFromNow(user?.plan_ending);
    if (days <= 0) return 0;
    return parseInt(user?.credits) || 0;
  } catch {
    return 0;
  }
}

async function reserveCredits(uid, fee) {
  const result = await query(
    `UPDATE user SET credits = credits - ? WHERE uid = ? AND credits >= ?`,
    [fee, uid, fee],
  );
  return result.affectedRows > 0;
}

async function refundCredits(uid, fee) {
  await query(`UPDATE user SET credits = credits + ? WHERE uid = ?`, [
    fee,
    uid,
  ]);
}

async function setGalleryError(id, msg) {
  await query(
    `UPDATE gallery SET status = 'error', error_message = ? WHERE id = ?`,
    [msg, id],
  );
}

// ── Send email helper (fire-and-forget, never throws) ─────────
async function notifyUser(user, { task, des, status }) {
  if (!user?.email) return;
  try {
    await sendUsageUpdateEmail({
      emailTo: user.email,
      variables: {
        user_email: user.email,
        task_name: task,
        task_description: des,
        task_status: status,
        date_time:
          new Date().toLocaleString("en-US", { timeZone: "UTC" }) + " UTC",
      },
    });
  } catch (err) {
    console.error("❌ notifyUser email failed:", err.message);
  }
}

// ── Upload local image to kie.ai and get public URL ───────────
async function uploadImageToProvider(localPath, apiKey) {
  // Already a public URL — no upload needed
  if (localPath.startsWith("http")) return localPath;

  console.log(`📤 Uploading image: ${localPath}`);

  const fileBuffer = fs.readFileSync(localPath);
  const base64 = fileBuffer.toString("base64");

  const ext = path.extname(localPath).toLowerCase();
  let mime = "image/jpeg";
  if (ext === ".png") mime = "image/png";
  if (ext === ".webp") mime = "image/webp";

  const response = await axios.post(
    "https://kieai.redpandaai.co/api/file-base64-upload",
    {
      base64Data: `data:${mime};base64,${base64}`,
      uploadPath: "images",
      fileName: path.basename(localPath),
    },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    },
  );

  if (!response.data.success) {
    throw new Error(response.data.msg || "Upload failed");
  }

  return response.data.data.downloadUrl;
}

// ============================================
// PROCESS SINGLE VARIATION
// ============================================

async function processVariation(item, provider, fee) {
  const { id, uid, job_id, prompt, model } = item;

  // ── Has a job already → poll its status ───────────────────────
  if (job_id) {
    let result;

    try {
      result = await fetchJobStatus(provider, "img2img", job_id);
    } catch (err) {
      console.error(
        `❌ fetchJobStatus crashed for gallery #${id}:`,
        err.message,
      );
      await logUsage({
        uid,
        task: "inf_var_maker",
        status: "error",
        des: `fetchJobStatus crashed for gallery #${id}: ${err.message}`,
      });
      return;
    }

    if (result.status === "pending") return;

    // ── Fetch user once — needed for email from here on ──────
    const user = await getUser(uid);

    if (result.status === "error") {
      await refundCredits(uid, fee);
      await setGalleryError(id, result.msg);
      console.error(`❌ gallery #${id} job failed — refunded ${fee}cr`);

      const des = `gallery #${id} job failed — ${fee} credits refunded. Reason: ${result.msg}`;
      await logUsage({
        uid,
        task: "inf_var_maker",
        credits: fee,
        status: "refunded",
        des,
      });
      await notifyUser(user, {
        task: "Influencer Variation",
        des,
        status: "Refunded",
      });
      return;
    }

    // ── success → download and save ───────────────────────────
    let savedPath;
    try {
      savedPath = await downloadImage(
        result.data,
        `${__dirname}/../client/public/media`,
      );
    } catch (err) {
      console.error(
        `❌ downloadImage failed for gallery #${id}:`,
        err.message,
        "| URL:",
        result.data,
      );
      await refundCredits(uid, fee);
      await setGalleryError(id, `downloadImage failed: ${err.message}`);

      const des = `gallery #${id} download failed — ${fee}cr refunded. Error: ${err.message} | URL: ${result.data}`;
      await logUsage({
        uid,
        task: "inf_var_maker",
        credits: fee,
        status: "refunded",
        des,
      });
      await notifyUser(user, {
        task: "Influencer Variation",
        des,
        status: "Refunded",
      });
      return;
    }

    if (!savedPath) {
      console.error(
        `❌ downloadImage returned empty for gallery #${id}, URL:`,
        result.data,
      );
      await refundCredits(uid, fee);
      await setGalleryError(id, "downloadImage returned empty path");

      const des = `gallery #${id} download returned empty — ${fee}cr refunded | URL: ${result.data}`;
      await logUsage({
        uid,
        task: "inf_var_maker",
        credits: fee,
        status: "refunded",
        des,
      });
      await notifyUser(user, {
        task: "Influencer Variation",
        des,
        status: "Refunded",
      });
      return;
    }

    await query(
      `UPDATE gallery SET status = 'active', generated_photo = ? WHERE id = ?`,
      [savedPath, id],
    );

    console.log(`✅ gallery #${id} completed — saved to ${savedPath}`);

    const successDes = `gallery #${id} completed successfully — image saved to ${savedPath}`;
    await logUsage({
      uid,
      task: "inf_var_maker",
      credits: fee,
      status: "success",
      des: successDes,
    });
    await notifyUser(user, {
      task: "Influencer Variation",
      des: successDes,
      status: "Success",
    });
    return;
  }

  // ── No job yet → validate user ────────────────────────────────
  const user = await getUser(uid);

  if (!user) {
    await setGalleryError(id, "User not found");
    await logUsage({
      uid,
      task: "inf_var_maker",
      status: "error",
      des: `gallery #${id} — user not found in database`,
    });
    return;
  }

  const credits = getUserCredits(user);

  if (credits <= 0) {
    console.log(`⏭️  gallery #${id} — plan expired or no credits`);
    await setGalleryError(id, "Plan expired or no credits available");
    await logUsage({
      uid,
      task: "inf_var_maker",
      credits: 0,
      status: "error",
      des: `gallery #${id} — plan expired or zero credits`,
    });
    await notifyUser(user, {
      task: "Influencer Variation",
      des: `Your variation #${id} could not be processed — your plan has expired or you have no credits.`,
      status: "Failed",
    });
    return;
  }

  if (credits < fee) {
    console.log(`⏭️  gallery #${id} — needs ${fee}cr, has ${credits}cr`);
    await setGalleryError(
      id,
      `Insufficient credits — needs ${fee}, has ${credits}`,
    );
    await logUsage({
      uid,
      task: "inf_var_maker",
      credits,
      status: "error",
      des: `gallery #${id} — needs ${fee}cr but user only has ${credits}cr`,
    });
    await notifyUser(user, {
      task: "Influencer Variation",
      des: `Your variation #${id} could not be processed — you need ${fee} credits but only have ${credits}.`,
      status: "Failed",
    });
    return;
  }

  // ── Parse model JSON to get base image ───────────────────────
  let influencer;
  try {
    influencer = typeof model === "string" ? JSON.parse(model) : model;
  } catch (err) {
    await setGalleryError(id, "Invalid model JSON");
    await logUsage({
      uid,
      task: "inf_var_maker",
      status: "error",
      des: `gallery #${id} — failed to parse model JSON: ${err.message}`,
    });
    return;
  }

  if (!influencer?.photo_url) {
    await setGalleryError(id, "Influencer has no photo");
    await logUsage({
      uid,
      task: "inf_var_maker",
      status: "error",
      des: `gallery #${id} — influencer has no photo_url in model JSON`,
    });
    return;
  }

  // ── Upload influencer photo to get public URL ─────────────────
  let referenceUrl;
  try {
    const localPath = `${__dirname}/../client/public/media/${influencer.photo_url}`;
    const apiKey = provider.img2img_api_key || provider.txt2img_api_key;
    referenceUrl = await uploadImageToProvider(localPath, apiKey);
    console.log(`📎 gallery #${id} reference URL: ${referenceUrl}`);
  } catch (err) {
    await setGalleryError(id, `Image upload failed: ${err.message}`);
    await logUsage({
      uid,
      task: "inf_var_maker",
      status: "error",
      des: `gallery #${id} — image upload failed: ${err.message}`,
    });
    return;
  }

  // ── Atomically reserve credits ────────────────────────────────
  const reserved = await reserveCredits(uid, fee);

  if (!reserved) {
    console.log(
      `⏭️  Skipping gallery #${id} — credits taken by concurrent task`,
    );
    await logUsage({
      uid,
      task: "inf_var_maker",
      status: "skipped",
      des: `gallery #${id} skipped — credits taken by a concurrent task`,
    });
    return;
  }

  // ── Create the job ────────────────────────────────────────────
  const create = await createJob(provider, "img2img", {
    prompt,
    reference_url: referenceUrl,
  });

  if (create.status === "error") {
    await refundCredits(uid, fee);
    await setGalleryError(id, create.msg);
    console.error(`❌ gallery #${id} job creation failed:`, create.msg);

    const des = `gallery #${id} job creation failed — ${fee} credits refunded. Reason: ${create.msg}`;
    await logUsage({
      uid,
      task: "inf_var_maker",
      credits: fee,
      status: "refunded",
      des,
    });
    await notifyUser(user, {
      task: "Influencer Variation",
      des,
      status: "Refunded",
    });
    return;
  }

  await query(`UPDATE gallery SET job_id = ? WHERE id = ?`, [
    create.taskId,
    id,
  ]);

  console.log(`🚀 gallery #${id} job created — taskId: ${create.taskId}`);
  await logUsage({
    uid,
    task: "inf_var_maker",
    credits: fee,
    status: "processing",
    des: `gallery #${id} job submitted — taskId: ${create.taskId}`,
  });
  await notifyUser(user, {
    task: "Influencer Variation",
    des: `Your variation #${id} is being generated. We'll notify you once it's ready.`,
    status: "Processing",
  });
}

// ============================================
// MAIN RUNNER
// ============================================

async function runInfVariation({ provider }) {
  try {
    const fee = await getCreditFee();

    if (fee < 1) {
      // console.log(
      //   "⚠️  inf_var_maker fee not configured by admin, skipping run",
      // );
      return;
    }

    const galleryList = await query(
      `SELECT * FROM gallery WHERE status = 'processing'`,
    );

    if (!galleryList?.length) return;

    await Promise.allSettled(
      galleryList.map((item) => processVariation(item, provider, fee)),
    );

    // console.log(`✅ Processed batch of ${galleryList.length} variation(s)`);
  } catch (err) {
    console.error("❌ runInfVariation fatal error:", err.message);
    await logUsage({
      task: "inf_var_maker",
      status: "error",
      des: `runInfVariation fatal crash: ${err.message}`,
    });
  }
}

module.exports = { runInfVariation };
