const mysql = require("mysql2/promise");

async function testConnection() {
    let connection = null;
    try {
        console.log("🔍 Testing database connection without dotenv...");
        
        console.log("Creating connection...");
        connection = await mysql.createConnection({
            host: "localhost",
            user: "root",
            password: "root",
            database: "search_images_engine_db",
            connectTimeout: 5000,
            acquireTimeout: 5000,
            timeout: 5000
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
    console.error("⏰ Connection test timed out after 10 seconds");
    process.exit(1);
}, 10000);

testConnection();
