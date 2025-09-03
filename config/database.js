const mysql = require("mysql2/promise");
require("dotenv").config();

const database = mysql.createPool({
	host: process.env.DB_HOST || "localhost",
	user: process.env.DB_USER || "root",
	password: process.env.DB_PASSWORD || "",
	database: process.env.DB_NAME || "search_images_nodejs",
	waitForConnections: true,
	connectionLimit: 10,
	queueLimit: 0,
});

// In some environments the promise pool may not expose EventEmitter 'on'
if (typeof database.on === "function") {
	database.on("connection", () => {
		console.log("New database connection established");
	});
}

module.exports = database;
