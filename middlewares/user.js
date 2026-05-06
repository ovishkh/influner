const jwt = require("jsonwebtoken");
const { query } = require("../database/connection");
const { getEnv } = require("../utils/common");

const validateUser = async (req, res, next) => {
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
        const getUser = await query(
          `SELECT * FROM user WHERE uid = ? AND token_version = ?`,
          [decode.uid, decode.token_version],
        );
        if (getUser.length < 1) {
          return res.json({
            success: false,
            msg: "Invalid token found",
            token,
            logout: true,
          });
        }
        if (getUser[0].role === "user") {
          req.decode = decode;
          req.decode.user = getUser[0];
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

module.exports = validateUser;
