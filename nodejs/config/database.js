const mysql = require("mysql2/promise");
require("dotenv").config();

const database = mysql.createPool({
	host: process.env.DB_HOST || "localhost",
	user: process.env.DB_USER || "root",
	password: process.env.DB_PASSWORD || "",
	database: process.env.DB_NAME || "search_images_engine_db",
	waitForConnections: true,
	connectionLimit: 20, // Increased from 10 for high-load scenarios
	queueLimit: 0,
	acquireTimeout: 60000, // 60 seconds timeout
	timeout: 60000,
	reconnect: true,
	// Additional options for large-scale operations
	multipleStatements: false,
	namedPlaceholders: false,
	// Performance optimizations
	supportBigNumbers: true,
	bigNumberStrings: true,
	dateStrings: false,
	debug: false,
	trace: false
});

// In some environments the promise pool may not expose EventEmitter 'on'
if (typeof database.on === "function") {
	database.on("connection", () => {
		console.log("New database connection established");
	});
}

module.exports = database;
