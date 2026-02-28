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
const scraperCache = new Map();

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

function normalizeText(value) {
  return (value || "").replace(/\s+/g, " ").trim();
}

function decodeHtml(value) {
  return normalizeText(
    value
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
      .replace(/<[^>]+>/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
  );
}

function tagValue(block, tagNames) {
  for (const tag of tagNames) {
    const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
    const match = block.match(regex);
    if (match?.[1]) return decodeHtml(match[1]);
  }
  return "";
}

function canonicalUrl(raw) {
  try {
    const url = new URL(raw);
    url.hash = "";
    return url.toString();
  } catch {
    return raw || "";
  }
}

function normalizeDate(raw) {
  if (!raw) return null;
  const value = raw.trim();
  if (/^\d{8}T\d{6}Z$/.test(value)) {
    const y = value.slice(0, 4);
    const m = value.slice(4, 6);
    const d = value.slice(6, 8);
    const hh = value.slice(9, 11);
    const mm = value.slice(11, 13);
    const ss = value.slice(13, 15);
    return new Date(`${y}-${m}-${d}T${hh}:${mm}:${ss}Z`).toISOString();
  }
  if (/^\d{8}$/.test(value)) {
    const y = value.slice(0, 4);
    const m = value.slice(4, 6);
    const d = value.slice(6, 8);
    return new Date(`${y}-${m}-${d}T00:00:00`).toISOString();
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function inferType(text) {
  const t = text.toLowerCase();
  if (/(volunteer|volunteering|serve|community service)/.test(t)) return "volunteer";
  if (/(food bank|food pantry|meal distribution|food assistance)/.test(t)) return "foodbank";
  if (/(donation|donate|fundraiser|drive)/.test(t)) return "donation";
  if (/(workshop|bootcamp|training)/.test(t)) return "workshop";
  if (/(class|course|lecture|seminar)/.test(t)) return "class";
  if (/(networking|career fair|meetup|professional)/.test(t)) return "networking";
  if (/(support group|peer support)/.test(t)) return "support_group";
  if (/(clinic|health screening|medical)/.test(t)) return "clinic";
  if (/(legal aid|pro bono|legal clinic|law center)/.test(t)) return "legal_aid";
  if (/(shelter|housing support|homeless)/.test(t)) return "shelter";
  if (/(resource center|community center|service center)/.test(t)) return "resource_center";
  return "event";
}

function inferAudience(text) {
  const t = text.toLowerCase();
  if (/(student|campus|university|college)/.test(t)) return "student";
  if (/(professional|career|industry|executive|workforce)/.test(t)) return "professional";
  if (/(family|kids|children|parents)/.test(t)) return "families";
  if (/(senior|older adult|retiree)/.test(t)) return "seniors";
  return "general";
}

function inferOrgCategory(text) {
  const t = text.toLowerCase();
  if (/(shelter|housing support|homeless)/.test(t)) return "shelter";
  if (/(legal aid|pro bono|legal clinic)/.test(t)) return "legal_aid";
  if (/(clinic|health center|medical)/.test(t)) return "free_clinic";
  if (/(law office|attorney|lawyer)/.test(t)) return "lawyer";
  if (/(food pantry|food assistance|meal)/.test(t)) return "food_assistance";
  if (/(resource center|community center|support services|crisis|immigration|domestic violence)/.test(t)) return "resource_center";
  return "other";
}

function parseRssOrAtom(xml, sourceName, sourceUrl) {
  const rssItems = xml.match(/<item[\s\S]*?<\/item>/gi) || [];
  const atomEntries = xml.match(/<entry[\s\S]*?<\/entry>/gi) || [];
  const blocks = rssItems.length ? rssItems : atomEntries;

  return blocks.map((block, idx) => {
    const title = tagValue(block, ["title"]) || `${sourceName} Listing ${idx + 1}`;
    const descriptionRaw = tagValue(block, ["description", "summary", "content"]);
    const linkTag = block.match(/<link[^>]*href="([^"]+)"/i)?.[1] || tagValue(block, ["link"]);
    const sourceLink = canonicalUrl(linkTag || sourceUrl);
    const start = normalizeDate(tagValue(block, ["pubDate", "updated", "dc:date", "published", "startDate", "dtstart"]));
    const locationName = tagValue(block, ["location", "venue", "address"]);
    const tagsRaw = tagValue(block, ["category", "tags"]);
    const organizer = tagValue(block, ["author", "organizer"]);
    const combined = `${title} ${descriptionRaw} ${tagsRaw} ${organizer} ${sourceName}`;
    const type = inferType(combined);
    const audience = inferAudience(combined);

    return {
      id: sourceLink || `${sourceName}-${idx}`,
      title,
      type,
      audience,
      date_start: start,
      date_end: null,
      date_unknown: !start,
      location_name: locationName || "Not listed",
      address: "Not listed",
      lat: null,
      lon: null,
      distance_miles: null,
      organizer: organizer || "Not listed",
      description: descriptionRaw || "Not listed",
      accessibility_notes: "Not listed",
      source_name: sourceName,
      source_url: sourceLink,
      confidence: {
        overall: start ? "medium" : "low",
        date: start ? "Parsed from feed date field" : "Date not listed in feed",
        location: locationName ? "Parsed from feed location field" : "Location not listed in feed",
        type: "Rule-based keyword classification"
      },
      needs_review: audience === "general" || type === "event",
      tags_raw: tagsRaw || "",
      description_raw: descriptionRaw || "",
      fieldOfStudy: "",
      academicLevel: "any",
      careerFocus: "any",
      industry: "",
      seniorityLevel: "",
      networkingVsTraining: ""
    };
  });
}

function parseIcs(text, sourceName, sourceUrl) {
  const events = text.match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/g) || [];
  return events.map((eventBlock, idx) => {
    const pick = (field) => {
      const match = eventBlock.match(new RegExp(`^${field}[^:]*:(.*)$`, "mi"));
      return normalizeText(match?.[1] || "");
    };
    const title = pick("SUMMARY") || `${sourceName} Event ${idx + 1}`;
    const descriptionRaw = pick("DESCRIPTION");
    const locationName = pick("LOCATION");
    const organizer = pick("ORGANIZER").replace(/^mailto:/i, "");
    const link = canonicalUrl(pick("URL") || sourceUrl);
    const start = normalizeDate(pick("DTSTART"));
    const end = normalizeDate(pick("DTEND"));
    const combined = `${title} ${descriptionRaw} ${locationName} ${organizer}`;
    const type = inferType(combined);
    const audience = inferAudience(combined);

    return {
      id: link || `${sourceName}-ics-${idx}`,
      title,
      type,
      audience,
      date_start: start,
      date_end: end,
      date_unknown: !start,
      location_name: locationName || "Not listed",
      address: "Not listed",
      lat: null,
      lon: null,
      distance_miles: null,
      organizer: organizer || "Not listed",
      description: descriptionRaw || "Not listed",
      accessibility_notes: "Not listed",
      source_name: sourceName,
      source_url: link,
      confidence: {
        overall: start ? "high" : "medium",
        date: start ? "Parsed from ICS DTSTART/DTEND" : "No parseable DTSTART",
        location: locationName ? "Parsed from ICS LOCATION" : "No location field",
        type: "Rule-based keyword classification"
      },
      needs_review: audience === "general" || type === "event",
      tags_raw: "",
      description_raw: descriptionRaw || "",
      fieldOfStudy: "",
      academicLevel: "any",
      careerFocus: "any",
      industry: "",
      seniorityLevel: "",
      networkingVsTraining: ""
    };
  });
}

function dedupeItems(items) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const day = item.date_start ? item.date_start.slice(0, 10) : "unknown";
    const key = item.source_url
      ? `url:${canonicalUrl(item.source_url)}`
      : `${normalizeText(item.title).toLowerCase()}|${normalizeText(item.location_name).toLowerCase()}|${day}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function sourcesFromEnv() {
  const raw = process.env.SCRAPER_SOURCES || "";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((entry) => {
      const [name, url] = entry.split("|").map((p) => p?.trim());
      return {
        name: name || "Source",
        url: url || name,
      };
    })
    .filter((s) => /^https?:\/\//i.test(s.url));
}

async function scrapeSources(query) {
  const cacheKey = normalizeText(query).toLowerCase() || "all";
  const cached = scraperCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.payload;
  }

  const sources = sourcesFromEnv();
  if (sources.length === 0) {
    return {
      results: [],
      organizations: [],
      notes: [
        "No scraper sources configured. Set SCRAPER_SOURCES in .env as Name|https://feed.url entries.",
        "Suggested sources: city events calendar RSS, university calendar ICS, nonprofit/community center feeds."
      ],
      sourceCount: 0,
    };
  }

  const timeoutMs = Number(process.env.SCRAPER_TIMEOUT_MS || 10000);
  const allFetches = await Promise.allSettled(
    sources.map(async (source) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(source.url, {
          signal: controller.signal,
          headers: { "User-Agent": "CommunitreeScraper/1.0 (+respectful-rate-limit)" },
        });
        if (!response.ok) return [];
        const body = await response.text();
        if (/BEGIN:VCALENDAR/i.test(body)) {
          return parseIcs(body, source.name, source.url);
        }
        if (/<rss|<feed|<item|<entry/i.test(body)) {
          return parseRssOrAtom(body, source.name, source.url);
        }
        return [];
      } catch {
        return [];
      } finally {
        clearTimeout(timeout);
      }
    })
  );

  const flattened = allFetches
    .filter((r) => r.status === "fulfilled")
    .flatMap((r) => r.value || []);

  const deduped = dedupeItems(flattened);
  const organizations = deduped
    .filter((item) => ["legal_aid", "clinic", "shelter", "resource_center", "foodbank", "donation"].includes(item.type))
    .slice(0, 50)
    .map((item) => ({
      name: item.organizer && item.organizer !== "Not listed" ? item.organizer : item.title,
      category: inferOrgCategory(`${item.title} ${item.description} ${item.location_name}`),
      address: item.address || "Not listed",
      phone: "Not listed",
      hours: "Not listed",
      services: [item.type.replace("_", " ")],
      eligibility: "Not listed",
      source_url: item.source_url,
      distance_miles: item.distance_miles ?? null,
    }));

  const payload = {
    results: deduped,
    organizations,
    notes: [
      `Deterministic scraper fallback used (${sources.length} configured sources, ${deduped.length} deduplicated listings).`,
      "Classification is rule-based; review items marked needs_review."
    ],
    sourceCount: sources.length,
  };

  scraperCache.set(cacheKey, {
    expiresAt: Date.now() + 15 * 60 * 1000,
    payload,
  });
  return payload;
}

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
    let items;
    if (tab === 'all') {
      items = db.prepare("SELECT * FROM community_items").all();
    } else {
      items = db.prepare("SELECT * FROM community_items WHERE type = ?").all(tab.replace(/s$/, ''));
    }
    const normalizedItems = items.map((item) => {
      let parsedServices = null;
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

  app.post("/api/scrape-fallback", async (req, res) => {
    const { query, location } = req.body || {};
    const scraped = await scrapeSources(query || "");
    res.json({
      query_context: {
        user_location: {
          lat: location?.latitude ?? null,
          lon: location?.longitude ?? null,
          city: "Unknown",
        },
        radius_miles: 25,
        date_range: {
          start: new Date().toISOString(),
          end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        },
        generated_at: new Date().toISOString(),
      },
      ui_settings: {
        appearance: "system",
        accent_preset: "failover",
        accent_custom_hex: "#5A5A40",
        high_contrast_mode: false,
        large_text_mode: false,
        reduced_motion: false,
      },
      results: scraped.results,
      organizations: scraped.organizations,
      notes: scraped.notes,
    });
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
    } catch (error) {
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
