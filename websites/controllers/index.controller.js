import createHttpError from "http-errors";
import { extractFeaturesFromFile } from "../services/features.js";
import database from "../config/database.js";
import { bufToF32, chiSquare, l2 } from "../utils/helper.js";

export default {
    get: (request, response, next) => {
        response.render("index", { title: "Express" });
    },

    search: async (request, response, next) => {
        try {
            if (!request.file) return next(createHttpError(400, "No file uploaded"));

            const reqId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
            const t0 = Date.now();
            console.info(`[search ${reqId}] start file=${request.file.originalname} path=${request.file.path}`);

            const tExtract0 = Date.now();
            const feats = await extractFeaturesFromFile(request.file.path);
            const tExtract = Date.now() - tExtract0;
            const hue = feats.dominant_hue_bin;
            const bucket = feats.aspect_ratio_bucket;
            console.info(`[search ${reqId}] features hueBin=${hue} arBucket=${bucket} size=${feats.width}x${feats.height} extract=${tExtract}ms`);

            const params = [bucket, hue, (hue + 1) % 36, (hue + 2) % 36, (hue + 35) % 36, (hue + 34) % 36];
            // Use shared pool instead of request.db (not attached)
            const tDb0 = Date.now();
            let [rows] = await database.execute(
                `SELECT i.id, i.storage_path, f.hsv_hist, f.thirds_grid_3x3, f.edge_orient_hist
                FROM images i JOIN image_features f ON f.image_id=i.id
                WHERE i.aspect_ratio_bucket = ? 
                AND (i.dominant_hue = ? OR i.dominant_hue = ? OR i.dominant_hue = ? OR i.dominant_hue = ? OR i.dominant_hue = ?)
                ORDER BY i.created_at DESC
                LIMIT 1500`,
                params
            );
            const tDb1 = Date.now();
            console.info(`[search ${reqId}] candidates stageA=${rows?.length ?? 0} db=${tDb1 - tDb0}ms`);

            if (!rows || rows.length === 0) {
                // Fallback 1: relax aspect ratio constraint, widen hue window
                const hueSet = new Set([hue]);
                for (let d = 1; d <= 3; d++) {
                    hueSet.add((hue + d) % 36);
                    hueSet.add((hue + 36 - d) % 36);
                }
                const hues = Array.from(hueSet);
                const placeholders = hues.map(() => "?").join(",");
                const sql = `SELECT i.id, i.storage_path, f.hsv_hist, f.thirds_grid_3x3, f.edge_orient_hist
                    FROM images i JOIN image_features f ON f.image_id=i.id
                    WHERE i.dominant_hue IN (${placeholders})
                    ORDER BY i.created_at DESC
                    LIMIT 2000`;
                const tDbF10 = Date.now();
                const [r2] = await database.execute(sql, hues);
                const tDbF11 = Date.now();
                console.info(`[search ${reqId}] fallback1 candidates=${r2?.length ?? 0} db=${tDbF11 - tDbF10}ms`);
                rows = r2;
            }

            if (!rows || rows.length === 0) {
                // Fallback 2: take most recent images
                const tDbF20 = Date.now();
                const [r3] = await database.execute(
                    `SELECT i.id, i.storage_path, f.hsv_hist, f.thirds_grid_3x3, f.edge_orient_hist
                     FROM images i JOIN image_features f ON f.image_id=i.id
                     ORDER BY i.created_at DESC
                     LIMIT 1000`
                );
                const tDbF21 = Date.now();
                console.info(`[search ${reqId}] fallback2 candidates=${r3?.length ?? 0} db=${tDbF21 - tDbF20}ms`);
                rows = r3;
            }

            const qHist = bufToF32(feats.hsv_hist);
            const qThirds = bufToF32(feats.thirds_grid_3x3);
            const qEdge = bufToF32(feats.edge_orient_hist);

            const tScore0 = Date.now();
            const scored = (rows || [])
                .map((r) => {
                    const h = bufToF32(r.hsv_hist);
                    const t = bufToF32(r.thirds_grid_3x3);
                    const e = bufToF32(r.edge_orient_hist);

                    const colorSim = 1 / (1 + chiSquare(qHist, h));
                    const thirdsSim = 1 / (1 + l2(qThirds, t));
                    const edgeSim = 1 / (1 + l2(qEdge, e));

                    const score = 0.55 * colorSim + 0.25 * thirdsSim + 0.2 * edgeSim;
                    return { id: r.id, storage_path: r.storage_path, score, parts: { colorSim, thirdsSim, edgeSim } };
                })
                .sort((a, b) => b.score - a.score)
                .slice(0, 30);
            const tScore = Date.now() - tScore0;

            const queryPath = "/" + request.file.path.replace(/^public[\\/]/, "").replace(/\\/g, "/");
            const total = Date.now() - t0;
            console.info(`[search ${reqId}] done finalCandidates=${rows?.length ?? 0} topK=${scored.length} times extract=${tExtract}ms score=${tScore}ms total=${total}ms`);
            response.render("results", { items: scored, queryPath });
        } catch (err) {
            next(err);
        }
    },
};
