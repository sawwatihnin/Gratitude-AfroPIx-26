import express from "express";
import { createServer as createViteServer } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";
import OpenAI from "openai";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database("community.db");
const scraperCache = new Map();
const geocodeCache = new Map();
const CURRENT_USER_ID = "user_me";

const simulatedProfiles = [
  {
    user_id: "user_me",
    display_name: "You",
    audience_type: "general",
    location: { lat: 35.9132, lon: -79.0558, region: "Chapel Hill, NC" },
    field_of_study: "",
    academic_level: "any",
    graduation_year: null,
    industry: "",
    job_title: "",
    experience_level: "entry",
    skills: ["community outreach", "event planning", "volunteering"],
    interests: ["food banks", "career growth", "networking"],
    organization_memberships: ["Orange County Volunteers"],
    availability: "weekends",
    event_participation_history: ["volunteer", "networking"],
    bio: "Local community member looking to connect and collaborate.",
    profile_color_theme: "#5A5A40",
    joined_date: "2026-01-15T12:00:00.000Z",
    last_active: "2026-02-28T18:00:00.000Z",
    profile_visibility: "public",
    messaging_permission: "anyone",
    location_visibility: "exact_distance",
  },
  {
    user_id: "user_anna",
    display_name: "Anna Kim",
    audience_type: "student",
    location: { lat: 35.9096, lon: -79.0512, region: "Chapel Hill, NC" },
    field_of_study: "Computer Science",
    academic_level: "undergrad",
    graduation_year: 2027,
    industry: "",
    job_title: "",
    experience_level: "entry",
    skills: ["python", "frontend", "tutoring"],
    interests: ["hackathons", "food banks", "study groups"],
    organization_memberships: ["UNC Tech Club"],
    availability: "evenings",
    event_participation_history: ["class", "volunteer"],
    bio: "CS student who likes building tools for local nonprofits.",
    profile_color_theme: "#4B9CD3",
    joined_date: "2026-02-01T10:00:00.000Z",
    last_active: "2026-02-28T17:45:00.000Z",
    profile_visibility: "public",
    messaging_permission: "nearby_users",
    location_visibility: "exact_distance",
  },
  {
    user_id: "user_mike",
    display_name: "Mike Torres",
    audience_type: "professional",
    location: { lat: 35.9940, lon: -78.8986, region: "Durham, NC" },
    field_of_study: "",
    academic_level: "any",
    graduation_year: null,
    industry: "Technology",
    job_title: "Software Engineer",
    experience_level: "mid",
    skills: ["backend", "cloud", "mentoring"],
    interests: ["networking", "career fairs", "open source"],
    organization_memberships: ["Triangle Devs"],
    availability: "weeknights",
    event_participation_history: ["networking", "workshop"],
    bio: "Tech professional interested in mentorship and civic projects.",
    profile_color_theme: "#2E7D32",
    joined_date: "2026-01-05T09:00:00.000Z",
    last_active: "2026-02-28T16:30:00.000Z",
    profile_visibility: "public",
    messaging_permission: "anyone",
    location_visibility: "approximate_area",
  },
  {
    user_id: "user_sara",
    display_name: "Sara Patel",
    audience_type: "professional",
    location: { lat: 35.7796, lon: -78.6382, region: "Raleigh, NC" },
    field_of_study: "",
    academic_level: "any",
    graduation_year: null,
    industry: "Healthcare",
    job_title: "Program Manager",
    experience_level: "senior",
    skills: ["operations", "fundraising", "community health"],
    interests: ["clinics", "domestic violence resources", "volunteering"],
    organization_memberships: ["NC Care Network"],
    availability: "weekends",
    event_participation_history: ["clinic", "support_group"],
    bio: "Building health access programs across the Triangle.",
    profile_color_theme: "#D97706",
    joined_date: "2025-12-10T08:30:00.000Z",
    last_active: "2026-02-27T22:15:00.000Z",
    profile_visibility: "nearby_only",
    messaging_permission: "connections_only",
    location_visibility: "exact_distance",
  },
  {
    user_id: "user_jamal",
    display_name: "Jamal Reed",
    audience_type: "general",
    location: { lat: 35.9251, lon: -79.0370, region: "Chapel Hill, NC" },
    field_of_study: "",
    academic_level: "any",
    graduation_year: null,
    industry: "",
    job_title: "",
    experience_level: "entry",
    skills: ["volunteer coordination", "logistics"],
    interests: ["food assistance", "shelters", "resource centers"],
    organization_memberships: ["Triangle Food Relief"],
    availability: "mornings",
    event_participation_history: ["foodbank", "donation"],
    bio: "Volunteer organizer focused on food and shelter access.",
    profile_color_theme: "#3B82F6",
    joined_date: "2026-01-22T14:00:00.000Z",
    last_active: "2026-02-28T15:10:00.000Z",
    profile_visibility: "public",
    messaging_permission: "nearby_users",
    location_visibility: "exact_distance",
  },
  {
    user_id: "user_emily",
    display_name: "Emily Chen",
    audience_type: "student",
    location: { lat: 35.9980, lon: -78.9400, region: "Durham, NC" },
    field_of_study: "Public Policy",
    academic_level: "grad",
    graduation_year: 2026,
    industry: "",
    job_title: "",
    experience_level: "entry",
    skills: ["research", "policy writing", "community engagement"],
    interests: ["legal aid", "advocacy", "workshops"],
    organization_memberships: ["Policy Student Association"],
    availability: "afternoons",
    event_participation_history: ["workshop", "legal_aid"],
    bio: "Grad student interested in legal aid and civic participation.",
    profile_color_theme: "#8B5CF6",
    joined_date: "2026-02-10T11:00:00.000Z",
    last_active: "2026-02-28T13:20:00.000Z",
    profile_visibility: "public",
    messaging_permission: "anyone",
    location_visibility: "hidden",
  },
  {
    user_id: "user_carlos",
    display_name: "Carlos Vega",
    audience_type: "professional",
    location: { lat: 35.8700, lon: -78.7800, region: "Morrisville, NC" },
    field_of_study: "",
    academic_level: "any",
    graduation_year: null,
    industry: "Technology",
    job_title: "Product Designer",
    experience_level: "mid",
    skills: ["ux", "facilitation", "design systems"],
    interests: ["networking", "workshops", "mentoring"],
    organization_memberships: ["Triangle Product Guild"],
    availability: "weeknights",
    event_participation_history: ["workshop", "networking"],
    bio: "Designer hosting portfolio review circles and meetup sessions.",
    profile_color_theme: "#06B6D4",
    joined_date: "2026-01-28T09:15:00.000Z",
    last_active: "2026-02-28T12:00:00.000Z",
    profile_visibility: "public",
    messaging_permission: "anyone",
    location_visibility: "approximate_area",
  },
  {
    user_id: "user_nina",
    display_name: "Nina Foster",
    audience_type: "general",
    location: { lat: 35.9130, lon: -79.0700, region: "Chapel Hill, NC" },
    field_of_study: "",
    academic_level: "any",
    graduation_year: null,
    industry: "",
    job_title: "",
    experience_level: "entry",
    skills: ["outreach", "event hosting"],
    interests: ["families", "resource centers", "support groups"],
    organization_memberships: ["Neighborhood Mutual Aid"],
    availability: "weekends",
    event_participation_history: ["support_group", "resource_center"],
    bio: "Community host for family support and local resource sharing.",
    profile_color_theme: "#EC4899",
    joined_date: "2026-02-05T16:45:00.000Z",
    last_active: "2026-02-28T14:40:00.000Z",
    profile_visibility: "nearby_only",
    messaging_permission: "nearby_users",
    location_visibility: "exact_distance",
  },
];

const simulatedConnectionKeys = new Set([
  ["user_me", "user_anna"].sort().join("|"),
  ["user_me", "user_mike"].sort().join("|"),
  ["user_me", "user_jamal"].sort().join("|"),
]);

const simulatedBlockKeys = new Set([
  "user_sara|user_me",
]);

const simulatedMessages = [
  {
    message_id: randomUUID(),
    sender_id: "user_anna",
    receiver_id: "user_me",
    timestamp: "2026-02-28T17:20:00.000Z",
    message_text: "Hey! Are you joining the volunteer orientation this weekend?",
    read_status: false,
  },
  {
    message_id: randomUUID(),
    sender_id: "user_me",
    receiver_id: "user_mike",
    timestamp: "2026-02-28T16:30:00.000Z",
    message_text: "Would love to connect about mentorship opportunities.",
    read_status: true,
  },
];

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
    retrieved_at TEXT,
    location_confidence TEXT,
    neighborhood TEXT,
    verified_source INTEGER,
    recommended_by_users INTEGER,
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
    primary_category TEXT,
    subcategory TEXT,
    ai_tags TEXT,
    relevance_score INTEGER,
    quality_score INTEGER,
    classification_confidence TEXT,
    low_relevance INTEGER,
    low_quality INTEGER,
    source_category TEXT,
    duplicate_of TEXT,
    user_reports INTEGER,
    report_types TEXT,
    classification_checked_at TEXT,
    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS search_cache (
    tab TEXT PRIMARY KEY,
    summary TEXT,
    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS geocode_cache (
    query TEXT PRIMARY KEY,
    lat REAL,
    lon REAL,
    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS translator_entities (
    id TEXT PRIMARY KEY,
    name TEXT,
    service_type TEXT,
    languages_supported TEXT,
    specializations TEXT,
    mode TEXT,
    cost TEXT,
    service_area TEXT,
    address TEXT,
    lat REAL,
    lon REAL,
    phone TEXT,
    email TEXT,
    website TEXT,
    hours TEXT,
    notes TEXT,
    source_name TEXT,
    source_url TEXT,
    retrieved_at TEXT,
    confidence_overall TEXT,
    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS newcomer_guides (
    id TEXT PRIMARY KEY,
    title TEXT,
    topic TEXT,
    language TEXT,
    format TEXT,
    summary TEXT,
    source_name TEXT,
    source_url TEXT,
    retrieved_at TEXT,
    local_relevance TEXT,
    confidence_overall TEXT,
    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS civics_elections (
    election_id TEXT PRIMARY KEY,
    name TEXT,
    country TEXT,
    state_or_region TEXT,
    county_or_district TEXT,
    city_or_locality TEXT,
    election_date TEXT,
    election_type TEXT,
    election_level TEXT,
    official_portal_name TEXT,
    official_portal_url TEXT,
    source_url TEXT,
    retrieved_at TEXT,
    ttl_hours INTEGER,
    last_verified_at TEXT,
    confidence_overall TEXT,
    needs_review INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS civics_candidates (
    candidate_id TEXT PRIMARY KEY,
    name TEXT,
    office_name TEXT,
    office_level TEXT,
    district TEXT,
    party_affiliation TEXT,
    incumbent INTEGER,
    official_website TEXT,
    social_links TEXT,
    highlights TEXT,
    connections TEXT,
    relevance_score INTEGER,
    classification_confidence TEXT,
    source_url TEXT,
    retrieved_at TEXT,
    ttl_hours INTEGER,
    last_verified_at TEXT,
    needs_review INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS civics_orgs (
    org_id TEXT PRIMARY KEY,
    name TEXT,
    category TEXT,
    address TEXT,
    lat REAL,
    lon REAL,
    phone TEXT,
    email TEXT,
    website TEXT,
    services TEXT,
    source_url TEXT,
    retrieved_at TEXT,
    ttl_hours INTEGER,
    last_verified_at TEXT,
    confidence_overall TEXT,
    needs_review INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS civics_eligibility (
    key TEXT PRIMARY KEY,
    country TEXT,
    state_or_region TEXT,
    checklist_items TEXT,
    official_tools TEXT,
    source_url TEXT,
    retrieved_at TEXT,
    ttl_hours INTEGER,
    last_verified_at TEXT,
    confidence_overall TEXT
  );
`);
try {
  db.prepare("ALTER TABLE community_items ADD COLUMN retrieved_at TEXT").run();
} catch {}
try {
  db.prepare("ALTER TABLE community_items ADD COLUMN location_confidence TEXT").run();
} catch {}
try {
  db.prepare("ALTER TABLE community_items ADD COLUMN neighborhood TEXT").run();
} catch {}
try {
  db.prepare("ALTER TABLE community_items ADD COLUMN verified_source INTEGER").run();
} catch {}
try {
  db.prepare("ALTER TABLE community_items ADD COLUMN recommended_by_users INTEGER").run();
} catch {}
try {
  db.prepare("ALTER TABLE community_items ADD COLUMN primary_category TEXT").run();
} catch {}
try {
  db.prepare("ALTER TABLE community_items ADD COLUMN subcategory TEXT").run();
} catch {}
try {
  db.prepare("ALTER TABLE community_items ADD COLUMN ai_tags TEXT").run();
} catch {}
try {
  db.prepare("ALTER TABLE community_items ADD COLUMN relevance_score INTEGER").run();
} catch {}
try {
  db.prepare("ALTER TABLE community_items ADD COLUMN quality_score INTEGER").run();
} catch {}
try {
  db.prepare("ALTER TABLE community_items ADD COLUMN classification_confidence TEXT").run();
} catch {}
try {
  db.prepare("ALTER TABLE community_items ADD COLUMN low_relevance INTEGER").run();
} catch {}
try {
  db.prepare("ALTER TABLE community_items ADD COLUMN low_quality INTEGER").run();
} catch {}
try {
  db.prepare("ALTER TABLE community_items ADD COLUMN source_category TEXT").run();
} catch {}
try {
  db.prepare("ALTER TABLE community_items ADD COLUMN duplicate_of TEXT").run();
} catch {}
try {
  db.prepare("ALTER TABLE community_items ADD COLUMN user_reports INTEGER").run();
} catch {}
try {
  db.prepare("ALTER TABLE community_items ADD COLUMN report_types TEXT").run();
} catch {}
try {
  db.prepare("ALTER TABLE community_items ADD COLUMN classification_checked_at TEXT").run();
} catch {}

function normalizeText(value) {
  return (value || "").replace(/\s+/g, " ").trim();
}

function isValidCoordinate(lat, lon) {
  if (lat == null || lon == null) return false;
  const nLat = Number(lat);
  const nLon = Number(lon);
  if (!Number.isFinite(nLat) || !Number.isFinite(nLon)) return false;
  if (nLat === 0 && nLon === 0) return false;
  return nLat >= -90 && nLat <= 90 && nLon >= -180 && nLon <= 180;
}

function normalizeCoordinates(lat, lon) {
  if (isValidCoordinate(lat, lon)) return { lat: Number(lat), lon: Number(lon) };
  if (lat != null && lon != null) {
    const swappedLat = Number(lon);
    const swappedLon = Number(lat);
    if (isValidCoordinate(swappedLat, swappedLon)) {
      return { lat: swappedLat, lon: swappedLon };
    }
  }
  return null;
}

function calculateDistanceMiles(lat1, lon1, lat2, lon2) {
  const R = 3958.8;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function isConnection(a, b) {
  return simulatedConnectionKeys.has([a, b].sort().join("|"));
}

function isBlocked(viewerId, otherId) {
  return simulatedBlockKeys.has(`${viewerId}|${otherId}`) || simulatedBlockKeys.has(`${otherId}|${viewerId}`);
}

function sharedValues(a = [], b = []) {
  const setB = new Set((b || []).map((v) => v.toLowerCase()));
  return (a || []).filter((v) => setB.has(v.toLowerCase()));
}

function normalizeGeocodeQuery(value) {
  return normalizeText(value || "").toLowerCase();
}

async function geocodeQuery(query) {
  const q = normalizeGeocodeQuery(query);
  if (!q) return null;
  if (geocodeCache.has(q)) return geocodeCache.get(q);

  const cached = db.prepare("SELECT lat, lon FROM geocode_cache WHERE query = ?").get(q);
  const normalizedCached = normalizeCoordinates(cached?.lat, cached?.lon);
  if (normalizedCached) {
    const result = { lat: normalizedCached.lat, lon: normalizedCached.lon, confidence: "medium" };
    geocodeCache.set(q, result);
    return result;
  }

  try {
    const params = new URLSearchParams({
      q,
      format: "jsonv2",
      limit: "1",
      addressdetails: "0",
    });
    const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
      headers: { "User-Agent": "GratitudeGeocoder/1.0 (+community map hydration)" },
    });
    if (!response.ok) return null;
    const results = await response.json();
    const first = Array.isArray(results) ? results[0] : null;
    if (!first?.lat || !first?.lon) return null;
    const normalized = normalizeCoordinates(first.lat, first.lon);
    if (!normalized) return null;
    const parsed = { lat: normalized.lat, lon: normalized.lon, confidence: "medium" };
    geocodeCache.set(q, parsed);
    db.prepare(
      "INSERT OR REPLACE INTO geocode_cache (query, lat, lon, last_updated) VALUES (?, ?, ?, CURRENT_TIMESTAMP)"
    ).run(q, parsed.lat, parsed.lon);
    return parsed;
  } catch {
    return null;
  }
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

function cleanListingText(value) {
  return normalizeText(
    String(value || "")
      .replace(/<[^>]*>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/[\u0000-\u001F\u007F]/g, " ")
  );
}

async function aiRepairListings(items) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || !Array.isArray(items) || items.length === 0) {
    return [];
  }

  const compact = items.slice(0, 60).map((item, index) => ({
    index,
    id: item.id || "",
    title: cleanListingText(item.title || item.name || ""),
    location_name: cleanListingText(item.location_name || ""),
    address: cleanListingText(item.address || ""),
    description: cleanListingText(item.description || ""),
  }));

  const openai = new OpenAI({ apiKey });
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You normalize community listing text. Do not invent facts. Only clean formatting, remove HTML artifacts, and fix obvious broken address punctuation. Return JSON object: {\"repairs\":[{\"index\":number,\"location_name\":string,\"address\":string,\"description\":string}]}.",
        },
        {
          role: "user",
          content: JSON.stringify({ listings: compact }),
        },
      ],
      temperature: 0.1,
    });
    const content = completion.choices?.[0]?.message?.content || "{}";
    const normalized = content.replace(/```json|```/gi, "").trim();
    const parsed = JSON.parse(normalized || "{}");
    return Array.isArray(parsed?.repairs) ? parsed.repairs : [];
  } catch {
    return [];
  }
}

function tagValue(block, tagNames) {
  for (const tag of tagNames) {
    const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
    const match = block.match(regex);
    if (match?.[1]) return decodeHtml(match[1]);
  }
  return "";
}

function canonicalUrl(raw, base) {
  try {
    const url = base ? new URL(raw, base) : new URL(raw);
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
  if (/(medical school|school of medicine|application|admission|admissions|enrollment|course registration)/.test(t)) {
    return "event";
  }
  const hasFoodAidContext = /(food|pantry|meal|hunger|nutrition|shelter|relief|mutual aid|supplies|clothing)/.test(t);
  if (/(volunteer|volunteering|serve|community service)/.test(t)) return "volunteer";
  if (/(food bank|food pantry|pantry|meal distribution|soup kitchen|food assistance|grocery support)/.test(t)) return "foodbank";
  if (/(donation|donate|donation drive|supply drive|fundraiser)/.test(t) && hasFoodAidContext) return "donation";
  if (/(workshop|bootcamp|training)/.test(t)) return "workshop";
  if (/(class|course|lecture|seminar)/.test(t)) return "class";
  if (/(networking|career fair|meetup|professional)/.test(t)) return "networking";
  if (/(support group|peer support)/.test(t)) return "support_group";
  if (/(free clinic|community clinic|health clinic|health screening|medical aid|urgent care)/.test(t)) return "clinic";
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
  const hasFoodAidContext = /(food|pantry|meal|hunger|nutrition|shelter|relief|mutual aid|supplies|clothing)/.test(t);
  if (/(medical school|school of medicine|application|admission|admissions|enrollment)/.test(t)) return "other";
  if (/(shelter|housing support|homeless)/.test(t)) return "shelter";
  if (/(legal aid|pro bono|legal clinic)/.test(t)) return "legal_aid";
  if (/(free clinic|health clinic|community clinic|health center|medical aid)/.test(t)) return "free_clinic";
  if (/(law office|attorney|lawyer)/.test(t)) return "lawyer";
  if (/(food pantry|pantry|food assistance|meal|soup kitchen|grocery support)/.test(t)) return "food_assistance";
  if (/(donation|donate|donation drive|supply drive)/.test(t) && hasFoodAidContext) return "food_assistance";
  if (/(resource center|community center|support services|crisis|immigration|domestic violence)/.test(t)) return "resource_center";
  return "other";
}

function inferSupportedLanguages(text) {
  const t = text.toLowerCase();
  const known = [
    "english","spanish","farsi","persian","arabic","turkish","chinese","hindi","urdu","korean","japanese","vietnamese","french","german","russian","pashto"
  ];
  const out = [];
  for (const lang of known) {
    if (t.includes(lang)) out.push(lang === "persian" ? "Farsi" : lang.charAt(0).toUpperCase() + lang.slice(1));
  }
  return [...new Set(out)];
}

function inferCulturalGroups(text) {
  const t = text.toLowerCase();
  const patterns = [
    "iranian","persian","arab","turkish","hispanic","latino","african","asian","european","south asian","east asian","middle eastern","indian","pakistani","kurdish","chinese","korean","japanese","vietnamese"
  ];
  const out = [];
  for (const p of patterns) {
    if (t.includes(p)) out.push(p.split(" ").map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join(" "));
  }
  return [...new Set(out)];
}

function inferTranslatorServiceType(text) {
  const t = text.toLowerCase();
  const hasTranslator = /translator|translation/.test(t);
  const hasInterpreter = /interpreter|interpretation/.test(t);
  if (hasTranslator && hasInterpreter) return "both";
  if (hasInterpreter) return "interpreter";
  return "translator";
}

function inferTranslatorMode(text) {
  const t = text.toLowerCase();
  if (/(phone|hotline|call)/.test(t)) return "phone";
  if (/(remote|virtual|online|zoom)/.test(t)) return "remote";
  if (/(in person|onsite|on-site|walk-in)/.test(t)) return "in_person";
  return "any";
}

function inferTranslatorCost(text) {
  const t = text.toLowerCase();
  if (/(free|no cost|complimentary)/.test(t)) return "free";
  if (/(fee|paid|cost|rate)/.test(t)) return "paid";
  return "any";
}

function inferTranslatorSpecializations(text) {
  const t = text.toLowerCase();
  const out = [];
  if (/(medical|clinic|health|hospital)/.test(t)) out.push("medical");
  if (/(legal|law|court|attorney)/.test(t)) out.push("legal");
  if (/(school|education|esl|student)/.test(t)) out.push("education");
  if (out.length === 0) out.push("general");
  return out;
}

function inferGuideTopic(text) {
  const t = text.toLowerCase();
  if (/(id|license|documentation|documents|visa|immigration)/.test(t)) return "documentation";
  if (/(health|clinic|medical|insurance)/.test(t)) return "healthcare";
  if (/(housing|shelter|rent|landlord)/.test(t)) return "housing";
  if (/(school|education|esl|enroll)/.test(t)) return "education";
  if (/(job|employment|resume|interview)/.test(t)) return "employment";
  if (/(bank|account|finance)/.test(t)) return "banking";
  if (/(bus|train|transport|transit|driver)/.test(t)) return "transportation";
  if (/(rights|know your rights|legal)/.test(t)) return "legal_rights_general";
  return "emergency_services";
}

function inferGuideFormat(item) {
  const url = String(item.source_url || "").toLowerCase();
  const text = `${item.title || ""} ${item.description || ""}`.toLowerCase();
  if (url.endsWith(".pdf")) return "pdf";
  if (/youtube|vimeo|video|webinar/.test(url + " " + text)) return "video";
  if (/checklist|steps|how to/.test(text)) return "checklist";
  if (/program|service|center/.test(text)) return "local_program";
  return "article";
}

function hasStrictFoodContext(text) {
  const t = String(text || "").toLowerCase();
  return /(food bank|food pantry|pantry|meal|soup kitchen|food assistance|grocery support|hunger|nutrition|supply drive|mutual aid|relief)/.test(t);
}

function hasStrictClinicLegalContext(text) {
  const t = String(text || "").toLowerCase();
  if (/(medical school|application|admission|course|training only)/.test(t)) return false;
  return /(clinic|health center|vaccination|medical aid|urgent care|legal aid|pro bono|attorney|lawyer|shelter|crisis support|domestic violence|immigration legal)/.test(t);
}

function detectElectionType(text) {
  const t = text.toLowerCase();
  if (/(primary)/.test(t)) return "primary";
  if (/(general election|general)/.test(t)) return "general";
  if (/(runoff)/.test(t)) return "runoff";
  if (/(referendum|measure|proposition|ballot measure)/.test(t)) return "referendum";
  if (/(special election)/.test(t)) return "special";
  if (/(city|county|municipal|school board|local)/.test(t)) return "local";
  return "unknown";
}

function detectElectionLevel(text) {
  const t = text.toLowerCase();
  if (/(president|senate|congress|federal|house of representatives)/.test(t)) return "federal";
  if (/(governor|state senate|state house|statewide)/.test(t)) return "state";
  if (/(county|commissioner|sheriff|district attorney)/.test(t)) return "county";
  if (/(city council|mayor|board of education|municipal|local)/.test(t)) return "local";
  return "all";
}

function inferCandidateOfficeLevel(text) {
  const lvl = detectElectionLevel(text);
  if (lvl === "federal") return "national";
  return lvl === "all" ? "unknown" : lvl;
}

function getOfficialElectionTools(stateOrRegion = "") {
  const s = normalizeText(stateOrRegion).toLowerCase();
  if (s.includes("north carolina") || s === "nc") {
    return {
      portalName: "North Carolina State Board of Elections",
      portalUrl: "https://www.ncsbe.gov/",
      tools: [
        { label: "Check registration / eligibility", url: "https://vt.ncsbe.gov/RegLkup/" },
        { label: "Find polling place / voting locations", url: "https://vt.ncsbe.gov/PPLkup/" },
        { label: "Registration portal", url: "https://www.ncsbe.gov/registering/how-register" },
      ],
      checklist: [
        { text: "Confirm registration status before deadlines.", source_url: "https://www.ncsbe.gov/registering/checking-your-registration" },
        { text: "Review accepted ID requirements for in-person voting.", source_url: "https://www.ncsbe.gov/voting/voter-id" },
        { text: "Verify county-specific early voting locations and hours.", source_url: "https://www.ncsbe.gov/voting/vote-early-person" },
      ],
    };
  }
  return {
    portalName: "Vote.gov",
    portalUrl: "https://vote.gov/",
    tools: [
      { label: "Check registration / eligibility", url: "https://www.usa.gov/confirm-voter-registration" },
      { label: "Find polling place / voting locations", url: "https://www.usa.gov/find-polling-place" },
      { label: "Registration portal", url: "https://vote.gov/" },
    ],
    checklist: [
      { text: "Confirm your state registration status.", source_url: "https://www.usa.gov/confirm-voter-registration" },
      { text: "Check state deadlines for registration and absentee voting.", source_url: "https://vote.gov/" },
      { text: "Use official state/county tools for polling place details.", source_url: "https://www.usa.gov/find-polling-place" },
    ],
  };
}

function mapItemsToCivics(items = [], { state_or_region = "North Carolina", county_or_district = "", city_or_locality = "" } = {}) {
  const nowIso = new Date().toISOString();
  const elections = [];
  const candidates = [];
  const orgs = [];

  for (const item of items) {
    const title = normalizeText(item.title || item.name || "");
    const description = normalizeText(item.description || "");
    const combined = `${title} ${description} ${item.type || ""} ${item.category || ""}`;
    const text = combined.toLowerCase();
    const sourceUrl = normalizeText(item.source_url || item.url || "");
    const retrievedAt = item.retrieved_at || nowIso;

    if (/(election|primary|ballot|referendum|vote|voting|runoff)/.test(text)) {
      const date = normalizeDate(item.date_start || item.election_date || "");
      elections.push({
        election_id: item.id || `election-${title.toLowerCase().replace(/\s+/g, "-")}`,
        name: title || "Election",
        jurisdiction: {
          country: "USA",
          state_or_region: state_or_region || "Unknown",
          county_or_district: county_or_district || "Unknown",
          city_or_locality: city_or_locality || "Unknown",
        },
        election_date: date ? String(date).slice(0, 10) : null,
        election_type: detectElectionType(combined),
        election_level: detectElectionLevel(combined),
        official_portal_name: getOfficialElectionTools(state_or_region).portalName,
        official_portal_url: getOfficialElectionTools(state_or_region).portalUrl,
        source_url: sourceUrl,
        retrieved_at: retrievedAt,
        confidence: { overall: date ? "medium" : "low" },
      });
    }

    if (/(candidate|running for|for (mayor|council|senate|governor|sheriff|board))/i.test(combined)) {
      candidates.push({
        candidate_id: item.id || `candidate-${title.toLowerCase().replace(/\s+/g, "-")}`,
        name: title.split(" for ")[0] || title || "Candidate",
        office: {
          office_name: /for (.+)$/i.test(title) ? (title.match(/for (.+)$/i)?.[1] || "Office") : "Office",
          level: inferCandidateOfficeLevel(combined),
          district: county_or_district || "Unknown",
        },
        party_affiliation: "Not listed",
        incumbent: null,
        campaign_links: { official_website: sourceUrl, social: [] },
        highlights: [
          {
            label: "Platform summary",
            summary: description || "Not listed",
            source_url: sourceUrl,
            retrieved_at: retrievedAt,
          },
        ],
        connections: [],
        ai_quality: { relevance_score: 70, classification_confidence: "medium" },
        source_url: sourceUrl,
        retrieved_at: retrievedAt,
      });
    }

    if (/(party|committee|civic|advocacy|democratic|republican|precinct|political action)/.test(text)) {
      const coords = normalizeCoordinates(item.lat ?? item.latitude, item.lon ?? item.longitude);
      orgs.push({
        org_id: item.id || `org-${title.toLowerCase().replace(/\s+/g, "-")}`,
        name: title || "Civic Organization",
        category: /student/.test(text) ? "student_org" : /advocacy/.test(text) ? "advocacy_group" : /party|committee/.test(text) ? "party_committee" : "civic_group",
        address: normalizeText(item.address || item.location_name || "Not listed"),
        lat: coords?.lat ?? null,
        lon: coords?.lon ?? null,
        phone: normalizeText(item.phone || "Not listed"),
        email: normalizeText(item.email || "Not listed"),
        website: sourceUrl,
        services: ["voter_info", "community_events"],
        source_url: sourceUrl,
        retrieved_at: retrievedAt,
        confidence: { overall: coords ? "medium" : "low" },
      });
    }
  }

  return { elections, candidates, parties_and_committees: orgs };
}

function dedupeByKey(rows, keyFn) {
  const map = new Map();
  for (const row of rows || []) {
    const key = keyFn(row);
    if (!key) continue;
    if (!map.has(key)) map.set(key, row);
  }
  return [...map.values()];
}

function buildEligibilityFromItems(items = [], baseTools) {
  const candidates = [];
  for (const item of items || []) {
    const text = `${normalizeText(item.title || "")}. ${normalizeText(item.description || "")}`;
    const source = normalizeText(item.source_url || item.url || baseTools.portalUrl);
    const lowered = text.toLowerCase();
    if (/(registration|register to vote|voter registration)/.test(lowered)) {
      candidates.push({ text: normalizeText(text).slice(0, 180), source_url: source });
    }
    if (/(eligibility|who can vote|requirements|residency|id requirement)/.test(lowered)) {
      candidates.push({ text: normalizeText(text).slice(0, 180), source_url: source });
    }
    if (/(polling place|vote center|early voting|absentee|mail ballot)/.test(lowered)) {
      candidates.push({ text: normalizeText(text).slice(0, 180), source_url: source });
    }
  }
  const merged = dedupeByKey(candidates, (c) => `${c.text.toLowerCase()}|${c.source_url.toLowerCase()}`).slice(0, 8);
  if (merged.length > 0) return merged;
  return baseTools.checklist;
}

async function aiExtractCivicsFromItems(items, { state_or_region = "Unknown", county_or_district = "", city_or_locality = "" } = {}) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || !Array.isArray(items) || items.length === 0) {
    return { elections: [], candidates: [], parties_and_committees: [], eligibility_items: [] };
  }
  const openai = new OpenAI({ apiKey });
  const compact = items.slice(0, 140).map((item, index) => ({
    index,
    title: normalizeText(item.title || item.name || ""),
    description: normalizeText(item.description || ""),
    source_name: normalizeText(item.source_name || ""),
    source_url: normalizeText(item.source_url || item.url || ""),
    date_start: normalizeDate(item.date_start || item.start || ""),
    location_name: normalizeText(item.location_name || ""),
    address: normalizeText(item.address || ""),
  }));
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "Extract civics information neutrally and factually. Do not invent facts. Every claim must include source_url and retrieved_at. Return JSON only with shape: {elections:[{name,election_date,election_type,election_level,official_portal_name,official_portal_url,source_url,retrieved_at,confidence}],candidates:[{name,office_name,office_level,district,party_affiliation,incumbent,campaign_links:{official_website,social},highlights:[{label,summary,source_url,retrieved_at}],connections:[{type,entity_name,summary,source_url,retrieved_at}],ai_quality:{relevance_score,classification_confidence},source_url,retrieved_at}],parties_and_committees:[{name,category,address,lat,lon,phone,email,website,services,source_url,retrieved_at,confidence}],eligibility_items:[{text,source_url}]}. Use neutral language only.",
        },
        {
          role: "user",
          content: JSON.stringify({
            jurisdiction: { state_or_region, county_or_district, city_or_locality, country: "USA" },
            listings: compact,
          }),
        },
      ],
    });
    const content = completion.choices?.[0]?.message?.content || "{}";
    const parsed = JSON.parse(String(content).replace(/```json|```/gi, "").trim() || "{}");
    return {
      elections: Array.isArray(parsed.elections) ? parsed.elections : [],
      candidates: Array.isArray(parsed.candidates) ? parsed.candidates : [],
      parties_and_committees: Array.isArray(parsed.parties_and_committees) ? parsed.parties_and_committees : [],
      eligibility_items: Array.isArray(parsed.eligibility_items) ? parsed.eligibility_items : [],
    };
  } catch {
    return { elections: [], candidates: [], parties_and_committees: [], eligibility_items: [] };
  }
}

function mapItemsToTranslators(items = [], location = null, radiusMiles = 25, limit = 120) {
  const out = [];
  const seen = new Set();
  for (const item of items) {
    const text = `${item.title || ""} ${item.description || ""} ${item.type || ""} ${item.category || ""}`.toLowerCase();
    if (!/(translator|translation|interpreter|interpretation|language assistance|bilingual|multilingual)/.test(text)) continue;
    const key = `${normalizeText(item.title || item.name || "").toLowerCase()}|${normalizeText(item.address || item.location_name || "").toLowerCase()}`;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const coords = normalizeCoordinates(item.lat ?? item.latitude, item.lon ?? item.longitude);
    let dist = null;
    if (location?.latitude != null && location?.longitude != null && coords) {
      dist = calculateDistanceMiles(location.latitude, location.longitude, coords.lat, coords.lon);
      if (dist > radiusMiles) continue;
    }
    const languages = inferSupportedLanguages(`${item.title || ""} ${item.description || ""}`);
    out.push({
      id: item.id || `translator-${out.length + 1}`,
      name: normalizeText(item.title || item.name || item.organizer || "Language Support"),
      service_type: inferTranslatorServiceType(text),
      languages_supported: languages.length ? languages : ["English"],
      specializations: inferTranslatorSpecializations(text),
      mode: inferTranslatorMode(text),
      cost: inferTranslatorCost(text),
      service_area: normalizeText(item.location_name || item.address || "Local"),
      address: normalizeText(item.address || item.location_name || "Not listed"),
      lat: coords?.lat ?? null,
      lon: coords?.lon ?? null,
      phone: normalizeText(item.phone || "Not listed"),
      email: normalizeText(item.email || "Not listed"),
      website: normalizeText(item.source_url || ""),
      hours: normalizeText(item.hours || "Not listed"),
      notes: normalizeText(item.description || "Not listed"),
      source_name: normalizeText(item.source_name || "Unknown"),
      source_url: normalizeText(item.source_url || ""),
      retrieved_at: item.retrieved_at || new Date().toISOString(),
      confidence: { overall: coords ? "medium" : "low" },
    });
    if (out.length >= limit) break;
  }
  return out;
}

function mapItemsToNewcomerGuides(items = [], limit = 120) {
  const out = [];
  const seen = new Set();
  for (const item of items) {
    const text = `${item.title || ""} ${item.description || ""} ${item.type || ""} ${item.category || ""}`.toLowerCase();
    if (!/(newcomer|immigrant|refugee|orientation|esl|translation|know your rights|driver|school enrollment|housing|healthcare)/.test(text)) continue;
    const key = normalizeText(item.source_url || item.title || "").toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const combined = `${item.title || ""} ${item.description || ""}`;
    const langs = inferSupportedLanguages(combined);
    out.push({
      id: item.id || `guide-${out.length + 1}`,
      title: normalizeText(item.title || "Newcomer Guide"),
      topic: inferGuideTopic(combined),
      language: langs[0] || "English",
      format: inferGuideFormat(item),
      summary: normalizeText(item.description || "Not listed"),
      source_name: normalizeText(item.source_name || "Unknown"),
      source_url: normalizeText(item.source_url || ""),
      retrieved_at: item.retrieved_at || new Date().toISOString(),
      local_relevance: /(chapel hill|durham|raleigh|north carolina|triangle)/i.test(combined) ? "high" : "medium",
      confidence: { overall: "medium" },
    });
    if (out.length >= limit) break;
  }
  return out;
}

function parseIso8601DurationToMinutes(iso) {
  if (!iso || typeof iso !== "string") return 0;
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/i);
  if (!match) return 0;
  const hours = Number(match[1] || 0);
  const minutes = Number(match[2] || 0);
  const seconds = Number(match[3] || 0);
  return hours * 60 + minutes + Math.ceil(seconds / 60);
}

function classifyChannelType(name, description = "") {
  const t = `${name} ${description}`.toLowerCase();
  if (/(official|org|nonprofit|foundation|city|county|department|university|college|library)/.test(t)) return "organization";
  if (/(academy|tutorial|school|education|learning|course)/.test(t)) return "educational";
  return "individual";
}

function discoverArtistsFromDb(query = "", location = null, radiusMiles = 25, limit = 100) {
  const q = normalizeText(query).toLowerCase();
  const rows = db.prepare("SELECT * FROM community_items").all();
  const candidates = rows.filter((row) => {
    const text = `${row.title || ""} ${row.description || ""} ${row.tags_raw || ""} ${row.organizer || ""}`.toLowerCase();
    const looksLikeArtist = /(artist|band|musician|dj|photographer|painter|gallery|theater|performance|creator|digital art)/.test(text);
    if (!looksLikeArtist) return false;
    if (!q) return true;
    return text.includes(q) || String(row.title || "").toLowerCase().includes(q);
  });

  const dedupe = new Set();
  const out = [];
  for (const row of candidates) {
    const key = normalizeText(row.title || row.organizer || "").toLowerCase();
    if (!key || dedupe.has(key)) continue;
    dedupe.add(key);
    const coords = normalizeCoordinates(row.latitude ?? row.lat, row.longitude ?? row.lon);
    let dist = null;
    if (location?.latitude != null && location?.longitude != null && coords) {
      dist = calculateDistanceMiles(location.latitude, location.longitude, coords.lat, coords.lon);
      if (dist > radiusMiles) continue;
    }
    const text = `${row.title || ""} ${row.description || ""}`.toLowerCase();
    const category = /music|band|musician|dj/.test(text)
      ? "music"
      : /painter|gallery|photographer|visual/.test(text)
        ? "visual_art"
        : /performance|theater|dance/.test(text)
          ? "performance"
          : /digital|3d|animation/.test(text)
            ? "digital"
            : "other";
    out.push({
      artist_name: row.title || row.organizer || "Local Artist",
      category,
      style: row.category || "Community",
      location: row.location_name || row.address || "Not listed",
      distance_miles: dist != null ? Number(dist.toFixed(1)) : null,
      description: row.description || "Not listed",
      website: row.source_url || "",
      social_links: [],
      upcoming_events: [],
      lat: coords?.lat ?? null,
      lon: coords?.lon ?? null,
      confidence: { overall: coords ? "medium" : "low" },
    });
    if (out.length >= limit) break;
  }
  return out;
}

function mapItemsToArtists(items = [], location = null, radiusMiles = 25, limit = 100) {
  const out = [];
  const seen = new Set();
  for (const item of items) {
    const title = normalizeText(item.title || item.name || item.organizer || "");
    const description = normalizeText(item.description || "");
    const text = `${title} ${description} ${item.type || ""} ${item.category || ""}`.toLowerCase();
    const looksLikeArtist = /(artist|musician|band|dj|painter|photographer|gallery|performance|performer|creator|digital art|visual art|singer)/.test(text);
    if (!looksLikeArtist) continue;

    const key = `${title.toLowerCase()}|${normalizeText(item.location_name || item.address).toLowerCase()}`;
    if (!title || seen.has(key)) continue;
    seen.add(key);

    const coords = normalizeCoordinates(item.lat ?? item.latitude, item.lon ?? item.longitude);
    let dist = null;
    if (location?.latitude != null && location?.longitude != null && coords) {
      dist = calculateDistanceMiles(location.latitude, location.longitude, coords.lat, coords.lon);
      if (dist > radiusMiles) continue;
    }

    const category = /music|band|musician|dj|singer/.test(text)
      ? "music"
      : /painter|gallery|photographer|visual/.test(text)
        ? "visual_art"
        : /performance|theater|dance/.test(text)
          ? "performance"
          : /digital|3d|animation|designer/.test(text)
            ? "digital"
            : "other";

    out.push({
      artist_name: title,
      category,
      style: normalizeText(item.category || item.type || "Community"),
      location: normalizeText(item.location_name || item.address || "Not listed"),
      distance_miles: dist != null ? Number(dist.toFixed(1)) : null,
      description: description || "Not listed",
      website: normalizeText(item.source_url || ""),
      social_links: [],
      upcoming_events: [],
      lat: coords?.lat ?? null,
      lon: coords?.lon ?? null,
      confidence: { overall: coords ? "medium" : "low" },
    });

    if (out.length >= limit) break;
  }
  return out;
}

function normalizeBackboardResults(payload) {
  const rows = payload?.results || payload?.items || payload?.data || [];
  if (!Array.isArray(rows)) return [];
  return rows.map((row, idx) => {
    const title = row.title || row.name || row.event_name || row.organization_name || `Backboard Item ${idx + 1}`;
    const description = normalizeText(row.description || row.summary || "");
    const address = normalizeText(row.address || row.location || row.venue_address || "");
    const locationName = normalizeText(row.location_name || row.venue || row.place || "");
    const coords = normalizeCoordinates(row.lat ?? row.latitude, row.lon ?? row.longitude);
    return {
      id: canonicalUrl(row.source_url || row.url || "") || `backboard-${idx}-${title.toLowerCase().replace(/\s+/g, "-")}`,
      title,
      type: inferType(`${title} ${description}`),
      audience: inferAudience(`${title} ${description}`),
      date_start: normalizeDate(row.date_start || row.start_date || row.start || row.datetime || ""),
      date_end: normalizeDate(row.date_end || row.end_date || row.end || ""),
      date_unknown: !(row.date_start || row.start_date || row.start || row.datetime),
      location_name: locationName || "Not listed",
      address: address || "Not listed",
      lat: coords?.lat ?? null,
      lon: coords?.lon ?? null,
      location_confidence: coords ? "high" : (address ? "medium" : "low"),
      distance_miles: null,
      organizer: row.organizer || row.host || "Not listed",
      description: description || "Not listed",
      accessibility_notes: "Not listed",
      source_name: row.source_name || "Backboard",
      source_url: canonicalUrl(row.source_url || row.url || ""),
      retrieved_at: new Date().toISOString(),
      confidence: {
        overall: "medium",
        date: "medium",
        location: coords ? "high" : "medium",
        type: "medium",
      },
      needs_review: false,
      cultural_groups: Array.isArray(row.cultural_groups) ? row.cultural_groups : [],
      supported_languages: Array.isArray(row.supported_languages) ? row.supported_languages : [],
      translation_services: Boolean(row.translation_services),
      translation_languages: Array.isArray(row.translation_languages) ? row.translation_languages : [],
      immigrant_support: Boolean(row.immigrant_support),
      newcomer_support: Boolean(row.newcomer_support),
    };
  });
}

function parseRssOrAtom(xml, sourceName, sourceUrl) {
  const rssItems = xml.match(/<item[\s\S]*?<\/item>/gi) || [];
  const atomEntries = xml.match(/<entry[\s\S]*?<\/entry>/gi) || [];
  const blocks = rssItems.length ? rssItems : atomEntries;

  return blocks.map((block, idx) => {
    const title = tagValue(block, ["title"]) || `${sourceName} Listing ${idx + 1}`;
    const descriptionRaw = tagValue(block, ["description", "summary", "content"]);
    const linkTag = block.match(/<link[^>]*href="([^"]+)"/i)?.[1] || tagValue(block, ["link"]);
    const sourceLink = canonicalUrl(linkTag || sourceUrl, sourceUrl);
    const start = normalizeDate(tagValue(block, ["pubDate", "updated", "dc:date", "published", "startDate", "dtstart"]));
    const locationName = tagValue(block, ["location", "venue", "address"]);
    const tagsRaw = tagValue(block, ["category", "tags"]);
    const organizer = tagValue(block, ["author", "organizer"]);
    const combined = `${title} ${descriptionRaw} ${tagsRaw} ${organizer} ${sourceName}`;
    const type = inferType(combined);
    const audience = inferAudience(combined);
    const locationConfidence = locationName ? "medium" : "low";

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
      location_confidence: locationConfidence,
      distance_miles: null,
      organizer: organizer || "Not listed",
      description: descriptionRaw || "Not listed",
      accessibility_notes: "Not listed",
      source_name: sourceName,
      source_url: sourceLink,
      retrieved_at: new Date().toISOString(),
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
    const link = canonicalUrl(pick("URL") || sourceUrl, sourceUrl);
    const start = normalizeDate(pick("DTSTART"));
    const end = normalizeDate(pick("DTEND"));
    const combined = `${title} ${descriptionRaw} ${locationName} ${organizer}`;
    const type = inferType(combined);
    const audience = inferAudience(combined);
    const locationConfidence = locationName ? "medium" : "low";

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
      location_confidence: locationConfidence,
      distance_miles: null,
      organizer: organizer || "Not listed",
      description: descriptionRaw || "Not listed",
      accessibility_notes: "Not listed",
      source_name: sourceName,
      source_url: link,
      retrieved_at: new Date().toISOString(),
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

function tokenize(text) {
  return normalizeText(String(text || ""))
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2);
}

function jaccardSimilarity(a, b) {
  const ta = new Set(tokenize(a));
  const tb = new Set(tokenize(b));
  if (ta.size === 0 && tb.size === 0) return 1;
  let intersection = 0;
  for (const t of ta) if (tb.has(t)) intersection += 1;
  const union = new Set([...ta, ...tb]).size;
  return union ? intersection / union : 0;
}

function inferPrimaryCategory(item) {
  const text = `${item.title || ""} ${item.description || ""} ${item.type || ""} ${item.category || ""}`.toLowerCase();
  const hasFoodAidContext = /(food|pantry|meal|hunger|nutrition|shelter|relief|mutual aid|supplies|clothing)/.test(text);
  if (/(spam|advertisement|limited time offer|coupon|buy now|promo code)/.test(text)) return "other";
  if (/(artist|band|musician|gallery|performance|photographer|painter)/.test(text)) return "artist";
  if (/(translation|language support|esl|interpretation)/.test(text)) return "language_support";
  if (/(cultural|heritage|festival|community center|cultural center)/.test(text)) return "cultural";
  if (/(clinic|legal aid|attorney|lawyer|pro bono|shelter|crisis support)/.test(text)) return "clinic_legal";
  if (/(food bank|pantry|meal|food assistance)/.test(text) || item.type === "foodbank") return "food_assistance";
  if ((/(donation|donate|donation drive|supply drive)/.test(text) && hasFoodAidContext) || (item.type === "donation" && hasFoodAidContext)) return "food_assistance";
  if (item.type === "volunteer" || /(volunteer|community service)/.test(text)) return "volunteer";
  if (/(organization|nonprofit|association|resource center)/.test(text)) return "organization";
  if (/(workshop|class|lecture|training|course)/.test(text)) return "education";
  if (/(networking|career fair|professional meetup)/.test(text)) return "networking";
  if (/(social|meetup|gathering)/.test(text)) return "social";
  if (item.type && item.type !== "organization") return "event";
  return "resource";
}

function inferSubcategory(item, primaryCategory) {
  const text = `${item.title || ""} ${item.description || ""} ${item.type || ""} ${item.category || ""}`.toLowerCase();
  if (primaryCategory === "clinic_legal") {
    if (/(legal aid|pro bono|attorney|lawyer)/.test(text)) return "legal_aid";
    if (/(shelter|housing support)/.test(text)) return "shelter";
    return "clinic";
  }
  if (primaryCategory === "food_assistance") {
    if (/(food pantry|food bank|pantry)/.test(text)) return "food_bank";
    return "donation";
  }
  if (/(workshop)/.test(text)) return "workshop";
  if (/(networking|career fair)/.test(text)) return "networking";
  if (/(class|course|lecture|seminar)/.test(text)) return "class";
  if (/(performance|concert|show)/.test(text)) return "performance";
  if (/(festival|fair)/.test(text)) return "festival";
  if (/(support group|peer support)/.test(text)) return "support_group";
  return normalizeText(item.type || "event").toLowerCase().replace(/\s+/g, "_");
}

function inferAiTags(item) {
  const text = `${item.title || ""} ${item.description || ""} ${item.type || ""} ${item.category || ""}`.toLowerCase();
  const map = [
    ["technology", /(tech|software|ai|data|coding)/],
    ["volunteering", /(volunteer|service|community service)/],
    ["free", /(free|no cost|complimentary)/],
    ["workshop", /(workshop|training|bootcamp)/],
    ["beginner", /(beginner|intro|101)/],
    ["community", /(community|local|neighborhood)/],
    ["cultural", /(cultural|heritage|international)/],
    ["networking", /(networking|career fair|meetup)/],
    ["food", /(food bank|pantry|meal|donation drive)/],
    ["legal", /(legal aid|attorney|lawyer|pro bono)/],
    ["health", /(clinic|health|medical)/],
    ["language_support", /(translation|interpretation|esl|language support)/],
  ];
  return map.filter(([, rx]) => rx.test(text)).map(([tag]) => tag);
}

function computeRelevanceScore(item) {
  const text = `${item.title || ""} ${item.description || ""}`.toLowerCase();
  let score = 65;
  if (item.source_url) score += 10;
  if (item.address || item.location_name) score += 8;
  if (item.date_start || item.date_end) score += 8;
  if (/(spam|coupon|buy now|shop now|sale ends)/.test(text)) score -= 60;
  if (/(online casino|forex|crypto signal|dropshipping)/.test(text)) score -= 70;
  if (/(sponsored|advertisement)/.test(text)) score -= 20;
  return Math.max(0, Math.min(100, score));
}

function computeQualityScore(item) {
  const text = normalizeText(item.description || "");
  const hasDesc = text.length >= 40;
  const hasDate = Boolean(item.date_start || item.date_end || item.date_unknown);
  const hasLocation = Boolean(item.address || item.location_name || normalizeCoordinates(item.lat, item.lon));
  const trusted = /(\.gov|\.edu|city|county|university|library|nonprofit|hospital)/i.test(`${item.source_url || ""} ${item.source_name || ""}`);
  let score = 20;
  if (hasDesc) score += 25;
  if (hasDate) score += 20;
  if (hasLocation) score += 20;
  if (trusted) score += 20;
  if (item.type && item.type !== "event") score += 10;
  return Math.max(0, Math.min(100, score));
}

function normalizeTypeFromPrimary(primary, subcategory, fallbackType) {
  if (primary === "food_assistance") return subcategory === "donation" ? "donation" : "foodbank";
  if (primary === "volunteer") return "volunteer";
  if (primary === "clinic_legal") {
    if (subcategory === "legal_aid") return "legal_aid";
    if (subcategory === "shelter") return "shelter";
    return "clinic";
  }
  if (primary === "networking") return "networking";
  if (primary === "education") return subcategory === "workshop" ? "workshop" : "class";
  if (primary === "organization" || primary === "resource") return "resource_center";
  if (primary === "artist") return "event";
  return fallbackType || "event";
}

async function aiBatchClassify(items) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || !Array.isArray(items) || items.length === 0) return [];
  const openai = new OpenAI({ apiKey });
  const compact = items.slice(0, 80).map((item, index) => ({
    index,
    title: normalizeText(item.title || item.name || ""),
    description: normalizeText(item.description || ""),
    organizer: normalizeText(item.organizer || ""),
    source: normalizeText(item.source_name || ""),
    source_category: normalizeText(item.type || item.category || ""),
  }));
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: "Classify each listing. Return JSON: {\"items\":[{\"index\":number,\"primary_category\":\"event|volunteer|food_assistance|organization|clinic_legal|cultural|language_support|artist|education|networking|social|resource|other\",\"subcategory\":string,\"audience\":\"student|professional|general|families|seniors\",\"ai_tags\":string[],\"classification_confidence\":\"high|medium|low\",\"relevance_score\":number,\"quality_score\":number}]}.",
        },
        { role: "user", content: JSON.stringify({ listings: compact }) },
      ],
    });
    const content = completion.choices?.[0]?.message?.content || "{}";
    const parsed = JSON.parse(String(content).replace(/```json|```/gi, "").trim() || "{}");
    return Array.isArray(parsed?.items) ? parsed.items : [];
  } catch {
    return [];
  }
}

async function runQualityPipeline(items, { hideLowRelevance = true } = {}) {
  const prepared = (Array.isArray(items) ? items : []).map((item) => ({ ...item }));
  const withDeterministic = prepared.map((item) => {
    const sourceCategory = normalizeText(item.type || item.category || "event").toLowerCase() || "event";
    const primary = inferPrimaryCategory(item);
    const sub = inferSubcategory(item, primary);
    const relevance = computeRelevanceScore(item);
    const quality = computeQualityScore(item);
    const tags = inferAiTags(item);
    const confidence = quality >= 75 ? "high" : quality >= 55 ? "medium" : "low";
    const lowRelevance = relevance < 40;
    const lowQuality = quality < 50;
    const correctedType = normalizeTypeFromPrimary(primary, sub, sourceCategory);
    return {
      ...item,
      source_category: sourceCategory,
      primary_category: primary,
      subcategory: sub,
      type: correctedType,
      audience: inferAudience(`${item.title || ""} ${item.description || ""}`),
      ai_tags: tags,
      relevance_score: relevance,
      quality_score: quality,
      classification_confidence: confidence,
      low_relevance: lowRelevance,
      low_quality: lowQuality,
      needs_review: Boolean(item.needs_review) || confidence === "low" || lowQuality,
      duplicate_of: null,
      user_reports: Number(item.user_reports || 0),
      report_types: Array.isArray(item.report_types) ? item.report_types : [],
      classification_checked_at: new Date().toISOString(),
    };
  });

  const ai = await aiBatchClassify(withDeterministic);
  const aiMap = new Map(ai.filter((a) => Number.isFinite(Number(a.index))).map((a) => [Number(a.index), a]));
  const merged = withDeterministic.map((item, index) => {
    const a = aiMap.get(index);
    if (!a) return item;
    const primary = normalizeText(a.primary_category || item.primary_category || "event").toLowerCase();
    const sub = normalizeText(a.subcategory || item.subcategory || "");
    const relevance = Number.isFinite(Number(a.relevance_score)) ? Math.max(0, Math.min(100, Number(a.relevance_score))) : item.relevance_score;
    const quality = Number.isFinite(Number(a.quality_score)) ? Math.max(0, Math.min(100, Number(a.quality_score))) : item.quality_score;
    return {
      ...item,
      primary_category: primary || item.primary_category,
      subcategory: sub || item.subcategory,
      audience: ["student", "professional", "general", "families", "seniors"].includes(String(a.audience || "").toLowerCase())
        ? String(a.audience).toLowerCase()
        : item.audience,
      ai_tags: Array.isArray(a.ai_tags) && a.ai_tags.length > 0 ? a.ai_tags : item.ai_tags,
      relevance_score: relevance,
      quality_score: quality,
      classification_confidence: ["high", "medium", "low"].includes(String(a.classification_confidence || "").toLowerCase())
        ? String(a.classification_confidence).toLowerCase()
        : item.classification_confidence,
      low_relevance: relevance < 40,
      low_quality: quality < 50,
      needs_review: item.needs_review || String(a.classification_confidence || "").toLowerCase() === "low" || quality < 50,
      type: normalizeTypeFromPrimary(primary || item.primary_category, sub || item.subcategory, item.type),
    };
  });

  const guarded = merged.map((item) => {
    const text = `${item.title || ""} ${item.description || ""} ${item.source_name || ""}`.toLowerCase();
    if (item.primary_category === "food_assistance" && !hasStrictFoodContext(text)) {
      return {
        ...item,
        primary_category: "event",
        subcategory: "event",
        type: "event",
        needs_review: true,
        classification_confidence: "low",
      };
    }
    if (item.primary_category === "clinic_legal" && !hasStrictClinicLegalContext(text)) {
      return {
        ...item,
        primary_category: "organization",
        subcategory: "resource",
        type: "resource_center",
        needs_review: true,
        classification_confidence: "low",
      };
    }
    return item;
  });

  const dedupeKeep = [];
  for (const item of guarded) {
    const day = item.date_start ? String(item.date_start).slice(0, 10) : "unknown";
    const venue = normalizeText(item.location_name || item.address).toLowerCase();
    let duplicateOf = null;
    for (const kept of dedupeKeep) {
      const keptDay = kept.date_start ? String(kept.date_start).slice(0, 10) : "unknown";
      const keptVenue = normalizeText(kept.location_name || kept.address).toLowerCase();
      if (day !== keptDay || venue !== keptVenue) continue;
      const sim = jaccardSimilarity(item.title || "", kept.title || "");
      if (sim >= 0.8) {
        duplicateOf = kept.id;
        break;
      }
    }
    if (duplicateOf) {
      item.duplicate_of = duplicateOf;
      continue;
    }
    dedupeKeep.push(item);
  }

  if (!hideLowRelevance) return dedupeKeep;
  return dedupeKeep.filter((item) => !item.low_relevance);
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

async function fetchTicketmasterEvents(query, location) {
  const apiKey = process.env.TICKETMASTER_API_KEY;
  if (!apiKey) return [];

  const params = new URLSearchParams({
    apikey: apiKey,
    size: "100",
    keyword: query || "community events",
    sort: "date,asc",
    unit: "miles",
    radius: String(Number(process.env.SCRAPER_RADIUS_MILES || 25)),
  });
  if (location?.latitude != null && location?.longitude != null) {
    params.set("latlong", `${location.latitude},${location.longitude}`);
  }

  try {
    const response = await fetch(`https://app.ticketmaster.com/discovery/v2/events.json?${params.toString()}`);
    if (!response.ok) return [];
    const data = await response.json();
    const events = data?._embedded?.events || [];

    return events.map((event, idx) => {
      const venue = event?._embedded?.venues?.[0];
      const dateStart = event?.dates?.start?.dateTime || normalizeDate(event?.dates?.start?.localDate);
      const venueAddress = normalizeText(
        `${venue?.address?.line1 || ""} ${venue?.city?.name || ""} ${venue?.state?.stateCode || ""}`
      ) || "Not listed";
      const text = `${event?.name || ""} ${event?.info || ""} ${event?.pleaseNote || ""} ${venue?.name || ""}`;
      const normalizedCoords = normalizeCoordinates(venue?.location?.latitude, venue?.location?.longitude);
      return {
        id: canonicalUrl(event?.url || `ticketmaster-${idx}`),
        title: event?.name || "Ticketmaster Event",
        type: inferType(text),
        audience: inferAudience(text),
        date_start: dateStart || null,
        date_end: null,
        date_unknown: !dateStart,
        location_name: venue?.name || "Not listed",
        address: venueAddress,
        lat: normalizedCoords?.lat ?? null,
        lon: normalizedCoords?.lon ?? null,
        location_confidence: normalizedCoords ? "high" : (venueAddress !== "Not listed" ? "medium" : "low"),
        distance_miles: null,
        organizer: event?.promoter?.name || "Not listed",
        description: normalizeText(event?.info || event?.pleaseNote || "Not listed"),
        accessibility_notes: normalizeText(event?.accessibility?.info || "Not listed"),
        source_name: "Ticketmaster API",
        source_url: canonicalUrl(event?.url || ""),
        retrieved_at: new Date().toISOString(),
        confidence: {
          overall: "high",
          date: dateStart ? "Provided by Ticketmaster event data" : "Date missing in provider payload",
          location: venue?.name ? "Provided by Ticketmaster venue data" : "Venue details missing",
          type: "Rule-based keyword classification from API fields"
        },
        needs_review: false,
        tags_raw: normalizeText(event?.classifications?.map((c) => `${c?.segment?.name || ""} ${c?.genre?.name || ""}`).join(" ") || ""),
        description_raw: normalizeText(event?.info || event?.pleaseNote || ""),
        fieldOfStudy: "",
        academicLevel: "any",
        careerFocus: "any",
        industry: "",
        seniorityLevel: "",
        networkingVsTraining: ""
      };
    });
  } catch {
    return [];
  }
}

async function fetchEventbriteEvents(query, location) {
  const token = process.env.EVENTBRITE_API_TOKEN;
  if (!token) return [];

  const params = new URLSearchParams({
    q: query || "community events",
    "location.within": `${Number(process.env.SCRAPER_RADIUS_MILES || 25)}mi`,
    expand: "venue,organizer",
    page_size: "50",
    sort_by: "date",
  });
  if (location?.latitude != null && location?.longitude != null) {
    params.set("location.latitude", String(location.latitude));
    params.set("location.longitude", String(location.longitude));
  }

  try {
    const response = await fetch(`https://www.eventbriteapi.com/v3/events/search/?${params.toString()}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    if (!response.ok) return [];
    const data = await response.json();
    const events = data?.events || [];

    return events.map((event, idx) => {
      const venue = event?.venue || {};
      const addressObj = venue?.address || {};
      const address = normalizeText(
        `${addressObj?.address_1 || ""} ${addressObj?.city || ""} ${addressObj?.region || ""}`
      ) || "Not listed";
      const text = `${event?.name?.text || ""} ${event?.description?.text || ""} ${event?.category_id || ""}`;
      const normalizedCoords = normalizeCoordinates(addressObj?.latitude, addressObj?.longitude);
      return {
        id: canonicalUrl(event?.url || `eventbrite-${idx}`),
        title: event?.name?.text || "Eventbrite Event",
        type: inferType(text),
        audience: inferAudience(text),
        date_start: normalizeDate(event?.start?.utc || event?.start?.local),
        date_end: normalizeDate(event?.end?.utc || event?.end?.local),
        date_unknown: !(event?.start?.utc || event?.start?.local),
        location_name: venue?.name || "Not listed",
        address,
        lat: normalizedCoords?.lat ?? null,
        lon: normalizedCoords?.lon ?? null,
        location_confidence: normalizedCoords ? "high" : (address !== "Not listed" ? "medium" : "low"),
        distance_miles: null,
        organizer: event?.organizer?.name || "Not listed",
        description: normalizeText(event?.summary || event?.description?.text || "Not listed"),
        accessibility_notes: "Not listed",
        source_name: "Eventbrite API",
        source_url: canonicalUrl(event?.url || ""),
        retrieved_at: new Date().toISOString(),
        confidence: {
          overall: "high",
          date: "Provided by Eventbrite event data",
          location: venue?.name ? "Provided by Eventbrite venue data" : "Venue details missing",
          type: "Rule-based keyword classification from API fields"
        },
        needs_review: false,
        tags_raw: "",
        description_raw: normalizeText(event?.description?.text || ""),
        fieldOfStudy: "",
        academicLevel: "any",
        careerFocus: "any",
        industry: "",
        seniorityLevel: "",
        networkingVsTraining: ""
      };
    });
  } catch {
    return [];
  }
}

async function scrapeSources(query, location) {
  const sourceSignature = `${process.env.SCRAPER_SOURCES || ""}|tm:${process.env.TICKETMASTER_API_KEY ? "1" : "0"}|eb:${process.env.EVENTBRITE_API_TOKEN ? "1" : "0"}`;
  const locKey = location?.latitude != null && location?.longitude != null
    ? `${Number(location.latitude).toFixed(2)},${Number(location.longitude).toFixed(2)}`
    : "noloc";
  const cacheKey = `${normalizeText(query).toLowerCase() || "all"}|${locKey}|${sourceSignature}`;
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
          headers: { "User-Agent": "GratitudeScraper/1.0 (+respectful-rate-limit)" },
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

  const [ticketmasterEvents, eventbriteEvents] = await Promise.all([
    fetchTicketmasterEvents(query, location),
    fetchEventbriteEvents(query, location),
  ]);

  const deduped = dedupeItems([
    ...flattened,
    ...ticketmasterEvents,
    ...eventbriteEvents,
  ]);
  const enriched = await runQualityPipeline(deduped, { hideLowRelevance: true });
  const organizations = enriched
    .filter((item) => ["legal_aid", "clinic", "shelter", "resource_center", "foodbank", "donation"].includes(item.type))
    .slice(0, 50)
    .map((item) => {
      const text = `${item.title} ${item.description} ${item.location_name} ${item.organizer || ""}`;
      const supported = inferSupportedLanguages(text);
      const cultural = inferCulturalGroups(text);
      const translationServices = /(translation|interpretation|language assistance|bilingual|multilingual)/i.test(text);
      const translationLanguages = translationServices ? supported : [];
      const immigrantSupport = /(immigration|immigrant|refugee|asylum|visa|new resident|newcomer)/i.test(text);
      const newcomerSupport = /(newcomer|new resident|orientation|settlement)/i.test(text);
      const normalizedCoords = normalizeCoordinates(item.lat, item.lon);
      return {
        name: item.organizer && item.organizer !== "Not listed" ? item.organizer : item.title,
        category: inferOrgCategory(text),
        address: item.address || "Not listed",
        lat: normalizedCoords?.lat ?? null,
        lon: normalizedCoords?.lon ?? null,
        phone: "Not listed",
        hours: "Not listed",
        services: [item.type.replace("_", " ")],
        eligibility: "Not listed",
        description: item.description || "Not listed",
        cultural_groups: cultural,
        supported_languages: supported,
        translation_services: translationServices,
        translation_languages: translationLanguages,
        immigrant_support: immigrantSupport,
        newcomer_support: newcomerSupport,
        source_url: item.source_url,
        confidence: { overall: "medium" },
        distance_miles: item.distance_miles ?? null,
      };
    });

  const payload = {
    results: enriched,
    organizations,
    notes: [
      `Deterministic scraper fallback used (${sources.length} configured feeds, ${deduped.length} deduplicated listings).`,
      `AI quality pipeline applied (${enriched.length} items after relevance + duplicate filtering).`,
      `API sources used: Ticketmaster ${ticketmasterEvents.length > 0 ? "enabled" : "not configured/empty"}, Eventbrite ${eventbriteEvents.length > 0 ? "enabled" : "not configured/empty"}.`,
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

  app.use(express.json({ limit: "25mb" }));
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.post("/api/help-support/translators", async (req, res) => {
    const {
      location = null,
      radius_miles = 25,
      language_needed = [],
      service_type = "both",
      mode = "any",
      specialization = "general",
      cost = "any",
      availability = "any",
    } = req.body || {};

    const langs = Array.isArray(language_needed)
      ? language_needed.map((l) => normalizeText(l).toLowerCase()).filter(Boolean)
      : [normalizeText(language_needed).toLowerCase()].filter(Boolean);

    const rows = db.prepare("SELECT * FROM translator_entities ORDER BY last_updated DESC").all();
    let local = rows.map((r) => ({
      ...r,
      languages_supported: (() => { try { return JSON.parse(r.languages_supported || "[]"); } catch { return []; } })(),
      specializations: (() => { try { return JSON.parse(r.specializations || "[]"); } catch { return []; } })(),
      confidence: { overall: r.confidence_overall || "medium" },
    }));

    local = local.filter((item) => {
      if (langs.length > 0) {
        const supported = (item.languages_supported || []).map((l) => String(l).toLowerCase());
        if (!langs.some((l) => supported.some((s) => s.includes(l) || l.includes(s)))) return false;
      }
      if (service_type !== "both" && item.service_type !== service_type && item.service_type !== "both") return false;
      if (mode !== "any" && item.mode !== mode && item.mode !== "any") return false;
      if (specialization !== "general" && !(item.specializations || []).includes(specialization)) return false;
      if (cost !== "any" && item.cost !== cost && item.cost !== "any") return false;
      if (availability !== "any") {
        const notes = `${item.notes || ""} ${item.hours || ""}`.toLowerCase();
        if (availability === "same_day" && !/(same day|today|24\/7|24x7)/.test(notes)) return false;
        if (availability === "weekends" && !/(weekend|sat|sun)/.test(notes)) return false;
      }
      const coords = normalizeCoordinates(item.lat, item.lon);
      if (location?.latitude != null && location?.longitude != null && coords) {
        const d = calculateDistanceMiles(location.latitude, location.longitude, coords.lat, coords.lon);
        if (d > Number(radius_miles || 25)) return false;
        item.distance_miles = Number(d.toFixed(1));
      }
      return true;
    });

    let source = "local_db";
    if (local.length < 5) {
      const query = `${langs.join(" ")} ${service_type} ${specialization} translator interpreter near me`.trim();
      const scraped = await scrapeSources(query, location);
      let mined = mapItemsToTranslators(scraped.results || [], location, Number(radius_miles || 25), 120);

      if (mined.length < 3) {
        try {
          const apiKey = process.env.BACKBOARD_API_KEY || process.env.BACKBOARD_API || "";
          const base = process.env.BACKBOARD_API_URL || "https://api.backboard.io";
          if (apiKey) {
            const response = await fetch(`${base.replace(/\/$/, "")}/v1/search`, {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}`, "x-api-key": apiKey },
              body: JSON.stringify({
                query: `Find local translators and interpreters. Languages: ${langs.join(", ") || "any"}.`,
                location: location ? { lat: location.latitude, lon: location.longitude } : null,
                radius_miles: Number(radius_miles || 25),
              }),
            });
            if (response.ok) {
              const payload = await response.json();
              const normalized = normalizeBackboardResults(payload);
              mined = [...mined, ...mapItemsToTranslators(normalized, location, Number(radius_miles || 25), 120)];
            }
          }
        } catch {}
      }

      const dedupe = new Map();
      for (const t of mined) {
        const key = `${normalizeText(t.name).toLowerCase()}|${normalizeText(t.address).toLowerCase()}`;
        if (!dedupe.has(key)) dedupe.set(key, t);
      }
      const fresh = [...dedupe.values()];
      const upsert = db.prepare(`
        INSERT OR REPLACE INTO translator_entities (
          id,name,service_type,languages_supported,specializations,mode,cost,service_area,address,lat,lon,phone,email,website,hours,notes,source_name,source_url,retrieved_at,confidence_overall,last_updated
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `);
      const tx = db.transaction((list) => {
        for (const it of list) {
          upsert.run(
            it.id || randomUUID(),
            it.name || "Translator",
            it.service_type || "both",
            JSON.stringify(it.languages_supported || []),
            JSON.stringify(it.specializations || ["general"]),
            it.mode || "any",
            it.cost || "any",
            it.service_area || "Local",
            it.address || "Not listed",
            it.lat ?? null,
            it.lon ?? null,
            it.phone || "Not listed",
            it.email || "Not listed",
            it.website || "",
            it.hours || "Not listed",
            it.notes || "",
            it.source_name || "Unknown",
            it.source_url || "",
            it.retrieved_at || new Date().toISOString(),
            it.confidence?.overall || "medium"
          );
        }
      });
      tx(fresh);
      source = fresh.length > 0 ? "online_fallback_stored" : source;
      local = [...local, ...fresh];
    }

    res.json({
      translators: local.slice(0, 120),
      notes: [source === "local_db" ? "Loaded from local cache/database first." : "Local-first lookup expanded with online fallback and stored locally."],
      api_sources: [source],
    });
  });

  app.post("/api/help-support/newcomer-guides", async (req, res) => {
    const { location = null, language = "", topic = "all", format = "any" } = req.body || {};
    const lang = normalizeText(language).toLowerCase();
    const rows = db.prepare("SELECT * FROM newcomer_guides ORDER BY last_updated DESC").all();
    let local = rows.map((r) => ({
      ...r,
      confidence: { overall: r.confidence_overall || "medium" },
    }));

    local = local.filter((g) => {
      if (lang && String(g.language || "").toLowerCase() !== lang) return false;
      if (topic !== "all" && g.topic !== topic) return false;
      if (format !== "any" && g.format !== format) return false;
      return true;
    });

    let source = "local_db";
    if (local.length < 6) {
      const query = `newcomer guide ${topic !== "all" ? topic : ""} ${lang || ""}`.trim();
      const scraped = await scrapeSources(query, location);
      let mined = mapItemsToNewcomerGuides(scraped.results || [], 120);

      if (mined.length < 4) {
        try {
          const apiKey = process.env.BACKBOARD_API_KEY || process.env.BACKBOARD_API || "";
          const base = process.env.BACKBOARD_API_URL || "https://api.backboard.io";
          if (apiKey) {
            const response = await fetch(`${base.replace(/\/$/, "")}/v1/search`, {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}`, "x-api-key": apiKey },
              body: JSON.stringify({
                query: `Find newcomer guides for ${topic !== "all" ? topic : "documentation, healthcare, housing, education"} in ${lang || "any language"}`,
                location: location ? { lat: location.latitude, lon: location.longitude } : null,
              }),
            });
            if (response.ok) {
              const payload = await response.json();
              const normalized = normalizeBackboardResults(payload);
              mined = [...mined, ...mapItemsToNewcomerGuides(normalized, 120)];
            }
          }
        } catch {}
      }

      const dedupe = new Map();
      for (const g of mined) {
        const key = normalizeText(g.source_url || g.title).toLowerCase();
        if (!dedupe.has(key)) dedupe.set(key, g);
      }
      const fresh = [...dedupe.values()];
      const upsert = db.prepare(`
        INSERT OR REPLACE INTO newcomer_guides (
          id,title,topic,language,format,summary,source_name,source_url,retrieved_at,local_relevance,confidence_overall,last_updated
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `);
      const tx = db.transaction((list) => {
        for (const it of list) {
          upsert.run(
            it.id || randomUUID(),
            it.title || "Newcomer Guide",
            it.topic || "documentation",
            it.language || "English",
            it.format || "article",
            it.summary || "Not listed",
            it.source_name || "Unknown",
            it.source_url || "",
            it.retrieved_at || new Date().toISOString(),
            it.local_relevance || "medium",
            it.confidence?.overall || "medium"
          );
        }
      });
      tx(fresh);
      source = fresh.length > 0 ? "online_fallback_stored" : source;
      local = [...local, ...fresh];
    }

    res.json({
      guides: local.slice(0, 160),
      notes: [source === "local_db" ? "Loaded from local cache/database first." : "Local-first lookup expanded with online fallback and stored locally."],
      api_sources: [source],
    });
  });

  app.post("/api/civics/query", async (req, res) => {
    const {
      state_or_region = "North Carolina",
      county_or_district = "",
      city_or_locality = "",
      election_level = "all",
      election_type = "all",
      section = "elections",
      include_past = false,
      location = null,
    } = req.body || {};

    const now = new Date();
    const staleThresholdMs = 24 * 60 * 60 * 1000;
    const stateNorm = normalizeText(state_or_region);
    const countyNorm = normalizeText(county_or_district);

    const electionsRows = db.prepare(
      "SELECT * FROM civics_elections WHERE (? = '' OR lower(state_or_region)=lower(?)) AND (? = '' OR lower(county_or_district)=lower(?))"
    ).all(stateNorm, stateNorm, countyNorm, countyNorm);
    const candidatesRows = db.prepare("SELECT * FROM civics_candidates ORDER BY retrieved_at DESC").all();
    const orgRows = db.prepare("SELECT * FROM civics_orgs ORDER BY retrieved_at DESC").all();
    const eligibilityKey = `eligibility:${stateNorm.toLowerCase() || 'unknown'}`;
    const eligibilityRow = db.prepare("SELECT * FROM civics_eligibility WHERE key = ?").get(eligibilityKey);

    let elections = electionsRows.map((r) => ({
      election_id: r.election_id,
      name: r.name,
      jurisdiction: {
        country: r.country || "USA",
        state_or_region: r.state_or_region || "",
        county_or_district: r.county_or_district || "",
        city_or_locality: r.city_or_locality || "",
      },
      election_date: r.election_date,
      election_type: r.election_type || "unknown",
      election_level: r.election_level || "all",
      official_portal_name: r.official_portal_name || "",
      official_portal_url: r.official_portal_url || "",
      source_url: r.source_url || "",
      retrieved_at: r.retrieved_at || "",
      confidence: { overall: r.confidence_overall || "medium" },
    }));

    elections = elections.filter((e) => {
      if (election_type !== "all" && e.election_type !== election_type) return false;
      if (election_level !== "all" && e.election_level !== election_level) return false;
      if (!include_past && e.election_date) {
        const dt = new Date(`${e.election_date}T00:00:00`);
        if (Number.isFinite(dt.getTime()) && dt < now) return false;
      }
      return true;
    }).sort((a, b) => String(a.election_date || "").localeCompare(String(b.election_date || "")));

    let candidates = candidatesRows.map((r) => ({
      candidate_id: r.candidate_id,
      name: r.name,
      office: {
        office_name: r.office_name || "Office",
        level: r.office_level || "unknown",
        district: r.district || "",
      },
      party_affiliation: r.party_affiliation || "Not listed",
      incumbent: r.incumbent == null ? null : Boolean(r.incumbent),
      campaign_links: {
        official_website: r.official_website || "",
        social: (() => { try { return JSON.parse(r.social_links || "[]"); } catch { return []; } })(),
      },
      highlights: (() => { try { return JSON.parse(r.highlights || "[]"); } catch { return []; } })(),
      connections: (() => { try { return JSON.parse(r.connections || "[]"); } catch { return []; } })(),
      ai_quality: {
        relevance_score: Number(r.relevance_score || 0),
        classification_confidence: r.classification_confidence || "medium",
      },
      source_url: r.source_url || "",
      retrieved_at: r.retrieved_at || "",
    }));

    if (election_level !== "all") {
      candidates = candidates.filter((c) =>
        election_level === "federal" ? c.office.level === "national" : c.office.level === election_level
      );
    }

    const partiesAndCommittees = orgRows.map((r) => ({
      org_id: r.org_id,
      name: r.name,
      category: r.category || "other",
      address: r.address || "Not listed",
      lat: r.lat ?? null,
      lon: r.lon ?? null,
      phone: r.phone || "Not listed",
      email: r.email || "Not listed",
      website: r.website || "",
      services: (() => { try { return JSON.parse(r.services || "[]"); } catch { return []; } })(),
      source_url: r.source_url || "",
      retrieved_at: r.retrieved_at || "",
      confidence: { overall: r.confidence_overall || "medium" },
    }));

    const baseTools = getOfficialElectionTools(stateNorm);
    let eligibilityWidget = eligibilityRow
      ? {
          jurisdiction: { country: eligibilityRow.country || "USA", state_or_region: eligibilityRow.state_or_region || stateNorm },
          checklist_items: (() => { try { return JSON.parse(eligibilityRow.checklist_items || "[]"); } catch { return []; } })(),
          official_tools: (() => { try { return JSON.parse(eligibilityRow.official_tools || "[]"); } catch { return []; } })(),
          retrieved_at: eligibilityRow.retrieved_at || now.toISOString(),
          confidence: { overall: eligibilityRow.confidence_overall || "medium" },
        }
      : {
          jurisdiction: { country: "USA", state_or_region: stateNorm || "Unknown" },
          checklist_items: baseTools.checklist,
          official_tools: baseTools.tools,
          retrieved_at: now.toISOString(),
          confidence: { overall: "high" },
        };

    const latestRetrieved = [
      ...elections.map((e) => new Date(e.retrieved_at || 0).getTime()),
      ...candidates.map((c) => new Date(c.retrieved_at || 0).getTime()),
      ...partiesAndCommittees.map((o) => new Date(o.retrieved_at || 0).getTime()),
    ].filter((n) => Number.isFinite(n));
    const stale = latestRetrieved.length === 0 || (Date.now() - Math.max(...latestRetrieved)) > staleThresholdMs;
    const insufficient = elections.length === 0 || (section === "candidates" && candidates.length < 2) || (section === "parties" && partiesAndCommittees.length < 2);

    let sourcesUsed = [{ name: "Local DB Cache", url: "local://community.db", retrieved_at: now.toISOString() }];

    if (stale || insufficient) {
      const primaryQuery = `upcoming ${election_level} ${election_type} elections ${stateNorm} ${countyNorm} candidates parties committees ballot measures`;
      const eligibilityQuery = `voter registration eligibility polling place early voting absentee ballot ${stateNorm} ${countyNorm}`;
      const [scrapedPrimary, scrapedEligibility] = await Promise.all([
        scrapeSources(primaryQuery, location),
        scrapeSources(eligibilityQuery, location),
      ]);
      const baseMined = mapItemsToCivics(scrapedPrimary.results || [], { state_or_region: stateNorm, county_or_district: countyNorm, city_or_locality });
      const aiMined = await aiExtractCivicsFromItems(scrapedPrimary.results || [], {
        state_or_region: stateNorm,
        county_or_district: countyNorm,
        city_or_locality,
      });
      const mergedElections = dedupeByKey(
        [...baseMined.elections, ...(aiMined.elections || []).map((e, idx) => ({
          election_id: e.election_id || `ai-election-${idx}-${normalizeText(e.name || "election").toLowerCase().replace(/\s+/g, "-")}`,
          name: normalizeText(e.name || "Election"),
          jurisdiction: {
            country: "USA",
            state_or_region: stateNorm || "Unknown",
            county_or_district: countyNorm || "Unknown",
            city_or_locality: city_or_locality || "Unknown",
          },
          election_date: normalizeText(e.election_date || ""),
          election_type: e.election_type || detectElectionType(`${e.name || ""}`),
          election_level: e.election_level || detectElectionLevel(`${e.name || ""}`),
          official_portal_name: normalizeText(e.official_portal_name || baseTools.portalName),
          official_portal_url: normalizeText(e.official_portal_url || baseTools.portalUrl),
          source_url: normalizeText(e.source_url || e.official_portal_url || baseTools.portalUrl),
          retrieved_at: e.retrieved_at || now.toISOString(),
          confidence: { overall: e.confidence?.overall || "medium" },
        }))],
        (e) => normalizeText(e.election_id || `${e.name}|${e.election_date}|${e.election_type}`).toLowerCase()
      );
      const mergedCandidates = dedupeByKey(
        [...baseMined.candidates, ...(aiMined.candidates || []).map((c, idx) => ({
          candidate_id: c.candidate_id || `ai-candidate-${idx}-${normalizeText(c.name || "candidate").toLowerCase().replace(/\s+/g, "-")}`,
          name: normalizeText(c.name || "Candidate"),
          office: {
            office_name: normalizeText(c.office_name || c.office?.office_name || "Office"),
            level: c.office_level || c.office?.level || inferCandidateOfficeLevel(`${c.office_name || c.office?.office_name || ""}`),
            district: normalizeText(c.district || c.office?.district || countyNorm || "Unknown"),
          },
          party_affiliation: normalizeText(c.party_affiliation || "Not listed"),
          incumbent: typeof c.incumbent === "boolean" ? c.incumbent : null,
          campaign_links: {
            official_website: normalizeText(c.campaign_links?.official_website || c.source_url || ""),
            social: Array.isArray(c.campaign_links?.social) ? c.campaign_links.social : [],
          },
          highlights: Array.isArray(c.highlights) ? c.highlights : [],
          connections: Array.isArray(c.connections) ? c.connections : [],
          ai_quality: {
            relevance_score: Math.max(0, Math.min(100, Number(c.ai_quality?.relevance_score || 70))),
            classification_confidence: c.ai_quality?.classification_confidence || "medium",
          },
          source_url: normalizeText(c.source_url || c.campaign_links?.official_website || ""),
          retrieved_at: c.retrieved_at || now.toISOString(),
        }))],
        (c) => normalizeText(c.candidate_id || `${c.name}|${c.office?.office_name}|${c.office?.district}`).toLowerCase()
      );
      const mergedOrgs = dedupeByKey(
        [...baseMined.parties_and_committees, ...(aiMined.parties_and_committees || []).map((o, idx) => ({
          org_id: o.org_id || `ai-civics-org-${idx}-${normalizeText(o.name || "org").toLowerCase().replace(/\s+/g, "-")}`,
          name: normalizeText(o.name || "Civic Organization"),
          category: o.category || "other",
          address: normalizeText(o.address || "Not listed"),
          lat: Number.isFinite(Number(o.lat)) ? Number(o.lat) : null,
          lon: Number.isFinite(Number(o.lon)) ? Number(o.lon) : null,
          phone: normalizeText(o.phone || "Not listed"),
          email: normalizeText(o.email || "Not listed"),
          website: normalizeText(o.website || o.source_url || ""),
          services: Array.isArray(o.services) ? o.services : ["voter_info", "community_events"],
          source_url: normalizeText(o.source_url || o.website || ""),
          retrieved_at: o.retrieved_at || now.toISOString(),
          confidence: { overall: o.confidence?.overall || "medium" },
        }))],
        (o) => normalizeText(o.org_id || `${o.name}|${o.address}`).toLowerCase()
      );

      const eUpsert = db.prepare(`INSERT OR REPLACE INTO civics_elections (election_id,name,country,state_or_region,county_or_district,city_or_locality,election_date,election_type,election_level,official_portal_name,official_portal_url,source_url,retrieved_at,ttl_hours,last_verified_at,confidence_overall,needs_review) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      const cUpsert = db.prepare(`INSERT OR REPLACE INTO civics_candidates (candidate_id,name,office_name,office_level,district,party_affiliation,incumbent,official_website,social_links,highlights,connections,relevance_score,classification_confidence,source_url,retrieved_at,ttl_hours,last_verified_at,needs_review) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      const oUpsert = db.prepare(`INSERT OR REPLACE INTO civics_orgs (org_id,name,category,address,lat,lon,phone,email,website,services,source_url,retrieved_at,ttl_hours,last_verified_at,confidence_overall,needs_review) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

      const tx = db.transaction(() => {
        for (const e of mergedElections) {
          eUpsert.run(
            e.election_id,
            e.name,
            e.jurisdiction.country,
            e.jurisdiction.state_or_region,
            e.jurisdiction.county_or_district,
            e.jurisdiction.city_or_locality,
            e.election_date,
            e.election_type,
            e.election_level || "all",
            e.official_portal_name,
            e.official_portal_url,
            e.source_url || e.official_portal_url,
            e.retrieved_at || now.toISOString(),
            48,
            now.toISOString(),
            e.confidence?.overall || "medium",
            e.confidence?.overall === "low" ? 1 : 0
          );
        }
        for (const c of mergedCandidates) {
          cUpsert.run(
            c.candidate_id,
            c.name,
            c.office.office_name,
            c.office.level,
            c.office.district,
            c.party_affiliation,
            c.incumbent == null ? null : (c.incumbent ? 1 : 0),
            c.campaign_links.official_website,
            JSON.stringify(c.campaign_links.social || []),
            JSON.stringify(c.highlights || []),
            JSON.stringify(c.connections || []),
            Number(c.ai_quality?.relevance_score || 0),
            c.ai_quality?.classification_confidence || "medium",
            c.source_url || "",
            c.retrieved_at || now.toISOString(),
            48,
            now.toISOString(),
            c.ai_quality?.classification_confidence === "low" ? 1 : 0
          );
        }
        for (const o of mergedOrgs) {
          oUpsert.run(
            o.org_id,
            o.name,
            o.category,
            o.address,
            o.lat ?? null,
            o.lon ?? null,
            o.phone || "Not listed",
            o.email || "Not listed",
            o.website || "",
            JSON.stringify(o.services || []),
            o.source_url || "",
            o.retrieved_at || now.toISOString(),
            72,
            now.toISOString(),
            o.confidence?.overall || "medium",
            o.confidence?.overall === "low" ? 1 : 0
          );
        }
        db.prepare(
          "INSERT OR REPLACE INTO civics_eligibility (key,country,state_or_region,checklist_items,official_tools,source_url,retrieved_at,ttl_hours,last_verified_at,confidence_overall) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        ).run(
          eligibilityKey,
          "USA",
          stateNorm,
          JSON.stringify(
            dedupeByKey(
              [
                ...buildEligibilityFromItems(scrapedEligibility.results || [], baseTools),
                ...(aiMined.eligibility_items || []).map((it) => ({
                  text: normalizeText(it.text || ""),
                  source_url: normalizeText(it.source_url || baseTools.portalUrl),
                })),
              ],
              (it) => `${normalizeText(it.text).toLowerCase()}|${normalizeText(it.source_url).toLowerCase()}`
            ).slice(0, 8)
          ),
          JSON.stringify(baseTools.tools),
          baseTools.portalUrl,
          now.toISOString(),
          72,
          now.toISOString(),
          "high"
        );
      });
      tx();

      elections = [...elections, ...mergedElections]
        .filter((v, i, arr) => arr.findIndex((x) => x.election_id === v.election_id) === i)
        .filter((e) => {
          if (election_type !== "all" && e.election_type !== election_type) return false;
          if (election_level !== "all" && e.election_level !== election_level) return false;
          if (!include_past && e.election_date) {
            const dt = new Date(`${e.election_date}T00:00:00`);
            if (Number.isFinite(dt.getTime()) && dt < now) return false;
          }
          return true;
        })
        .sort((a, b) => String(a.election_date || "").localeCompare(String(b.election_date || "")));
      candidates = [...candidates, ...mergedCandidates].filter((v, i, arr) => arr.findIndex((x) => x.candidate_id === v.candidate_id) === i);
      if (election_level !== "all") {
        candidates = candidates.filter((c) => election_level === "federal" ? c.office.level === "national" : c.office.level === election_level);
      }
      const mergedOrgRows = [...partiesAndCommittees, ...mergedOrgs];
      const dedupedOrgMap = new Map();
      for (const o of mergedOrgRows) {
        const key = `${normalizeText(o.name).toLowerCase()}|${normalizeText(o.address).toLowerCase()}`;
        if (!dedupedOrgMap.has(key)) dedupedOrgMap.set(key, o);
      }
      sourcesUsed = [
        ...sourcesUsed,
        ...(scrapedPrimary.notes || []).map((n) => ({ name: "Fallback Source", url: n, retrieved_at: now.toISOString() })),
        ...(scrapedEligibility.notes || []).map((n) => ({ name: "Eligibility Source", url: n, retrieved_at: now.toISOString() })),
      ];
      eligibilityWidget = {
        jurisdiction: { country: "USA", state_or_region: stateNorm || "Unknown" },
        checklist_items: dedupeByKey(
          [
            ...buildEligibilityFromItems(scrapedEligibility.results || [], baseTools),
            ...(aiMined.eligibility_items || []).map((it) => ({
              text: normalizeText(it.text || ""),
              source_url: normalizeText(it.source_url || baseTools.portalUrl),
            })),
          ],
          (it) => `${normalizeText(it.text).toLowerCase()}|${normalizeText(it.source_url).toLowerCase()}`
        ).slice(0, 8),
        official_tools: baseTools.tools,
        retrieved_at: now.toISOString(),
        confidence: { overall: "high" },
      };
      return res.json({
        civics_politics: {
          elections,
          candidates,
          parties_and_committees: [...dedupedOrgMap.values()],
          eligibility_widget: eligibilityWidget,
          sources_used: sourcesUsed,
        },
      });
    }

    return res.json({
      civics_politics: {
        elections,
        candidates,
        parties_and_committees: partiesAndCommittees,
        eligibility_widget: eligibilityWidget,
        sources_used: sourcesUsed,
      },
    });
  });

  // API Routes
  app.get("/api/items/:tab", async (req, res) => {
    const { tab } = req.params;
    let items;
    if (tab === "all" || tab === "map_view") {
      items = db.prepare("SELECT * FROM community_items").all();
    } else if (tab === "mylist" || tab === "connections") {
      items = [];
    } else if (tab === "clinics_legal") {
      items = db.prepare("SELECT * FROM community_items WHERE type IN ('clinic', 'legal_aid', 'shelter', 'resource_center')").all();
    } else if (tab === "organizations") {
      items = db.prepare("SELECT * FROM community_items WHERE type IN ('organization', 'resource_center', 'shelter', 'legal_aid', 'clinic')").all();
    } else if (tab === "foodbanks") {
      items = db.prepare("SELECT * FROM community_items WHERE type IN ('foodbank', 'donation')").all();
    } else if (tab === "events") {
      items = db.prepare("SELECT * FROM community_items WHERE type IN ('event', 'class', 'workshop', 'networking', 'support_group')").all();
    } else if (tab === "volunteer") {
      items = db.prepare("SELECT * FROM community_items WHERE type = 'volunteer'").all();
    } else {
      items = [];
    }
    let normalizedItems = items.map((item) => {
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
        ai_tags: (() => {
          if (typeof item.ai_tags === "string" && item.ai_tags.trim()) {
            try { return JSON.parse(item.ai_tags); } catch { return []; }
          }
          return Array.isArray(item.ai_tags) ? item.ai_tags : [];
        })(),
        report_types: (() => {
          if (typeof item.report_types === "string" && item.report_types.trim()) {
            try { return JSON.parse(item.report_types); } catch { return []; }
          }
          return Array.isArray(item.report_types) ? item.report_types : [];
        })(),
        date_unknown: Boolean(item.date_unknown),
        needs_review: Boolean(item.needs_review),
        verified_source: Boolean(item.verified_source),
        low_relevance: Boolean(item.low_relevance),
        low_quality: Boolean(item.low_quality),
      };
    }).filter((item) => !item.low_relevance);

    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    const needsReclassification = normalizedItems.some((item) => {
      if (!item.primary_category || !item.classification_checked_at) return true;
      const checkedAt = new Date(item.classification_checked_at).getTime();
      if (Number.isNaN(checkedAt)) return true;
      return (Date.now() - checkedAt) > sevenDaysMs;
    });
    if (needsReclassification) {
      const reclassified = await runQualityPipeline(normalizedItems, { hideLowRelevance: true });
      normalizedItems = reclassified;
    }

    // Hard tab-level guardrails to prevent cross-category leakage from legacy labels.
    if (tab === "foodbanks") {
      normalizedItems = normalizedItems.filter((item) => {
        const text = `${item.title || ""} ${item.description || ""} ${item.type || ""}`.toLowerCase();
        return (item.type === "foodbank") || (item.type === "donation" && hasStrictFoodContext(text)) || hasStrictFoodContext(text);
      });
    } else if (tab === "clinics_legal") {
      normalizedItems = normalizedItems.filter((item) => {
        const text = `${item.title || ""} ${item.description || ""} ${item.type || ""}`.toLowerCase();
        return ["clinic", "legal_aid", "shelter"].includes(String(item.type || "").toLowerCase()) || hasStrictClinicLegalContext(text);
      });
    } else if (tab === "events") {
      normalizedItems = normalizedItems.filter((item) => ["event", "class", "workshop", "networking", "support_group"].includes(String(item.type || "").toLowerCase()));
    } else if (tab === "volunteer") {
      normalizedItems = normalizedItems.filter((item) => String(item.type || "").toLowerCase() === "volunteer");
    }

    const cache = db.prepare("SELECT summary FROM search_cache WHERE tab = ?").get(tab);
    res.json({ items: normalizedItems, summary: cache?.summary || "" });
  });

  app.post("/api/items", async (req, res) => {
    const { items, organizations, summary, tab } = req.body;
    
    const insertItem = db.prepare(`
      INSERT OR REPLACE INTO community_items (
        id, title, description, location_name, address, date_start, date_end, date_unknown,
        type, audience, latitude, longitude, distance_miles, organizer, accessibility_notes,
        source_name, source_url, confidence_overall, confidence_date, confidence_location,
        confidence_type, needs_review, category, phone, hours, services, eligibility,
        retrieved_at, location_confidence, neighborhood, verified_source, recommended_by_users,
        fieldOfStudy, academicLevel, careerFocus, industry, seniorityLevel, networkingVsTraining,
        primary_category, subcategory, ai_tags, relevance_score, quality_score, classification_confidence,
        low_relevance, low_quality, source_category, duplicate_of, user_reports, report_types, classification_checked_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const transaction = db.transaction((list) => {
      for (const item of list) {
        const normalized = normalizeCoordinates(item.lat ?? item.latitude, item.lon ?? item.longitude);
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
          normalized?.lat ?? null,
          normalized?.lon ?? null,
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
          item.retrieved_at || new Date().toISOString(),
          item.location_confidence || ((item.address || item.location_name) ? "medium" : "low"),
          item.neighborhood || null,
          item.verified_source ? 1 : 0,
          Number(item.recommended_by_users || 0),
          item.fieldOfStudy || null,
          item.academicLevel || null,
          item.careerFocus || null,
          item.industry || null,
          item.seniorityLevel || null,
          item.networkingVsTraining || null,
          item.primary_category || null,
          item.subcategory || null,
          Array.isArray(item.ai_tags) ? JSON.stringify(item.ai_tags) : null,
          Number.isFinite(Number(item.relevance_score)) ? Number(item.relevance_score) : null,
          Number.isFinite(Number(item.quality_score)) ? Number(item.quality_score) : null,
          item.classification_confidence || null,
          item.low_relevance ? 1 : 0,
          item.low_quality ? 1 : 0,
          item.source_category || null,
          item.duplicate_of || null,
          Number(item.user_reports || 0),
          Array.isArray(item.report_types) ? JSON.stringify(item.report_types) : null,
          item.classification_checked_at || new Date().toISOString()
        );
      }
    });

    const allItems = [...(items || []), ...(organizations || [])];
    const processed = await runQualityPipeline(allItems, { hideLowRelevance: true });
    const seen = new Set();
    const deduped = [];
    for (const item of processed) {
      const title = normalizeText(item.title || item.name).toLowerCase();
      const locationName = normalizeText(item.location_name || item.address).toLowerCase();
      const day = item.date_start ? String(item.date_start).slice(0, 10) : "unknown";
      const type = normalizeText(item.type || "organization").toLowerCase();
      const url = item.source_url ? canonicalUrl(item.source_url) : "";
      const key = url ? `url:${url}` : `${title}|${locationName}|${day}|${type}`;
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(item);
    }

    transaction(deduped);

    db.prepare("INSERT OR REPLACE INTO search_cache (tab, summary, last_updated) VALUES (?, ?, CURRENT_TIMESTAMP)")
      .run(tab, summary);

    res.json({ status: "ok" });
  });

  app.delete("/api/cache", (req, res) => {
    db.prepare("DELETE FROM community_items").run();
    db.prepare("DELETE FROM search_cache").run();
    res.json({ status: "ok" });
  });

  app.post("/api/reclassify-all", async (_req, res) => {
    const rows = db.prepare("SELECT * FROM community_items").all();
    if (rows.length === 0) {
      return res.json({ status: "ok", updated: 0 });
    }

    const items = rows.map((r) => ({
      id: r.id,
      title: r.title,
      description: r.description,
      location_name: r.location_name,
      address: r.address,
      date_start: r.date_start,
      date_end: r.date_end,
      type: r.type,
      category: r.category,
      audience: r.audience,
      lat: r.latitude,
      lon: r.longitude,
      source_name: r.source_name,
      source_url: r.source_url,
      retrieved_at: r.retrieved_at,
      needs_review: Boolean(r.needs_review),
      user_reports: Number(r.user_reports || 0),
      report_types: (() => { try { return JSON.parse(r.report_types || "[]"); } catch { return []; } })(),
    }));

    const classified = await runQualityPipeline(items, { hideLowRelevance: false });
    const update = db.prepare(`
      UPDATE community_items
      SET type = ?, audience = ?, needs_review = ?, primary_category = ?, subcategory = ?, ai_tags = ?, relevance_score = ?, quality_score = ?,
          classification_confidence = ?, low_relevance = ?, low_quality = ?, source_category = ?, duplicate_of = ?, classification_checked_at = ?, last_updated = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    const tx = db.transaction((list) => {
      for (const it of list) {
        update.run(
          it.type || "event",
          it.audience || "general",
          it.needs_review ? 1 : 0,
          it.primary_category || null,
          it.subcategory || null,
          JSON.stringify(it.ai_tags || []),
          Number.isFinite(Number(it.relevance_score)) ? Number(it.relevance_score) : null,
          Number.isFinite(Number(it.quality_score)) ? Number(it.quality_score) : null,
          it.classification_confidence || null,
          it.low_relevance ? 1 : 0,
          it.low_quality ? 1 : 0,
          it.source_category || null,
          it.duplicate_of || null,
          it.classification_checked_at || new Date().toISOString(),
          it.id
        );
      }
    });
    tx(classified);

    return res.json({ status: "ok", updated: classified.length });
  });

  app.post("/api/connections/search", (req, res) => {
    const {
      current_user_id = CURRENT_USER_ID,
      location,
      filters = {},
      page = 1,
      page_size = 10,
    } = req.body || {};

    const currentUser = simulatedProfiles.find((p) => p.user_id === current_user_id) || simulatedProfiles[0];
    const hasIncomingCoords =
      Number.isFinite(Number(location?.latitude)) && Number.isFinite(Number(location?.longitude));
    const effectiveLocation = hasIncomingCoords
      ? { latitude: Number(location.latitude), longitude: Number(location.longitude) }
      : {
          latitude: Number(currentUser?.location?.lat ?? 35.9132),
          longitude: Number(currentUser?.location?.lon ?? -79.0558),
        };

    const radius = Number(filters.radius_miles || 25);
    const audience = (filters.audience_type || "all").toLowerCase();
    const field = normalizeText(filters.field_of_study || "").toLowerCase();
    const industry = normalizeText(filters.industry || "").toLowerCase();
    const skills = normalizeText(filters.skills || "").toLowerCase();
    const interests = normalizeText(filters.interests || "").toLowerCase();
    const orgMembership = normalizeText(filters.organization_membership || "").toLowerCase();
    const availability = normalizeText(filters.availability || "").toLowerCase();
    const eventHistory = normalizeText(filters.event_participation || "").toLowerCase();
    const academicLevel = normalizeText(filters.academic_level || "").toLowerCase();
    const experienceLevel = normalizeText(filters.experience_level || "").toLowerCase();
    const sortBy = (filters.sort_by || "nearest").toLowerCase();

    let results = simulatedProfiles
      .filter((profile) => profile.user_id !== current_user_id)
      .map((profile) => {
        const hasCoords = profile.location?.lat != null && profile.location?.lon != null;
        const distance = hasCoords
          ? calculateDistanceMiles(effectiveLocation.latitude, effectiveLocation.longitude, profile.location.lat, profile.location.lon)
          : null;
        const sharedInterests = sharedValues(
          [...(currentUser?.skills || []), ...(currentUser?.interests || [])],
          [...(profile.skills || []), ...(profile.interests || [])]
        );
        return {
          ...profile,
          _distance_miles: distance,
          _is_connection: isConnection(current_user_id, profile.user_id),
          _shared_interests: sharedInterests,
        };
      })
      .filter((profile) => !isBlocked(current_user_id, profile.user_id))
      .filter((profile) => profile._distance_miles == null || profile._distance_miles <= radius)
      .filter((profile) => {
        if (profile.profile_visibility === "connections_only" && !profile._is_connection) return false;
        if (profile.profile_visibility === "nearby_only" && (profile._distance_miles == null || profile._distance_miles > radius)) return false;
        return true;
      })
      .filter((profile) => audience === "all" || profile.audience_type === audience)
      .filter((profile) => !field || (profile.field_of_study || "").toLowerCase().includes(field))
      .filter((profile) => !industry || (profile.industry || "").toLowerCase().includes(industry))
      .filter((profile) => !skills || profile.skills.some((s) => s.toLowerCase().includes(skills)))
      .filter((profile) => !interests || profile.interests.some((i) => i.toLowerCase().includes(interests)))
      .filter((profile) => !orgMembership || profile.organization_memberships.some((m) => m.toLowerCase().includes(orgMembership)))
      .filter((profile) => !availability || (profile.availability || "").toLowerCase().includes(availability))
      .filter((profile) => !eventHistory || profile.event_participation_history.some((e) => e.toLowerCase().includes(eventHistory)))
      .filter((profile) => !academicLevel || (profile.academic_level || "").toLowerCase() === academicLevel)
      .filter((profile) => !experienceLevel || (profile.experience_level || "").toLowerCase() === experienceLevel);

    results.sort((a, b) => {
      if (sortBy === "most_active") return new Date(b.last_active).getTime() - new Date(a.last_active).getTime();
      if (sortBy === "newest_members") return new Date(b.joined_date).getTime() - new Date(a.joined_date).getTime();
      if (sortBy === "shared_interests") return b._shared_interests.length - a._shared_interests.length || (a._distance_miles ?? 9999) - (b._distance_miles ?? 9999);
      return (a._distance_miles ?? 9999) - (b._distance_miles ?? 9999);
    });

    const total = results.length;
    const safePageSize = Math.max(1, Math.min(50, Number(page_size) || 10));
    const safePage = Math.max(1, Number(page) || 1);
    const start = (safePage - 1) * safePageSize;
    const paged = results.slice(start, start + safePageSize).map((profile) => {
      let visibleDistance = profile._distance_miles;
      if (profile.location_visibility === "hidden") visibleDistance = null;
      if (profile.location_visibility === "approximate_area" && visibleDistance != null) {
        visibleDistance = Math.max(1, Math.round(visibleDistance / 5) * 5);
      }
      return {
        user_id: profile.user_id,
        display_name: profile.display_name,
        audience_type: profile.audience_type,
        distance_miles: visibleDistance != null ? Number(visibleDistance.toFixed(1)) : null,
        field_of_study: profile.field_of_study || "",
        industry: profile.industry || "",
        skills: profile.skills || [],
        interests: profile.interests || [],
        shared_interests: profile._shared_interests || [],
        profile_summary: profile.bio || "No bio available.",
        profile_color_theme: profile.profile_color_theme || "#5A5A40",
        last_active: profile.last_active,
      };
    });

    const notes = [
      ...(!hasIncomingCoords ? ["Location unavailable. Using your profile/default area for nearby matching."] : []),
      ...(total === 0 ? ["No users matched your filters. Try increasing radius or removing one or more filters."] : []),
    ];

    return res.json({
      connections: paged,
      total,
      page: safePage,
      page_size: safePageSize,
      notes,
    });
  });

  app.get("/api/messages/:peerId", (req, res) => {
    const currentUserId = (req.query.current_user_id || CURRENT_USER_ID).toString();
    const peerId = req.params.peerId;

    const conversation = simulatedMessages
      .filter((m) =>
        (m.sender_id === currentUserId && m.receiver_id === peerId) ||
        (m.sender_id === peerId && m.receiver_id === currentUserId)
      )
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
      .map((m) => {
        if (m.sender_id === peerId && m.receiver_id === currentUserId) {
          m.read_status = true;
        }
        return m;
      });

    return res.json({ messages: conversation });
  });

  app.post("/api/messages", (req, res) => {
    const {
      current_user_id = CURRENT_USER_ID,
      sender_id = CURRENT_USER_ID,
      receiver_id,
      message_text,
    } = req.body || {};

    if (!receiver_id || !normalizeText(message_text)) {
      return res.status(400).json({ error: "receiver_id and message_text are required" });
    }
    if (sender_id !== current_user_id) {
      return res.status(400).json({ error: "sender_id must match current_user_id" });
    }
    if (isBlocked(sender_id, receiver_id)) {
      return res.status(403).json({ error: "Messaging is blocked between these users" });
    }

    const sender = simulatedProfiles.find((p) => p.user_id === sender_id);
    const receiver = simulatedProfiles.find((p) => p.user_id === receiver_id);
    if (!sender || !receiver) {
      return res.status(404).json({ error: "User not found" });
    }

    const senderDistance = calculateDistanceMiles(
      sender.location.lat,
      sender.location.lon,
      receiver.location.lat,
      receiver.location.lon
    );
    const canMessage =
      receiver.messaging_permission === "anyone" ||
      (receiver.messaging_permission === "nearby_users" && senderDistance <= 25) ||
      (receiver.messaging_permission === "connections_only" && isConnection(sender_id, receiver_id));

    if (!canMessage) {
      return res.status(403).json({ error: "Receiver privacy settings do not allow this message" });
    }

    const message = {
      message_id: randomUUID(),
      sender_id,
      receiver_id,
      timestamp: new Date().toISOString(),
      message_text: normalizeText(message_text),
      read_status: false,
    };
    simulatedMessages.push(message);
    return res.json({ message });
  });

  app.post("/api/listings/repair", async (req, res) => {
    const input = Array.isArray(req.body?.items) ? req.body.items : [];
    if (input.length === 0) {
      return res.json({ items: [], notes: [] });
    }

    const cleaned = input.slice(0, 200).map((item) => ({
      ...item,
      title: cleanListingText(item.title || item.name || ""),
      location_name: cleanListingText(item.location_name || ""),
      address: cleanListingText(item.address || ""),
      description: cleanListingText(item.description || ""),
    }));

    const aiRepairs = await aiRepairListings(cleaned);
    const repairMap = new Map(
      aiRepairs
        .filter((r) => Number.isFinite(Number(r.index)))
        .map((r) => [Number(r.index), r])
    );

    const merged = cleaned.map((item, idx) => {
      const repair = repairMap.get(idx);
      if (!repair) return item;
      return {
        ...item,
        location_name: cleanListingText(repair.location_name || item.location_name || ""),
        address: cleanListingText(repair.address || item.address || ""),
        description: cleanListingText(repair.description || item.description || ""),
      };
    });

    return res.json({
      items: merged,
      notes: [aiRepairs.length > 0 ? "AI-assisted listing normalization applied." : "Rule-based listing normalization applied."],
    });
  });

  app.post("/api/geocode/batch", async (req, res) => {
    const queries = Array.isArray(req.body?.queries) ? req.body.queries : [];
    const unique = [...new Set(queries.map((q) => normalizeText(q)).filter(Boolean))].slice(0, 1000);
    const results = {};

    for (const query of unique) {
      const hit = await geocodeQuery(query);
      if (hit) {
        results[query] = hit;
      }
    }

    return res.json({ results });
  });

  app.get("/api/videos/search", async (req, res) => {
    const apiKey = process.env.YOUTUBE_API_KEY || process.env.YOUTUBE_API || "";
    const query = normalizeText(req.query.q || "");
    const order = normalizeText(req.query.order || "relevance");
    const duration = normalizeText(req.query.duration || "any"); // short|medium|long|any
    const maxResults = Math.max(1, Math.min(25, Number(req.query.maxResults || 12)));
    const pageToken = normalizeText(req.query.pageToken || "");
    if (!apiKey) {
      return res.status(400).json({ videos: [], error: "YOUTUBE_API_KEY is not configured" });
    }
    if (!query) {
      return res.json({ videos: [] });
    }

    try {
      const searchParams = new URLSearchParams({
        key: apiKey,
        q: query,
        part: "snippet",
        type: "video",
        maxResults: String(maxResults),
        order: ["date", "relevance", "rating", "title", "viewCount"].includes(order) ? order : "relevance",
      });
      if (duration && duration !== "any") {
        searchParams.set("videoDuration", duration);
      }
      if (pageToken) {
        searchParams.set("pageToken", pageToken);
      }
      const searchResp = await fetch(`https://www.googleapis.com/youtube/v3/search?${searchParams.toString()}`);
      if (!searchResp.ok) {
        return res.status(searchResp.status).json({ videos: [], error: "YouTube search failed" });
      }
      const searchData = await searchResp.json();
      const items = searchData.items || [];
      const ids = items.map((i) => i.id?.videoId).filter(Boolean);
      if (ids.length === 0) {
        return res.json({ videos: [], nextPageToken: searchData.nextPageToken || null });
      }

      const detailsParams = new URLSearchParams({
        key: apiKey,
        part: "contentDetails,snippet",
        id: ids.join(","),
      });
      const detailsResp = await fetch(`https://www.googleapis.com/youtube/v3/videos?${detailsParams.toString()}`);
      const detailsData = detailsResp.ok ? await detailsResp.json() : { items: [] };
      const detailMap = new Map((detailsData.items || []).map((v) => [v.id, v]));

      const localTerms = /(chapel hill|durham|raleigh|triangle|north carolina|nc|community|local|neighborhood)/i;
      const videos = items.map((item) => {
        const videoId = item.id.videoId;
        const d = detailMap.get(videoId);
        const durationIso = d?.contentDetails?.duration || "";
        const mins = parseIso8601DurationToMinutes(durationIso);
        const channelType = classifyChannelType(item.snippet?.channelTitle || "", item.snippet?.description || "");
        const text = `${item.snippet?.title || ""} ${item.snippet?.description || ""}`;
        return {
          video_id: videoId,
          title: item.snippet?.title || "Untitled",
          channel_name: item.snippet?.channelTitle || "Unknown",
          channel_type: channelType,
          published_date: item.snippet?.publishedAt || null,
          duration: durationIso,
          duration_minutes: mins,
          thumbnail: item.snippet?.thumbnails?.medium?.url || item.snippet?.thumbnails?.default?.url || "",
          description: item.snippet?.description || "",
          watch_url: `https://www.youtube.com/watch?v=${videoId}`,
          embed_url: `https://www.youtube.com/embed/${videoId}`,
          local_relevance: localTerms.test(text) ? "high" : "medium",
        };
      });

      return res.json({ videos, nextPageToken: searchData.nextPageToken || null });
    } catch (err) {
      return res.status(500).json({ videos: [], error: "YouTube integration failed" });
    }
  });

  app.post("/api/artists/search", async (req, res) => {
    const { query = "", location = null, radius_miles = 25, page = 1, page_size = 20 } = req.body || {};
    const limit = Math.max(1, Math.min(100, Number(page_size) || 20));
    let all = discoverArtistsFromDb(query, location, Number(radius_miles || 25), 500);
    let source = "local_db";

    if (all.length === 0) {
      try {
        const apiKey = process.env.BACKBOARD_API_KEY || process.env.BACKBOARD_API || "";
        const base = process.env.BACKBOARD_API_URL || "https://api.backboard.io";
        if (apiKey) {
          const candidates = [
            `${base.replace(/\/$/, "")}/v1/search`,
            `${base.replace(/\/$/, "")}/search`,
          ];
          for (const url of candidates) {
            try {
              const response = await fetch(url, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${apiKey}`,
                  "x-api-key": apiKey,
                },
                body: JSON.stringify({
                  query: `Find local artists (musicians, painters, photographers, performers, creators) near me. ${normalizeText(query) || ""}`,
                  location: location ? { lat: location.latitude, lon: location.longitude } : null,
                  radius_miles: Number(radius_miles || 25),
                }),
              });
              if (!response.ok) continue;
              const payload = await response.json();
              const normalized = normalizeBackboardResults(payload);
              const aiArtists = mapItemsToArtists(normalized, location, Number(radius_miles || 25), 500);
              if (aiArtists.length > 0) {
                all = aiArtists;
                source = "backboard_ai";
                break;
              }
            } catch {
              // Try next Backboard URL shape.
            }
          }
        }
      } catch {
        // Keep fallback path.
      }
    }

    if (all.length === 0) {
      try {
        const scraped = await scrapeSources(`local artists ${query || ""}`.trim(), location);
        all = mapItemsToArtists(scraped.results || [], location, Number(radius_miles || 25), 500);
        if (all.length > 0) source = "scraper_fallback";
      } catch {
        // Ignore scrape fallback errors.
      }
    }

    const safePage = Math.max(1, Number(page) || 1);
    const start = (safePage - 1) * limit;
    const paged = all.slice(start, start + limit);
    return res.json({
      artists: paged,
      total: all.length,
      page: safePage,
      page_size: limit,
      api_sources: [source],
    });
  });

  app.post("/api/assistant/query", async (req, res) => {
    const { message = "", location = null } = req.body || {};
    const q = normalizeText(message).toLowerCase();
    if (!q) return res.json({ answer: "Ask me what you want to find nearby.", suggestions: [] });
    const rows = db.prepare("SELECT * FROM community_items").all();
    const matches = rows.filter((row) => {
      const text = `${row.title || ""} ${row.description || ""} ${row.type || ""} ${row.category || ""}`.toLowerCase();
      return q.split(/\s+/).every((token) => text.includes(token) || token.length <= 2);
    }).slice(0, 5);
    const suggestions = matches.map((m) => ({
      title: m.title,
      type: m.type,
      source_url: m.source_url,
      location_name: m.location_name || m.address || "Not listed",
      distance_miles: (location?.latitude != null && location?.longitude != null && normalizeCoordinates(m.latitude, m.longitude))
        ? Number(calculateDistanceMiles(location.latitude, location.longitude, m.latitude, m.longitude).toFixed(1))
        : null,
    }));
    if (suggestions.length > 0) {
      return res.json({
        answer: `Found ${suggestions.length} matching items. Open details for directions and source links.`,
        suggestions,
        api_sources: ["local_cache"],
      });
    }

    // Backboard assistant fallback for no local matches.
    try {
      const apiKey = process.env.BACKBOARD_API_KEY || process.env.BACKBOARD_API || "";
      const base = process.env.BACKBOARD_API_URL || "https://api.backboard.io";
      if (apiKey) {
        const response = await fetch(`${base.replace(/\/$/, "")}/v1/search`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
            "x-api-key": apiKey,
          },
          body: JSON.stringify({
            query: message,
            location: location ? { lat: location.latitude, lon: location.longitude } : null,
          }),
        });
        if (response.ok) {
          const payload = await response.json();
          const items = normalizeBackboardResults(payload).slice(0, 5);
          const backboardSuggestions = items.map((m) => ({
            title: m.title,
            type: m.type,
            source_url: m.source_url,
            location_name: m.location_name || m.address || "Not listed",
            distance_miles: null,
          }));
          if (backboardSuggestions.length > 0) {
            return res.json({
              answer: `No exact local match found. I pulled ${backboardSuggestions.length} additional web results.`,
              suggestions: backboardSuggestions,
              api_sources: ["backboard"],
            });
          }
        }
      }
    } catch {
      // Ignore fallback errors.
    }

    return res.json({
      answer: "No exact match in current data. Try broader keywords or refresh nearby sources.",
      suggestions: [],
      api_sources: ["local_cache"],
    });
  });

  app.post("/api/backboard/search", async (req, res) => {
    const apiKey = process.env.BACKBOARD_API_KEY || process.env.BACKBOARD_API || "";
    const base = process.env.BACKBOARD_API_URL || "https://api.backboard.io";
    const { query = "", location = null } = req.body || {};
    if (!apiKey) {
      return res.status(400).json({ items: [], notes: ["Backboard API key not configured"] });
    }

    const candidates = [
      `${base.replace(/\/$/, "")}/v1/search`,
      `${base.replace(/\/$/, "")}/search`,
    ];

    for (const url of candidates) {
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
            "x-api-key": apiKey,
          },
          body: JSON.stringify({
            query,
            location: location
              ? { lat: location.latitude, lon: location.longitude }
              : null,
            radius_miles: Number(process.env.SCRAPER_RADIUS_MILES || 25),
          }),
        });
        if (!response.ok) continue;
        const payload = await response.json();
        const normalized = normalizeBackboardResults(payload);
        const items = await runQualityPipeline(normalized, { hideLowRelevance: true });
        return res.json({
          items,
          organizations: [],
          notes: ["Backboard failover used", "AI quality pipeline applied"],
          api_sources: ["backboard"],
        });
      } catch {
        // Try next candidate.
      }
    }

    return res.status(502).json({ items: [], notes: ["Backboard request failed"], api_sources: ["backboard"] });
  });

  app.post("/api/scrape-fallback", async (req, res) => {
    const { query, location } = req.body || {};
    const scraped = await scrapeSources(query || "", location);
    const resultsWithCoordinates = (scraped.results || []).filter((item) => isValidCoordinate(item.lat, item.lon)).length;
    res.json({
      ui_layout: {
        layout_type: "two_column_nextdoor_style_v3",
        left_tabs: ["events","volunteer","food_assistance","organizations","help_support","connections","saved","map_all","settings"],
        help_support_sections: ["clinics","legal_aid","shelters","translators","newcomer_guides"],
        right_view_mode: "list",
        active_tab: "events"
      },
      query_context: {
        user_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York",
        now_local: new Date().toISOString(),
        user_location: {
          lat: location?.latitude ?? null,
          lon: location?.longitude ?? null,
          city: null,
          zip: null
        },
        radius_miles: Number(process.env.SCRAPER_RADIUS_MILES || 25),
        date_range: {
          start: new Date().toISOString(),
          end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        },
        generated_at: new Date().toISOString(),
      },
      filters: {
        common: {
          radius_miles: 10,
          sort: "distance",
          audience: ["student", "professional", "general"]
        },
        events: {
          time_window: "upcoming_only",
          include_past_events: false,
          include_undated: false,
          date_range: { start: null, end: null },
          type: [],
          cost: "any",
          time_of_day: [],
          format: "any"
        },
        connections: {
          audience_type: ["student", "professional", "general"],
          field_of_study: [],
          academic_level: "any",
          industry: [],
          experience_level: "any",
          skills: [],
          interests: []
        }
      },
      map_scope: "radius",
      map_debug: {
        total_results: scraped.results?.length || 0,
        results_with_coordinates: resultsWithCoordinates,
        markers_displayed: resultsWithCoordinates
      },
      layout_debug: {
        sidebar_width_px: 260,
        content_start_px: 260,
        content_width_px: 1200,
        horizontal_gap_px: 0
      },
      api_sources: ["youtube", "openstreetmap", "nominatim", "scraper"],
      ai_assistant_enabled: true,
      ui_settings: {
        appearance: "system",
        accent_preset: "failover",
        accent_custom_hex: "#5A5A40",
        high_contrast_mode: false,
        large_text_mode: false,
        reduced_motion: false,
        translation_enabled: true,
        interface_language: "English",
      },
      results: scraped.results,
      organizations: scraped.organizations,
      help_support: {
        translators: [],
        newcomer_guides: [],
      },
      connections: [],
      messages: [],
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
              "ui_layout": {
                "layout_type": "two_column_nextdoor_style_v3",
                "left_tabs": ["events","volunteer","food_assistance","organizations","help_support","connections","saved","map_all","settings"],
                "help_support_sections": ["clinics","legal_aid","shelters","translators","newcomer_guides"],
                "right_view_mode": "list|map|split",
                "active_tab": "events|volunteer|food_assistance|organizations|help_support|connections|saved|map_all|settings"
              },
              "query_context": {
                "user_timezone": "America/New_York",
                "now_local": "ISO_8601_TIMESTAMP",
                "user_location": {"lat": number|null, "lon": number|null, "city": "string|null", "zip": "string|null"},
                "radius_miles": number,
                "date_range": {"start": "ISO8601", "end": "ISO8601"},
                "generated_at": "ISO8601"
              },
              "filters": {
                "common": {"radius_miles": 10, "sort": "distance|soonest|newest|relevance", "audience": ["student","professional","general"]},
                "events": {"time_window": "upcoming_only|today|this_week|this_month|custom", "include_past_events": false, "include_undated": false, "date_range": {"start": null, "end": null}, "type": [], "cost": "free_only|any", "time_of_day": [], "format": "in_person|online|hybrid|any"},
                "connections": {"audience_type": ["student","professional","general"], "field_of_study": [], "academic_level": "undergrad|grad|any", "industry": [], "experience_level": "entry|mid|senior|any", "skills": [], "interests": []}
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
                  "entity_kind": "event|volunteer|resource|organization|clinic_legal",
                  "title": "string",
                  "type": "event|volunteer|foodbank|donation|class|workshop|networking|support_group|clinic|legal_aid|shelter|resource_center",
                  "audience": "student|professional|general|families|seniors",
                  "date_start": "ISO8601|null",
                  "date_end": "ISO8601|null",
                  "date_unknown": boolean,
                  "is_upcoming": boolean,
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
                  "retrieved_at": "ISO8601",
                  "confidence": {"overall": "high|medium|low", "date": "high|medium|low", "location": "high|medium|low", "type": "high|medium|low"},
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
              "connections": [],
              "messages": [],
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
      const processedResults = await runQualityPipeline(result.results || [], { hideLowRelevance: true });
      const processedOrgs = await runQualityPipeline(
        (result.organizations || []).map((org, idx) => ({
          id: org.id || `org-${idx}-${normalizeText(org.name || "organization").toLowerCase().replace(/\s+/g, "-")}`,
          title: org.name || "Organization",
          description: org.description || "",
          location_name: org.name || "",
          address: org.address || "",
          type: org.category === "legal_aid" ? "legal_aid" : org.category === "free_clinic" ? "clinic" : org.category === "food_assistance" ? "foodbank" : "resource_center",
          audience: "general",
          source_url: org.source_url || "",
          source_name: "OpenAI failover",
          lat: org.lat ?? null,
          lon: org.lon ?? null,
        })),
        { hideLowRelevance: true }
      );
      result.results = processedResults;
      result.organizations = processedOrgs;
      result.notes = [...(result.notes || []), "AI quality pipeline applied (classification, relevance, dedupe)."];
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

  app.use((err, _req, res, next) => {
    if (err?.type === "entity.too.large") {
      return res.status(413).json({
        error: "Payload too large",
        message: "Request body exceeded server limit. Reduce result size or send in smaller chunks."
      });
    }
    return next(err);
  });

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
