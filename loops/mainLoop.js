const { query } = require("../database/connection");
const { runContent } = require("./content");
const { runMakeInf } = require("./inf");
const { runInfVariation } = require("./infVariation");
const { productShowcase } = require("./productShow");

async function getApiKeys() {
  try {
    const [data] = await query(
      `SELECT * FROM ai_providers WHERE is_active = ?`,
      [1],
    );
    return data || null;
  } catch {
    return null;
  }
}

async function loop() {
  console.log("🔁 Main loop started");

  while (true) {
    try {
      const aiProvider = await getApiKeys();

      if (aiProvider) {
        await runMakeInf({ provider: aiProvider });
        await runInfVariation({ provider: aiProvider });
        await runContent({ provider: aiProvider });
        await productShowcase({ provider: aiProvider });
      } else {
        // console.log("⚠️  No active provider found, skipping...");
      }
    } catch (err) {
      console.error("❌ Loop error:", err.message);
    }

    await new Promise((res) => setTimeout(res, 2000));
  }
}

function mainLoop() {
  loop().catch((err) => console.error("❌ Fatal loop crash:", err.message));
}

module.exports = { mainLoop };
