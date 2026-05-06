const express = require("express");
const router = express.Router();
const { query } = require("../database/connection");
const validateUser = require("../middlewares/user");
const sharp = require("sharp");
const path = require("path");
const fs = require("fs");
const randomstring = require("randomstring");
const { checkPlan } = require("../middlewares/common");
const { logUsage } = require("../utils/common");

// Ensure media directory exists
const mediaDir = path.join(__dirname, "../client/public/media");
if (!fs.existsSync(mediaDir)) {
  fs.mkdirSync(mediaDir, { recursive: true });
}

// Allowed image types
const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 10MB

// Helper function to get file extension from mimetype
const getExtensionFromMimetype = (mimetype) => {
  const map = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
  };
  return map[mimetype] || "jpg";
};

// Add new influencer
router.post("/add_model", validateUser, checkPlan, async (req, res) => {
  try {
    const { name, description, creation_type, prompt } = req.body;
    const uid = req.decode.uid;

    // Validation
    if (!name || !description || !creation_type) {
      return res.json({
        success: false,
        msg: "Please provide name, description, and creation type",
      });
    }

    if (!["upload", "prompt"].includes(creation_type)) {
      return res.json({
        success: false,
        msg: "Invalid creation type. Must be 'upload' or 'prompt'",
      });
    }

    let photoFilename = null;
    let status = "processing";
    let metadata = {
      originalName: null,
      fileSize: null,
      mimeType: null,
      dimensions: null,
      processedAt: new Date().toISOString(),
    };

    // ── Handle photo upload ────────────────────────────────────
    if (creation_type === "upload") {
      if (!req.files || !req.files.photo) {
        return res.json({
          success: false,
          msg: "Please upload a photo for upload type",
        });
      }

      const photo = req.files.photo;

      if (!ALLOWED_IMAGE_TYPES.includes(photo.mimetype)) {
        return res.json({
          success: false,
          msg: "Invalid file type. Only JPG, PNG, and WebP are allowed",
        });
      }

      if (photo.size > MAX_FILE_SIZE) {
        return res.json({
          success: false,
          msg: "File size too large. Maximum 10MB allowed",
        });
      }

      const randomStr = randomstring.generate({
        length: 8,
        charset: "alphanumeric",
        capitalization: "lowercase",
      });
      const extension = getExtensionFromMimetype(photo.mimetype);
      photoFilename = `inf_${randomStr}.${extension}`;
      const filePath = path.join(mediaDir, photoFilename);

      try {
        const imageMetadata = await sharp(photo.data).metadata();
        await fs.promises.writeFile(filePath, photo.data);

        metadata.originalName = photo.name;
        metadata.fileSize = photo.size;
        metadata.mimeType = photo.mimetype;
        metadata.dimensions = {
          width: imageMetadata.width,
          height: imageMetadata.height,
        };

        status = "active";
      } catch (error) {
        console.error("File save error:", error);

        await logUsage({
          uid,
          task: "Influencer Manual upload",
          status: "error",
          des: `inf upload failed — file save error: ${error.message} | file: ${photo.name}`,
        });

        return res.json({
          success: false,
          msg: "Error saving image. Please try another image.",
        });
      }

      // ── Handle prompt ──────────────────────────────────────────
    } else if (creation_type === "prompt") {
      if (!prompt || prompt.trim().length < 10) {
        return res.json({
          success: false,
          msg: "Please provide a detailed prompt (minimum 10 characters)",
        });
      }

      metadata.promptLength = prompt.length;
      metadata.promptWords = prompt.split(/\s+/).length;
      status = "processing";
    }

    // ── Insert into database ───────────────────────────────────
    const result = await query(
      `INSERT INTO influencers 
      (uid, name, description, creation_type, photo_url, prompt, status, data) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        uid,
        name,
        description,
        creation_type,
        photoFilename,
        prompt || null,
        status,
        JSON.stringify(metadata),
      ],
    );

    // ── Log upload success only ────────────────────────────────
    if (creation_type === "upload") {
      await logUsage({
        uid,
        task: "Influencer Manual upload",
        status: "success",
        des: `inf #${result.insertId} uploaded successfully — file: ${photoFilename} (${metadata.dimensions?.width}x${metadata.dimensions?.height}, ${(metadata.fileSize / 1024).toFixed(1)}KB)`,
      });
    }

    res.json({
      success: true,
      msg:
        creation_type === "prompt"
          ? "AI character is being generated. This may take a few minutes..."
          : "Character created successfully!",
      data: {
        id: result.insertId,
        uid,
        status,
      },
    });
  } catch (err) {
    console.error("Add model error:", err);

    await logUsage({
      uid: req.decode?.uid,
      task: "Influencer Manual upload",
      status: "error",
      des: `add_model route crashed: ${err.message}`,
    });

    res.json({
      success: false,
      msg: "Something went wrong. Please try again.",
      error: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
  }
});

// Get all influencers
router.get("/get_models", validateUser, checkPlan, async (req, res) => {
  try {
    const influencers = await query(
      `SELECT * FROM influencers WHERE uid = ? ORDER BY created_at DESC`,
      [req.decode.uid],
    );

    const gall = await query(`SELECT * FROM gallery WHERE uid = ?`, [
      req.decode.uid,
    ]);

    // Parse JSON data field
    const parsedInfluencers = influencers.map((inf) => ({
      ...inf,
      data: inf.data ? JSON.parse(inf.data) : null,
    }));

    res.json({
      success: true,
      data: parsedInfluencers,
    });
  } catch (err) {
    console.error("Get models error:", err);
    res.json({
      success: false,
      msg: "Error fetching influencers",
    });
  }
});

// Delete influencer (using POST)
router.post("/delete_model", validateUser, async (req, res) => {
  try {
    const { id } = req.body;

    if (!id) {
      return res.json({
        success: false,
        msg: "Influencer ID is required",
      });
    }

    // Get influencer details
    const influencer = await query(
      `SELECT photo_url FROM influencers WHERE id = ?`,
      [id],
    );

    if (influencer.length === 0) {
      return res.json({
        success: false,
        msg: "Influencer not found",
      });
    }

    // Delete photo file if exists
    if (influencer[0].photo_url) {
      const photoPath = path.join(mediaDir, influencer[0].photo_url);
      if (fs.existsSync(photoPath)) {
        fs.unlinkSync(photoPath);
      }
    }

    // Delete from database
    await query(`DELETE FROM influencers WHERE id = ? AND uid = ?`, [
      id,
      req.decode.uid,
    ]);

    res.json({
      success: true,
      msg: "Influencer deleted successfully",
    });
  } catch (err) {
    console.error("Delete model error:", err);
    res.json({
      success: false,
      msg: "Error deleting influencer",
    });
  }
});

// Import gallery photo as influencer (no credit deduction)
router.post("/import_from_gallery", validateUser, async (req, res) => {
  try {
    const { name, description, generated_photo, photo_url, gallery_id } =
      req.body;
    const uid = req.decode.uid;

    if (!name) {
      return res.json({
        success: false,
        msg: "Influencer name is required",
      });
    }

    // Resolve which filename to use — prefer generated_photo, fallback to photo_url
    const resolvedPhoto = generated_photo || photo_url || null;

    if (!resolvedPhoto) {
      return res.json({
        success: false,
        msg: "No photo found to import",
      });
    }

    // Verify the file actually exists on disk
    const filePath = path.join(mediaDir, resolvedPhoto);
    if (!fs.existsSync(filePath)) {
      return res.json({
        success: false,
        msg: "Photo file not found on server",
      });
    }

    const metadata = {
      originalName: resolvedPhoto,
      fileSize: null,
      mimeType: null,
      dimensions: null,
      processedAt: new Date().toISOString(),
      importedFromGallery: true, // 👈 flag so you know the source
      galleryId: gallery_id || null,
    };

    // Try to read image dimensions via sharp
    try {
      const imageMetadata = await sharp(filePath).metadata();
      metadata.dimensions = {
        width: imageMetadata.width,
        height: imageMetadata.height,
      };
      const stats = fs.statSync(filePath);
      metadata.fileSize = stats.size;
      metadata.mimeType = `image/${imageMetadata.format}`;
    } catch (_) {
      // Non-fatal — dimensions just won't be stored
    }

    const result = await query(
      `INSERT INTO influencers 
        (uid, name, description, creation_type, photo_url, prompt, status, data) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        uid,
        name,
        description || `Imported from gallery — ${name}`,
        "upload", // treated same as a manual upload
        resolvedPhoto, // reuse the existing file, no copy needed
        null,
        "active", // ready immediately
        JSON.stringify(metadata),
      ],
    );

    await logUsage({
      uid,
      task: "Influencer Import from Gallery",
      status: "success",
      des: `inf #${result.insertId} imported from gallery #${gallery_id} — file: ${resolvedPhoto}`,
    });

    res.json({
      success: true,
      msg: "Influencer imported successfully!",
      data: {
        id: result.insertId,
        uid,
        status: "active",
      },
    });
  } catch (err) {
    console.error("Import from gallery error:", err);

    await logUsage({
      uid: req.decode?.uid,
      task: "Influencer Import from Gallery",
      status: "error",
      des: `import_from_gallery crashed: ${err.message}`,
    });

    res.json({
      success: false,
      msg: "Something went wrong. Please try again.",
      error: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
  }
});

module.exports = router;
