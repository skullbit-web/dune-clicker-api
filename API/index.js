import { get, set } from "@vercel/edge-config";

const LEADERBOARD_KEY = "leaderboard";

/**
 * Node.js Serverless function for Vercel
 * GET  /api/leaderboard  -> returns sorted leaderboard
 * POST /api/submit       -> submit new score
 */
export default async function handler(req, res) {
  const path = req.url.split("/api")[1]; // "/leaderboard" or "/submit"

  if (req.method === "GET" && path === "/leaderboard") {
    try {
      const leaderboard = (await get(LEADERBOARD_KEY)) || [];
      const sorted = leaderboard.sort((a, b) => b.score - a.score).slice(0, 50);
      return res.status(200).json(sorted);
    } catch (err) {
      console.error("Error fetching leaderboard:", err);
      return res.status(500).json({ error: "Failed to fetch leaderboard" });
    }
  }

  if (req.method === "POST" && path === "/submit") {
    try {
      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      const { name, score } = body;

      if (!name || typeof score !== "number") {
        return res.status(400).json({ error: "Invalid payload" });
      }

      const cleanName = name.trim().substring(0, 20).replace(/[^a-zA-Z0-9 _-]/g, "");

      if (score < 0 || score > 1_000_000) {
        return res.status(400).json({ error: "Invalid score range" });
      }

      const ip = req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown";
      const now = Date.now();
      if (!global.rateLimit) global.rateLimit = {};
      const lastSubmit = global.rateLimit[ip] || 0;
      if (now - lastSubmit < 5000) {
        return res.status(429).json({ error: "Too many submissions" });
      }
      global.rateLimit[ip] = now;

      const leaderboard = (await get(LEADERBOARD_KEY)) || [];
      leaderboard.push({ name: cleanName, score, time: now });
      leaderboard.sort((a, b) => b.score - a.score);
      const trimmed = leaderboard.slice(0, 100);
      await set(LEADERBOARD_KEY, trimmed);

      return res.status(200).json({ message: "Score submitted" });
    } catch (err) {
      console.error("Submit error:", err);
      return res.status(500).json({ error: "Server error" });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}

// ✅ Use Node.js 20
export const config = {
  runtime: "nodejs20.x"
};
