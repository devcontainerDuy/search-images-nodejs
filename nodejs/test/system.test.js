/**
 * Test script to verify the converted Node.js system
 * Mirrors functionality from Python api-final.py
 */

const path = require("path");
const fs = require("fs");
const fetch = require("cross-fetch"); // npm install cross-fetch

const BASE_URL = "http://localhost:3000/api";

async function testHealthCheck() {
    console.log("🔍 Testing health check...");
    try {
        const response = await fetch(`${BASE_URL}/health`);
        const data = await response.json();
        console.log("✅ Health check:", data.status);
        return data;
    } catch (error) {
        console.error("❌ Health check failed:", error.message);
        return null;
    }
}

async function testStats() {
    console.log("🔍 Testing stats endpoint...");
    try {
        const response = await fetch(`${BASE_URL}/stats`);
        const data = await response.json();
        console.log("✅ Stats:", {
            total_images: data.total_images,
            model: data.model,
            augmentation_enabled: data.augmentation_enabled
        });
        return data;
    } catch (error) {
        console.error("❌ Stats failed:", error.message);
        return null;
    }
}

async function testToggleAugmentation() {
    console.log("🔍 Testing augmentation toggle...");
    try {
        // Test disable
        let response = await fetch(`${BASE_URL}/toggle-augmentation`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ enabled: false })
        });
        let data = await response.json();
        console.log("✅ Augmentation disabled:", data.augmentation_enabled);

        // Test enable
        response = await fetch(`${BASE_URL}/toggle-augmentation`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ enabled: true })
        });
        data = await response.json();
        console.log("✅ Augmentation enabled:", data.augmentation_enabled);
        
        return data;
    } catch (error) {
        console.error("❌ Augmentation toggle failed:", error.message);
        return null;
    }
}

async function testImageUpload() {
    console.log("🔍 Testing image upload...");
    try {
        // Create a simple test image or use existing one
        const testImagePath = path.join(__dirname, "../public/uploads/images");
        const files = fs.readdirSync(testImagePath);
        const imageFile = files.find(f => f.match(/\.(jpg|jpeg|png)$/i));
        
        if (!imageFile) {
            console.log("⚠️ No test image found, skipping upload test");
            return null;
        }

        const FormData = require("form-data");
        const imageBuffer = fs.readFileSync(path.join(testImagePath, imageFile));
        
        const formData = new FormData();
        formData.append("image", imageBuffer, imageFile);
        formData.append("title", "Test Image Upload");
        formData.append("description", "Test image from Node.js conversion");
        formData.append("tags", "test,nodejs,conversion");

        const response = await fetch(`${BASE_URL}/images`, {
            method: "POST",
            body: formData
        });
        
        const data = await response.json();
        console.log("✅ Image upload:", data.message);
        return data;
    } catch (error) {
        console.error("❌ Image upload failed:", error.message);
        return null;
    }
}

async function testImageSearch() {
    console.log("🔍 Testing image search...");
    try {
        // Use first available image for search
        const testImagePath = path.join(__dirname, "../public/uploads/images");
        const files = fs.readdirSync(testImagePath);
        const imageFile = files.find(f => f.match(/\.(jpg|jpeg|png)$/i));
        
        if (!imageFile) {
            console.log("⚠️ No test image found, skipping search test");
            return null;
        }

        const FormData = require("form-data");
        const imageBuffer = fs.readFileSync(path.join(testImagePath, imageFile));
        
        const formData = new FormData();
        formData.append("image", imageBuffer, imageFile);
        formData.append("min_similarity", "0.5");
        formData.append("top_k", "10");
        formData.append("use_augmentation", "true");

        const response = await fetch(`${BASE_URL}/search`, {
            method: "POST",
            body: formData
        });
        
        const data = await response.json();
        console.log("✅ Image search:", {
            total_results: data.total_results,
            timing: data.timing,
            use_augmentation: data.use_augmentation
        });
        return data;
    } catch (error) {
        console.error("❌ Image search failed:", error.message);
        return null;
    }
}

async function testRebuildEmbeddings() {
    console.log("🔍 Testing rebuild embeddings...");
    try {
        const response = await fetch(`${BASE_URL}/rebuild`);
        const data = await response.json();
        console.log("✅ Rebuild embeddings:", {
            status: data.status,
            processed: data.processed,
            total_time: data.total_time
        });
        return data;
    } catch (error) {
        console.error("❌ Rebuild embeddings failed:", error.message);
        return null;
    }
}

async function runAllTests() {
    console.log("🚀 Starting Node.js Image Search System Tests");
    console.log("=" .repeat(50));

    await testHealthCheck();
    await new Promise(resolve => setTimeout(resolve, 1000));

    await testStats();
    await new Promise(resolve => setTimeout(resolve, 1000));

    await testToggleAugmentation();
    await new Promise(resolve => setTimeout(resolve, 1000));

    // await testImageUpload();
    // await new Promise(resolve => setTimeout(resolve, 2000));

    await testImageSearch();
    await new Promise(resolve => setTimeout(resolve, 1000));

    await testRebuildEmbeddings();

    console.log("=" .repeat(50));
    console.log("✅ All tests completed");
}

// Run tests if this file is executed directly
if (require.main === module) {
    runAllTests().catch(console.error);
}

module.exports = {
    testHealthCheck,
    testStats,
    testToggleAugmentation,
    testImageUpload,
    testImageSearch,
    testRebuildEmbeddings,
    runAllTests
};
