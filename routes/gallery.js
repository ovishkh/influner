const express = require("express");
const router = express.Router();
const { query } = require("../database/connection");
const validateUser = require("../middlewares/user");
const { checkPlan } = require("../middlewares/common");

// add gallery
router.post("/add_new_task", validateUser, checkPlan, async (req, res) => {
  try {
    const { selectedModel, prompt } = req.body;
    if (!selectedModel || !prompt) {
      return res.json({
        msg: "Please selecte an influencer and enter a prompt",
      });
    }

    await query(
      `INSERT INTO gallery (uid, model, prompt, status) VALUES (?,?,?,?)`,
      [req.decode.uid, JSON.stringify(selectedModel), prompt, "processing"],
    );

    res.json({ success: true, msg: "The influencer is getting ready..." });
  } catch (err) {
    console.error(err);
    res.json({
      success: false,
      msg: "Something went wrong",
    });
  }
});

// get all gallery
router.get("/get_all", validateUser, checkPlan, async (req, res) => {
  try {
    const data = await query(`SELECT * FROM gallery WHERE uid = ?`, [
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
    await query(`DELETE FROM gallery WHERE id = ?`, [id]);
    res.json({ success: true, msg: "The content is deleted" });
  } catch (err) {
    console.error(err);
    res.json({
      success: false,
      msg: "Something went wrong",
    });
  }
});

module.exports = router;
