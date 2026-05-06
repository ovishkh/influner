const { getDaysFromNow } = require("../utils/common");

const checkPlan = async (req, res, next) => {
  try {
    const user = req.decode.user;
    const plan = user?.plan ? JSON.parse(user?.plan) : null;

    if (!plan) {
      return res.json({ msg: "Please subscribe a plan to proceed this." });
    }

    const planLeft = parseInt(getDaysFromNow(user?.plan_ending) || 0);
    if (planLeft < 1) {
      return res.json({ msg: "Your plan was expired. Please buy a plan" });
    }
    req.decode.plan = JSON.parse(user?.plan);
    next();
  } catch (err) {
    console.log(err);
    res.json({ msg: "server error", err });
  }
};

module.exports = {
  checkPlan,
};
