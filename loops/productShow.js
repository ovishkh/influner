const fs = require("fs");
const path = require("path");
const axios = require("axios");
const { query } = require("../database/connection");
const {
  getDaysFromNow,
  downloadImage,
  logUsage,
  sendUsageUpdateEmail,
} = require("../utils/common");
const { fetchJobStatus, createJob } = require("./api");

// ============================================
// HELPERS
// ============================================

async function getUser(uid) {
  const [user] = await query(`SELECT * FROM user WHERE uid = ?`, [uid]);
  return user || null;
}

async function getCreditFee() {
  const [web] = await query(`SELECT * FROM web_private`);
  return parseInt(web?.product_showcase_maker || 0);
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

async function setContentError(id, msg) {
  await query(
    `UPDATE product_content SET status = 'error', error_message = ? WHERE id = ?`,
    [msg, id],
  );
}

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

// ── Upload local file and return a public URL ─────────────────
async function uploadFileToProvider(localPath, provider, apiKey) {
  if (localPath.startsWith("http")) return localPath;

  console.log(`📤 Uploading file: ${localPath}`);

  const fileBuffer = fs.readFileSync(localPath);
  const ext = path.extname(localPath).toLowerCase();

  const isAtlas =
    String(provider?.provider_key || "").includes("atlas") ||
    String(provider?.txt2img_base_url || "").includes("atlascloud.ai") ||
    String(provider?.img2img_base_url || "").includes("atlascloud.ai") ||
    String(provider?.reel_base_url || "").includes("atlascloud.ai") ||
    String(provider?.showcase_base_url || "").includes("atlascloud.ai");

  if (isAtlas) {
    const form = new FormData();
    form.append("file", new Blob([fileBuffer]), path.basename(localPath));

    const res = await fetch("https://api.atlascloud.ai/api/v1/model/uploadMedia", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });

    const data = await res.json().catch(() => ({}));
    const url = data?.url || data?.data?.url;

    if (!res.ok || !url) {
      throw new Error(
        data?.message ||
          data?.msg ||
          data?.error ||
          `Upload failed (HTTP ${res.status})`,
      );
    }

    return url;
  }

  // Fallback: Kie.ai base64 upload (legacy)
  const base64 = fileBuffer.toString("base64");
  let mime = "image/jpeg";
  if (ext === ".png") mime = "image/png";
  if (ext === ".webp") mime = "image/webp";
  if (ext === ".mp4") mime = "video/mp4";
  if (ext === ".mov") mime = "video/quicktime";
  if (ext === ".webm") mime = "video/webm";

  const isVideo = [".mp4", ".mov", ".webm"].includes(ext);

  const response = await axios.post(
    "https://kieai.redpandaai.co/api/file-base64-upload",
    {
      base64Data: `data:${mime};base64,${base64}`,
      uploadPath: isVideo ? "videos" : "images",
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
// PROCESS SINGLE PRODUCT CONTENT ITEM
// ============================================

async function processProductShowcase(item, provider, fee) {
  const { id, uid, job_id, model, ref_photo, prompt } = item;

  // ── Has a job already → poll its status ───────────────────────
  if (job_id) {
    let result;

    try {
      result = await fetchJobStatus(provider, "showcase", job_id);
    } catch (err) {
      console.error(
        `❌ fetchJobStatus crashed for product_content #${id}:`,
        err.message,
      );
      await logUsage({
        uid,
        task: "product_showcase_maker",
        status: "error",
        des: `fetchJobStatus crashed for product_content #${id}: ${err.message}`,
      });
      return;
    }

    if (result.status === "pending") return;

    const user = await getUser(uid);

    if (result.status === "error") {
      await refundCredits(uid, fee);
      await setContentError(id, result.msg);
      console.error(`❌ product_content #${id} job failed — refunded ${fee}cr`);

      const des = `product_content #${id} job failed — ${fee} credits refunded. Reason: ${result.msg}`;
      await logUsage({
        uid,
        task: "product_showcase_maker",
        credits: fee,
        status: "refunded",
        des,
      });
      await notifyUser(user, {
        task: "Product Showcase Video",
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
        `❌ downloadImage failed for product_content #${id}:`,
        err.message,
        "| URL:",
        result.data,
      );
      await refundCredits(uid, fee);
      await setContentError(id, `Download failed: ${err.message}`);

      const des = `product_content #${id} download failed — ${fee}cr refunded. Error: ${err.message}`;
      await logUsage({
        uid,
        task: "product_showcase_maker",
        credits: fee,
        status: "refunded",
        des,
      });
      await notifyUser(user, {
        task: "Product Showcase Video",
        des,
        status: "Refunded",
      });
      return;
    }

    if (!savedPath) {
      await refundCredits(uid, fee);
      await setContentError(id, "Download returned empty path");

      const des = `product_content #${id} download returned empty — ${fee}cr refunded`;
      await logUsage({
        uid,
        task: "product_showcase_maker",
        credits: fee,
        status: "refunded",
        des,
      });
      await notifyUser(user, {
        task: "Product Showcase Video",
        des,
        status: "Refunded",
      });
      return;
    }

    await query(
      `UPDATE product_content SET status = 'active', generated_video = ?, job_id = NULL WHERE id = ?`,
      [savedPath, id],
    );

    console.log(`✅ product_content #${id} completed — saved to ${savedPath}`);

    const successDes = `product_content #${id} completed successfully — video saved to ${savedPath}`;
    await logUsage({
      uid,
      task: "product_showcase_maker",
      credits: fee,
      status: "success",
      des: successDes,
    });
    await notifyUser(user, {
      task: "Product Showcase Video",
      des: successDes,
      status: "Success",
    });
    return;
  }

  // ── No job yet → validate user ────────────────────────────────
  const user = await getUser(uid);

  if (!user) {
    await setContentError(id, "User not found");
    await logUsage({
      uid,
      task: "product_showcase_maker",
      status: "error",
      des: `product_content #${id} — user not found`,
    });
    return;
  }

  const credits = getUserCredits(user);

  if (credits <= 0) {
    console.log(`⏭️  product_content #${id} — plan expired or no credits`);
    await setContentError(id, "Plan expired or no credits available");
    await logUsage({
      uid,
      task: "product_showcase_maker",
      credits: 0,
      status: "error",
      des: `product_content #${id} — plan expired or zero credits`,
    });
    await notifyUser(user, {
      task: "Product Showcase Video",
      des: `Your product showcase video #${id} could not be processed — your plan has expired or you have no credits.`,
      status: "Failed",
    });
    return;
  }

  if (credits < fee) {
    console.log(
      `⏭️  product_content #${id} — needs ${fee}cr, has ${credits}cr`,
    );
    await setContentError(
      id,
      `Insufficient credits — needs ${fee}, has ${credits}`,
    );
    await logUsage({
      uid,
      task: "product_showcase_maker",
      credits,
      status: "error",
      des: `product_content #${id} — needs ${fee}cr but user only has ${credits}cr`,
    });
    await notifyUser(user, {
      task: "Product Showcase Video",
      des: `Your product showcase video #${id} could not be processed — you need ${fee} credits but only have ${credits}.`,
      status: "Failed",
    });
    return;
  }

  // ── Parse model JSON to get influencer photo ──────────────────
  let influencer;
  try {
    influencer = typeof model === "string" ? JSON.parse(model) : model;
  } catch (err) {
    await setContentError(id, "Invalid model JSON");
    await logUsage({
      uid,
      task: "product_showcase_maker",
      status: "error",
      des: `product_content #${id} — failed to parse model JSON: ${err.message}`,
    });
    return;
  }

  if (!influencer?.photo_url) {
    await setContentError(id, "Influencer has no photo");
    await logUsage({
      uid,
      task: "product_showcase_maker",
      status: "error",
      des: `product_content #${id} — influencer has no photo_url`,
    });
    return;
  }

  if (!ref_photo) {
    await setContentError(id, "No product photo found");
    await logUsage({
      uid,
      task: "product_showcase_maker",
      status: "error",
      des: `product_content #${id} — ref_photo is empty`,
    });
    return;
  }

  if (!prompt) {
    await setContentError(id, "No prompt provided");
    await logUsage({
      uid,
      task: "product_showcase_maker",
      status: "error",
      des: `product_content #${id} — prompt is empty`,
    });
    return;
  }

  // ── Upload both images before touching credits ─────────────────
  const apiKey =
    provider.reel_api_key ||
    provider.img2img_api_key ||
    provider.txt2img_api_key;

  // image_url_1 → model/influencer photo
  let modelImageUrl;
  try {
    const modelImagePath = `${__dirname}/../client/public/media/${influencer.photo_url}`;
    modelImageUrl = await uploadFileToProvider(modelImagePath, provider, apiKey);
    console.log(`📎 product_content #${id} model image URL: ${modelImageUrl}`);
  } catch (err) {
    await setContentError(id, `Model image upload failed: ${err.message}`);
    await logUsage({
      uid,
      task: "product_showcase_maker",
      status: "error",
      des: `product_content #${id} — model image upload failed: ${err.message}`,
    });
    return;
  }

  // image_url_2 → product/ref photo
  let productImageUrl;
  try {
    const productImagePath = `${__dirname}/../client/public/media/${ref_photo}`;
    productImageUrl = await uploadFileToProvider(
      productImagePath,
      provider,
      apiKey,
    );
    console.log(
      `📎 product_content #${id} product image URL: ${productImageUrl}`,
    );
  } catch (err) {
    await setContentError(id, `Product image upload failed: ${err.message}`);
    await logUsage({
      uid,
      task: "product_showcase_maker",
      status: "error",
      des: `product_content #${id} — product image upload failed: ${err.message}`,
    });
    return;
  }

  // ── Atomically reserve credits ────────────────────────────────
  const reserved = await reserveCredits(uid, fee);

  if (!reserved) {
    console.log(
      `⏭️  Skipping product_content #${id} — credits taken by concurrent task`,
    );
    await logUsage({
      uid,
      task: "product_showcase_maker",
      status: "skipped",
      des: `product_content #${id} skipped — credits taken by concurrent task`,
    });
    return;
  }

  // ── Create the job ────────────────────────────────────────────
  // image_url_1 = model photo, image_url_2 = product photo, text = prompt
  const create = await createJob(provider, "showcase", {
    image_url_1: modelImageUrl,
    image_url_2: productImageUrl,
    text: prompt,
  });

  if (create.status === "error") {
    await refundCredits(uid, fee);
    await setContentError(id, create.msg);
    console.error(`❌ product_content #${id} job creation failed:`, create.msg);

    const des = `product_content #${id} job creation failed — ${fee} credits refunded. Reason: ${create.msg}`;
    await logUsage({
      uid,
      task: "product_showcase_maker",
      credits: fee,
      status: "refunded",
      des,
    });
    await notifyUser(user, {
      task: "Product Showcase Video",
      des,
      status: "Refunded",
    });
    return;
  }

  await query(`UPDATE product_content SET job_id = ? WHERE id = ?`, [
    create.taskId,
    id,
  ]);

  console.log(
    `🚀 product_content #${id} job created — taskId: ${create.taskId}`,
  );
  await logUsage({
    uid,
    task: "product_showcase_maker",
    credits: fee,
    status: "processing",
    des: `product_content #${id} job submitted — taskId: ${create.taskId}`,
  });
  await notifyUser(user, {
    task: "Product Showcase Video",
    des: `Your product showcase video #${id} is being generated. We'll notify you once it's ready.`,
    status: "Processing",
  });
}

// ============================================
// MAIN RUNNER
// ============================================

async function productShowcase({ provider }) {
  try {
    const fee = await getCreditFee();

    if (fee < 1) {
      // console.log(
      //   "⚠️  product_showcase_maker fee not configured by admin, skipping run",
      // );
      return;
    }

    const contentList = await query(
      `SELECT * FROM product_content WHERE status = 'processing'`,
    );

    if (!contentList?.length) return;

    await Promise.allSettled(
      contentList.map((item) => processProductShowcase(item, provider, fee)),
    );

    // console.log(
    //   `✅ Processed batch of ${contentList.length} product_content item(s)`,
    // );
  } catch (err) {
    console.error("❌ productShowcase fatal error:", err.message);
    await logUsage({
      task: "product_showcase_maker",
      status: "error",
      des: `productShowcase fatal crash: ${err.message}`,
    });
  }
}

module.exports = { productShowcase };
