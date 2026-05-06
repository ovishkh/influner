const express = require("express");
const router = express.Router();
const { query } = require("../database/connection");
const validateUser = require("../middlewares/user");
const adminValidator = require("../middlewares/admin.js");

router.post("/add_que", validateUser, async (req, res) => {
  try {
    const { que } = req.body;

    console.log(req.body);
    if (!que) {
      return res.json({ msg: "Please type your question" });
    }

    await query(`INSERT INTO support_msg (uid, que) VALUES (?,?)`, [
      req.decode.uid,
      que,
    ]);

    res.json({
      msg: "Your question was sent. It will be answered shortly.",
      success: true,
    });
  } catch (err) {
    console.log(err);
    res.json({ msg: "Something went wrong", err });
  }
});

router.get("/get_my_que", validateUser, async (req, res) => {
  try {
    const data = await query(`SELECT * FROM support_msg WHERE uid = ?`, [
      req.decode.uid,
    ]);
    res.json({ data, success: true });
  } catch (err) {
    console.log(err);
    res.json({ msg: "Something went wrong", err });
  }
});

router.post("/add_reply", adminValidator, async (req, res) => {
  try {
    const { ans, id } = req.body;

    if (!ans) {
      return res.json({ msg: "Pleas type a reply" });
    }

    await query(`UPDATE support_msg SET ans = ? WHERE id = ?`, [ans, id]);

    res.json({ msg: "Your reply was submitted", success: true });
  } catch (err) {
    console.log(err);
    res.json({ msg: "Something went wrong", err });
  }
});

// get all que — with pagination (limit + offset)
router.get("/get_all_que", adminValidator, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const offset = parseInt(req.query.offset) || 0;

    const data = await query(
      `SELECT * FROM support_msg ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [limit, offset],
    );

    const [{ total }] = await query(
      `SELECT COUNT(*) as total FROM support_msg`,
    );

    res.json({ data, total, success: true });
  } catch (err) {
    console.log(err);
    res.json({ msg: "Something went wrong", err });
  }
});

router.post("/del_que", adminValidator, async (req, res) => {
  try {
    const { id } = req.body;
    await query(`DELETE FROM support_msg WHERE id = ?`, [id]);
    res.json({ msg: "Your question was deleted", success: true });
  } catch (err) {
    console.log(err);
    res.json({ msg: "Something went wrong", err });
  }
});

module.exports = router;
