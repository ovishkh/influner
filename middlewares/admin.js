const jwt = require("jsonwebtoken");
const { query } = require("../database/connection");
const { getEnv } = require("../utils/common");

const adminValidator = async (req, res, next) => {
  try {
    const token = req.get("Authorization");
    if (!token) {
      return res.json({ msg: "No token found", token: token, logout: true });
    }

    const env = getEnv();

    jwt.verify(token.split(" ")[1], env?.jwt, async (err, decode) => {
      if (err) {
        return res.json({
          success: 0,
          msg: "Invalid token found",
          token,
          logout: true,
        });
      } else {
        const getAdmin = await query(
          `SELECT * FROM admin WHERE uid = ? AND token_version = ?`,
          [decode.uid, decode.token_version],
        );
        if (getAdmin.length < 1) {
          return res.json({
            success: false,
            msg: "Invalid token found",
            token,
            logout: true,
          });
        }
        if (getAdmin[0].role === "admin") {
          req.decode = decode;
          next();
        } else {
          return res.json({
            success: 0,
            msg: "Unauthorized token",
            token: token,
            logout: true,
          });
        }
      }
    });
  } catch (err) {
    console.log(err);
    res.json({ msg: "server error", err });
  }
};

module.exports = adminValidator;
