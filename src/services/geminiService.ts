import { GoogleGenAI } from "@google/genai";

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = (typeof process !== "undefined" && process.env?.GEMINI_API_KEY) || "";
  if (!apiKey) {
    return null;
  }
  return new GoogleGenAI({ apiKey });
}

export interface Location {
  latitude: number;
  longitude: number;
}

export function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3958.8; // Radius of the Earth in miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function normalizeDateString(value: any): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function normalizeText(value: any): string {
  return String(value || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeItems(rows: any[]) {
  return (rows || []).map((item: any) => {
    const dateStart = normalizeDateString(item.date_start || item.start_date || item.start);
    const dateEnd = normalizeDateString(item.date_end || item.end_date || item.end);
    return {
      ...item,
      title: item.title || item.name || "Untitled",
      description: normalizeText(item.description || item.summary || "Not listed"),
      date_start: dateStart,
      date_end: dateEnd,
      date_unknown: !dateStart && !dateEnd,
      address: normalizeText(item.address || "Not listed"),
      location_name: normalizeText(item.location_name || item.venue || item.place || "Not listed"),
      source_url: item.source_url || item.url || "",
      retrieved_at: item.retrieved_at || new Date().toISOString(),
    };
  });
}

function dedupeBySourceAndSignature(items: any[]) {
  const seen = new Set<string>();
  const out: any[] = [];
  for (const item of items || []) {
    const day = item.date_start ? String(item.date_start).slice(0, 10) : "unknown";
    const key = item.source_url
      ? `url:${item.source_url}`
      : `${String(item.title || "").toLowerCase()}|${String(item.location_name || item.address || "").toLowerCase()}|${day}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

export async function fetchCommunityData(query: string, location?: Location, retries = 3, delay = 2000) {
  const model = "gemini-2.5-flash";
  const fallbackNotes = [
    "No structured listings were returned by the model response.",
    "Try widening radius/date range and prioritizing deterministic scrapers (city calendar, university calendar, nonprofit pages, libraries)."
  ];
  
  const config: any = {
    tools: [{ googleMaps: {} }, { googleSearch: {} }],
    responseMimeType: "application/json",
  };

  if (location) {
    config.toolConfig = {
      retrievalConfig: {
        latLng: {
          latitude: location.latitude,
          longitude: location.longitude,
        },
      },
    };
  }

  const refinedQuery = `You are an assistant embedded in an app that helps users discover nearby opportunities.
Your job is to return structured, actionable results and be transparent about sources and certainty.

CORE GOAL
- Find and present nearby: events, volunteering opportunities, food bank/donation resources, and community organizations/services.
- Categorize results for easy filtering and browsing.

DATA SOURCING (deterministic-first)
- Prefer deterministic sources and grounded lookups first.
- Use AI for cleanup/summarization/classification/deduplication, not invention.
- Always attach source_url for each listing.
- Clearly separate confirmed-from-source fields from inferred fields in notes/confidence text.
- Do not invent details. If missing, use null or "Not listed".

CATEGORIZATION
- type: one of ["event","volunteer","foodbank","donation","class","workshop","networking","support_group","clinic","legal_aid","shelter","resource_center"]
- audience: one of ["student","professional","general","families","seniors"]
- If uncertain, set audience to "general" and needs_review=true.
- Events MUST default to upcoming-only results (exclude past events unless user explicitly asks).

FILTER FIELDS (include when available)
- Student-focused fields: fieldOfStudy, academicLevel ["undergrad","grad","any"], careerFocus ["internship","networking","skills","social","any"]
- Professional-focused fields: industry, seniorityLevel, networkingVsTraining

ORGANIZATION COVERAGE
- Include nearby service organizations where available: shelters, legal aid, free/low-cost clinics, local lawyers, food assistance, crisis support, immigration support, domestic violence resources.

RESPONSE FORMAT
Return ONLY valid JSON with this exact top-level shape:
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
      "description": "string (1-3 sentences)",
      "accessibility_notes": "string",
      "source_name": "string",
      "source_url": "string",
      "retrieved_at": "ISO_8601_TIMESTAMP",
      "confidence": {"overall": "high|medium|low", "date": "high|medium|low", "location": "high|medium|low", "type": "high|medium|low"},
      "needs_review": boolean,
      "fieldOfStudy": "string (optional)",
      "academicLevel": "undergrad|grad|any (optional)",
      "careerFocus": "internship|networking|skills|social|any (optional)",
      "industry": "string (optional)",
      "seniorityLevel": "string (optional)",
      "networkingVsTraining": "string (optional)"
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
  "notes": ["brief gaps/limitations + source strategy used"]
}

EMPTY RESULTS RULE
- If results are empty, include actionable notes suggesting next sources to scrape (city calendar, university calendar, nonprofit pages, libraries) and recommend widening radius/date range.

Current Location: ${location ? `${location.latitude}, ${location.longitude}` : 'Unknown'}.
Current Time: ${new Date().toISOString()}.
Query: ${query}`;

  try {
    const ai = getGeminiClient();
    if (!ai) {
      throw new Error("Gemini API key is missing");
    }

    const response = await ai.models.generateContent({
      model,
      contents: refinedQuery,
      config,
    });

    const text = response.text || "";
    let items = [];
    let organizations = [];
    let summary = "";
    let notes = [];

    try {
      const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/i) || text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const jsonStr = jsonMatch[1] || jsonMatch[0];
        const parsed = JSON.parse(jsonStr);
        items = parsed.results || [];
        organizations = parsed.organizations || [];
        notes = parsed.notes || [];
        summary = notes.join(" ");
      } else {
        notes = fallbackNotes;
        summary = fallbackNotes[0];
      }
    } catch (e) {
      notes = fallbackNotes;
      summary = fallbackNotes[0];
    }

    // Guardrail: never surface unstructured refusal/prose blobs as summary.
    const looksLikeRefusal = /i understand you're looking|i won't be able|due to the limitations|cannot provide/i.test(text);
    if ((items.length === 0 && organizations.length === 0) && (looksLikeRefusal || !summary)) {
      notes = fallbackNotes;
      summary = fallbackNotes[0];
    }

    let mergedItems = normalizeItems(items);
    const mergedOrganizations = organizations || [];
    const mergedNotes = [...(notes || [])];
    const sources = new Set<string>(["gemini"]);

    // Backboard combination layer (best-effort).
    try {
      const backboardResponse = await fetch("/api/backboard/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, location }),
      });
      if (backboardResponse.ok) {
        const backboard = await backboardResponse.json();
        mergedItems = dedupeBySourceAndSignature([...mergedItems, ...normalizeItems(backboard.items || [])]);
        if (Array.isArray(backboard.notes)) mergedNotes.push(...backboard.notes);
        (backboard.api_sources || []).forEach((s: string) => sources.add(s));
      }
    } catch {
      // Ignore backboard failures; keep Gemini output.
    }

    return {
      items: mergedItems,
      organizations,
      summary,
      notes: mergedNotes,
      videos: [],
      artists: [],
      api_sources: Array.from(sources),
      ai_assistant_enabled: true,
      groundingChunks: response.candidates?.[0]?.groundingMetadata?.groundingChunks || [],
    };
  } catch (error: any) {
    // Handle 429 Resource Exhausted with exponential backoff
    if (error?.status === 429 || error?.message?.includes('429') || error?.message?.includes('RESOURCE_EXHAUSTED')) {
      if (retries > 0) {
        console.warn(`Rate limit hit. Retrying in ${delay}ms... (${retries} retries left)`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return fetchCommunityData(query, location, retries - 1, delay * 2);
      }
    }
    
    // Backboard failover (before other fallbacks)
    console.warn("Gemini failed, trying Backboard failover...");
    try {
      const backboardResponse = await fetch("/api/backboard/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, location })
      });
      if (backboardResponse.ok) {
        const data = await backboardResponse.json();
        const normalized = normalizeItems(data.items || []);
        if (normalized.length > 0) {
          return {
            items: dedupeBySourceAndSignature(normalized),
            organizations: data.organizations || [],
            summary: data.notes?.join(" ") || "Results from Backboard failover.",
            notes: data.notes || [],
            videos: data.videos || [],
            artists: data.artists || [],
            api_sources: data.api_sources || ["backboard"],
            ai_assistant_enabled: true,
            groundingChunks: []
          };
        }
      }
    } catch (backboardError) {
      console.error("Backboard failover failed:", backboardError);
    }

    // Failover to OpenAI via backend
    console.warn("Gemini failed, trying OpenAI failover...");
    try {
      const failoverResponse = await fetch("/api/openai-failover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, location })
      });
      
      if (failoverResponse.ok) {
        const data = await failoverResponse.json();
        return {
          items: data.results || [],
          organizations: data.organizations || [],
          summary: data.notes?.join(" ") || "Results from failover service.",
          notes: data.notes || [],
          videos: data.videos || [],
          artists: data.artists || [],
          api_sources: data.api_sources || ["openai", "scraper"],
          ai_assistant_enabled: data.ai_assistant_enabled ?? true,
          groundingChunks: []
        };
      }
    } catch (failoverError) {
      console.error("OpenAI Failover failed:", failoverError);
    }

    // Deterministic scraper fallback
    console.warn("AI failovers unavailable, trying deterministic scraper fallback...");
    try {
      const scraperResponse = await fetch("/api/scrape-fallback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, location })
      });

      if (scraperResponse.ok) {
        const data = await scraperResponse.json();
        return {
          items: data.results || [],
          organizations: data.organizations || [],
          summary: data.notes?.join(" ") || "Deterministic scraper fallback results.",
          notes: data.notes || [],
          videos: data.videos || [],
          artists: data.artists || [],
          api_sources: data.api_sources || ["scraper", "openstreetmap", "nominatim"],
          ai_assistant_enabled: data.ai_assistant_enabled ?? true,
          groundingChunks: []
        };
      }
    } catch (scraperError) {
      console.error("Scraper fallback failed:", scraperError);
    }
    
    console.error("Error fetching community data:", error);
    throw error;
  }
}
