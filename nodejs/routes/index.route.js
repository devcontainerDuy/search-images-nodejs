const express = require("express");
const router = express.Router();

const { index, searchImages } = require("../controllers/index.controller.js");

/* GET home page. */
router.get("/", index);

/* GET search images page. */
router.get("/search", searchImages);

module.exports = router;
