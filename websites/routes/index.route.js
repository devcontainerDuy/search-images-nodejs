import express from "express";
import multer from "multer";
import path from "node:path";
import indexController from "../controllers/index.controller.js";
const router = express.Router();

const upload = multer({ dest: path.join("public", "uploads", "tmp") });

/* GET home page. */
router.get("/", indexController.get);
router.get("/search", indexController.get);
router.post("/search-by-image", upload.single("image"), indexController.search);
export default router;
