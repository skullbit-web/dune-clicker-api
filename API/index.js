import { get, set } from "@vercel/edge-config";

const LEADERBOARD_KEY = "leaderboard";

/**
 * Node.js Serverless function for Vercel
 * Routes:
 *   GET  /api/leaderboard  -> returns sorted leaderboard
 *   POST /api/submit       -> submit new score
 */
export default async function handler(req, res) {
  const url = req.url || "";
  
  if (req.method === "GET" && url.endsWith("/leaderboard")) {
    try {
      const leaderboard = (await get(LEADERBOARD_KEY)) || [];
      const sorted = leaderboard.sort((a, b) => b.score - a.score).slice(0, 50);
      return res.status(200).json(sorted);
    } catch (err) {
      console.error("Error fetching leaderboard:", err);
      return res.status(500).json({ error: "Failed to fetch leaderboard" });
    }
  }

  if (req.method === "POST" && url.endsWith("/submit")) {
    try {
      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      const { name, score } = body;

      // ✅ Validate input
      if (!name || typeof score !== "number") {
        return res.status(400).json({ error: "Invalid payload" });
      }

      // ✅ Sanitization
      const cleanName = name.trim().substring(0, 20).replace(/[^a-zA-Z0-9 _-]/g, "");

      // ✅ Basic anti-cheat: limit score range
      if (score < 0 || score > 1_000_000) {
        return res.status(400).json({ error: "Invalid score range" });
      }

      // ✅ Rate-limit by IP (simple in-memory)
      const ip = req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown";
      const now = Date.now();
      if (!global.rateLimit) global.rateLimit = {};
      const lastSubmit = global.rateLimit[ip] || 0;
      if (now - lastSubmit < 5000) {
        return res.status(429).json({ error: "Too many submissions" });
      }
      global.rateLimit[ip] = now;

      // ✅ Get leaderboard
      const leaderboard = (await get(LEADERBOARD_KEY)) || [];

      // ✅ Push new score
      leaderboard.push({ name: cleanName, score, time: now });

      // ✅ Keep top 100 only
      leaderboard.sort((a, b) => b.score - a.score);
      const trimmed = leaderboard.slice(0, 100);

      // ✅ Save back to Edge Config
      await set(LEADERBOARD_KEY, trimmed);

      return res.status(200).json({ message: "Score submitted" });
    } catch (err) {
      console.error("Submit error:", err);
      return res.status(500).json({ error: "Server error" });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}

export const config = {
  runtime: "nodejs16.x" // ✅ Node.js runtime
};
