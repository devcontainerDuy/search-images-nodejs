const db = require("../config/database");
const { getImageStats } = require("../models/images");

async function monitorProgress() {
    try {
        const stats = await getImageStats();
        const timestamp = new Date().toISOString();
        
        console.log(`\n📊 Progress Report - ${timestamp}`);
        console.log(`===============================================`);
        console.log(`Total Images: ${stats.total.toLocaleString()}`);
        console.log(`Total Size: ${(stats.totalSize / (1024 * 1024 * 1024)).toFixed(2)} GB`);
        console.log(`Added in last 24h: ${stats.recentlyAdded.toLocaleString()}`);
        
        // Check disk space usage
        const uploadsPath = require("path").join(__dirname, "..", "public", "uploads", "images");
        const fs = require("fs");
        
        if (fs.existsSync(uploadsPath)) {
            const files = fs.readdirSync(uploadsPath);
            console.log(`Files on disk: ${files.length.toLocaleString()}`);
        }
        
        console.log(`===============================================\n`);
        
    } catch (error) {
        console.error("Error getting stats:", error.message);
    } finally {
        await db.end();
    }
}

// Run monitoring
if (require.main === module) {
    const interval = parseInt(process.argv[2] || "0", 10);
    
    if (interval > 0) {
        console.log(`Starting monitoring with ${interval}s interval...`);
        setInterval(monitorProgress, interval * 1000);
    } else {
        monitorProgress();
    }
}

module.exports = { monitorProgress };
