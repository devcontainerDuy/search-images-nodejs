function md5(buffer) {
    const crypto = require("crypto");
    return crypto.createHash("md5").update(buffer).digest("hex");
}

async function getDimensions(filePath) {
    // Prefer fast image-size probing without full decode
    try {
        const sizeOf = require("image-size");
        const dim = sizeOf(filePath);
        return { width: dim.width || 0, height: dim.height || 0 };
    } catch (e) {
        return { width: 0, height: 0 };
    }
}

function generateFakeTitle(originalName) {
    const base = (originalName || "image")
        .replace(/\.[^.]+$/, "")
        .replace(/[^a-zA-Z0-9-_]+/g, " ")
        .trim();
    const stamp = new Date().toISOString().replace(/[:T]/g, "-").split(".")[0];
    return `${base || "Image"} ${stamp}`;
}

module.exports = { md5, getDimensions, generateFakeTitle };
