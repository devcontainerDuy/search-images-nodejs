const express = require("express");
const router = express.Router();
const path = require("path");

const { index, searchImages } = require("../controllers/index.controller.js");

/* GET home page. */
router.get("/", index);

/* GET search images page. */
router.get("/search", searchImages);

/* GET search demo page. */
router.get("/demo", (req, res) => {
    res.sendFile(path.join(__dirname, "../views/search-demo.html"));
});

module.exports = router;
