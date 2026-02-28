import express from "express";
import { createServer as createViteServer } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import OpenAI from "openai";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database("community.db");

// Initialize database
db.exec(`
  CREATE TABLE IF NOT EXISTS community_items (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    location_name TEXT,
    address TEXT,
    date_start TEXT,
    date_end TEXT,
    date_unknown INTEGER,
    type TEXT,
    audience TEXT,
    latitude REAL,
    longitude REAL,
    distance_miles REAL,
    organizer TEXT,
    accessibility_notes TEXT,
    source_name TEXT,
    source_url TEXT,
    confidence_overall TEXT,
    confidence_date TEXT,
    confidence_location TEXT,
    confidence_type TEXT,
    needs_review INTEGER,
    category TEXT,
    phone TEXT,
    hours TEXT,
    services TEXT,
    eligibility TEXT,
    fieldOfStudy TEXT,
    academicLevel TEXT,
    careerFocus TEXT,
    industry TEXT,
    seniorityLevel TEXT,
    networkingVsTraining TEXT,
    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS search_cache (
    tab TEXT PRIMARY KEY,
    summary TEXT,
    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT || 3000);

  app.use(express.json());
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  // API Routes
  app.get("/api/items/:tab", (req, res) => {
    const { tab } = req.params;
    let items: any[];
    if (tab === 'all') {
      items = db.prepare("SELECT * FROM community_items").all();
    } else {
      items = db.prepare("SELECT * FROM community_items WHERE type = ?").all(tab.replace(/s$/, ''));
    }
    const normalizedItems = items.map((item) => {
      let parsedServices: string[] | null = null;
      if (typeof item.services === "string" && item.services.trim()) {
        try {
          const parsed = JSON.parse(item.services);
          parsedServices = Array.isArray(parsed) ? parsed : null;
        } catch {
          parsedServices = null;
        }
      } else if (Array.isArray(item.services)) {
        parsedServices = item.services;
      }

      return {
        ...item,
        description: item.description || "",
        services: parsedServices,
        date_unknown: Boolean(item.date_unknown),
        needs_review: Boolean(item.needs_review),
      };
    });
    const cache = db.prepare("SELECT summary FROM search_cache WHERE tab = ?").get(tab);
    res.json({ items: normalizedItems, summary: cache?.summary || "" });
  });

  app.post("/api/items", (req, res) => {
    const { items, organizations, summary, tab } = req.body;
    
    const insertItem = db.prepare(`
      INSERT OR REPLACE INTO community_items (
        id, title, description, location_name, address, date_start, date_end, date_unknown,
        type, audience, latitude, longitude, distance_miles, organizer, accessibility_notes,
        source_name, source_url, confidence_overall, confidence_date, confidence_location,
        confidence_type, needs_review, category, phone, hours, services, eligibility,
        fieldOfStudy, academicLevel, careerFocus, industry, seniorityLevel, networkingVsTraining
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const transaction = db.transaction((list) => {
      for (const item of list) {
        insertItem.run(
          item.id || item.name || Math.random().toString(36).substr(2, 9),
          item.title || item.name,
          item.description || "",
          item.location_name || "",
          item.address || "",
          item.date_start || null,
          item.date_end || null,
          item.date_unknown ? 1 : 0,
          item.type || "organization",
          item.audience || "general",
          item.lat || item.latitude || null,
          item.lon || item.longitude || null,
          item.distance_miles || null,
          item.organizer || null,
          item.accessibility_notes || null,
          item.source_name || null,
          item.source_url || null,
          item.confidence?.overall || null,
          item.confidence?.date || null,
          item.confidence?.location || null,
          item.confidence?.type || null,
          item.needs_review ? 1 : 0,
          item.category || null,
          item.phone || null,
          item.hours || null,
          item.services ? JSON.stringify(item.services) : null,
          item.eligibility || null,
          item.fieldOfStudy || null,
          item.academicLevel || null,
          item.careerFocus || null,
          item.industry || null,
          item.seniorityLevel || null,
          item.networkingVsTraining || null
        );
      }
    });

    const allItems = [...(items || []), ...(organizations || [])];
    transaction(allItems);

    db.prepare("INSERT OR REPLACE INTO search_cache (tab, summary, last_updated) VALUES (?, ?, CURRENT_TIMESTAMP)")
      .run(tab, summary);

    res.json({ status: "ok" });
  });

  app.delete("/api/cache", (req, res) => {
    db.prepare("DELETE FROM community_items").run();
    db.prepare("DELETE FROM search_cache").run();
    res.json({ status: "ok" });
  });

  app.post("/api/openai-failover", async (req, res) => {
    const { query, location } = req.body;
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ error: "OpenAI API key not configured" });
    }

    const openai = new OpenAI({ apiKey });

    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `You are a community discovery assistant. Return ONLY valid JSON.

            Use deterministic/grounded sourcing first and AI for cleanup/classification only.
            Do not invent details. Keep source_url for every listing.
            If uncertain, set audience="general" and needs_review=true.
            Keep descriptions to 1-3 sentences.

            RESPONSE FORMAT (JSON):
            {
              "query_context": {
                "user_location": {"lat": number, "lon": number, "city": "string"},
                "radius_miles": number,
                "date_range": {"start": "ISO8601", "end": "ISO8601"},
                "generated_at": "ISO8601"
              },
              "ui_settings": {
                "appearance": "system|light|dark",
                "accent_preset": "failover|carolina_blue|custom",
                "accent_custom_hex": "#RRGGBB",
                "high_contrast_mode": boolean,
                "large_text_mode": boolean,
                "reduced_motion": boolean
              },
              "results": [
                {
                  "title": "string",
                  "type": "event|volunteer|foodbank|donation|class|workshop|networking|support_group|clinic|legal_aid|shelter|resource_center",
                  "audience": "student|professional|general|families|seniors",
                  "date_start": "ISO8601|null",
                  "date_end": "ISO8601|null",
                  "date_unknown": boolean,
                  "location_name": "string",
                  "address": "string",
                  "lat": "number|null",
                  "lon": "number|null",
                  "distance_miles": "number|null",
                  "organizer": "string",
                  "description": "string",
                  "accessibility_notes": "string",
                  "source_name": "string",
                  "source_url": "string",
                  "confidence": {"overall": "high|medium|low", "date": "string", "location": "string", "type": "string"},
                  "needs_review": boolean
                }
              ],
              "organizations": [
                {
                  "name": "string",
                  "category": "shelter|legal_aid|free_clinic|lawyer|food_assistance|resource_center|other",
                  "address": "string",
                  "phone": "string",
                  "hours": "string",
                  "services": ["string"],
                  "eligibility": "string",
                  "source_url": "string",
                  "distance_miles": "number|null"
                }
              ],
              "notes": ["gaps/limitations and which sources were used"]
            }

            If no results are found, provide notes suggesting best next sources (city calendar, university calendars, nonprofit pages) and recommend widening radius/date range.

            Current Location: ${location ? `${location.latitude}, ${location.longitude}` : 'Unknown'}.
            Current Time: ${new Date().toISOString()}.`
          },
          {
            role: "user",
            content: query
          }
        ],
        response_format: { type: "json_object" }
      });

      const result = JSON.parse(completion.choices[0].message.content || "{}");
      res.json(result);
    } catch (error: any) {
      console.error("OpenAI Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    try {
      const vite = await createViteServer({
        configFile: false,
        plugins: [react(), tailwindcss()],
        define: {
          "process.env.GEMINI_API_KEY": JSON.stringify(process.env.GEMINI_API_KEY || ""),
        },
        server: { middlewareMode: true },
        appType: "spa",
      });
      app.use(vite.middlewares);
    } catch (error) {
      console.error("Vite middleware init failed, falling back to dist if available:", error);
      const distPath = path.join(__dirname, "dist");
      const distIndexPath = path.join(distPath, "index.html");
      if (fs.existsSync(distIndexPath)) {
        app.use(express.static(distPath));
        app.get("*", (_req, res) => {
          res.sendFile(distIndexPath);
        });
      } else {
        app.get("*", (_req, res) => {
          res.status(500).send("Dev middleware failed and dist/ is missing. Run npm run build or use Node >= 22.12.");
        });
      }
    }
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
