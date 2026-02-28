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

FILTER FIELDS (include when available)
- Student-focused fields: fieldOfStudy, academicLevel ["undergrad","grad","any"], careerFocus ["internship","networking","skills","social","any"]
- Professional-focused fields: industry, seniorityLevel, networkingVsTraining

ORGANIZATION COVERAGE
- Include nearby service organizations where available: shelters, legal aid, free/low-cost clinics, local lawyers, food assistance, crisis support, immigration support, domestic violence resources.

RESPONSE FORMAT
Return ONLY valid JSON with this exact top-level shape:
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
      "description": "string (1-3 sentences)",
      "accessibility_notes": "string",
      "source_name": "string",
      "source_url": "string",
      "confidence": {"overall": "high|medium|low", "date": "string", "location": "string", "type": "string"},
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

    return {
      items,
      organizations,
      summary,
      notes,
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
