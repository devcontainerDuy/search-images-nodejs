const imageRouter = require("./image");

function route(app) {
	// 1. Upload hình ảnh
	app.use("/api", imageRouter);
}

module.exports = route;
