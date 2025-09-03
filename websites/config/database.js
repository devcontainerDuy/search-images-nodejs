const mysql = require("mysql2/promise");

const database = mysql.createPool({
	host: process.env.DB_HOST,
	user: process.env.DB_USER,
	password: process.env.DB_PASSWORD,
	database: process.env.DB_NAME,
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
