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
    const sourceLink = canonicalUrl(linkTag || sourceUrl, sourceUrl);
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
    const link = canonicalUrl(pick("URL") || sourceUrl, sourceUrl);
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
        lat: venue?.location?.latitude ? Number(venue.location.latitude) : null,
        lon: venue?.location?.longitude ? Number(venue.location.longitude) : null,
        distance_miles: null,
        organizer: event?.promoter?.name || "Not listed",
        description: normalizeText(event?.info || event?.pleaseNote || "Not listed"),
        accessibility_notes: normalizeText(event?.accessibility?.info || "Not listed"),
        source_name: "Ticketmaster API",
        source_url: canonicalUrl(event?.url || ""),
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
        lat: addressObj?.latitude ? Number(addressObj.latitude) : null,
        lon: addressObj?.longitude ? Number(addressObj.longitude) : null,
        distance_miles: null,
        organizer: event?.organizer?.name || "Not listed",
        description: normalizeText(event?.summary || event?.description?.text || "Not listed"),
        accessibility_notes: "Not listed",
        source_name: "Eventbrite API",
        source_url: canonicalUrl(event?.url || ""),
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
      `Deterministic scraper fallback used (${sources.length} configured feeds, ${deduped.length} deduplicated listings).`,
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

  app.post("/api/connections/search", (req, res) => {
    const {
      current_user_id = CURRENT_USER_ID,
      location,
      filters = {},
      page = 1,
      page_size = 10,
    } = req.body || {};

    if (!location?.latitude || !location?.longitude) {
      return res.json({
        connections: [],
        total: 0,
        page,
        page_size,
        notes: ["Location unavailable. Please share city/ZIP or enable location to discover nearby users."],
      });
    }

    const currentUser = simulatedProfiles.find((p) => p.user_id === current_user_id) || simulatedProfiles[0];
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
          ? calculateDistanceMiles(location.latitude, location.longitude, profile.location.lat, profile.location.lon)
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

    const notes = total === 0
      ? ["No users matched your filters. Try increasing radius or removing one or more filters."]
      : [];

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

  app.post("/api/scrape-fallback", async (req, res) => {
    const { query, location } = req.body || {};
    const scraped = await scrapeSources(query || "", location);
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
