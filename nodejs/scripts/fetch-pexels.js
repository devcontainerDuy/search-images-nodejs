require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const path = require("path");
const fs = require("fs/promises");
const fetch = require("cross-fetch");
const db = require("../config/database");
const { md5 } = require("../utils/helper");
const { insertManyImages } = require("../models/images");

const PEXELS_API_KEY = process.env.JWT_SECRET_PEXELS;
const UPLOADS_DIR = path.join(__dirname, "..", "public", "uploads", "images");

// Configuration for large scale processing
const CONFIG = {
    MAX_CONCURRENT_DOWNLOADS: 10,
    MAX_CONCURRENT_PAGES: 3,
    BATCH_SIZE: 50,
    MAX_RETRIES: 3,
    RETRY_DELAY: 1000,
    RATE_LIMIT_DELAY: 100,
    MAX_PAGES_PER_QUERY: 1000,
    CHECKPOINT_INTERVAL: 100,
};

// Utility functions for robust processing
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

class ProgressTracker {
    constructor(totalExpected = 0) {
        this.totalProcessed = 0;
        this.totalExpected = totalExpected;
        this.errors = 0;
        this.startTime = Date.now();
        this.lastCheckpoint = 0;
    }

    update(count, errors = 0) {
        this.totalProcessed += count;
        this.errors += errors;
        
        if (this.totalProcessed - this.lastCheckpoint >= CONFIG.CHECKPOINT_INTERVAL) {
            this.logProgress();
            this.lastCheckpoint = this.totalProcessed;
        }
    }

    logProgress() {
        const elapsed = (Date.now() - this.startTime) / 1000;
        const rate = this.totalProcessed / elapsed;
        const eta = this.totalExpected > 0 ? (this.totalExpected - this.totalProcessed) / rate : 0;
        
        console.log(`📊 Progress: ${this.totalProcessed}/${this.totalExpected || '?'} processed, ` +
                   `${this.errors} errors, ${rate.toFixed(2)}/s, ETA: ${eta.toFixed(0)}s`);
    }

    finish() {
        const elapsed = (Date.now() - this.startTime) / 1000;
        const rate = this.totalProcessed / elapsed;
        console.log(`✅ Final: ${this.totalProcessed} processed, ${this.errors} errors, ` +
                   `${rate.toFixed(2)}/s, total time: ${elapsed.toFixed(2)}s`);
    }
}

// Semaphore for controlling concurrency
class Semaphore {
    constructor(max) {
        this.max = max;
        this.current = 0;
        this.queue = [];
    }

    async acquire() {
        return new Promise((resolve) => {
            if (this.current < this.max) {
                this.current++;
                resolve();
            } else {
                this.queue.push(resolve);
            }
        });
    }

    release() {
        this.current--;
        if (this.queue.length > 0) {
            this.current++;
            const next = this.queue.shift();
            next();
        }
    }
}

const downloadSemaphore = new Semaphore(CONFIG.MAX_CONCURRENT_DOWNLOADS);
const pageSemaphore = new Semaphore(CONFIG.MAX_CONCURRENT_PAGES);

async function fetchFromPexelsWithRetry(query, perPage, page, retryCount = 0) {
    try {
        await pageSemaphore.acquire();
        
        if (!PEXELS_API_KEY) {
            throw new Error("Pexels API key (JWT_SECRET_PEXELS) is not defined in .env file.");
        }
        
        const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=${perPage}&page=${page}`;
        
        // Add rate limiting
        await sleep(CONFIG.RATE_LIMIT_DELAY);
        
        const response = await fetch(url, { 
            headers: { Authorization: PEXELS_API_KEY },
            timeout: 30000
        });
        
        if (!response.ok) {
            if (response.status === 429 && retryCount < CONFIG.MAX_RETRIES) {
                console.log(`⏳ Rate limited on page ${page}, retrying in ${CONFIG.RETRY_DELAY * (retryCount + 1)}ms...`);
                await sleep(CONFIG.RETRY_DELAY * (retryCount + 1));
                return fetchFromPexelsWithRetry(query, perPage, page, retryCount + 1);
            }
            throw new Error(`Pexels API request failed: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        return {
            photos: data.photos || [],
            totalResults: data.total_results || 0,
            nextPage: data.next_page || null
        };
        
    } catch (error) {
        if (retryCount < CONFIG.MAX_RETRIES) {
            console.log(`🔄 Retrying page ${page} (attempt ${retryCount + 1}/${CONFIG.MAX_RETRIES}): ${error.message}`);
            await sleep(CONFIG.RETRY_DELAY * (retryCount + 1));
            return fetchFromPexelsWithRetry(query, perPage, page, retryCount + 1);
        }
        throw error;
    } finally {
        pageSemaphore.release();
    }
}

async function downloadImageWithRetry(url, retryCount = 0) {
    try {
        await downloadSemaphore.acquire();
        
        const response = await fetch(url, { timeout: 30000 });
        if (!response.ok) throw new Error(`Failed to download: ${response.status}`);
        
        const arrayBuffer = await response.arrayBuffer();
        return Buffer.from(arrayBuffer);
        
    } catch (error) {
        if (retryCount < CONFIG.MAX_RETRIES) {
            await sleep(CONFIG.RETRY_DELAY * (retryCount + 1));
            return downloadImageWithRetry(url, retryCount + 1);
        }
        throw error;
    } finally {
        downloadSemaphore.release();
    }
}

async function processBatchRobust(photos, query, tracker) {
    const errors = [];
    
    try {
        console.log(`   📥 Processing batch of ${photos.length} images...`);
        
        // Create chunks to avoid overwhelming the system
        const chunks = [];
        for (let i = 0; i < photos.length; i += CONFIG.BATCH_SIZE) {
            chunks.push(photos.slice(i, i + CONFIG.BATCH_SIZE));
        }
        
        let totalProcessed = 0;
        
        for (const chunk of chunks) {
            const metaPromises = chunk.map(async (photo) => {
                try {
                    const buffer = await downloadImageWithRetry(photo.src.original);
                    const fileExtension = path.extname(new URL(photo.src.original).pathname) || ".jpg";
                    const filename = `pexels-${photo.id}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}${fileExtension}`;
                    const filePath = path.join(UPLOADS_DIR, filename);

                    // Ensure directory exists
                    await fs.mkdir(path.dirname(filePath), { recursive: true });
                    
                    // Save the file to disk
                    await fs.writeFile(filePath, buffer);

                    // Return metadata
                    return {
                        filename,
                        original_name: `pexels-${photo.id}`,
                        file_path: path.relative(path.join(__dirname, ".."), filePath).replace(/\\/g, "/"),
                        file_size: buffer.length,
                        mime_type: "image/jpeg",
                        width: photo.width,
                        height: photo.height,
                        title: photo.alt || `Image by ${photo.photographer}`,
                        description: `Photo by ${photo.photographer} from Pexels. URL: ${photo.url}`,
                        tags: query,
                        content_hash: md5(buffer),
                    };
                } catch (error) {
                    console.warn(`⚠️  Failed to process image ${photo.id}: ${error.message}`);
                    errors.push({ photo: photo.id, error: error.message });
                    return null;
                }
            });

            const imageMetas = (await Promise.all(metaPromises)).filter(meta => meta !== null);
            
            if (imageMetas.length > 0) {
                try {
                    console.log(`   💾 Batch inserting ${imageMetas.length} records...`);
                    await insertManyImages(imageMetas);
                    totalProcessed += imageMetas.length;
                } catch (dbError) {
                    console.error(`❌ Database error for chunk: ${dbError.message}`);
                    errors.push({ type: 'database', error: dbError.message });
                }
            }
            
            // Small delay between chunks to prevent overwhelming
            await sleep(50);
        }
        
        tracker.update(totalProcessed, errors.length);
        
        if (errors.length > 0) {
            console.log(`⚠️  ${errors.length} errors occurred in this batch`);
        }
        
        return totalProcessed;
        
    } catch (error) {
        console.error(`❌ Fatal error in batch processing: ${error.message}`);
        tracker.update(0, 1);
        throw error;
    }
}

async function processMultiplePages(query, perPage, startPage, maxPages, tracker) {
    const pagePromises = [];
    let currentPage = startPage;
    let totalResults = 0;
    let actualMaxPages = maxPages;
    
    // First, get the first page to determine total available
    try {
        const firstPageResult = await fetchFromPexelsWithRetry(query, perPage, currentPage);
        totalResults = firstPageResult.totalResults;
        actualMaxPages = Math.min(maxPages, Math.ceil(totalResults / perPage));
        
        console.log(`📋 Found ${totalResults} total results, will process ${actualMaxPages} pages`);
        tracker.totalExpected = Math.min(totalResults, actualMaxPages * perPage);
        
        if (firstPageResult.photos.length > 0) {
            pagePromises.push(processBatchRobust(firstPageResult.photos, query, tracker));
        }
        
        currentPage++;
    } catch (error) {
        console.error(`❌ Failed to fetch first page: ${error.message}`);
        return 0;
    }
    
    // Process remaining pages in controlled batches
    const pageGroups = [];
    for (let i = currentPage; i <= actualMaxPages; i += CONFIG.MAX_CONCURRENT_PAGES) {
        const group = [];
        for (let j = i; j < Math.min(i + CONFIG.MAX_CONCURRENT_PAGES, actualMaxPages + 1); j++) {
            group.push(j);
        }
        pageGroups.push(group);
    }
    
    for (const group of pageGroups) {
        const groupPromises = group.map(async (pageNum) => {
            try {
                const result = await fetchFromPexelsWithRetry(query, perPage, pageNum);
                if (result.photos.length > 0) {
                    return await processBatchRobust(result.photos, query, tracker);
                }
                return 0;
            } catch (error) {
                console.error(`❌ Failed to process page ${pageNum}: ${error.message}`);
                tracker.update(0, 1);
                return 0;
            }
        });
        
        const groupResults = await Promise.all(groupPromises);
        const groupTotal = groupResults.reduce((sum, count) => sum + count, 0);
        console.log(`📄 Completed page group ${group[0]}-${group[group.length-1]}: ${groupTotal} images processed`);
        
        // Small delay between page groups
        await sleep(200);
    }
    
    // Wait for all processing to complete
    const results = await Promise.all(pagePromises);
    return results.reduce((total, count) => total + count, 0);
}

async function main(query, perPage, startPage, maxPages) {
    const tracker = new ProgressTracker();
    
    console.log(`🚀 Starting large-scale Pexels ingestion`);
    console.log(`📝 Query: "${query}"`);
    console.log(`📄 Pages: ${startPage} to ${startPage + maxPages - 1} (${perPage} per page)`);
    console.log(`⚙️  Config: ${CONFIG.MAX_CONCURRENT_DOWNLOADS} concurrent downloads, ${CONFIG.MAX_CONCURRENT_PAGES} concurrent pages`);
    
    try {
        // Ensure uploads directory exists
        await fs.mkdir(UPLOADS_DIR, { recursive: true });
        
        const totalProcessed = await processMultiplePages(query, perPage, startPage, maxPages, tracker);
        
        tracker.finish();
        console.log(`🎉 Ingestion complete! Successfully processed ${totalProcessed} images.`);
        
        return totalProcessed;
        
    } catch (err) {
        console.error("💥 Critical error during ingestion process:", err);
        tracker.finish();
        throw err;
    } finally {
        try {
            await db.end();
        } catch (dbError) {
            console.warn("⚠️  Warning: Could not close database connection:", dbError.message);
        }
    }
}

// Bulk processing function for multiple queries
async function bulkProcess(queries, perPage = 80, maxPagesPerQuery = 100) {
    console.log(`🚀 Starting bulk processing for ${queries.length} queries`);
    console.log(`📊 Estimated max images: ${queries.length * maxPagesPerQuery * perPage}`);
    
    let totalProcessed = 0;
    let queryCount = 0;
    
    for (const query of queries) {
        queryCount++;
        console.log(`\n🔄 Processing query ${queryCount}/${queries.length}: "${query}"`);
        
        try {
            const processed = await processMultiplePages(query, perPage, 1, maxPagesPerQuery, new ProgressTracker());
            totalProcessed += processed;
            console.log(`✅ Query "${query}" completed: ${processed} images processed`);
            
            // Delay between queries to be respectful to the API
            if (queryCount < queries.length) {
                console.log(`⏳ Waiting before next query...`);
                await sleep(2000);
            }
            
        } catch (error) {
            console.error(`❌ Failed to process query "${query}": ${error.message}`);
            continue; // Continue with next query
        }
    }
    
    console.log(`🎉 Bulk processing complete! Total images processed: ${totalProcessed}`);
    return totalProcessed;
}

// --- Main Execution ---
if (require.main === module) {
    const args = process.argv.slice(2);
    const command = args[0];

    async function runCommand() {
        try {
            if (command === "bulk") {
                // Bulk processing mode: node scripts/fetch-pexels.js bulk <queries-file> [per_page] [max_pages_per_query]
                const queriesFile = args[1];
                const perPage = parseInt(args[2] || "80", 10);
                const maxPagesPerQuery = parseInt(args[3] || "50", 10);

                if (!queriesFile) {
                    console.error("Usage: node scripts/fetch-pexels.js bulk <queries-file> [per_page] [max_pages_per_query]");
                    console.error("Example: node scripts/fetch-pexels.js bulk queries.txt 80 50");
                    console.error("queries.txt should contain one query per line");
                    process.exit(1);
                }

                const fs = require("fs/promises");
                const content = await fs.readFile(queriesFile, 'utf8');
                const queries = content.split('\n')
                    .map(line => line.trim())
                    .filter(line => line.length > 0);
                
                if (queries.length === 0) {
                    console.error("No queries found in file");
                    process.exit(1);
                }
                
                await bulkProcess(queries, perPage, maxPagesPerQuery);

            } else if (command === "range") {
                // Range processing mode: node scripts/fetch-pexels.js range <query> <start_page> <max_pages> [per_page]
                const query = args[1];
                const startPage = parseInt(args[2] || "1", 10);
                const maxPages = parseInt(args[3] || "100", 10);
                const perPage = parseInt(args[4] || "80", 10);

                if (!query) {
                    console.error("Usage: node scripts/fetch-pexels.js range <query> <start_page> <max_pages> [per_page]");
                    console.error("Example: node scripts/fetch-pexels.js range \"cats\" 1 100 80");
                    process.exit(1);
                }

                await main(query, perPage, startPage, maxPages);

            } else if (!command) {
                // Show help when no arguments provided
                console.error("Usage:");
                console.error("  Single page: node scripts/fetch-pexels.js <query> [per_page] [page]");
                console.error("  Range mode:  node scripts/fetch-pexels.js range <query> <start_page> <max_pages> [per_page]");
                console.error("  Bulk mode:   node scripts/fetch-pexels.js bulk <queries-file> [per_page] [max_pages_per_query]");
                console.error("");
                console.error("Examples:");
                console.error("  node scripts/fetch-pexels.js \"cats\" 80 1");
                console.error("  node scripts/fetch-pexels.js range \"cats\" 1 100 80");
                console.error("  node scripts/fetch-pexels.js bulk sample-queries.txt 80 50");
                process.exit(1);
            } else {
                // Legacy single page mode: node scripts/fetch-pexels.js <query> [per_page] [page]
                const query = command;
                const perPage = parseInt(args[1] || "80", 10);
                const page = parseInt(args[2] || "1", 10);

                // Single page mode for backward compatibility
                await main(query, perPage, page, 1);
            }
        } catch (error) {
            console.error("💥 Fatal error:", error.message);
            process.exit(1);
        }
    }
    
    runCommand();
}
