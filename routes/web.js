const router = require("express").Router();
const adminValidator = require("../middlewares/admin.js");
const fs = require("fs");
const path = require("path");
const { query } = require("../database/connection.js");
const { uploadImage, downloadAndExtractFile } = require("../utils/common.js");
const { createLicenseFile } = require("../middlewares/license.js");
const bcrypt = require("bcrypt");
const { injectMetaIntoHtml } = require("../utils/common.js");

// update app
router.post("/update_app", async (req, res) => {
  try {
    const { password, newQueries } = req.body;

    if (!password) {
      return res.json({ msg: "Admin password missing", success: false });
    }

    const getAdmin = await query(`SELECT * FROM admin`, []);

    const compare = await bcrypt.compare(password, getAdmin[0].password);
    if (!compare) {
      return res.json({
        msg: "Invalid admin password. Please give a correct admin password",
      });
    }

    if (newQueries && JSON.parse(newQueries)?.length > 0) {
      const newQuery = JSON.parse(newQueries);
      await Promise.all(
        newQuery?.map(async (i) => {
          const { run, check } = i;
          const checkExist = await query(check, []);
          if (checkExist.length < 1) {
            await query(run, []);
          }
        }),
      );
    }

    const outputPath = `${__dirname}/../`;

    const installApp = await downloadAndExtractFile(req.files, outputPath);

    res.json(installApp);
  } catch (err) {
    res.json({ success: false, error: err, msg: "Server error", err });
    console.log(err);
  }
});

// add new languages
router.post("/add-new-translation", adminValidator, async (req, res) => {
  try {
    const cirDir = process.cwd();
    const newCode = req.body.newcode;

    const sourceFolderPath = path.join(cirDir, "languages");

    fs.readdir(sourceFolderPath, (err, files) => {
      if (err) {
        console.log("Error reading folder:", err);
        res.json({ success: false, error: err });
        return;
      }

      // Filter out non-JSON files
      const jsonFiles = files.filter((file) => file.endsWith(".json"));

      // Select a random JSON file
      const randomIndex = Math.floor(Math.random() * jsonFiles.length);
      const randomFile = jsonFiles[randomIndex];

      const sourceFilePath = path.join(sourceFolderPath, randomFile);
      const destinationFilePath = path.join(
        sourceFolderPath,
        `${newCode}.json`,
      );

      // Check if the destination file already exists
      if (fs.existsSync(destinationFilePath)) {
        res.json({ success: false, msg: "Destination file already exists" });
        return;
      }

      // Duplicate the source file to the destination file
      fs.copyFile(sourceFilePath, destinationFilePath, (err) => {
        if (err) {
          console.log("File duplication failed:", err);
          res.json({ success: false, error: err });
          return;
        }
        res.json({
          success: true,
          msg: "Language file duplicated successfully",
        });
      });
    });
  } catch (err) {
    res.json({ success: false, error: err, msg: "Server error", err });
    console.log(err);
  }
});

router.get("/get-one-translation", async (req, res) => {
  try {
    const cirDir = process.cwd();
    const code = req.query.code;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 0;
    const search = req.query.search || "";

    fs.readFile(`${cirDir}/languages/${code}.json`, "utf8", (err, lang) => {
      if (err) {
        console.log("File read failed:", err);
        res.json({ notfound: true });
        return;
      }

      try {
        const parsedData = JSON.parse(lang);

        if (!search && !limit) {
          return res.json({
            success: true,
            data: parsedData,
            total: Object.keys(parsedData).length,
          });
        }

        let filteredData = parsedData;
        if (search) {
          const searchLower = search.toLowerCase();
          const filtered = {};
          Object.keys(parsedData).forEach((key) => {
            if (
              key.toLowerCase().includes(searchLower) ||
              String(parsedData[key]).toLowerCase().includes(searchLower)
            ) {
              filtered[key] = parsedData[key];
            }
          });
          filteredData = filtered;
        }

        if (limit > 0) {
          const keys = Object.keys(filteredData);
          const totalItems = keys.length;
          const startIndex = (page - 1) * limit;
          const endIndex = startIndex + limit;
          const paginatedKeys = keys.slice(startIndex, endIndex);

          const paginatedData = {};
          paginatedKeys.forEach((key) => {
            paginatedData[key] = filteredData[key];
          });

          return res.json({
            success: true,
            data: paginatedData,
            pagination: {
              total: totalItems,
              page,
              limit,
              pages: Math.ceil(totalItems / limit),
            },
          });
        }

        res.json({
          success: true,
          data: filteredData,
          total: Object.keys(filteredData).length,
        });
      } catch (parseError) {
        console.log("JSON parse error:", parseError);
        res.json({ success: false, error: "Invalid JSON format" });
      }
    });
  } catch (err) {
    res.json({ err, msg: "server error" });
    console.log(err);
  }
});

router.get("/get-all-translation-name", async (req, res) => {
  try {
    const cirDir = `${__dirname}/../languages/`;
    fs.readdir(`${cirDir}`, (err, files) => {
      res.json({ success: true, data: files });
    });
  } catch (err) {
    res.json({ msg: "Server error", err });
    console.log(err);
  }
});

router.post("/update-one-translation", adminValidator, async (req, res) => {
  try {
    const cirDir = process.cwd();
    const code = req.body.code;
    const updatedJson = req.body.updatedjson;
    const filePath = path.join(cirDir, "languages", `${code}.json`);

    fs.writeFile(filePath, JSON.stringify(updatedJson), "utf8", (err) => {
      if (err) {
        console.log("File write failed:", err);
        res.json({ success: false, error: err });
        return;
      }
      res.json({
        success: true,
        msg: "Languages updated refresh the page to make effects",
      });
    });
  } catch (err) {
    res.json({ success: false, error: err, msg: "Server error" });
    console.log(err);
  }
});

router.get("/get_all_plans", async (req, res) => {
  try {
    const data = await query(`SELECT * FROM plan`, []);
    res.json({ data, success: true });
  } catch (err) {
    res.json({ success: false, msg: "Something went wrong", err });
    console.log(err);
  }
});

router.get("/get_web_pvt", adminValidator, async (req, res) => {
  try {
    const [data] = await query(`SELECT * FROM web_private`, []);
    res.json({ data, success: true });
  } catch (err) {
    res.json({ success: false, msg: "Something went wrong", err });
    console.log(err);
  }
});

router.post("/update_credit_set", adminValidator, async (req, res) => {
  try {
    const {
      inf_maker,
      inf_var_maker,
      content_video_maker,
      product_showcase_maker,
    } = req.body;

    if (
      !inf_maker ||
      !inf_var_maker ||
      !content_video_maker ||
      !product_showcase_maker
    ) {
      return res.json({ msg: "You cant sent 0 or null value" });
    }

    await query(
      `UPDATE web_private SET inf_maker = ?, inf_var_maker = ?, content_video_maker = ?, product_showcase_maker = ?`,
      [inf_maker, inf_var_maker, content_video_maker, product_showcase_maker],
    );

    res.json({ msg: "Credit set updated successfully", success: true });
  } catch (err) {
    res.json({ success: false, msg: "Something went wrong", err });
    console.log(err);
  }
});

// ── GET web_public ──
router.get("/get_web_public", async (req, res) => {
  try {
    const [data] = await query(`SELECT * FROM web_public`, []);
    res.json({ data: data || {}, success: true });
  } catch (err) {
    res.json({ success: false, msg: "Something went wrong", err });
    console.log(err);
  }
});

// ── UPLOAD MEDIA ──
router.post("/upload_media", adminValidator, async (req, res) => {
  try {
    const dir = path.join(__dirname, "../client/public/media");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const result = await uploadImage(
      req.files?.file,
      dir,
      ["jpeg", "jpg", "png", "webp"],
      10,
      { convert: true, format: "webp", quality: 85 },
    );

    res.json(result);
  } catch (err) {
    res.json({ success: false, msg: "Something went wrong", err });
    console.log(err);
  }
});

// ── UPLOAD FAVICON ──
router.post("/upload_favicon", adminValidator, async (req, res) => {
  try {
    const dir = path.join(__dirname, "../client/public");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const result = await uploadImage(
      req.files?.file,
      dir,
      ["jpeg", "jpg", "png", "webp", "ico"],
      5,
      { convert: true, width: 64, height: 64, format: "png", quality: 100 },
    );

    if (!result.success) return res.json(result);

    const generatedPath = path.join(dir, result.filename);
    const faviconPath = path.join(dir, "favicon.ico");

    if (fs.existsSync(faviconPath)) fs.unlinkSync(faviconPath);
    fs.renameSync(generatedPath, faviconPath);

    res.json({
      success: true,
      msg: "Favicon uploaded",
      filename: "favicon.ico",
    });
  } catch (err) {
    res.json({ success: false, msg: "Something went wrong", err });
    console.log(err);
  }
});

// ── SAVE SITE SETTINGS ──
router.post("/save_web_public", adminValidator, async (req, res) => {
  try {
    const {
      site_name,
      site_logo,
      site_favicon,
      meta_title,
      meta_description,
      meta_keywords,
      og_title,
      og_description,
      og_image,
      google_analytics_id,
      google_tag_manager_id,
      facebook_pixel_id,
      custom_homepage_enabled,
      custom_homepage_url,
      youtube_tutorial_url,
      currency_symbol,
      currency_code,
      currency_exchange_rate,
      privacy_policy_html,
      tnc_html,
      about_us_html,
    } = req.body;

    const [existing] = await query(`SELECT id FROM web_public`, []);

    if (existing) {
      await query(
        `UPDATE web_public SET
          site_name = ?, site_logo = ?, site_favicon = ?,
          meta_title = ?, meta_description = ?, meta_keywords = ?,
          og_title = ?, og_description = ?, og_image = ?,
          google_analytics_id = ?, google_tag_manager_id = ?, facebook_pixel_id = ?,
          custom_homepage_enabled = ?, custom_homepage_url = ?, youtube_tutorial_url = ?,
          currency_symbol = ?, currency_code = ?, currency_exchange_rate = ?,
          privacy_policy_html = ?, tnc_html = ?, about_us_html = ?
        WHERE id = ?`,
        [
          site_name,
          site_logo,
          site_favicon,
          meta_title,
          meta_description,
          meta_keywords,
          og_title,
          og_description,
          og_image,
          google_analytics_id,
          google_tag_manager_id,
          facebook_pixel_id,
          custom_homepage_enabled ? 1 : 0,
          custom_homepage_url,
          youtube_tutorial_url,
          currency_symbol,
          currency_code,
          currency_exchange_rate,
          privacy_policy_html || null,
          tnc_html || null,
          about_us_html || null,
          existing.id,
        ],
      );
    } else {
      await query(
        `INSERT INTO web_public (
          site_name, site_logo, site_favicon,
          meta_title, meta_description, meta_keywords,
          og_title, og_description, og_image,
          google_analytics_id, google_tag_manager_id, facebook_pixel_id,
          custom_homepage_enabled, custom_homepage_url, youtube_tutorial_url,
          currency_symbol, currency_code, currency_exchange_rate,
          privacy_policy_html, tnc_html, about_us_html
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          site_name,
          site_logo,
          site_favicon,
          meta_title,
          meta_description,
          meta_keywords,
          og_title,
          og_description,
          og_image,
          google_analytics_id,
          google_tag_manager_id,
          facebook_pixel_id,
          custom_homepage_enabled ? 1 : 0,
          custom_homepage_url,
          youtube_tutorial_url,
          currency_symbol,
          currency_code,
          currency_exchange_rate,
          privacy_policy_html || null,
          tnc_html || null,
          about_us_html || null,
        ],
      );
    }

    // ── Bake meta tags into index.html so crawlers (WhatsApp, Instagram etc) see them ──
    try {
      const [freshData] = await query(`SELECT * FROM web_public`, []);
      if (freshData) {
        const bakedHtml = injectMetaIntoHtml(freshData);
        const indexPath = path.join(__dirname, "../client/public/index.html");
        fs.writeFileSync(indexPath, bakedHtml, "utf8");
      }
    } catch (bakeErr) {
      console.error("Failed to bake index.html:", bakeErr);
      // non-fatal — don't block the save response
    }

    res.json({ success: true, msg: "Site settings saved successfully" });
  } catch (err) {
    res.json({ success: false, msg: "Something went wrong", err });
    console.log(err);
  }
});

// get pages
router.get("/get_pages_html", async (req, res) => {
  try {
    const [data] = await query(
      `SELECT privacy_policy_html, tnc_html, about_us_html FROM web_public`,
      [],
    );
    res.json({
      data,
      success: true,
    });
  } catch (err) {
    res.json({ success: false, msg: "Something went wrong", err });
    console.log(err);
  }
});

router.post("/fill_contact_us", async (req, res) => {
  try {
    const { name, email, phone, message } = req.body;
    if (!name || !email || !phone || !message) {
      return res.json({
        msg: "Please fill all the details.",
      });
    }

    await query(
      `INSERT INTO contact_us_leads (name, email, phone, message) VALUES (?, ?, ?, ?)`,
      [name, email, phone, message],
    );
    res.json({ msg: "Message sent successfully", success: true });
  } catch (err) {
    res.json({ success: false, msg: "Something went wrong", err });
    console.log(err);
  }
});

// get social login data
router.get("/get_social_login_admin", async (req, res) => {
  try {
    const [data] = await query(`SELECT google_login_id FROM web_public`, []);
    res.json({ data, success: true });
  } catch (err) {
    res.json({ success: false, msg: "Something went wrong", err });
    console.log(err);
  }
});

router.post("/update_social_login_data", adminValidator, async (req, res) => {
  try {
    const { google_login_id } = req.body;
    await query(`UPDATE web_public SET google_login_id = ?`, [google_login_id]);

    res.json({ msg: "Updated successfully", success: true });
  } catch (err) {
    res.json({ success: false, msg: "Something went wrong", err });
    console.log(err);
  }
});

// del one lang
router.post("/del-one-translation", adminValidator, async (req, res) => {
  try {
    const cirDir = process.cwd();
    const code = req.body.code;

    const folderPath = path.join(cirDir, "languages");
    const filePath = path.join(folderPath, `${code}.json`);

    // Read the list of files in the "languages" folder
    fs.readdir(folderPath, (err, files) => {
      if (err) {
        console.log("Error reading folder:", err);
        res.json({ success: false, error: err });
        return;
      }

      // Filter out non-JSON files
      const jsonFiles = files.filter((file) => file.endsWith(".json"));

      // Check if there is only one JSON file left
      if (jsonFiles.length === 1) {
        res.json({ success: false, msg: "You cannot delete all languages" });
        return;
      }

      fs.unlink(filePath, (err) => {
        if (err) {
          console.log("File deletion failed:", err);
          res.json({ success: false, error: err });
          return;
        }
        res.json({ success: true, msg: "Language file deleted successfully" });
      });
    });
  } catch (err) {
    res.json({ success: false, error: err, msg: "Server error", err });
    console.log(err);
  }
});

// verfy license
router.post("/verify_license", async (req, res) => {
  try {
    const { licenseKey, name, email, mobile } = req.body;

    const hit = await fetch(
      "https://envato-buyer.oneoftheprojects.com/api/admin/check_license_external?lang=English",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          licenseKey: licenseKey,
          product_name: "Influencify",
          domain: req.get("host"),
          name: name,
          email: email,
          mobile: mobile,
        }),
      },
    );

    const ress = await hit.json();

    console.log({ ress });

    if (ress.success) {
      createLicenseFile({
        domain: req.get("host"),
        product: "whatscrm",
      });

      return res.json({ success: true, msg: "License verified successfully" });
    } else {
      return res.json({
        success: false,
        msg: ress.msg || "Invalid license key",
      });
    }
  } catch (err) {
    res.json({ success: false, error: err, msg: "Something went wrong", err });
    console.log(err);
  }
});

module.exports = router;
