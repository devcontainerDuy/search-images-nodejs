require("dotenv").config();
const mysql = require("mysql2/promise");

async function testConnection() {
    let connection = null;
    try {
        console.log("🔍 Testing database connection...");
        console.log("Host:", process.env.DB_HOST);
        console.log("User:", process.env.DB_USER);
        console.log("Database:", process.env.DB_NAME);
        
        console.log("Creating connection...");
        connection = await mysql.createConnection({
            host: process.env.DB_HOST || "localhost",
            user: process.env.DB_USER || "root",
            password: process.env.DB_PASSWORD || "",
            database: process.env.DB_NAME || "search_images_engine_db",
            connectTimeout: 10000,
            acquireTimeout: 10000,
            timeout: 10000
        });
        
        console.log("✅ Database connection successful!");
        
        // Test a simple query
        console.log("Running test query...");
        const [rows] = await connection.execute("SELECT 1 as test");
        console.log("✅ Test query successful:", rows[0]);
        
        console.log("Closing connection...");
        await connection.end();
        console.log("✅ Connection closed properly");
        
        // Force exit to ensure script terminates
        process.exit(0);
        
    } catch (error) {
        console.error("❌ Database connection failed:", error.message);
        console.error("Error code:", error.code);
        console.error("Error number:", error.errno);
        
        if (connection) {
            try {
                await connection.end();
            } catch (closeError) {
                console.error("Error closing connection:", closeError.message);
            }
        }
        
        process.exit(1);
    }
}

// Set a timeout to force exit if hanging
setTimeout(() => {
    console.error("⏰ Connection test timed out after 15 seconds");
    process.exit(1);
}, 15000);

testConnection();
