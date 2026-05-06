const router = require("express").Router();
const { query } = require("../database/connection.js");
const adminValidator = require("../middlewares/admin.js");

const FEATURES = ["txt2img", "img2img", "reel", "showcase"];

function buildFeatureFields(body, forUpdate = false) {
  const cols = [];
  const vals = [];

  FEATURES.forEach((f) => {
    const fields = [
      [`${f}_enabled`, body[`${f}_enabled`] ? 1 : 0],
      [`${f}_base_url`, body[`${f}_base_url`] || null],
      [`${f}_api_key`, body[`${f}_api_key`] || null],
      [`${f}_auth_type`, body[`${f}_auth_type`] || "bearer"],
      [`${f}_auth_header_key`, body[`${f}_auth_header_key`] || "Authorization"],
      [`${f}_auth_header_prefix`, body[`${f}_auth_header_prefix`] || "Bearer"],
      [`${f}_auth_body_key`, body[`${f}_auth_body_key`] || null],
      [`${f}_auth_query_key`, body[`${f}_auth_query_key`] || null],
      [`${f}_create_endpoint`, body[`${f}_create_endpoint`] || null],
      [`${f}_create_method`, body[`${f}_create_method`] || "POST"],
      [
        `${f}_create_payload`,
        body[`${f}_create_payload`]
          ? JSON.stringify(body[`${f}_create_payload`])
          : null,
      ],
      [`${f}_job_id_path`, body[`${f}_job_id_path`] || "data.taskId"],
      [`${f}_status_endpoint`, body[`${f}_status_endpoint`] || null],
      [`${f}_status_method`, body[`${f}_status_method`] || "GET"],
      [`${f}_state_path`, body[`${f}_state_path`] || "data.state"],
      [`${f}_success_state`, body[`${f}_success_state`] || "success"],
      [`${f}_failed_state`, body[`${f}_failed_state`] || "fail"],
      [`${f}_result_path`, body[`${f}_result_path`] || null],
    ];

    fields.forEach(([col, val]) => {
      forUpdate ? cols.push(`${col} = ?`) : cols.push(col);
      vals.push(val);
    });
  });

  return { cols, vals };
}

// ── GET ALL ──
router.get("/get_providers", adminValidator, async (req, res) => {
  try {
    const providers = await query(
      `SELECT * FROM ai_providers ORDER BY created_at DESC`,
      [],
    );
    res.json({ success: true, data: providers });
  } catch (err) {
    console.log(err);
    res.json({ success: false, msg: "Something went wrong", data: [] });
  }
});

// ── GET ONE ──
router.get("/get_provider/:id", adminValidator, async (req, res) => {
  try {
    const rows = await query(`SELECT * FROM ai_providers WHERE id = ?`, [
      req.params.id,
    ]);
    if (!rows.length)
      return res.json({ success: false, msg: "Provider not found" });
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    console.log(err);
    res.json({ success: false, msg: "Something went wrong" });
  }
});

// ── ADD ──
router.post("/add_provider", adminValidator, async (req, res) => {
  try {
    const { name, provider_key, is_default } = req.body;

    if (!name?.trim())
      return res.json({ success: false, msg: "Provider Name is required" });
    if (!provider_key?.trim())
      return res.json({ success: false, msg: "Provider Key is required" });

    // at least one feature must be enabled with base_url + api_key
    const hasFeature = FEATURES.some((f) => req.body[`${f}_enabled`]);
    if (!hasFeature) {
      return res.json({
        success: false,
        msg: "Enable and configure at least one feature",
      });
    }

    if (!/^[a-z0-9_]+$/.test(provider_key)) {
      return res.json({
        success: false,
        msg: "Provider Key must be lowercase letters, numbers and underscores only",
      });
    }

    const existing = await query(
      `SELECT id FROM ai_providers WHERE provider_key = ?`,
      [provider_key],
    );
    if (existing.length) {
      return res.json({
        success: false,
        msg: `Provider key "${provider_key}" already exists`,
      });
    }

    if (is_default) {
      await query(`UPDATE ai_providers SET is_default = 0`, []);
    }

    const { cols, vals } = buildFeatureFields(req.body);

    const baseCols = ["name", "provider_key", "is_default"];
    const baseVals = [name.trim(), provider_key.trim(), is_default ? 1 : 0];

    const allCols = [...baseCols, ...cols];
    const allVals = [...baseVals, ...vals];
    const placeholders = allCols.map(() => "?").join(", ");

    await query(
      `INSERT INTO ai_providers (${allCols.join(", ")}) VALUES (${placeholders})`,
      allVals,
    );

    res.json({ success: true, msg: "Provider added successfully" });
  } catch (err) {
    console.log(err);
    res.json({ success: false, msg: "Something went wrong" });
  }
});

// ── UPDATE ──
router.post("/update_provider", adminValidator, async (req, res) => {
  try {
    const { id, name, is_active, is_default } = req.body;

    if (!id)
      return res.json({ success: false, msg: "Provider ID is required" });
    if (!name?.trim())
      return res.json({ success: false, msg: "Provider Name is required" });

    const existing = await query(`SELECT id FROM ai_providers WHERE id = ?`, [
      id,
    ]);
    if (!existing.length)
      return res.json({ success: false, msg: "Provider not found" });

    if (is_default) {
      await query(`UPDATE ai_providers SET is_default = 0`, []);
    }

    const { cols, vals } = buildFeatureFields(req.body, true);

    const baseCols = ["name = ?", "is_active = ?", "is_default = ?"];
    const baseVals = [name.trim(), is_active ? 1 : 0, is_default ? 1 : 0];

    const allSets = [...baseCols, ...cols];
    const allVals = [...baseVals, ...vals, id];

    await query(
      `UPDATE ai_providers SET ${allSets.join(", ")} WHERE id = ?`,
      allVals,
    );

    res.json({ success: true, msg: "Provider updated successfully" });
  } catch (err) {
    console.log(err);
    res.json({ success: false, msg: "Something went wrong" });
  }
});

// ── DELETE ──
router.post("/delete_provider", adminValidator, async (req, res) => {
  try {
    const { id } = req.body;
    if (!id)
      return res.json({ success: false, msg: "Provider ID is required" });

    const existing = await query(
      `SELECT id, provider_key FROM ai_providers WHERE id = ?`,
      [id],
    );
    if (!existing.length)
      return res.json({ success: false, msg: "Provider not found" });

    if (existing[0]?.provider_key === "kie_ai") {
      return res.json({ success: false, msg: "Kie.ai cannot be deleted" });
    }

    await query(`DELETE FROM ai_providers WHERE id = ?`, [id]);
    res.json({ success: true, msg: "Provider deleted successfully" });
  } catch (err) {
    console.log(err);
    res.json({ success: false, msg: "Something went wrong" });
  }
});

// ── TOGGLE ACTIVE ──
router.post("/toggle_provider", adminValidator, async (req, res) => {
  try {
    const { id, is_active } = req.body;
    if (!id)
      return res.json({ success: false, msg: "Provider ID is required" });

    const existing = await query(`SELECT id FROM ai_providers WHERE id = ?`, [
      id,
    ]);
    if (!existing.length)
      return res.json({ success: false, msg: "Provider not found" });

    await query(`UPDATE ai_providers SET is_active = ? WHERE id = ?`, [
      is_active ? 1 : 0,
      id,
    ]);
    res.json({ success: true, msg: "Status updated successfully" });
  } catch (err) {
    console.log(err);
    res.json({ success: false, msg: "Something went wrong" });
  }
});

module.exports = router;
