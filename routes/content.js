const express = require("express");
const router = express.Router();
const { query } = require("../database/connection");
const validateUser = require("../middlewares/user");
const { checkPlan } = require("../middlewares/common");
const { uploadImage, deleteFile } = require("../utils/common");
const path = require("path");

// add content
router.post("/add_new", validateUser, checkPlan, async (req, res) => {
  try {
    const { model, ref_video } = req.body;
    if (!model || !ref_video) {
      return res.json({
        msg: "Please select a model and a video",
        success: false,
      });
    }

    await query(
      `INSERT INTO content (uid, model, ref_video, status) VALUES (?,?,?,?)`,
      [
        req.decode.uid,
        JSON.stringify(model),
        JSON.stringify(ref_video),
        "processing",
      ],
    );

    res.json({ success: true, msg: "The video is getting ready..." });
  } catch (err) {
    console.error("Add model error:", err);
    res.json({
      success: false,
      msg: "Something went wrong. Please try again.",
      err,
    });
  }
});

// get all gallery
router.get("/get_all", validateUser, checkPlan, async (req, res) => {
  try {
    const data = await query(`SELECT * FROM content WHERE uid = ?`, [
      req.decode.uid,
    ]);
    res.json({ data, success: true });
  } catch (err) {
    console.error(err);
    res.json({
      success: false,
      msg: "Something went wrong",
    });
  }
});

// del a content
router.post("/del_one", validateUser, checkPlan, async (req, res) => {
  try {
    const { id } = req.body;
    await query(`DELETE FROM content WHERE id = ?`, [id]);
    res.json({ success: true, msg: "The content is deleted" });
  } catch (err) {
    console.error(err);
    res.json({
      success: false,
      msg: "Something went wrong",
    });
  }
});

// Add product content
router.post(
  "/add_new_product_content",
  validateUser,
  checkPlan,
  async (req, res) => {
    try {
      const { model_id, model_name, prompt, aspect_ratio } = req.body;

      // Validation
      if (!model_id || !model_name) {
        return res.json({
          msg: "Please select a model",
          success: false,
        });
      }

      if (!req.files || !req.files.product_image) {
        return res.json({
          msg: "Please upload a product image",
          success: false,
        });
      }

      // Upload image
      const uploadResult = await uploadImage(
        req.files.product_image,
        path.join(__dirname, "../client/public/media"),
        ["jpeg", "jpg", "png", "webp"],
        10,
      );

      if (!uploadResult.success) {
        return res.json({
          success: false,
          msg: uploadResult.msg,
        });
      }

      // Prepare model JSON
      const [modelData] = await query(
        `SELECT * FROM influencers WHERE id = ?`,
        [model_id],
      );

      console.log({ model_id });

      if (!modelData) {
        return res.json({ msg: "Selected model does not exist" });
      }

      // Prepare other data JSON
      const otherData = {
        aspect_ratio: aspect_ratio || "9:16",
      };

      // Insert into database
      await query(
        `INSERT INTO product_content (uid, model, ref_photo, prompt, other, status) VALUES (?,?,?,?,?,?)`,
        [
          req.decode.uid,
          JSON.stringify(modelData),
          uploadResult.filename,
          prompt || "",
          JSON.stringify(otherData),
          "processing",
        ],
      );

      res.json({ success: true, msg: "The video is getting ready..." });
    } catch (err) {
      console.error("Add product content error:", err);
      res.json({
        success: false,
        msg: "Something went wrong. Please try again.",
        err: err.message,
      });
    }
  },
);

// Get all product content
router.get(
  "/get_all_product_content",
  validateUser,
  checkPlan,
  async (req, res) => {
    try {
      const data = await query(
        `SELECT * FROM product_content WHERE uid = ? ORDER BY created_at DESC`,
        [req.decode.uid],
      );
      res.json({ data, success: true });
    } catch (err) {
      console.error(err);
      res.json({
        success: false,
        msg: "Something went wrong",
      });
    }
  },
);

// In your delete route
router.post(
  "/del_one_product_content",
  validateUser,
  checkPlan,
  async (req, res) => {
    try {
      const { id } = req.body;

      const content = await query(
        `SELECT ref_photo FROM product_content WHERE id = ? AND uid = ?`,
        [id, req.decode.uid],
      );

      if (content.length === 0) {
        return res.json({
          success: false,
          msg: "Content not found",
        });
      }

      // Delete from database
      await query(`DELETE FROM product_content WHERE id = ? AND uid = ?`, [
        id,
        req.decode.uid,
      ]);

      // Delete the file (silent operation)
      const filePath = path.join(
        __dirname,
        "../client/public/media",
        content[0].ref_photo,
      );
      deleteFile(filePath);

      res.json({ success: true, msg: "The content is deleted" });
    } catch (err) {
      console.error(err);
      res.json({
        success: false,
        msg: "Something went wrong",
      });
    }
  },
);

module.exports = router;
