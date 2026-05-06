const router = require("express").Router();
const { query } = require("../database/connection.js");
const adminValidator = require("../middlewares/admin.js");
const path = require("path");
const fs = require("fs");
const randomstring = require("randomstring");

// ─── GET all blogs ────────────────────────────────────────────────────────────
router.get("/get_all", async (req, res) => {
  try {
    const data = await query(`SELECT * FROM blog ORDER BY createdAt DESC`, []);
    res.json({ data, success: true });
  } catch (err) {
    console.log(err);
    res.json({ err, msg: "Something went wrong", success: false });
  }
});

// ─── POST add new blog ────────────────────────────────────────────────────────
router.post("/add_new", adminValidator, async (req, res) => {
  try {
    const {
      title,
      slug,
      content,
      excerpt,
      meta_title,
      meta_description,
      meta_keywords,
      og_image,
      status,
    } = req.body;

    const uid = randomstring.generate(24);
    let thumbnail = null;

    if (req.files && req.files.thumbnail) {
      const file = req.files.thumbnail;
      const ext = path.extname(file.name);
      const fileName = `${randomstring.generate(5)}${ext}`;
      const mediaDir = path.join(__dirname, "../client/public/media");

      if (!fs.existsSync(mediaDir)) {
        fs.mkdirSync(mediaDir, { recursive: true });
      }

      await file.mv(path.join(mediaDir, fileName));
      thumbnail = fileName;
    }

    await query(
      `INSERT INTO blog 
        (uid, title, slug, thumbnail, content, excerpt, meta_title, meta_description, meta_keywords, og_image, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        uid,
        title,
        slug,
        thumbnail,
        content,
        excerpt,
        meta_title,
        meta_description,
        meta_keywords,
        og_image,
        status || "draft",
      ],
    );

    res.json({ msg: "Blog added successfully", success: true });
  } catch (err) {
    console.log(err);
    res.json({ err, msg: "Something went wrong", success: false });
  }
});

// ─── POST update blog ─────────────────────────────────────────────────────────
router.post("/update", adminValidator, async (req, res) => {
  try {
    const {
      id,
      title,
      slug,
      content,
      excerpt,
      meta_title,
      meta_description,
      meta_keywords,
      og_image,
      status,
    } = req.body;

    let thumbnailQuery = "";
    let thumbnailValue = [];

    if (req.files && req.files.thumbnail) {
      const file = req.files.thumbnail;
      const fileName = file.name.replace(/\s+/g, "_");
      const mediaDir = path.join(__dirname, "../client/public/media");

      if (!fs.existsSync(mediaDir)) {
        fs.mkdirSync(mediaDir, { recursive: true });
      }

      await file.mv(path.join(mediaDir, fileName));
      thumbnail = `/media/${fileName}`;
    }

    await query(
      `UPDATE blog SET 
        title = ?, slug = ?, content = ?, excerpt = ?,
        meta_title = ?, meta_description = ?, meta_keywords = ?,
        og_image = ?, status = ?
        ${thumbnailQuery}
       WHERE id = ?`,
      [
        title,
        slug,
        content,
        excerpt,
        meta_title,
        meta_description,
        meta_keywords,
        og_image,
        status,
        ...thumbnailValue,
        id,
      ],
    );

    res.json({ msg: "Blog updated successfully", success: true });
  } catch (err) {
    console.log(err);
    res.json({ err, msg: "Something went wrong", success: false });
  }
});

// ─── POST delete blog ─────────────────────────────────────────────────────────
router.post("/delete", adminValidator, async (req, res) => {
  try {
    const { id } = req.body;

    // Remove thumbnail file from disk
    const [blog] = await query(`SELECT thumbnail FROM blog WHERE id = ?`, [id]);
    if (blog?.thumbnail) {
      const filePath = path.join(__dirname, "../client/public", blog.thumbnail);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }

    await query(`DELETE FROM blog WHERE id = ?`, [id]);
    res.json({ msg: "Blog deleted successfully", success: true });
  } catch (err) {
    console.log(err);
    res.json({ err, msg: "Something went wrong", success: false });
  }
});

// ─── GET all published blogs (public) ────────────────────────────────────────
router.get("/get_published", async (req, res) => {
  try {
    const data = await query(
      `SELECT * FROM blog WHERE status = 'published' ORDER BY createdAt DESC`,
      [],
    );
    res.json({ data, success: true });
  } catch (err) {
    console.log(err);
    res.json({ err, msg: "Something went wrong", success: false });
  }
});

// ─── GET single blog by slug (public) ────────────────────────────────────────
router.get("/get_by_slug/:slug", async (req, res) => {
  try {
    const { slug } = req.params;
    console.log({ slug });
    const [data] = await query(
      `SELECT * FROM blog WHERE slug = ? AND status = 'published' LIMIT 1`,
      [slug],
    );
    if (!data) return res.json({ success: false, msg: "Not found" });
    res.json({ data, success: true });
  } catch (err) {
    console.log(err);
    res.json({ err, msg: "Something went wrong", success: false });
  }
});

module.exports = router;
