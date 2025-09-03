const { computeDHashHex, computeTileDHashes, computeOverlappingTileDHashes } = require("../utils/imageHash");

function hammingDistanceHex(hex1, hex2) {
    const b1 = Buffer.from(hex1, "hex");
    const b2 = Buffer.from(hex2, "hex");
    const len = Math.min(b1.length, b2.length);
    let dist = 0;
    for (let i = 0; i < len; i++) {
        let x = b1[i] ^ b2[i];
        while (x) {
            dist += x & 1;
            x >>= 1;
        }
    }
    if (b1.length !== b2.length) {
        const longer = b1.length > b2.length ? b1 : b2;
        for (let i = len; i < longer.length; i++) {
            let x = longer[i];
            while (x) {
                dist += x & 1;
                x >>= 1;
            }
        }
    }
    return dist;
}

module.exports = {
    computeDHashHex,
    computeTileDHashes,
    computeOverlappingTileDHashes,
    hammingDistanceHex,
};
