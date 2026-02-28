import { useState, useEffect, useMemo } from 'react';
import type { ReactNode } from 'react';
import {
  MapPin, 
  Calendar, 
  Heart, 
  ShoppingBasket, 
  Loader2,
  Navigation,
  ExternalLink,
  Bookmark,
  BookmarkCheck,
  Sun,
  Moon,
  Map as MapIcon,
  LayoutGrid,
  Filter,
  GraduationCap,
  Briefcase,
  Users,
  X,
  Info,
  RefreshCw,
  Building2,
  Settings,
  MessageCircle,
  Search,
  Bot
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { fetchCommunityData, Location, calculateDistance } from './services/geminiService';
import { CommunityItem, ConnectionProfile, DirectMessage, CommunityVideo, LocalArtist, TranslatorEntity, NewcomerGuide, CivicsElection, CivicsCandidate, CivicsOrg } from './types';

// Fix Leaflet icon issue
const DefaultIcon = L.icon({
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41]
});
const UserLocationIcon = L.icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

function safeGetLocalStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSetLocalStorage(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Ignore storage failures (private mode/restricted environments).
  }
}

function getSystemPrefersDark(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

type Tab = 'events' | 'volunteer' | 'foodbanks' | 'organizations' | 'clinics_legal' | 'civics_politics' | 'connections' | 'mylist' | 'map_view' | 'all';
type Appearance = 'system' | 'light' | 'dark';
type AccentPreset = 'failover' | 'carolina_blue' | 'custom';
type AudienceFilter = 'all' | 'student' | 'professional' | 'general' | 'families' | 'seniors';
type SortBy = 'distance' | 'soonest' | 'newest' | 'relevance';
type EventWindow = 'upcoming_only' | 'today' | 'this_week' | 'this_month' | 'custom';
type MapScope = 'radius' | 'viewport';
type HelpSupportSection = 'clinics' | 'legal_aid' | 'shelters' | 'translators' | 'newcomer_guides';
type CivicsSection = 'elections' | 'candidates' | 'parties' | 'ballot' | 'saved_topics';

const FAILOVER_ACCENT = '#5A5A40';
const CAROLINA_BLUE_ACCENT = '#4B9CD3';
const CURRENT_USER_ID = 'user_me';
const LOCAL_CACHE_KEY = 'gratitude_tab_cache_v1';
const SAVED_ITEMS_KEY = 'gratitude_saved_items_v2';
const VIDEO_CACHE_KEY = 'gratitude_video_cache_v1';
const ARTIST_CACHE_KEY = 'gratitude_artist_cache_v1';

function toCanonicalUrl(url?: string) {
  if (!url) return '';
  try {
    const u = new URL(url);
    u.hash = '';
    return u.toString();
  } catch {
    return url;
  }
}

function dedupeCommunityItems(list: CommunityItem[]): CommunityItem[] {
  const seen = new Set<string>();
  const out: CommunityItem[] = [];
  for (const item of list) {
    const day = item.date_start ? item.date_start.slice(0, 10) : 'unknown';
    const key = item.source_url
      ? `url:${toCanonicalUrl(item.source_url)}`
      : `${(item.title || item.name || '').toLowerCase()}|${(item.location_name || item.address || '').toLowerCase()}|${day}|${item.type}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function sanitizeSavedItems(list: any[]): CommunityItem[] {
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  const out: CommunityItem[] = [];
  for (const raw of list) {
    if (!raw || typeof raw !== 'object') continue;
    const id = String(raw.id || '');
    const title = String(raw.title || raw.name || '').trim();
    if (!id || !title) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(raw as CommunityItem);
  }
  return out;
}

function readLocalTabCache(tab: string): { items: CommunityItem[]; summary: string } | null {
  const raw = safeGetLocalStorage(LOCAL_CACHE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    const entry = parsed?.[tab];
    if (!entry) return null;
    if (!Array.isArray(entry.items)) return null;
    const ageMs = Date.now() - Number(entry.updatedAt || 0);
    const maxAgeMs = tab === 'events' ? 1000 * 60 * 60 * 6 : 1000 * 60 * 60 * 24 * 30;
    if (ageMs > maxAgeMs) return null;
    return { items: entry.items, summary: entry.summary || '' };
  } catch {
    return null;
  }
}

function writeLocalTabCache(tab: string, items: CommunityItem[], summary: string) {
  const raw = safeGetLocalStorage(LOCAL_CACHE_KEY);
  let parsed: Record<string, any> = {};
  if (raw) {
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = {};
    }
  }
  parsed[tab] = {
    items,
    summary,
    updatedAt: Date.now(),
  };
  safeSetLocalStorage(LOCAL_CACHE_KEY, JSON.stringify(parsed));
}

function readSignatureCache(cacheKey: string, signature: string, maxAgeMs = 1000 * 60 * 60 * 24 * 30) {
  const raw = safeGetLocalStorage(cacheKey);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    const entry = parsed?.[signature];
    if (!entry) return null;
    if ((Date.now() - Number(entry.updatedAt || 0)) > maxAgeMs) return null;
    return entry.data ?? null;
  } catch {
    return null;
  }
}

function writeSignatureCache(cacheKey: string, signature: string, data: any) {
  const raw = safeGetLocalStorage(cacheKey);
  let parsed: Record<string, any> = {};
  if (raw) {
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = {};
    }
  }
  parsed[signature] = { data, updatedAt: Date.now() };
  safeSetLocalStorage(cacheKey, JSON.stringify(parsed));
}

function normalizeSummary(value: string) {
  if (!value) return '';
  if (value.includes('Deterministic scraper fallback used')) {
    return 'Showing local and verified feed results.';
  }
  return value;
}

function parseDateSafe(value?: string | null) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function isValidCoordinate(lat?: number | null, lon?: number | null) {
  if (lat == null || lon == null) return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  if (lat === 0 && lon === 0) return false;
  return lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}

function normalizeCoordinates(lat?: number | null, lon?: number | null): { lat: number; lon: number } | null {
  if (isValidCoordinate(lat, lon)) return { lat: Number(lat), lon: Number(lon) };
  // Basic swapped coordinate correction.
  if (lat != null && lon != null && Number.isFinite(lat) && Number.isFinite(lon)) {
    const maybeLat = Number(lon);
    const maybeLon = Number(lat);
    if (isValidCoordinate(maybeLat, maybeLon)) return { lat: maybeLat, lon: maybeLon };
  }
  return null;
}

function formatEventDate(start?: string, dateUnknown?: boolean) {
  const parsed = parseDateSafe(start);
  if (!parsed) return dateUnknown ? 'Date not listed' : 'Date not listed';
  const hasTime = parsed.getUTCHours() !== 0 || parsed.getUTCMinutes() !== 0 || parsed.getUTCSeconds() !== 0;
  if (!hasTime) {
    return parsed.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) + ' (time not listed)';
  }
  return parsed.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).replace(',', ' •');
}

function getGeocodeQuery(item: CommunityItem) {
  const clean = (value: unknown) =>
    String(value || '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/&nbsp;|&amp;|&lt;|&gt;|&quot;|&#39;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  const pieces = [item.address, item.location_name].filter(Boolean).map((v) => clean(v));
  const query = pieces.find((v) => v && !/^not listed$/i.test(v));
  return query || '';
}

function textSignals(item: CommunityItem) {
  return `${item.title || item.name || ''} ${item.description || ''} ${item.type || ''} ${item.category || ''} ${item.location_name || ''} ${item.address || ''}`.toLowerCase();
}

function isFoodItem(item: CommunityItem) {
  const t = textSignals(item);
  const hasFoodAidContext = /(food bank|food pantry|pantry|meal|soup kitchen|food assistance|grocery support|nutrition|hunger|relief|mutual aid|shelter|clothing|supplies)/.test(t);
  const isDonationType = (item.type || '').toLowerCase() === 'donation';
  return (
    (item.type || '').toLowerCase() === 'foodbank' ||
    (isDonationType && hasFoodAidContext) ||
    (item.category || '').toLowerCase() === 'food_assistance' ||
    /(food bank|food pantry|pantry|meal|soup kitchen|food assistance|grocery support|hunger relief)/.test(t) ||
    (/(donation|donate|donation drive|supply drive)/.test(t) && hasFoodAidContext)
  );
}

function isClinicLegalItem(item: CommunityItem) {
  const t = textSignals(item);
  if (/(medical school|school of medicine|application|admission|admissions|student application|enrollment)/.test(t)) {
    return false;
  }
  return (
    ['clinic', 'legal_aid', 'shelter', 'resource_center'].includes((item.type || '').toLowerCase()) ||
    ['free_clinic', 'legal_aid', 'lawyer', 'shelter'].includes((item.category || '').toLowerCase()) ||
    /(free clinic|health clinic|community clinic|urgent care|medical aid|health aid|legal aid|legal clinic|pro bono|attorney|lawyer|shelter|domestic violence|crisis support|immigration legal)/.test(t)
  );
}

function isEventLikeType(type?: string) {
  return ['event', 'workshop', 'class', 'networking', 'support_group'].includes((type || '').toLowerCase());
}

function isVolunteerItem(item: CommunityItem) {
  const text = `${item.title || ''} ${item.description || ''} ${item.type || ''}`.toLowerCase();
  return (item.type || '').toLowerCase() === 'volunteer' || /(volunteer|community service|serve)/.test(text);
}

function isOrganizationItem(item: CommunityItem) {
  const t = (item.type || '').toLowerCase();
  const c = (item.category || '').toLowerCase();
  const text = `${item.title || ''} ${item.description || ''}`.toLowerCase();
  return (
    ['organization', 'resource_center', 'shelter', 'legal_aid', 'clinic'].includes(t) ||
    ['resource_center', 'other', 'food_assistance', 'lawyer', 'legal_aid', 'free_clinic', 'shelter'].includes(c) ||
    /(organization|nonprofit|community center|resource center|association)/.test(text)
  );
}

function isCivicsItem(item: CommunityItem) {
  const id = String(item.id || '').toLowerCase();
  const source = String(item.source_name || '').toLowerCase();
  const text = `${item.title || ''} ${item.description || ''}`.toLowerCase();
  return (
    id.startsWith('election-') ||
    id.startsWith('candidate-') ||
    id.startsWith('civics-org-') ||
    source.includes('civic') ||
    source.includes('election portal') ||
    /(election|candidate|ballot|referendum|voter|voting|committee|civic)/.test(text)
  );
}

function filterItemsForTab(tab: Tab, list: CommunityItem[], helpSupportSection: HelpSupportSection): CommunityItem[] {
  if (!Array.isArray(list)) return [];
  if (tab === 'events') return list.filter((item) => isEventLikeType(item.type));
  if (tab === 'volunteer') return list.filter((item) => isVolunteerItem(item));
  if (tab === 'foodbanks') return list.filter((item) => isFoodItem(item));
  if (tab === 'organizations') return list.filter((item) => isOrganizationItem(item));
  if (tab === 'clinics_legal') {
    if (helpSupportSection === 'translators' || helpSupportSection === 'newcomer_guides') return [];
    return list.filter((item) => isClinicLegalItem(item));
  }
  if (tab === 'civics_politics') return list.filter((item) => isCivicsItem(item));
  return list;
}

function prunePastEvents(items: CommunityItem[]) {
  const now = new Date();
  return items.filter((item) => {
    if (!isEventLikeType(item.type)) return true;
    const start = parseDateSafe(item.date_start);
    const end = parseDateSafe(item.date_end);
    if (!start && !end) return true;
    const reference = end || start;
    return reference ? reference >= now : true;
  });
}

function t(lang: string, key: string) {
  const l = (lang || "English").toLowerCase();
  const dict: Record<string, Record<string, string>> = {
    english: {
      events: "Events",
      volunteer: "Volunteer Opportunities",
      food: "Food Banks & Donations",
      organizations: "Organizations",
      clinics: "Help & Support",
      connections: "Connections",
      saved: "Saved Items",
      map: "Map (All Categories)",
      settings: "Settings",
      civics: "Civics & Politics",
      reset: "Reset Filters",
      search: "Search resources...",
      details: "Details",
      refresh: "Refresh",
      all: "All",
      student: "Student",
      professional: "Professional",
      families: "Families",
      sort_soonest: "Sort by Soonest",
      sort_distance: "Sort by Distance",
      sort_relevance: "Sort by Relevance",
      sort_newest: "Sort by Recently Added",
      map_scope_radius: "Map scope: Radius",
      map_scope_viewport: "Map scope: Viewport",
      upcoming_only: "Upcoming only",
      today: "Today",
      this_week: "This week",
      this_month: "This month",
      custom_range: "Custom range",
      all_types: "All types",
      include_undated: "Include undated",
      include_past: "Include past events",
      language_placeholder: "Language (e.g., Farsi, Pashto)",
      cultural_placeholder: "Cultural group (e.g., Iranian, Kurdish)",
      translation_services: "Translation services",
      immigration_support: "Immigration support",
      newcomer_support: "Newcomer support",
      no_exact_match: "No exact match found. Showing closest cultural or language matches.",
      ai_fallback_running: "No exact match yet. Running AI web search fallback automatically...",
      community_videos: "Community Videos",
      local_artists: "Local Artists",
      loading_videos: "Loading videos...",
      loading_artists: "Loading artists...",
      no_videos: "Search to discover community and educational videos.",
      no_artists: "No artists found in current radius.",
      all_channels: "All Channels",
      any_length: "Any Length",
      no_items: "No items found matching your filters.",
      distance_unavailable: "Distance unavailable",
      miles_away: "miles away",
    },
    spanish: {
      events: "Eventos",
      volunteer: "Voluntariado",
      food: "Bancos de Comida y Donaciones",
      organizations: "Organizaciones",
      clinics: "Ayuda y Apoyo",
      connections: "Conexiones",
      saved: "Guardados",
      map: "Mapa (Todas las categorías)",
      settings: "Configuración",
      civics: "Civismo y Política",
      reset: "Restablecer filtros",
      search: "Buscar recursos...",
      details: "Detalles",
      refresh: "Actualizar",
    },
    farsi: {
      events: "رویدادها",
      volunteer: "داوطلبی",
      food: "بانک غذا و کمک‌ها",
      organizations: "سازمان‌ها",
      clinics: "کمک و پشتیبانی",
      connections: "ارتباطات",
      saved: "موارد ذخیره‌شده",
      map: "نقشه (همه دسته‌ها)",
      settings: "تنظیمات",
      civics: "امور مدنی و سیاست",
      reset: "بازنشانی فیلترها",
      search: "جستجوی منابع...",
      details: "جزئیات",
      refresh: "تازه‌سازی",
    },
    arabic: {
      events: "الفعاليات",
      volunteer: "التطوع",
      food: "بنوك الطعام والتبرعات",
      organizations: "المنظمات",
      clinics: "المساعدة والدعم",
      connections: "الاتصالات",
      saved: "العناصر المحفوظة",
      map: "الخريطة (كل الفئات)",
      settings: "الإعدادات",
      civics: "الشؤون المدنية والسياسة",
      reset: "إعادة تعيين الفلاتر",
      search: "ابحث في الموارد...",
      details: "التفاصيل",
      refresh: "تحديث",
    },
    french: {
      events: "Événements",
      volunteer: "Bénévolat",
      food: "Banques alimentaires et dons",
      organizations: "Organisations",
      clinics: "Aide et soutien",
      connections: "Connexions",
      saved: "Éléments enregistrés",
      map: "Carte (toutes catégories)",
      settings: "Paramètres",
      civics: "Civique et Politique",
      reset: "Réinitialiser les filtres",
      search: "Rechercher des ressources...",
      details: "Détails",
      refresh: "Actualiser",
      all: "Tous",
      student: "Étudiant",
      professional: "Professionnel",
      families: "Familles",
      sort_soonest: "Trier par date proche",
      sort_distance: "Trier par distance",
      sort_relevance: "Trier par pertinence",
      sort_newest: "Trier par ajout récent",
      map_scope_radius: "Portée carte : rayon",
      map_scope_viewport: "Portée carte : écran",
      upcoming_only: "À venir uniquement",
      today: "Aujourd'hui",
      this_week: "Cette semaine",
      this_month: "Ce mois-ci",
      custom_range: "Plage personnalisée",
      all_types: "Tous les types",
      include_undated: "Inclure sans date",
      include_past: "Inclure les événements passés",
      language_placeholder: "Langue (ex: persan, pachto)",
      cultural_placeholder: "Groupe culturel (ex: iranien, kurde)",
      translation_services: "Services de traduction",
      immigration_support: "Aide à l'immigration",
      newcomer_support: "Aide aux nouveaux arrivants",
      no_exact_match: "Aucune correspondance exacte. Affichage des résultats les plus proches.",
      ai_fallback_running: "Aucun résultat exact. Recherche web IA en cours...",
      community_videos: "Vidéos communautaires",
      local_artists: "Artistes locaux",
      no_items: "Aucun résultat correspondant aux filtres.",
      loading_videos: "Chargement des vidéos...",
      loading_artists: "Chargement des artistes...",
      no_artists: "Aucun artiste trouvé dans le rayon actuel.",
      no_videos: "Recherchez pour découvrir des vidéos communautaires et éducatives.",
      all_channels: "Toutes les chaînes",
      any_length: "Toute durée",
      distance_unavailable: "Distance indisponible",
      miles_away: "miles",
    },
  };
  return dict[l]?.[key] || dict.english[key] || key;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('events');
  const [appearance, setAppearance] = useState<Appearance>(() => (safeGetLocalStorage('communitree_appearance') as Appearance) || 'system');
  const [accentPreset, setAccentPreset] = useState<AccentPreset>(() => (safeGetLocalStorage('communitree_accent_preset') as AccentPreset) || 'failover');
  const [accentCustomHex, setAccentCustomHex] = useState(() => safeGetLocalStorage('communitree_accent_custom_hex') || FAILOVER_ACCENT);
  const [highContrast, setHighContrast] = useState(() => safeGetLocalStorage('communitree_highcontrast') === 'true');
  const [largeTextMode, setLargeTextMode] = useState(() => safeGetLocalStorage('communitree_largetext') === 'true');
  const [reducedMotion, setReducedMotion] = useState(() => safeGetLocalStorage('communitree_reducedmotion') === 'true');
  const [screenReaderLabels, setScreenReaderLabels] = useState(() => {
    const saved = safeGetLocalStorage('communitree_screenreader_labels');
    return saved === null ? true : saved === 'true';
  });
  const [systemPrefersDark, setSystemPrefersDark] = useState(() => getSystemPrefersDark());
  
  const [audienceFilter, setAudienceFilter] = useState<AudienceFilter>('all');
  const [sortBy, setSortBy] = useState<SortBy>('soonest');
  const [radiusMiles, setRadiusMiles] = useState<number>(10);
  const [searchQuery, setSearchQuery] = useState("");
  const [eventWindow, setEventWindow] = useState<EventWindow>('upcoming_only');
  const [includePastEvents, setIncludePastEvents] = useState(false);
  const [includeUndatedEvents, setIncludeUndatedEvents] = useState(false);
  const [eventTypeFilter, setEventTypeFilter] = useState<string>('all');
  const [customDateStart, setCustomDateStart] = useState<string>('');
  const [customDateEnd, setCustomDateEnd] = useState<string>('');
  const [mapScope, setMapScope] = useState<MapScope>('radius');
  const [viewportBounds, setViewportBounds] = useState<{ north: number; south: number; east: number; west: number } | null>(null);
  
  // Student Filters
  const [fieldOfStudy, setFieldOfStudy] = useState<string>("all");
  const [academicLevel, setAcademicLevel] = useState<string>("all");
  const [careerFocus, setCareerFocus] = useState<string>("all");

  // Professional Filters
  const [industry, setIndustry] = useState<string>("all");
  const [seniorityLevel, setSeniorityLevel] = useState<string>("all");
  const [networkingVsTraining, setNetworkingVsTraining] = useState<string>("all");

  // Org Filters
  const [orgCategoryFilter, setOrgCategoryFilter] = useState<string>("all");
  const [orgCulturalGroupFilter, setOrgCulturalGroupFilter] = useState<string>("");
  const [orgLanguageFilter, setOrgLanguageFilter] = useState<string>("");
  const [orgTranslationOnly, setOrgTranslationOnly] = useState(false);
  const [orgImmigrantSupportOnly, setOrgImmigrantSupportOnly] = useState(false);
  const [orgNewcomerSupportOnly, setOrgNewcomerSupportOnly] = useState(false);
  const [foodTypeFilter, setFoodTypeFilter] = useState<'all' | 'foodbank' | 'donation'>('all');
  const [clinicServiceFilter, setClinicServiceFilter] = useState<'all' | 'clinic' | 'legal_aid' | 'shelter' | 'resource_center' | 'lawyer'>('all');
  const [helpSupportSection, setHelpSupportSection] = useState<HelpSupportSection>('clinics');
  const [translatorItems, setTranslatorItems] = useState<TranslatorEntity[]>([]);
  const [newcomerGuideItems, setNewcomerGuideItems] = useState<NewcomerGuide[]>([]);
  const [helpSupportLoading, setHelpSupportLoading] = useState(false);
  const [translatorLanguageNeeded, setTranslatorLanguageNeeded] = useState('');
  const [translatorServiceType, setTranslatorServiceType] = useState<'translator' | 'interpreter' | 'both'>('both');
  const [translatorMode, setTranslatorMode] = useState<'in_person' | 'remote' | 'phone' | 'any'>('any');
  const [translatorSpecialization, setTranslatorSpecialization] = useState<'medical' | 'legal' | 'education' | 'general'>('general');
  const [translatorCost, setTranslatorCost] = useState<'free' | 'paid' | 'any'>('any');
  const [translatorAvailability, setTranslatorAvailability] = useState<'same_day' | 'weekends' | 'any'>('any');
  const [newcomerLanguage, setNewcomerLanguage] = useState('');
  const [newcomerTopic, setNewcomerTopic] = useState<'all' | 'documentation' | 'healthcare' | 'housing' | 'education' | 'employment' | 'banking' | 'transportation' | 'legal_rights_general' | 'emergency_services'>('all');
  const [newcomerFormat, setNewcomerFormat] = useState<'any' | 'article' | 'pdf' | 'video' | 'checklist' | 'local_program'>('any');
  const [civicsSection, setCivicsSection] = useState<CivicsSection>('elections');
  const [civicsElections, setCivicsElections] = useState<CivicsElection[]>([]);
  const [civicsCandidates, setCivicsCandidates] = useState<CivicsCandidate[]>([]);
  const [civicsOrgs, setCivicsOrgs] = useState<CivicsOrg[]>([]);
  const [civicsEligibility, setCivicsEligibility] = useState<any>(null);
  const [civicsLoading, setCivicsLoading] = useState(false);
  const [civicsState, setCivicsState] = useState('North Carolina');
  const [civicsCounty, setCivicsCounty] = useState('');
  const [civicsElectionLevel, setCivicsElectionLevel] = useState<'all' | 'federal' | 'state' | 'county' | 'local'>('all');
  const [civicsElectionType, setCivicsElectionType] = useState<'all' | 'general' | 'primary' | 'local' | 'special' | 'runoff' | 'referendum' | 'unknown'>('all');
  const [interfaceLanguage, setInterfaceLanguage] = useState<string>(() => safeGetLocalStorage('gratitude_interface_language') || 'English');

  const [viewMode, setViewMode] = useState<'grid' | 'map' | 'split'>('grid');
  const [showSettings, setShowSettings] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  
  const [location, setLocation] = useState<Location | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<CommunityItem[]>([]);
  const [summary, setSummary] = useState<string>("");
  const [selectedItem, setSelectedItem] = useState<CommunityItem | null>(null);
  const [myList, setMyList] = useState<CommunityItem[]>(() => {
    const saved = safeGetLocalStorage(SAVED_ITEMS_KEY) || safeGetLocalStorage('communitree_list');
    if (!saved) return [];
    try {
      return sanitizeSavedItems(JSON.parse(saved));
    } catch {
      return [];
    }
  });
  const [connections, setConnections] = useState<ConnectionProfile[]>([]);
  const [connectionsLoading, setConnectionsLoading] = useState(false);
  const [connectionsError, setConnectionsError] = useState<string | null>(null);
  const [connectionNotes, setConnectionNotes] = useState<string[]>([]);
  const [connectionPage, setConnectionPage] = useState(1);
  const [connectionTotal, setConnectionTotal] = useState(0);
  const [connectionRadiusMiles, setConnectionRadiusMiles] = useState(25);
  const [connectionAudience, setConnectionAudience] = useState<'all' | 'student' | 'professional' | 'general'>('all');
  const [connectionFieldOfStudy, setConnectionFieldOfStudy] = useState('');
  const [connectionAcademicLevel, setConnectionAcademicLevel] = useState('');
  const [connectionIndustry, setConnectionIndustry] = useState('');
  const [connectionExperienceLevel, setConnectionExperienceLevel] = useState('');
  const [connectionSkills, setConnectionSkills] = useState('');
  const [connectionInterests, setConnectionInterests] = useState('');
  const [connectionSortBy, setConnectionSortBy] = useState<'nearest' | 'most_active' | 'newest_members' | 'shared_interests'>('nearest');
  const [selectedConnection, setSelectedConnection] = useState<ConnectionProfile | null>(null);
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messageDraft, setMessageDraft] = useState('');
  const [videos, setVideos] = useState<CommunityVideo[]>([]);
  const [videosLoading, setVideosLoading] = useState(false);
  const [videoOrder, setVideoOrder] = useState<'relevance' | 'date'>('relevance');
  const [videoDuration, setVideoDuration] = useState<'any' | 'short' | 'medium' | 'long'>('any');
  const [videoChannelType, setVideoChannelType] = useState<'all' | 'organization' | 'educational' | 'individual'>('all');
  const [artists, setArtists] = useState<LocalArtist[]>([]);
  const [artistsLoading, setArtistsLoading] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantMessages, setAssistantMessages] = useState<Array<{ role: 'user' | 'assistant'; text: string; suggestions?: any[] }>>([]);
  const [assistantDraft, setAssistantDraft] = useState('');
  const [autoRescueSignature, setAutoRescueSignature] = useState<string>('');
  const [autoRescueLoading, setAutoRescueLoading] = useState(false);
  const [communityPosts] = useState<Array<{ id: string; title: string; body: string; category: 'General' | 'Help Needed' | 'Local News' | 'Events' | 'Free Items'; neighborhood?: string }>>([
    { id: 'p1', title: 'Need moving boxes', body: 'Looking for free boxes this weekend near downtown.', category: 'Help Needed', neighborhood: 'Downtown Chapel Hill' },
    { id: 'p2', title: 'Saturday clean-up', body: 'Volunteers meeting at 10 AM at the library lot.', category: 'Events', neighborhood: 'Campus Area' },
  ]);
  const [groups, setGroups] = useState<Array<{ group_id: string; name: string; description: string; member_count: number; location: string; joined?: boolean }>>([
    { group_id: 'g1', name: 'Tech Students', description: 'Study jams and project collaboration.', member_count: 214, location: 'Campus Area' },
    { group_id: 'g2', name: 'Volunteers', description: 'Coordinate service opportunities.', member_count: 389, location: 'Downtown Chapel Hill' },
    { group_id: 'g3', name: 'Local Entrepreneurs', description: 'Networking for founders and builders.', member_count: 176, location: 'Triangle Region' },
  ]);
  const [attendance, setAttendance] = useState<Record<string, { interested: number; going: number }>>(() => {
    const raw = safeGetLocalStorage('gratitude_event_attendance_v1');
    if (!raw) return {};
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  });

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (event: MediaQueryListEvent) => setSystemPrefersDark(event.matches);
    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', onChange);
      return () => mediaQuery.removeEventListener('change', onChange);
    }
    mediaQuery.addListener(onChange);
    return () => mediaQuery.removeListener(onChange);
  }, []);

  const resolvedAppearance: Exclude<Appearance, 'system'> = appearance === 'system' ? (systemPrefersDark ? 'dark' : 'light') : appearance;
  const appliedAccentColor = accentPreset === 'carolina_blue'
    ? CAROLINA_BLUE_ACCENT
    : accentPreset === 'custom'
      ? accentCustomHex
      : FAILOVER_ACCENT;

  useEffect(() => {
    document.body.className = cn(
      `theme-${resolvedAppearance}`,
      highContrast && "high-contrast",
      largeTextMode && "large-text-mode",
      reducedMotion && "reduced-motion"
    );
    document.documentElement.setAttribute('dir', ['arabic', 'farsi'].includes(interfaceLanguage.toLowerCase()) ? 'rtl' : 'ltr');
    document.documentElement.style.setProperty('--accent-color', appliedAccentColor);
    safeSetLocalStorage('communitree_appearance', appearance);
    safeSetLocalStorage('communitree_accent_preset', accentPreset);
    safeSetLocalStorage('communitree_accent_custom_hex', accentCustomHex);
    safeSetLocalStorage('communitree_highcontrast', highContrast.toString());
    safeSetLocalStorage('communitree_largetext', largeTextMode.toString());
    safeSetLocalStorage('communitree_reducedmotion', reducedMotion.toString());
    safeSetLocalStorage('communitree_screenreader_labels', screenReaderLabels.toString());
    safeSetLocalStorage('gratitude_interface_language', interfaceLanguage);
  }, [appearance, accentPreset, accentCustomHex, resolvedAppearance, appliedAccentColor, highContrast, largeTextMode, reducedMotion, screenReaderLabels, interfaceLanguage]);

  useEffect(() => {
    safeSetLocalStorage(SAVED_ITEMS_KEY, JSON.stringify(sanitizeSavedItems(myList)));
  }, [myList]);

  useEffect(() => {
    safeSetLocalStorage('gratitude_event_attendance_v1', JSON.stringify(attendance));
  }, [attendance]);

  useEffect(() => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setLocation({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          });
        },
        (err) => {
          console.error("Geolocation error:", err);
          // Non-blocking fallback so tabs (especially connections) still have usable local results.
          setLocation({ latitude: 35.9132, longitude: -79.0558 });
          setSummary("Location permission unavailable. Showing results near Chapel Hill, NC by default.");
        }
      );
    }
  }, []);

  useEffect(() => {
    const last = Number(safeGetLocalStorage('gratitude_reclassify_last_run') || 0);
    const oneDay = 24 * 60 * 60 * 1000;
    if (Date.now() - last < oneDay) return;
    (async () => {
      try {
        await fetch('/api/reclassify-all', { method: 'POST' });
        safeSetLocalStorage('gratitude_reclassify_last_run', String(Date.now()));
      } catch {
        // Best effort only.
      }
    })();
  }, []);

  const CONNECTION_PAGE_SIZE = 8;

  const fetchConnections = async (page = connectionPage) => {
    const effectiveLocation = location || { latitude: 35.9132, longitude: -79.0558 };
    setConnectionsLoading(true);
    setConnectionsError(null);
    try {
      const response = await fetch('/api/connections/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          current_user_id: CURRENT_USER_ID,
          location: effectiveLocation,
          page,
          page_size: CONNECTION_PAGE_SIZE,
          filters: {
            radius_miles: connectionRadiusMiles,
            audience_type: connectionAudience,
            field_of_study: connectionFieldOfStudy,
            academic_level: connectionAcademicLevel,
            industry: connectionIndustry,
            experience_level: connectionExperienceLevel,
            skills: connectionSkills,
            interests: connectionInterests,
            sort_by: connectionSortBy,
          },
        }),
      });

      const data = await response.json();
      setConnections(data.connections || []);
      setConnectionTotal(data.total || 0);
      const baseNotes = Array.isArray(data.notes) ? data.notes : [];
      setConnectionNotes(
        location
          ? baseNotes
          : ["Location unavailable. Showing nearby users around Chapel Hill by default.", ...baseNotes]
      );
    } catch (err) {
      console.error('Connections search failed', err);
      setConnectionsError('Failed to load nearby users.');
      setConnectionNotes(["Connection service temporarily unavailable. Try Refresh in a few seconds."]);
    } finally {
      setConnectionsLoading(false);
    }
  };

  const fetchMessages = async (peerId: string) => {
    setMessagesLoading(true);
    try {
      const response = await fetch(`/api/messages/${peerId}?current_user_id=${CURRENT_USER_ID}`);
      const data = await response.json();
      setMessages(data.messages || []);
    } catch (err) {
      console.error('Failed to load messages', err);
    } finally {
      setMessagesLoading(false);
    }
  };

  const sendMessage = async () => {
    if (!selectedConnection || !messageDraft.trim()) return;
    try {
      const response = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          current_user_id: CURRENT_USER_ID,
          sender_id: CURRENT_USER_ID,
          receiver_id: selectedConnection.user_id,
          message_text: messageDraft.trim(),
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setConnectionsError(data.error || 'Could not send message.');
        return;
      }
      setMessages((prev) => [...prev, data.message]);
      setMessageDraft('');
    } catch (err) {
      console.error('Failed to send message', err);
      setConnectionsError('Could not send message.');
    }
  };

  const fetchVideos = async (query: string) => {
    const q = query.trim();
    if (!q) {
      setVideos([]);
      return;
    }
    const signature = [
      q.toLowerCase(),
      videoOrder,
      videoDuration,
      videoChannelType,
      interfaceLanguage.toLowerCase(),
    ].join("|");
    const cached = readSignatureCache(VIDEO_CACHE_KEY, signature);
    if (Array.isArray(cached) && cached.length > 0) {
      setVideos(cached);
      return;
    }
    setVideosLoading(true);
    try {
      const response = await fetch(`/api/videos/search?q=${encodeURIComponent(q)}&order=${videoOrder}&duration=${videoDuration}&maxResults=12`);
      const data = await response.json();
      let list: CommunityVideo[] = Array.isArray(data.videos) ? data.videos : [];

      if (list.length === 0) {
        try {
          const fallbackResponse = await fetch('/api/backboard/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              query: `Find relevant community or educational videos and guides for: ${q}. Preferred language: ${interfaceLanguage}.`,
              location,
            }),
          });
          const fallbackData = await fallbackResponse.json();
          const fallbackItems: any[] = Array.isArray(fallbackData.items) ? fallbackData.items : [];
          list = fallbackItems.slice(0, 12).map((item: any, index: number) => ({
            video_id: item.id || `backboard-video-${index}`,
            title: item.title || "Community Guide",
            channel_name: item.source_name || "Backboard",
            channel_type: "educational",
            published_date: item.date_start || item.retrieved_at || new Date().toISOString(),
            duration: "",
            duration_minutes: null,
            thumbnail: "",
            description: item.description || "",
            watch_url: item.source_url || "",
            embed_url: "",
            local_relevance: "medium",
          }));
        } catch {
          // Ignore fallback errors.
        }
      }

      const filtered = videoChannelType === 'all' ? list : list.filter((v) => v.channel_type === videoChannelType);
      setVideos(filtered);
      writeSignatureCache(VIDEO_CACHE_KEY, signature, filtered);
    } catch (err) {
      console.error('Video search failed', err);
      setVideos([]);
    } finally {
      setVideosLoading(false);
    }
  };

  const fetchArtists = async (query = searchQuery) => {
    const q = query.trim();
    const signature = [
      q.toLowerCase(),
      radiusMiles,
      interfaceLanguage.toLowerCase(),
      location ? `${location.latitude.toFixed(3)},${location.longitude.toFixed(3)}` : "noloc",
    ].join("|");
    const cached = readSignatureCache(ARTIST_CACHE_KEY, signature);
    if (Array.isArray(cached) && cached.length > 0) {
      setArtists(cached);
      return;
    }
    setArtistsLoading(true);
    try {
      const response = await fetch('/api/artists/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: q,
          location,
          radius_miles: radiusMiles,
          page: 1,
          page_size: 40,
        }),
      });
      const data = await response.json();
      let list: LocalArtist[] = Array.isArray(data.artists) ? data.artists : [];

      if (list.length === 0) {
        try {
          const fallbackResponse = await fetch('/api/backboard/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              query: `Find local artists (music, visual art, performance, digital) near me for: ${q || 'community'}. Preferred language: ${interfaceLanguage}.`,
              location,
            }),
          });
          const fallbackData = await fallbackResponse.json();
          const fallbackItems: any[] = Array.isArray(fallbackData.items) ? fallbackData.items : [];
          list = fallbackItems.map((item: any, idx: number) => {
            const coords = normalizeCoordinates(
              item.lat != null ? Number(item.lat) : (item.latitude != null ? Number(item.latitude) : null),
              item.lon != null ? Number(item.lon) : (item.longitude != null ? Number(item.longitude) : null)
            );
            const dist = location && coords
              ? calculateDistance(location.latitude, location.longitude, coords.lat, coords.lon)
              : null;
            return {
              artist_name: item.title || `Local Artist ${idx + 1}`,
              category: 'other',
              style: item.type || 'Community',
              location: item.location_name || item.address || 'Not listed',
              distance_miles: dist != null ? Number(dist.toFixed(1)) : null,
              description: item.description || 'Not listed',
              website: item.source_url || '',
              social_links: [],
              upcoming_events: [],
              lat: coords?.lat ?? null,
              lon: coords?.lon ?? null,
              confidence: { overall: coords ? 'medium' : 'low' },
            };
          });
        } catch {
          // Ignore fallback errors.
        }
      }

      const deduped = list.filter((artist, idx, arr) => {
        const key = `${artist.artist_name.toLowerCase()}|${artist.location.toLowerCase()}`;
        return arr.findIndex((a) => `${a.artist_name.toLowerCase()}|${a.location.toLowerCase()}` === key) === idx;
      });
      setArtists(deduped);
      writeSignatureCache(ARTIST_CACHE_KEY, signature, deduped);
    } catch (err) {
      console.error('Artist search failed', err);
      setArtists([]);
    } finally {
      setArtistsLoading(false);
    }
  };

  const fetchHelpSupportData = async () => {
    if (activeTab !== 'clinics_legal') return;
    setHelpSupportLoading(true);
    try {
      if (helpSupportSection === 'translators') {
        const response = await fetch('/api/help-support/translators', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            location,
            radius_miles: radiusMiles,
            language_needed: translatorLanguageNeeded
              ? translatorLanguageNeeded.split(',').map((s) => s.trim()).filter(Boolean)
              : [],
            service_type: translatorServiceType,
            mode: translatorMode,
            specialization: translatorSpecialization,
            cost: translatorCost,
            availability: translatorAvailability,
          }),
        });
        const data = await response.json();
        setTranslatorItems(Array.isArray(data.translators) ? data.translators : []);
      } else if (helpSupportSection === 'newcomer_guides') {
        const response = await fetch('/api/help-support/newcomer-guides', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            location,
            language: newcomerLanguage,
            topic: newcomerTopic,
            format: newcomerFormat,
          }),
        });
        const data = await response.json();
        setNewcomerGuideItems(Array.isArray(data.guides) ? data.guides : []);
      }
    } catch (err) {
      console.error('Help & Support fetch failed', err);
      if (helpSupportSection === 'translators') setTranslatorItems([]);
      if (helpSupportSection === 'newcomer_guides') setNewcomerGuideItems([]);
    } finally {
      setHelpSupportLoading(false);
    }
  };

  const fetchCivicsData = async () => {
    if (activeTab !== 'civics_politics') return;
    setCivicsLoading(true);
    try {
      const response = await fetch('/api/civics/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          state_or_region: civicsState,
          county_or_district: civicsCounty,
          election_level: civicsElectionLevel,
          election_type: civicsElectionType,
          section: civicsSection,
          include_past: false,
          location,
        }),
      });
      const data = await response.json();
      const civics = data?.civics_politics || {};
      setCivicsElections(Array.isArray(civics.elections) ? civics.elections : []);
      setCivicsCandidates(Array.isArray(civics.candidates) ? civics.candidates : []);
      setCivicsOrgs(Array.isArray(civics.parties_and_committees) ? civics.parties_and_committees : []);
      setCivicsEligibility(civics.eligibility_widget || null);

      const mapped: CommunityItem[] = [
        ...(Array.isArray(civics.elections) ? civics.elections : []).map((e: any, idx: number) => ({
          id: e.election_id || `election-${idx}`,
          title: e.name || 'Election',
          description: `${e.election_type || 'unknown'} election in ${e.jurisdiction?.state_or_region || ''}.`,
          type: 'event',
          audience: 'general',
          date_start: e.election_date ? `${e.election_date}T09:00:00` : null,
          date_end: null,
          date_unknown: !e.election_date,
          location_name: e.jurisdiction?.county_or_district || e.jurisdiction?.city_or_locality || 'Not listed',
          address: e.jurisdiction?.state_or_region || 'Not listed',
          source_name: e.official_portal_name || 'Official election portal',
          source_url: e.official_portal_url || '',
          retrieved_at: e.retrieved_at || new Date().toISOString(),
          needs_review: e.confidence?.overall === 'low',
        })),
        ...(Array.isArray(civics.candidates) ? civics.candidates : []).map((c: any, idx: number) => ({
          id: c.candidate_id || `candidate-${idx}`,
          title: c.name || 'Candidate',
          description: `${c.office?.office_name || 'Office'} (${c.party_affiliation || 'Not listed'})`,
          type: 'networking',
          audience: 'general',
          date_unknown: true,
          location_name: c.office?.district || 'Not listed',
          address: c.office?.district || 'Not listed',
          source_name: 'Candidate listing',
          source_url: c.campaign_links?.official_website || c.source_url || '',
          retrieved_at: c.retrieved_at || new Date().toISOString(),
          needs_review: c.ai_quality?.classification_confidence === 'low',
        })),
        ...(Array.isArray(civics.parties_and_committees) ? civics.parties_and_committees : []).map((o: any, idx: number) => ({
          id: o.org_id || `civics-org-${idx}`,
          title: o.name || 'Civic Organization',
          description: `${o.category || 'other'} • ${(o.services || []).join(', ')}`,
          type: 'resource_center',
          audience: 'general',
          date_unknown: true,
          location_name: o.name || 'Not listed',
          address: o.address || 'Not listed',
          lat: o.lat ?? null,
          lon: o.lon ?? null,
          latitude: o.lat ?? null,
          longitude: o.lon ?? null,
          source_name: 'Civics directory',
          source_url: o.source_url || '',
          retrieved_at: o.retrieved_at || new Date().toISOString(),
          needs_review: o.confidence?.overall === 'low',
        })),
      ];
      setItems(dedupeCommunityItems(mapped));
      setSummary("Neutral civics data shown from local-first cache and verified sources.");
    } catch (err) {
      console.error('Civics fetch failed', err);
      setCivicsElections([]);
      setCivicsCandidates([]);
      setCivicsOrgs([]);
      setCivicsEligibility(null);
    } finally {
      setCivicsLoading(false);
    }
  };

  const sendAssistantQuery = async () => {
    const text = assistantDraft.trim();
    if (!text) return;
    setAssistantMessages((prev) => [...prev, { role: 'user', text }]);
    setAssistantDraft('');
    try {
      const response = await fetch('/api/assistant/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, location }),
      });
      const data = await response.json();
      setAssistantMessages((prev) => [...prev, { role: 'assistant', text: data.answer || 'No response.', suggestions: data.suggestions || [] }]);
    } catch {
      setAssistantMessages((prev) => [...prev, { role: 'assistant', text: 'Assistant unavailable right now.' }]);
    }
  };

  const hydrateCoordinates = async (baseItems: CommunityItem[], tabForCache: Tab) => {
    let workingItems = [...baseItems];
    const candidates = workingItems
      .filter((item) => (item.latitude == null || item.longitude == null) && getGeocodeQuery(item))
      .slice(0, 1000);
    if (candidates.length === 0) return;

    try {
      const repairResponse = await fetch('/api/listings/repair', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: candidates }),
      });
      const repairData = await repairResponse.json();
      const repairedItems: CommunityItem[] = Array.isArray(repairData?.items) ? repairData.items : [];
      if (repairedItems.length > 0) {
        const repairedById = new Map(repairedItems.filter((r) => r.id).map((r) => [r.id, r]));
        workingItems = workingItems.map((item) => {
          const repaired = item.id ? repairedById.get(item.id) : undefined;
          if (!repaired) return item;
          return {
            ...item,
            address: repaired.address || item.address,
            location_name: repaired.location_name || item.location_name,
            description: repaired.description || item.description,
          };
        });
      }
    } catch {
      // Ignore repair errors and continue with raw data.
    }

    const queries = [...new Set(
      workingItems
        .filter((item) => (item.latitude == null || item.longitude == null) && getGeocodeQuery(item))
        .map((item) => getGeocodeQuery(item))
    )];
    if (queries.length === 0) return;

    try {
      const response = await fetch('/api/geocode/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ queries }),
      });
      const data = await response.json();
      const map = data?.results || {};
      if (!map || Object.keys(map).length === 0) return;

      const updated: CommunityItem[] = workingItems.map((item): CommunityItem => {
        if (item.latitude != null && item.longitude != null) return item;
        const q = getGeocodeQuery(item);
        const hit = map[q];
        const normalized = normalizeCoordinates(Number(hit?.lat), Number(hit?.lon));
        if (!normalized) return item;
        return {
          ...item,
          latitude: normalized.lat,
          longitude: normalized.lon,
          lat: normalized.lat,
          lon: normalized.lon,
          location_confidence: 'medium' as const,
        };
      });
      const deduped = dedupeCommunityItems(updated);
      setItems(deduped);
      writeLocalTabCache(tabForCache, deduped, summary);
    } catch (err) {
      console.warn('Coordinate hydration failed', err);
    }
  };

  const mapPayloadToItems = (tab: Tab, data: any): CommunityItem[] => {
    return [
      ...(data.items || []).map((item: any, index: number) => ({
        ...(normalizeCoordinates(
          item.lat != null ? Number(item.lat) : (item.latitude != null ? Number(item.latitude) : null),
          item.lon != null ? Number(item.lon) : (item.longitude != null ? Number(item.longitude) : null)
        ) || {}),
        ...item,
        id: item.id || `result-${tab}-${index}-${(item.title || item.name || 'item').toLowerCase().replace(/\s+/g, '-')}`,
        description: item.description || "",
        retrieved_at: item.retrieved_at || new Date().toISOString(),
        latitude: normalizeCoordinates(
          item.lat != null ? Number(item.lat) : (item.latitude != null ? Number(item.latitude) : null),
          item.lon != null ? Number(item.lon) : (item.longitude != null ? Number(item.longitude) : null)
        )?.lat,
        longitude: normalizeCoordinates(
          item.lat != null ? Number(item.lat) : (item.latitude != null ? Number(item.latitude) : null),
          item.lon != null ? Number(item.lon) : (item.longitude != null ? Number(item.longitude) : null)
        )?.lon,
        location_confidence: (item.location_confidence === 'high' || item.location_confidence === 'medium' || item.location_confidence === 'low')
          ? item.location_confidence
          : ((item.address || item.location_name) ? 'medium' : 'low') as 'high' | 'medium' | 'low',
        verified_source: typeof item.verified_source === 'boolean' ? item.verified_source : false,
        recommended_by_users: Number(item.recommended_by_users || 0),
        neighborhood: item.neighborhood || '',
        cultural_groups: Array.isArray(item.cultural_groups) ? item.cultural_groups : [],
        supported_languages: Array.isArray(item.supported_languages) ? item.supported_languages : [],
        translation_services: Boolean(item.translation_services),
        translation_languages: Array.isArray(item.translation_languages) ? item.translation_languages : [],
        immigrant_support: Boolean(item.immigrant_support),
        newcomer_support: Boolean(item.newcomer_support),
        event_attendance: item.event_attendance || { interested_count: 0, going_count: 0 },
        coordinates: (() => {
          const c = normalizeCoordinates(
            item.lat != null ? Number(item.lat) : (item.latitude != null ? Number(item.latitude) : null),
            item.lon != null ? Number(item.lon) : (item.longitude != null ? Number(item.longitude) : null)
          );
          return c ? [c.lat, c.lon] as [number, number] : undefined;
        })()
      })),
      ...(data.organizations || []).map((org: any, index: number) => ({
        ...org,
        id: org.id || `org-${tab}-${index}-${(org.name || 'organization').toLowerCase().replace(/\s+/g, '-')}`,
        title: org.name,
        description: org.description || "",
        retrieved_at: org.retrieved_at || new Date().toISOString(),
        type: 'organization',
        audience: 'general',
        latitude: normalizeCoordinates(
          org.lat != null ? Number(org.lat) : (org.latitude != null ? Number(org.latitude) : null),
          org.lon != null ? Number(org.lon) : (org.longitude != null ? Number(org.longitude) : null)
        )?.lat,
        longitude: normalizeCoordinates(
          org.lat != null ? Number(org.lat) : (org.latitude != null ? Number(org.latitude) : null),
          org.lon != null ? Number(org.lon) : (org.longitude != null ? Number(org.longitude) : null)
        )?.lon,
        location_confidence: (org.location_confidence === 'high' || org.location_confidence === 'medium' || org.location_confidence === 'low')
          ? org.location_confidence
          : ((org.address || org.location_name) ? 'medium' : 'low') as 'high' | 'medium' | 'low',
        verified_source: typeof org.verified_source === 'boolean' ? org.verified_source : false,
        recommended_by_users: Number(org.recommended_by_users || 0),
        neighborhood: org.neighborhood || '',
        cultural_groups: Array.isArray(org.cultural_groups) ? org.cultural_groups : [],
        supported_languages: Array.isArray(org.supported_languages) ? org.supported_languages : [],
        translation_services: Boolean(org.translation_services),
        translation_languages: Array.isArray(org.translation_languages) ? org.translation_languages : [],
        immigrant_support: Boolean(org.immigrant_support),
        newcomer_support: Boolean(org.newcomer_support),
        coordinates: (() => {
          const c = normalizeCoordinates(
            org.lat != null ? Number(org.lat) : (org.latitude != null ? Number(org.latitude) : null),
            org.lon != null ? Number(org.lon) : (org.longitude != null ? Number(org.longitude) : null)
          );
          return c ? [c.lat, c.lon] as [number, number] : undefined;
        })()
      }))
    ];
  };

  const handleSearch = async (tab: Tab, forceRefresh = false) => {
    setLoading(true);
    setError(null);

    if (!forceRefresh) {
      const localCache = readLocalTabCache(tab);
      if (localCache && localCache.items.length > 0) {
        const cached = dedupeCommunityItems(tab === 'events' ? prunePastEvents(localCache.items) : localCache.items);
        const tabClean = dedupeCommunityItems(filterItemsForTab(tab, cached, helpSupportSection));
        setSummary(normalizeSummary(localCache.summary));
        setItems(tabClean);
        hydrateCoordinates(tabClean, tab);
        setLoading(false);
        return;
      }
      try {
        const cachedResponse = await fetch(`/api/items/${tab}`);
        const cachedData = await cachedResponse.json();
        if (cachedData.items && cachedData.items.length > 0) {
          const dedupedCached = dedupeCommunityItems(tab === 'events' ? prunePastEvents(cachedData.items) : cachedData.items);
          const tabClean = dedupeCommunityItems(filterItemsForTab(tab, dedupedCached, helpSupportSection));
          const clean = normalizeSummary(cachedData.summary || '');
          setSummary(clean);
          setItems(tabClean);
          writeLocalTabCache(tab, tabClean, clean);
          hydrateCoordinates(tabClean, tab);
          setLoading(false);
          return;
        }
      } catch (e) {
        console.warn("Cache fetch failed", e);
      }
    }

    let query = "";
    switch (tab) {
      case 'all':
        query = "Find all community resources nearby including events, volunteering, food banks, and organizations.";
        break;
      case 'events':
        query = `Find community events nearby (upcoming by default). Include language-specific and cultural events when relevant. Search hint: ${searchQuery || 'general community events'}.`;
        break;
      case 'volunteer':
        query = "Find volunteering opportunities nearby. Categorize them as 'student', 'professional', or 'general'.";
        break;
      case 'foodbanks':
        query = "Find food banks nearby. Categorize them as 'general'.";
        break;
      case 'organizations':
        query = `Find local organizations including cultural organizations, language support, translation services, immigrant/newcomer resources, shelters, legal aid, clinics, and food assistance. Cultural filter: ${orgCulturalGroupFilter || 'none'}. Language filter: ${orgLanguageFilter || 'none'}. Search hint: ${searchQuery || 'community organizations'}.`;
        break;
      case 'clinics_legal':
        query = `Find nearby help and support resources including clinics, legal aid, shelters, translators/interpreters, and newcomer support guides. Focus section: ${helpSupportSection}.`;
        break;
      case 'map_view':
        query = "Find all nearby events, volunteer opportunities, food assistance, organizations, clinics, shelters, and legal aid resources with coordinates for map display.";
        break;
      case 'civics_politics':
        await fetchCivicsData();
        setLoading(false);
        return;
      default:
        setLoading(false);
        return;
    }

    try {
      const data = await fetchCommunityData(query, location || undefined);
      const mappedItems: CommunityItem[] = mapPayloadToItems(tab, data);
      
      const dedupedMapped = dedupeCommunityItems(mappedItems);
      const tabClean = dedupeCommunityItems(filterItemsForTab(tab, dedupedMapped, helpSupportSection));
      setItems(tabClean);
      const cleanedSummary = normalizeSummary(data.summary || '');
      setSummary(cleanedSummary);
      writeLocalTabCache(tab, tabClean, cleanedSummary);
      hydrateCoordinates(tabClean, tab);

      // Save to server-side cache
      await fetch('/api/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          items: tabClean.slice(0, 1200),
          organizations: [],
          summary: cleanedSummary,
          tab 
        })
      });

    } catch (err: any) {
      if (err?.status === 429 || err?.message?.includes('429') || err?.message?.includes('RESOURCE_EXHAUSTED')) {
        setError("The community search is currently busy due to high demand. Please wait a moment and try again.");
      } else {
        setError("Failed to fetch data. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab !== 'mylist' && activeTab !== 'connections' && activeTab !== 'civics_politics') {
      handleSearch(activeTab);
    }
  }, [activeTab, location]);

  useEffect(() => {
    if (activeTab !== 'organizations') return;
    const timer = setTimeout(() => {
      handleSearch('organizations', true);
    }, 350);
    return () => clearTimeout(timer);
  }, [activeTab, orgCulturalGroupFilter, orgLanguageFilter]);

  useEffect(() => {
    if (activeTab !== 'civics_politics') return;
    const timer = setTimeout(() => fetchCivicsData(), 250);
    return () => clearTimeout(timer);
  }, [activeTab, civicsSection, civicsState, civicsCounty, civicsElectionLevel, civicsElectionType, location]);

  useEffect(() => {
    if (activeTab !== 'clinics_legal') return;
    if (helpSupportSection === 'translators' || helpSupportSection === 'newcomer_guides') return;
    const timer = setTimeout(() => {
      handleSearch('clinics_legal', true);
    }, 250);
    return () => clearTimeout(timer);
  }, [activeTab, helpSupportSection]);

  useEffect(() => {
    if (activeTab !== 'clinics_legal') return;
    if (helpSupportSection === 'clinics') setClinicServiceFilter('clinic');
    else if (helpSupportSection === 'legal_aid') setClinicServiceFilter('legal_aid');
    else if (helpSupportSection === 'shelters') setClinicServiceFilter('shelter');
  }, [activeTab, helpSupportSection]);

  useEffect(() => {
    if (activeTab === 'map_view') {
      setViewMode('split');
      setAudienceFilter('all');
      setMapScope('radius');
    }
    if (activeTab === 'events') {
      setSortBy('soonest');
      setMapScope('radius');
    }
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== 'connections') return;
    setConnectionPage(1);
  }, [
    activeTab,
    connectionRadiusMiles,
    connectionAudience,
    connectionFieldOfStudy,
    connectionAcademicLevel,
    connectionIndustry,
    connectionExperienceLevel,
    connectionSkills,
    connectionInterests,
    connectionSortBy,
  ]);

  useEffect(() => {
    if (activeTab !== 'connections') return;
    fetchConnections(connectionPage);
  }, [
    activeTab,
    connectionPage,
    location,
    connectionRadiusMiles,
    connectionAudience,
    connectionFieldOfStudy,
    connectionAcademicLevel,
    connectionIndustry,
    connectionExperienceLevel,
    connectionSkills,
    connectionInterests,
    connectionSortBy,
  ]);

  useEffect(() => {
    if (!selectedConnection || activeTab !== 'connections') return;
    fetchMessages(selectedConnection.user_id);
    const interval = setInterval(() => {
      fetchMessages(selectedConnection.user_id);
    }, 8000);
    return () => clearInterval(interval);
  }, [selectedConnection, activeTab]);

  useEffect(() => {
    if (activeTab === 'connections') {
      setArtists([]);
      return;
    }
    const q = searchQuery.trim()
      ? `${searchQuery.trim()} local artists`
      : `local artists near me ${activeTab === 'events' ? 'with upcoming performances' : ''}`.trim();
    fetchArtists(q);
  }, [activeTab, searchQuery, location, radiusMiles, interfaceLanguage]);

  useEffect(() => {
    const q = searchQuery || (activeTab === 'events' ? 'community events near me' : '');
    if (!q) {
      setVideos([]);
      return;
    }
    const timer = setTimeout(() => fetchVideos(q), 350);
    return () => clearTimeout(timer);
  }, [searchQuery, activeTab, videoOrder, videoDuration, videoChannelType, interfaceLanguage, location]);

  useEffect(() => {
    if (activeTab !== 'clinics_legal') return;
    if (helpSupportSection !== 'translators' && helpSupportSection !== 'newcomer_guides') return;
    const timer = setTimeout(() => {
      fetchHelpSupportData();
    }, 300);
    return () => clearTimeout(timer);
  }, [
    activeTab,
    helpSupportSection,
    location,
    radiusMiles,
    translatorLanguageNeeded,
    translatorServiceType,
    translatorMode,
    translatorSpecialization,
    translatorCost,
    translatorAvailability,
    newcomerLanguage,
    newcomerTopic,
    newcomerFormat,
  ]);

  const applyFilters = (list: CommunityItem[]) => {
    let filtered = [...list];

    // Hard tab-level relevance gate: prevent cross-category leakage.
    if (activeTab === 'events') {
      filtered = filtered.filter((item) => isEventLikeType(item.type));
    } else if (activeTab === 'volunteer') {
      filtered = filtered.filter((item) => isVolunteerItem(item));
    } else if (activeTab === 'foodbanks') {
      filtered = filtered.filter((item) => isFoodItem(item));
    } else if (activeTab === 'organizations') {
      filtered = filtered.filter((item) => isOrganizationItem(item));
    } else if (activeTab === 'clinics_legal') {
      if (helpSupportSection === 'translators' || helpSupportSection === 'newcomer_guides') {
        filtered = [];
      } else {
        filtered = filtered.filter((item) => isClinicLegalItem(item));
      }
    } else if (activeTab === 'civics_politics') {
      filtered = filtered.filter((item) => isCivicsItem(item));
    }

    // Search Query
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(item => 
        (item.title || item.name || "").toLowerCase().includes(q) || 
        (item.description || "").toLowerCase().includes(q) ||
        (item.cultural_groups || []).some((g) => g.toLowerCase().includes(q)) ||
        (item.supported_languages || []).some((l) => l.toLowerCase().includes(q)) ||
        (item.translation_languages || []).some((l) => l.toLowerCase().includes(q))
      );
    }

    const supportsAudienceFilter = activeTab === 'events' || activeTab === 'volunteer' || activeTab === 'map_view';

    // Audience Filter (only tabs that support audience segmentation).
    if (supportsAudienceFilter && audienceFilter !== 'all') {
      filtered = filtered.filter(item => item.audience === audienceFilter);
    }

    // Student Specific Filters
    if (supportsAudienceFilter && audienceFilter === 'student') {
      if (fieldOfStudy !== 'all') {
        filtered = filtered.filter(item => item.fieldOfStudy?.toLowerCase().includes(fieldOfStudy.toLowerCase()));
      }
      if (academicLevel !== 'all') {
        filtered = filtered.filter(item => item.academicLevel === academicLevel);
      }
      if (careerFocus !== 'all') {
        filtered = filtered.filter(item => item.careerFocus === careerFocus);
      }
    }

    // Professional Specific Filters
    if (supportsAudienceFilter && audienceFilter === 'professional') {
      if (industry !== 'all') {
        filtered = filtered.filter(item => item.industry?.toLowerCase().includes(industry.toLowerCase()));
      }
      if (seniorityLevel !== 'all') {
        filtered = filtered.filter(item => item.seniorityLevel === seniorityLevel);
      }
      if (networkingVsTraining !== 'all') {
        filtered = filtered.filter(item => item.networkingVsTraining === networkingVsTraining);
      }
    }

    // Org Specific Filters
    if (activeTab === 'organizations') {
      const originalOrganizations = [...filtered];
      if (orgCategoryFilter !== 'all') {
        filtered = filtered.filter(item => item.category === orgCategoryFilter);
      }
      if (orgCulturalGroupFilter.trim()) {
        const q = orgCulturalGroupFilter.trim().toLowerCase();
        filtered = filtered.filter((item) =>
          (item.cultural_groups || []).some((g) => g.toLowerCase().includes(q)) ||
          (item.description || '').toLowerCase().includes(q) ||
          (item.title || '').toLowerCase().includes(q)
        );
      }
      if (orgLanguageFilter.trim()) {
        const q = orgLanguageFilter.trim().toLowerCase();
        filtered = filtered.filter((item) =>
          (item.supported_languages || []).some((l) => l.toLowerCase().includes(q)) ||
          (item.translation_languages || []).some((l) => l.toLowerCase().includes(q)) ||
          (item.description || '').toLowerCase().includes(q)
        );
      }
      if (orgTranslationOnly) {
        filtered = filtered.filter((item) => item.translation_services);
      }
      if (orgImmigrantSupportOnly) {
        filtered = filtered.filter((item) => item.immigrant_support);
      }
      if (orgNewcomerSupportOnly) {
        filtered = filtered.filter((item) => item.newcomer_support);
      }
      if (
        filtered.length === 0 &&
        (orgCulturalGroupFilter.trim() || orgLanguageFilter.trim() || orgTranslationOnly || orgImmigrantSupportOnly || orgNewcomerSupportOnly)
      ) {
        const relaxedTerm = `${orgCulturalGroupFilter} ${orgLanguageFilter}`.trim().toLowerCase();
        filtered = originalOrganizations.filter((item) => {
          const text = `${item.title || ''} ${item.description || ''} ${(item.supported_languages || []).join(' ')} ${(item.cultural_groups || []).join(' ')}`.toLowerCase();
          if (!relaxedTerm) return true;
          return relaxedTerm.split(/\s+/).some((token) => token.length > 1 && text.includes(token));
        });
      }
    }
    if (activeTab === 'foodbanks' && foodTypeFilter !== 'all') {
      filtered = filtered.filter((item) => {
        const type = (item.type || '').toLowerCase();
        if (foodTypeFilter === 'foodbank') return type === 'foodbank';
        if (foodTypeFilter === 'donation') return type === 'donation' && isFoodItem(item);
        return true;
      });
    }

    if (activeTab === 'clinics_legal' && clinicServiceFilter !== 'all') {
      filtered = filtered.filter((item) => {
        const itemType = (item.type || '').toLowerCase();
        const itemCategory = (item.category || '').toLowerCase();
        if (clinicServiceFilter === 'lawyer') return itemCategory === 'lawyer';
        return itemType === clinicServiceFilter || itemCategory === clinicServiceFilter;
      });
    }

    // Events-specific date logic: upcoming-only by default.
    if (activeTab === 'events') {
      const now = new Date();
      const endOfToday = new Date(now);
      endOfToday.setHours(23, 59, 59, 999);
      const endOfWeek = new Date(now);
      endOfWeek.setDate(now.getDate() + (7 - now.getDay()));
      endOfWeek.setHours(23, 59, 59, 999);
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
      const customStart = parseDateSafe(customDateStart ? `${customDateStart}T00:00:00` : null);
      const customEnd = parseDateSafe(customDateEnd ? `${customDateEnd}T23:59:59` : null);

      filtered = filtered.filter((item) => {
        const start = parseDateSafe(item.date_start);
        const end = parseDateSafe(item.date_end);
        const isUndated = !start && !end;
        if (isUndated && !includeUndatedEvents) return false;

        let isUpcoming = false;
        if (start && end) isUpcoming = end >= now;
        else if (start) isUpcoming = start >= now;
        else if (end) isUpcoming = end >= now;

        if (!includePastEvents && !isUndated && !isUpcoming) return false;

        if (eventWindow === 'upcoming_only') return includePastEvents ? true : (isUpcoming || isUndated);
        if (eventWindow === 'today') return !!start && start >= now && start <= endOfToday;
        if (eventWindow === 'this_week') return !!start && start >= now && start <= endOfWeek;
        if (eventWindow === 'this_month') return !!start && start >= now && start <= endOfMonth;
        if (eventWindow === 'custom') {
          if (!start) return includeUndatedEvents;
          if (customStart && start < customStart) return false;
          if (customEnd && start > customEnd) return false;
          return true;
        }
        return true;
      });

      if (eventTypeFilter !== 'all') {
        filtered = filtered.filter((item) => item.type === eventTypeFilter);
      }
    }
    
    // Add distance and Sort
    if (location) {
      filtered = filtered.map(item => {
        const coords = normalizeCoordinates(
          item.latitude != null ? Number(item.latitude) : (item.lat != null ? Number(item.lat) : null),
          item.longitude != null ? Number(item.longitude) : (item.lon != null ? Number(item.lon) : null)
        );
        if (coords) {
          const dist = calculateDistance(
            location.latitude, 
            location.longitude, 
            coords.lat,
            coords.lon
          );
          return { ...item, latitude: coords.lat, longitude: coords.lon, lat: coords.lat, lon: coords.lon, distance_miles: dist };
        }
        return item;
      });
    }

    // Common radius filter.
    filtered = filtered.filter((item) => item.distance_miles == null || item.distance_miles <= radiusMiles);

    // Sorting
    filtered.sort((a, b) => {
      if (sortBy === 'distance') {
        return (a.distance_miles || 9999) - (b.distance_miles || 9999);
      } else if (sortBy === 'soonest') {
        const dateA = a.date_start ? new Date(a.date_start).getTime() : Number.MAX_SAFE_INTEGER;
        const dateB = b.date_start ? new Date(b.date_start).getTime() : Number.MAX_SAFE_INTEGER;
        return dateA - dateB;
      } else if (sortBy === 'newest') {
        return new Date(b.date_start || 0).getTime() - new Date(a.date_start || 0).getTime();
      } else if (sortBy === 'relevance') {
        const qa = `${a.title || ''} ${a.description || ''}`.toLowerCase();
        const qb = `${b.title || ''} ${b.description || ''}`.toLowerCase();
        const q = searchQuery.toLowerCase();
        const scoreA = q ? (qa.includes(q) ? 1 : 0) : 0;
        const scoreB = q ? (qb.includes(q) ? 1 : 0) : 0;
        return scoreB - scoreA || ((a.distance_miles || 9999) - (b.distance_miles || 9999));
      } else {
        return (a.title || a.name || "").localeCompare(b.title || b.name || "");
      }
    });

    return filtered;
  };

  const filteredItems = useMemo(() => {
    const list = activeTab === 'mylist' ? myList : items;
    return applyFilters(list);
  }, [items, myList, activeTab, helpSupportSection, audienceFilter, location, searchQuery, sortBy, fieldOfStudy, academicLevel, careerFocus, industry, seniorityLevel, networkingVsTraining, orgCategoryFilter, orgCulturalGroupFilter, orgLanguageFilter, orgTranslationOnly, orgImmigrantSupportOnly, orgNewcomerSupportOnly, foodTypeFilter, clinicServiceFilter, radiusMiles, eventWindow, includePastEvents, includeUndatedEvents, eventTypeFilter, customDateStart, customDateEnd]);

  useEffect(() => {
    if (activeTab === 'connections' || activeTab === 'mylist') return;
    if (viewMode !== 'map' && viewMode !== 'split') return;
    const hasMissingCoordinates = filteredItems.some(
      (item) => (item.latitude == null || item.longitude == null) && !!getGeocodeQuery(item)
    );
    if (!hasMissingCoordinates) return;
    hydrateCoordinates(filteredItems, activeTab);
  }, [viewMode, activeTab, filteredItems]);

  const displayedItems = useMemo(() => {
    if (mapScope !== 'viewport' || !viewportBounds) return filteredItems;
    return filteredItems.filter((item) => {
      const coords = normalizeCoordinates(
        item.latitude != null ? Number(item.latitude) : (item.lat != null ? Number(item.lat) : null),
        item.longitude != null ? Number(item.longitude) : (item.lon != null ? Number(item.lon) : null)
      );
      if (!coords) return false;
      return (
        coords.lat <= viewportBounds.north &&
        coords.lat >= viewportBounds.south &&
        coords.lon <= viewportBounds.east &&
        coords.lon >= viewportBounds.west
      );
    });
  }, [filteredItems, mapScope, viewportBounds]);

  const artistItems = useMemo<CommunityItem[]>(() => {
    return artists
      .filter((artist) => normalizeCoordinates(artist.lat, artist.lon))
      .map((artist, idx) => {
        const c = normalizeCoordinates(artist.lat, artist.lon)!;
        return {
          id: `artist-${idx}-${artist.artist_name.toLowerCase().replace(/\s+/g, '-')}`,
          entity_kind: 'resource',
          title: artist.artist_name,
          description: artist.description,
          type: 'resource_center',
          audience: 'general',
          location_name: artist.location,
          address: artist.location,
          latitude: c.lat,
          longitude: c.lon,
          lat: c.lat,
          lon: c.lon,
          distance_miles: artist.distance_miles ?? undefined,
          source_name: 'Local Artist Discovery',
          source_url: artist.website || '',
          location_confidence: 'medium',
          needs_review: false,
          neighborhood: '',
          category: 'resource_center',
        };
      });
  }, [artists]);

  const translatorMapItems = useMemo<CommunityItem[]>(() => {
    if (activeTab !== 'clinics_legal' || helpSupportSection !== 'translators') return [];
    return translatorItems
      .filter((t) => normalizeCoordinates(t.lat, t.lon))
      .map((t, idx) => {
        const c = normalizeCoordinates(t.lat, t.lon)!;
        return {
          id: `translator-${idx}-${t.name.toLowerCase().replace(/\s+/g, '-')}`,
          entity_kind: 'resource',
          title: t.name,
          description: t.notes || 'Translation/interpretation service',
          type: t.service_type === 'translator' ? 'resource_center' : 'resource_center',
          audience: 'general',
          location_name: t.service_area || t.address,
          address: t.address,
          latitude: c.lat,
          longitude: c.lon,
          lat: c.lat,
          lon: c.lon,
          distance_miles: undefined,
          source_name: t.source_name,
          source_url: t.source_url,
          location_confidence: t.confidence?.overall === 'high' ? 'high' : 'medium',
          needs_review: false,
          category: 'resource_center',
        };
      });
  }, [translatorItems, activeTab, helpSupportSection]);

  const displayedItemsWithArtists = useMemo(() => {
    if (activeTab === 'organizations' || activeTab === 'map_view') {
      return [...displayedItems, ...artistItems, ...translatorMapItems];
    }
    if (activeTab === 'clinics_legal' && helpSupportSection === 'translators') return [...displayedItems, ...translatorMapItems];
    return displayedItems;
  }, [displayedItems, artistItems, translatorMapItems, activeTab, helpSupportSection]);

  useEffect(() => {
    const hasIntent = Boolean(
      searchQuery.trim() ||
      orgLanguageFilter.trim() ||
      orgCulturalGroupFilter.trim() ||
      (activeTab === 'events' && interfaceLanguage.trim())
    );
    if (!hasIntent) return;
    if (loading || autoRescueLoading) return;
    if (activeTab === 'connections' || activeTab === 'mylist') return;
    if (displayedItemsWithArtists.length > 0) return;

    const signature = [
      activeTab,
      searchQuery.trim().toLowerCase(),
      orgLanguageFilter.trim().toLowerCase(),
      orgCulturalGroupFilter.trim().toLowerCase(),
      interfaceLanguage.trim().toLowerCase(),
      radiusMiles,
    ].join('|');
    if (signature === autoRescueSignature) return;

    setAutoRescueSignature(signature);
    setAutoRescueLoading(true);
    (async () => {
      try {
        const rescueQuery = [
          `Use live web search and maps to find ${activeTab} near me.`,
          `Preferred interface language: ${interfaceLanguage}.`,
          orgLanguageFilter ? `Language requirement: ${orgLanguageFilter}.` : "",
          orgCulturalGroupFilter ? `Cultural requirement: ${orgCulturalGroupFilter}.` : "",
          searchQuery ? `User query: ${searchQuery}.` : "",
          "Return events and organizations with source URLs, corrected dates, and valid addresses."
        ].filter(Boolean).join(" ");
        const data = await fetchCommunityData(rescueQuery, location || undefined);
        const mapped = dedupeCommunityItems(mapPayloadToItems(activeTab, data));
        if (mapped.length > 0) {
          setItems(mapped);
          const msg = `No exact local match found. Expanded with AI web search (${interfaceLanguage}).`;
          setSummary(msg);
          writeLocalTabCache(activeTab, mapped, msg);
          hydrateCoordinates(mapped, activeTab);
        } else {
          setSummary(t(interfaceLanguage, 'no_exact_match'));
        }
      } catch {
        // Ignore and keep existing empty-state message.
      } finally {
        setAutoRescueLoading(false);
      }
    })();
  }, [
    activeTab,
    searchQuery,
    orgLanguageFilter,
    orgCulturalGroupFilter,
    interfaceLanguage,
    radiusMiles,
    displayedItemsWithArtists.length,
    loading,
    autoRescueLoading,
    autoRescueSignature,
    location,
  ]);

  const mapDebug = useMemo(() => {
    const withCoordinates = displayedItemsWithArtists.filter((item) => {
      const c = normalizeCoordinates(
        item.latitude != null ? Number(item.latitude) : (item.lat != null ? Number(item.lat) : null),
        item.longitude != null ? Number(item.longitude) : (item.lon != null ? Number(item.lon) : null)
      );
      return Boolean(c);
    }).length;
    return {
      total_results: displayedItemsWithArtists.length,
      results_with_coordinates: withCoordinates,
      markers_displayed: withCoordinates,
    };
  }, [displayedItemsWithArtists]);
  const layoutDebug = {
    sidebar_width_px: 260,
    content_start_px: 260,
    content_width_px: 1200,
    horizontal_gap_px: 0,
  };

  const toggleMyList = (item: CommunityItem) => {
    setMyList(prev => {
      const exists = prev.find(i => i.id === item.id);
      if (exists) {
        return prev.filter(i => i.id !== item.id);
      }
      return [...prev, item];
    });
  };

  const isInList = (id: string) => myList.some(i => i.id === id);
  const toggleGroupMembership = (groupId: string) => {
    setGroups((prev) =>
      prev.map((g) =>
        g.group_id === groupId
          ? { ...g, joined: !g.joined, member_count: g.member_count + (g.joined ? -1 : 1) }
          : g
      )
    );
  };
  const incrementAttendance = (itemId: string, kind: 'interested' | 'going') => {
    setAttendance((prev) => {
      const current = prev[itemId] || { interested: 0, going: 0 };
      return {
        ...prev,
        [itemId]: {
          ...current,
          [kind]: current[kind] + 1,
        },
      };
    });
  };

  return (
    <div className="min-h-screen md:flex">
      <aside className={cn(
        "fixed md:sticky md:top-0 left-0 top-0 h-screen md:h-screen z-[120] w-[260px] bg-[var(--card-bg)] border-r border-[var(--border-color)] p-4 overflow-y-auto transition-transform",
        sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
      )}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-serif text-2xl">Gratitude</h2>
          <button className="md:hidden p-2 opacity-70" onClick={() => setSidebarOpen(false)} aria-label="Close menu">
            <X size={18} />
          </button>
        </div>
        <div className="space-y-2">
          <SidebarItem active={activeTab === 'events'} label={t(interfaceLanguage, 'events')} icon={<Calendar size={16} />} onClick={() => { setActiveTab('events'); setSidebarOpen(false); }} />
          <SidebarItem active={activeTab === 'volunteer'} label={t(interfaceLanguage, 'volunteer')} icon={<Heart size={16} />} onClick={() => { setActiveTab('volunteer'); setSidebarOpen(false); }} />
          <SidebarItem active={activeTab === 'foodbanks'} label={t(interfaceLanguage, 'food')} icon={<ShoppingBasket size={16} />} onClick={() => { setActiveTab('foodbanks'); setSidebarOpen(false); }} />
          <SidebarItem active={activeTab === 'organizations'} label={t(interfaceLanguage, 'organizations')} icon={<Building2 size={16} />} onClick={() => { setActiveTab('organizations'); setSidebarOpen(false); }} />
          <SidebarItem active={activeTab === 'clinics_legal'} label={t(interfaceLanguage, 'clinics')} icon={<Info size={16} />} onClick={() => { setActiveTab('clinics_legal'); setSidebarOpen(false); }} />
          <SidebarItem active={activeTab === 'civics_politics'} label={t(interfaceLanguage, 'civics')} icon={<Info size={16} />} onClick={() => { setActiveTab('civics_politics'); setSidebarOpen(false); }} />
          <SidebarItem active={activeTab === 'connections'} label={t(interfaceLanguage, 'connections')} icon={<MessageCircle size={16} />} onClick={() => { setActiveTab('connections'); setSidebarOpen(false); }} />
          <SidebarItem active={activeTab === 'mylist'} label={t(interfaceLanguage, 'saved')} icon={<Bookmark size={16} />} onClick={() => { setActiveTab('mylist'); setSidebarOpen(false); }} />
          <SidebarItem active={activeTab === 'map_view'} label={t(interfaceLanguage, 'map')} icon={<MapIcon size={16} />} onClick={() => { setActiveTab('map_view'); setViewMode('split'); setSidebarOpen(false); }} />
          <SidebarItem active={showSettings} label={t(interfaceLanguage, 'settings')} icon={<Settings size={16} />} onClick={() => { setShowSettings(true); setSidebarOpen(false); }} />
        </div>
        <button
          onClick={() => {
            setAudienceFilter('all');
            setRadiusMiles(10);
            setSortBy(activeTab === 'events' ? 'soonest' : 'distance');
            setSearchQuery('');
            setEventWindow('upcoming_only');
            setIncludePastEvents(false);
            setIncludeUndatedEvents(false);
            setEventTypeFilter('all');
            setCustomDateStart('');
            setCustomDateEnd('');
            setFieldOfStudy('all');
            setAcademicLevel('all');
            setCareerFocus('all');
            setIndustry('all');
            setSeniorityLevel('all');
            setNetworkingVsTraining('all');
            setOrgCategoryFilter('all');
            setOrgCulturalGroupFilter('');
            setOrgLanguageFilter('');
            setOrgTranslationOnly(false);
            setOrgImmigrantSupportOnly(false);
            setOrgNewcomerSupportOnly(false);
            setFoodTypeFilter('all');
            setClinicServiceFilter('all');
            setHelpSupportSection('clinics');
            setTranslatorLanguageNeeded('');
            setTranslatorServiceType('both');
            setTranslatorMode('any');
            setTranslatorSpecialization('general');
            setTranslatorCost('any');
            setTranslatorAvailability('any');
            setNewcomerLanguage('');
            setNewcomerTopic('all');
            setNewcomerFormat('any');
          }}
          className="w-full mt-4 px-4 py-3 rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 text-sm"
        >
          {t(interfaceLanguage, 'reset')}
        </button>
      </aside>
      {sidebarOpen && <div className="fixed inset-0 bg-black/40 z-[110] md:hidden" onClick={() => setSidebarOpen(false)} />}

      <div className="flex-1 md:ml-[260px] px-4 md:px-5 py-6 max-w-[1400px]">
      <header className="mb-8 flex flex-col lg:flex-row justify-between lg:items-start gap-4">
        <div className="text-center lg:text-left w-full lg:w-auto">
          <button className="md:hidden mb-3 px-3 py-2 rounded-xl bg-white/10 border border-white/10" onClick={() => setSidebarOpen(true)}>
            Menu
          </button>
          <motion.h1 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="text-5xl font-serif font-light tracking-tight mb-1"
          >
            Gratitude
          </motion.h1>
          <p className="opacity-60 font-light italic">Rooted in your neighborhood.</p>
          <p className="text-xs opacity-55 mt-2">
            Near: {location ? `${location.latitude.toFixed(3)}, ${location.longitude.toFixed(3)}` : 'Approximate area'}
          </p>
          <p className="text-xs opacity-55">
            translation_enabled: true • interface_language: {interfaceLanguage}
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-center lg:justify-end gap-2 bg-white/10 backdrop-blur-md p-2 rounded-2xl border border-white/20 shadow-lg max-w-full">
          <button 
            onClick={() => setShowSettings(true)}
            aria-label="Open settings"
            className="p-2 rounded-xl transition-all opacity-50 hover:opacity-100 hover:bg-white/10"
          >
            <Settings size={20} />
          </button>
          <div className="w-[1px] h-6 bg-white/20 mx-1 hidden sm:block" />
          <ThemeToggle current={appearance} onSelect={setAppearance} />
          <div className="w-[1px] h-6 bg-white/20 mx-1 hidden sm:block" />
          <div className="flex flex-wrap gap-1">
          <button 
              onClick={() => setViewMode('grid')}
              aria-label="Grid view"
              className={cn("p-2 rounded-xl transition-all", viewMode === 'grid' ? "bg-[#5A5A40] text-white" : "opacity-50 hover:opacity-100")}
            >
              <LayoutGrid size={20} />
            </button>
            <button 
              onClick={() => setViewMode('map')}
              aria-label="Map view"
              className={cn("p-2 rounded-xl transition-all", viewMode === 'map' ? "bg-[#5A5A40] text-white" : "opacity-50 hover:opacity-100")}
            >
              <MapIcon size={20} />
            </button>
            <button
              onClick={() => setViewMode('split')}
              aria-label="Split view"
              className={cn("px-2 py-2 rounded-xl transition-all text-xs font-semibold", viewMode === 'split' ? "bg-[#5A5A40] text-white" : "opacity-50 hover:opacity-100")}
            >
              Split
            </button>
          </div>
        </div>
      </header>

      {activeTab !== 'connections' && (
      <div className="mb-8 flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          {(activeTab === 'events' || activeTab === 'volunteer' || activeTab === 'map_view') ? (
            <div className="flex items-center gap-2 bg-white/5 p-1 rounded-2xl border border-white/10">
              <FilterButton 
                active={audienceFilter === 'all'} 
                onClick={() => setAudienceFilter('all')}
                icon={<Users size={16} />}
                label={t(interfaceLanguage, 'all')}
              />
              <FilterButton 
                active={audienceFilter === 'student'} 
                onClick={() => setAudienceFilter('student')}
                icon={<GraduationCap size={16} />}
                label={t(interfaceLanguage, 'student')}
              />
              <FilterButton 
                active={audienceFilter === 'professional'} 
                onClick={() => setAudienceFilter('professional')}
                icon={<Briefcase size={16} />}
                label={t(interfaceLanguage, 'professional')}
              />
              <FilterButton 
                active={audienceFilter === 'families'} 
                onClick={() => setAudienceFilter('families')}
                icon={<Heart size={16} />}
                label={t(interfaceLanguage, 'families')}
              />
            </div>
          ) : (
            <div className="text-xs uppercase tracking-wider opacity-50 px-1">
              {activeTab === 'foodbanks' ? 'Food filters' : activeTab === 'clinics_legal' ? 'Help & Support filters' : activeTab === 'civics_politics' ? 'Civics filters' : 'Tab-specific filters'}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 justify-start lg:justify-end w-full lg:w-auto">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 opacity-30" size={16} />
              <input 
                type="text" 
                placeholder={t(interfaceLanguage, 'search')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 pr-4 py-2 bg-white/5 border border-white/10 rounded-xl text-sm focus:outline-none focus:border-[#5A5A40] transition-all w-full min-w-[220px] lg:w-64"
              />
            </div>
            <select 
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortBy)}
              className="px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-sm focus:outline-none focus:border-[#5A5A40] transition-all min-w-[180px]"
            >
              <option value="soonest">{t(interfaceLanguage, 'sort_soonest')}</option>
              <option value="distance">{t(interfaceLanguage, 'sort_distance')}</option>
              <option value="relevance">{t(interfaceLanguage, 'sort_relevance')}</option>
              <option value="newest">{t(interfaceLanguage, 'sort_newest')}</option>
            </select>
            <select
              value={radiusMiles}
              onChange={(e) => setRadiusMiles(Number(e.target.value))}
              className="px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-sm focus:outline-none focus:border-[#5A5A40] transition-all min-w-[96px]"
            >
              {[1, 5, 10, 25, 50].map((m) => (
                <option key={m} value={m}>{m} mi</option>
              ))}
            </select>
            <select
              value={mapScope}
              onChange={(e) => setMapScope(e.target.value as MapScope)}
              className="px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-sm focus:outline-none focus:border-[#5A5A40] transition-all min-w-[170px]"
            >
              <option value="radius">{t(interfaceLanguage, 'map_scope_radius')}</option>
              <option value="viewport">{t(interfaceLanguage, 'map_scope_viewport')}</option>
            </select>
          </div>
        </div>

        {activeTab === 'events' && (
          <div className="flex flex-wrap items-center gap-2 bg-white/5 p-3 rounded-2xl border border-white/10">
            <select value={eventWindow} onChange={(e) => setEventWindow(e.target.value as EventWindow)} className="px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-sm">
              <option value="upcoming_only">{t(interfaceLanguage, 'upcoming_only')}</option>
              <option value="today">{t(interfaceLanguage, 'today')}</option>
              <option value="this_week">{t(interfaceLanguage, 'this_week')}</option>
              <option value="this_month">{t(interfaceLanguage, 'this_month')}</option>
              <option value="custom">{t(interfaceLanguage, 'custom_range')}</option>
            </select>
            {eventWindow === 'custom' && (
              <>
                <input type="date" value={customDateStart} onChange={(e) => setCustomDateStart(e.target.value)} className="px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-sm" />
                <input type="date" value={customDateEnd} onChange={(e) => setCustomDateEnd(e.target.value)} className="px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-sm" />
              </>
            )}
            <select value={eventTypeFilter} onChange={(e) => setEventTypeFilter(e.target.value)} className="px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-sm">
              <option value="all">{t(interfaceLanguage, 'all_types')}</option>
              <option value="event">Event</option>
              <option value="workshop">Workshop</option>
              <option value="networking">Networking</option>
              <option value="class">Class</option>
              <option value="support_group">Support Group</option>
            </select>
            <label className="text-xs opacity-80 flex items-center gap-2 px-2">
              <input type="checkbox" checked={includeUndatedEvents} onChange={(e) => setIncludeUndatedEvents(e.target.checked)} />
              {t(interfaceLanguage, 'include_undated')}
            </label>
            <label className="text-xs opacity-80 flex items-center gap-2 px-2">
              <input type="checkbox" checked={includePastEvents} onChange={(e) => setIncludePastEvents(e.target.checked)} />
              {t(interfaceLanguage, 'include_past')}
            </label>
          </div>
        )}

        {activeTab === 'foodbanks' && (
          <div className="flex flex-wrap items-center gap-2 bg-white/5 p-3 rounded-2xl border border-white/10">
            <select value={foodTypeFilter} onChange={(e) => setFoodTypeFilter(e.target.value as 'all' | 'foodbank' | 'donation')} className="px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-sm">
              <option value="all">All food resources</option>
              <option value="foodbank">Food banks/pantries</option>
              <option value="donation">Donation drives</option>
            </select>
          </div>
        )}

        {activeTab === 'clinics_legal' && (
          <div className="bg-white/5 p-3 rounded-2xl border border-white/10 space-y-3">
            <div className="flex flex-wrap gap-2">
              {[
                ['clinics', 'Clinics'],
                ['legal_aid', 'Legal Aid'],
                ['shelters', 'Shelters'],
                ['translators', 'Translators'],
                ['newcomer_guides', 'Newcomer Guides'],
              ].map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setHelpSupportSection(key as HelpSupportSection)}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs border border-white/10",
                    helpSupportSection === key ? "bg-[#5A5A40] text-white" : "bg-white/5"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            {(helpSupportSection === 'clinics' || helpSupportSection === 'legal_aid' || helpSupportSection === 'shelters') && (
              <select value={clinicServiceFilter} onChange={(e) => setClinicServiceFilter(e.target.value as 'all' | 'clinic' | 'legal_aid' | 'shelter' | 'resource_center' | 'lawyer')} className="px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-sm">
                <option value="all">All help services</option>
                <option value="clinic">Clinics</option>
                <option value="legal_aid">Legal aid</option>
                <option value="lawyer">Lawyers</option>
                <option value="shelter">Shelters</option>
                <option value="resource_center">Resource centers</option>
              </select>
            )}

            {helpSupportSection === 'translators' && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                <input value={translatorLanguageNeeded} onChange={(e) => setTranslatorLanguageNeeded(e.target.value)} placeholder="Language needed (e.g., Farsi, French)" className="px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-sm" />
                <select value={translatorServiceType} onChange={(e) => setTranslatorServiceType(e.target.value as 'translator' | 'interpreter' | 'both')} className="px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-sm">
                  <option value="both">Translator + Interpreter</option>
                  <option value="translator">Translator</option>
                  <option value="interpreter">Interpreter</option>
                </select>
                <select value={translatorMode} onChange={(e) => setTranslatorMode(e.target.value as 'in_person' | 'remote' | 'phone' | 'any')} className="px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-sm">
                  <option value="any">Any mode</option>
                  <option value="in_person">In person</option>
                  <option value="remote">Remote</option>
                  <option value="phone">Phone</option>
                </select>
                <select value={translatorSpecialization} onChange={(e) => setTranslatorSpecialization(e.target.value as 'medical' | 'legal' | 'education' | 'general')} className="px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-sm">
                  <option value="general">General specialization</option>
                  <option value="medical">Medical</option>
                  <option value="legal">Legal</option>
                  <option value="education">Education</option>
                </select>
                <select value={translatorCost} onChange={(e) => setTranslatorCost(e.target.value as 'free' | 'paid' | 'any')} className="px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-sm">
                  <option value="any">Any cost</option>
                  <option value="free">Free</option>
                  <option value="paid">Paid</option>
                </select>
                <select value={translatorAvailability} onChange={(e) => setTranslatorAvailability(e.target.value as 'same_day' | 'weekends' | 'any')} className="px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-sm">
                  <option value="any">Any availability</option>
                  <option value="same_day">Same day</option>
                  <option value="weekends">Weekends</option>
                </select>
              </div>
            )}

            {helpSupportSection === 'newcomer_guides' && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                <input value={newcomerLanguage} onChange={(e) => setNewcomerLanguage(e.target.value)} placeholder="Guide language (e.g., English, Farsi)" className="px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-sm" />
                <select value={newcomerTopic} onChange={(e) => setNewcomerTopic(e.target.value as any)} className="px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-sm">
                  <option value="all">All topics</option>
                  <option value="documentation">Documentation</option>
                  <option value="healthcare">Healthcare</option>
                  <option value="housing">Housing</option>
                  <option value="education">Education</option>
                  <option value="employment">Employment</option>
                  <option value="banking">Banking</option>
                  <option value="transportation">Transportation</option>
                  <option value="legal_rights_general">Legal rights (general)</option>
                  <option value="emergency_services">Emergency services</option>
                </select>
                <select value={newcomerFormat} onChange={(e) => setNewcomerFormat(e.target.value as any)} className="px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-sm">
                  <option value="any">Any format</option>
                  <option value="article">Article</option>
                  <option value="pdf">PDF</option>
                  <option value="video">Video</option>
                  <option value="checklist">Checklist</option>
                  <option value="local_program">Local program</option>
                </select>
              </div>
            )}
          </div>
        )}

        {activeTab === 'civics_politics' && (
          <div className="bg-white/5 p-3 rounded-2xl border border-white/10 space-y-3">
            <div className="flex flex-wrap gap-2">
              {[
                ['elections', 'Elections Near Me'],
                ['candidates', 'Candidates & Offices'],
                ['parties', 'Parties & Committees'],
                ['ballot', 'Ballot & Measures'],
                ['saved_topics', 'My Saved Topics'],
              ].map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setCivicsSection(key as CivicsSection)}
                  className={cn("px-3 py-1.5 rounded-lg text-xs border border-white/10", civicsSection === key ? "bg-[#5A5A40] text-white" : "bg-white/5")}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
              <input value={civicsState} onChange={(e) => setCivicsState(e.target.value)} placeholder="State or region" className="px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-sm" />
              <input value={civicsCounty} onChange={(e) => setCivicsCounty(e.target.value)} placeholder="County or district" className="px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-sm" />
              <select value={civicsElectionLevel} onChange={(e) => setCivicsElectionLevel(e.target.value as any)} className="px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-sm">
                <option value="all">All levels</option>
                <option value="federal">Federal</option>
                <option value="state">State</option>
                <option value="county">County</option>
                <option value="local">Local</option>
              </select>
              <select value={civicsElectionType} onChange={(e) => setCivicsElectionType(e.target.value as any)} className="px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-sm">
                <option value="all">All election types</option>
                <option value="general">General</option>
                <option value="primary">Primary</option>
                <option value="local">Local</option>
                <option value="special">Special</option>
                <option value="runoff">Runoff</option>
                <option value="referendum">Referendum</option>
              </select>
            </div>
          </div>
        )}

        {/* Advanced Filters */}
        <AnimatePresence>
          {(activeTab === 'events' || activeTab === 'volunteer' || activeTab === 'map_view') && audienceFilter === 'student' && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="bg-white/5 p-6 rounded-3xl border border-white/10 grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <label className="text-[10px] uppercase tracking-widest font-bold opacity-30 mb-2 block">Field of Study</label>
                  <select 
                    value={fieldOfStudy}
                    onChange={(e) => setFieldOfStudy(e.target.value)}
                    className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-sm focus:outline-none"
                  >
                    <option value="all">All Fields</option>
                    <option value="computer science">Computer Science</option>
                    <option value="business">Business</option>
                    <option value="health">Health</option>
                    <option value="arts">Arts</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-widest font-bold opacity-30 mb-2 block">Academic Level</label>
                  <select 
                    value={academicLevel}
                    onChange={(e) => setAcademicLevel(e.target.value)}
                    className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-sm focus:outline-none"
                  >
                    <option value="all">All Levels</option>
                    <option value="undergrad">Undergraduate</option>
                    <option value="grad">Graduate</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-widest font-bold opacity-30 mb-2 block">Career Focus</label>
                  <select 
                    value={careerFocus}
                    onChange={(e) => setCareerFocus(e.target.value)}
                    className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-sm focus:outline-none"
                  >
                    <option value="all">Any Focus</option>
                    <option value="internship">Internship</option>
                    <option value="networking">Networking</option>
                    <option value="skills">Skills</option>
                    <option value="social">Social</option>
                  </select>
                </div>
              </div>
            </motion.div>
          )}

          {(activeTab === 'events' || activeTab === 'volunteer' || activeTab === 'map_view') && audienceFilter === 'professional' && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="bg-white/5 p-6 rounded-3xl border border-white/10 grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <label className="text-[10px] uppercase tracking-widest font-bold opacity-30 mb-2 block">Industry</label>
                  <input 
                    type="text"
                    placeholder="e.g. Tech, Finance"
                    value={industry === 'all' ? '' : industry}
                    onChange={(e) => setIndustry(e.target.value || 'all')}
                    className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-sm focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-widest font-bold opacity-30 mb-2 block">Seniority</label>
                  <select 
                    value={seniorityLevel}
                    onChange={(e) => setSeniorityLevel(e.target.value)}
                    className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-sm focus:outline-none"
                  >
                    <option value="all">All Levels</option>
                    <option value="entry">Entry Level</option>
                    <option value="mid">Mid Level</option>
                    <option value="senior">Senior</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-widest font-bold opacity-30 mb-2 block">Focus</label>
                  <select 
                    value={networkingVsTraining}
                    onChange={(e) => setNetworkingVsTraining(e.target.value)}
                    className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-sm focus:outline-none"
                  >
                    <option value="all">All</option>
                    <option value="networking">Networking</option>
                    <option value="training">Training</option>
                  </select>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'organizations' && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="bg-white/5 p-6 rounded-3xl border border-white/10">
                <label className="text-[10px] uppercase tracking-widest font-bold opacity-30 mb-2 block">Category</label>
                <div className="flex flex-wrap gap-2">
                  {['all', 'shelter', 'legal_aid', 'free_clinic', 'lawyer', 'food_assistance', 'resource_center'].map(cat => (
                    <button 
                      key={cat}
                      onClick={() => setOrgCategoryFilter(cat)}
                      className={cn(
                        "px-4 py-2 rounded-xl text-xs font-medium transition-all",
                        orgCategoryFilter === cat ? "bg-[#5A5A40] text-white" : "bg-white/5 opacity-40 hover:opacity-100"
                      )}
                    >
                      {cat.replace('_', ' ').toUpperCase()}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
                  <input
                    type="text"
                    value={orgCulturalGroupFilter}
                    onChange={(e) => setOrgCulturalGroupFilter(e.target.value)}
                    placeholder={t(interfaceLanguage, 'cultural_placeholder')}
                    className="px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-sm"
                  />
                  <input
                    type="text"
                    value={orgLanguageFilter}
                    onChange={(e) => setOrgLanguageFilter(e.target.value)}
                    placeholder={t(interfaceLanguage, 'language_placeholder')}
                    className="px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-sm"
                  />
                </div>
                <div className="flex flex-wrap gap-3 mt-3 text-xs">
                  <label className="flex items-center gap-2"><input type="checkbox" checked={orgTranslationOnly} onChange={(e) => setOrgTranslationOnly(e.target.checked)} /> {t(interfaceLanguage, 'translation_services')}</label>
                  <label className="flex items-center gap-2"><input type="checkbox" checked={orgImmigrantSupportOnly} onChange={(e) => setOrgImmigrantSupportOnly(e.target.checked)} /> {t(interfaceLanguage, 'immigration_support')}</label>
                  <label className="flex items-center gap-2"><input type="checkbox" checked={orgNewcomerSupportOnly} onChange={(e) => setOrgNewcomerSupportOnly(e.target.checked)} /> {t(interfaceLanguage, 'newcomer_support')}</label>
                </div>
                {(orgCulturalGroupFilter || orgLanguageFilter) && displayedItemsWithArtists.length === 0 && !autoRescueLoading && (
                  <p className="text-xs text-yellow-300 mt-3">{t(interfaceLanguage, 'no_exact_match')}</p>
                )}
                {autoRescueLoading && (
                  <p className="text-xs text-emerald-300 mt-3">{t(interfaceLanguage, 'ai_fallback_running')}</p>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            {activeTab !== 'mylist' && (
              <button 
                onClick={() => handleSearch(activeTab, true)}
                className="p-2 rounded-xl bg-white/5 hover:bg-white/10 transition-all opacity-60 hover:opacity-100 flex items-center gap-2 text-xs"
                title="Refresh results"
              >
                <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
                {t(interfaceLanguage, 'refresh')}
              </button>
            )}
            {summary && activeTab !== 'mylist' && (
              <p className="text-sm opacity-60 italic max-w-md text-right hidden md:block">
                {summary}
              </p>
            )}
            <p className="text-xs opacity-60 hidden lg:block">
              map_debug: total {mapDebug.total_results} | with coords {mapDebug.results_with_coordinates} | markers {mapDebug.markers_displayed}
            </p>
            <p className="text-xs opacity-60 hidden xl:block">
              layout_debug: sidebar {layoutDebug.sidebar_width_px}px | content {layoutDebug.content_width_px}px | gap {layoutDebug.horizontal_gap_px}px
            </p>
            {mapDebug.markers_displayed < mapDebug.results_with_coordinates && (
              <p className="text-xs text-yellow-400">Map marker mismatch detected</p>
            )}
          </div>
        </div>
      </div>
      )}

      {activeTab !== 'connections' && (
        <div className="mb-6 grid grid-cols-1 xl:grid-cols-2 gap-4">
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
            <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
              <h3 className="font-serif text-xl">{t(interfaceLanguage, 'community_videos')}</h3>
              <div className="flex flex-wrap gap-2 max-w-full">
                <select value={videoOrder} onChange={(e) => setVideoOrder(e.target.value as 'relevance' | 'date')} className="px-2 py-1 bg-white/5 border border-white/10 rounded-lg text-xs min-w-[120px]">
                  <option value="relevance">Relevance</option>
                  <option value="date">Upload Date</option>
                </select>
                <select value={videoDuration} onChange={(e) => setVideoDuration(e.target.value as 'any' | 'short' | 'medium' | 'long')} className="px-2 py-1 bg-white/5 border border-white/10 rounded-lg text-xs min-w-[120px]">
                  <option value="any">{t(interfaceLanguage, 'any_length')}</option>
                  <option value="short">Short</option>
                  <option value="medium">Medium</option>
                  <option value="long">Long</option>
                </select>
                <select value={videoChannelType} onChange={(e) => setVideoChannelType(e.target.value as 'all' | 'organization' | 'educational' | 'individual')} className="px-2 py-1 bg-white/5 border border-white/10 rounded-lg text-xs min-w-[130px]">
                  <option value="all">{t(interfaceLanguage, 'all_channels')}</option>
                  <option value="organization">Organization</option>
                  <option value="educational">Educational</option>
                  <option value="individual">Individual</option>
                </select>
              </div>
            </div>
            {videosLoading ? (
              <p className="text-sm opacity-60">{t(interfaceLanguage, 'loading_videos')}</p>
            ) : videos.length === 0 ? (
              <p className="text-sm opacity-60">{t(interfaceLanguage, 'no_videos')}</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {videos.slice(0, 4).map((video) => (
                  <a key={video.video_id} href={video.watch_url} target="_blank" rel="noopener noreferrer" className="flex gap-3 p-2 rounded-xl bg-white/5 border border-white/10">
                    <img src={video.thumbnail} alt={video.title} className="w-24 h-16 object-cover rounded-lg" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold line-clamp-2">{video.title}</p>
                      <p className="text-xs opacity-60 truncate">{video.channel_name}</p>
                    </div>
                  </a>
                ))}
              </div>
            )}
          </div>
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
            <h3 className="font-serif text-xl mb-3">{t(interfaceLanguage, 'local_artists')}</h3>
            {artistsLoading ? (
              <p className="text-sm opacity-60">{t(interfaceLanguage, 'loading_artists')}</p>
            ) : artists.length === 0 ? (
              <p className="text-sm opacity-60">{t(interfaceLanguage, 'no_artists')}</p>
            ) : (
              <div className="space-y-2">
                {artists.slice(0, 4).map((artist, idx) => (
                  <div key={`${artist.artist_name}-${idx}`} className="p-2 rounded-xl bg-white/5 border border-white/10">
                    <p className="font-semibold">{artist.artist_name}</p>
                    <p className="text-xs opacity-70">{artist.category.replace('_', ' ')} • {artist.location}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'clinics_legal' && helpSupportSection === 'translators' && (
        <div className="mb-6 bg-white/5 border border-white/10 rounded-2xl p-4">
          <h3 className="font-serif text-2xl mb-3">Translators & Interpreters</h3>
          {helpSupportLoading ? (
            <p className="text-sm opacity-60">Loading translator listings...</p>
          ) : translatorItems.length === 0 ? (
            <p className="text-sm opacity-60">No local translator listings found. Expand radius or language filters.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {translatorItems.slice(0, 12).map((tr, idx) => (
                <div key={`${tr.name}-${idx}`} className="p-3 rounded-xl bg-white/5 border border-white/10">
                  <p className="font-semibold">{tr.name}</p>
                  <p className="text-xs opacity-70">{tr.service_type} • {(tr.languages_supported || []).join(', ') || 'English'}</p>
                  <p className="text-xs opacity-70">{tr.mode} • {tr.cost}</p>
                  <p className="text-xs opacity-60 mt-1">{tr.address || tr.service_area}</p>
                  {tr.website && <a className="text-xs text-[#5A5A40] underline" href={tr.website} target="_blank" rel="noreferrer">Source</a>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'clinics_legal' && helpSupportSection === 'newcomer_guides' && (
        <div className="mb-6 bg-white/5 border border-white/10 rounded-2xl p-4">
          <h3 className="font-serif text-2xl mb-3">Newcomer Guides</h3>
          {helpSupportLoading ? (
            <p className="text-sm opacity-60">Loading newcomer guides...</p>
          ) : newcomerGuideItems.length === 0 ? (
            <p className="text-sm opacity-60">No local newcomer guides found for current filters.</p>
          ) : (
            <div className="space-y-3">
              {newcomerGuideItems.slice(0, 16).map((guide, idx) => (
                <div key={`${guide.title}-${idx}`} className="p-3 rounded-xl bg-white/5 border border-white/10">
                  <p className="font-semibold">{guide.title}</p>
                  <p className="text-xs opacity-70">{guide.topic} • {guide.language} • {guide.format}</p>
                  <p className="text-sm opacity-80 mt-1">{guide.summary}</p>
                  {guide.source_url && <a className="text-xs text-[#5A5A40] underline" href={guide.source_url} target="_blank" rel="noreferrer">Source</a>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'civics_politics' && (
        <div className="mb-6 grid grid-cols-1 xl:grid-cols-2 gap-4">
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
            <h3 className="font-serif text-2xl mb-3">Elections Near Me (Upcoming)</h3>
            {civicsLoading ? (
              <p className="text-sm opacity-60">Loading elections...</p>
            ) : civicsElections.length === 0 ? (
              <p className="text-sm opacity-60">No upcoming elections in current filter. Check official portals below.</p>
            ) : (
              <div className="space-y-2">
                {civicsElections.slice(0, 8).map((e) => (
                  <div key={e.election_id} className="p-3 rounded-xl bg-white/5 border border-white/10">
                    <p className="font-semibold">{e.name}</p>
                    <p className="text-xs opacity-70">{e.election_date} • {e.election_type}</p>
                    <a className="text-xs text-[#5A5A40] underline" href={e.official_portal_url} target="_blank" rel="noreferrer">{e.official_portal_name}</a>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
            <h3 className="font-serif text-2xl mb-3">Voting Eligibility & How To Vote</h3>
            {!civicsEligibility ? (
              <p className="text-sm opacity-60">Eligibility checklist unavailable. Use official tools below.</p>
            ) : (
              <div className="space-y-3">
                <p className="text-sm opacity-80">{civicsEligibility.jurisdiction?.state_or_region || 'Unknown jurisdiction'}</p>
                <ul className="text-sm space-y-1">
                  {(civicsEligibility.checklist_items || []).slice(0, 5).map((it: any, idx: number) => (
                    <li key={idx} className="opacity-80">• {it.text}</li>
                  ))}
                </ul>
                <div className="flex flex-col gap-1">
                  {(civicsEligibility.official_tools || []).map((tool: any, idx: number) => (
                    <a key={idx} className="text-xs text-[#5A5A40] underline" href={tool.url} target="_blank" rel="noreferrer">{tool.label}</a>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <main className="flex-1 relative min-h-[500px]">
        <AnimatePresence mode="wait">
          {activeTab === 'connections' ? (
            <ConnectionsPanel
              connections={connections}
              loading={connectionsLoading}
              error={connectionsError}
              notes={connectionNotes}
              page={connectionPage}
              pageSize={CONNECTION_PAGE_SIZE}
              total={connectionTotal}
              radiusMiles={connectionRadiusMiles}
              setRadiusMiles={setConnectionRadiusMiles}
              audience={connectionAudience}
              setAudience={setConnectionAudience}
              fieldOfStudy={connectionFieldOfStudy}
              setFieldOfStudy={setConnectionFieldOfStudy}
              academicLevel={connectionAcademicLevel}
              setAcademicLevel={setConnectionAcademicLevel}
              industry={connectionIndustry}
              setIndustry={setConnectionIndustry}
              experienceLevel={connectionExperienceLevel}
              setExperienceLevel={setConnectionExperienceLevel}
              skills={connectionSkills}
              setSkills={setConnectionSkills}
              interests={connectionInterests}
              setInterests={setConnectionInterests}
              sortBy={connectionSortBy}
              setSortBy={setConnectionSortBy}
              onPageChange={setConnectionPage}
              selectedConnection={selectedConnection}
              onSelectConnection={(connection) => {
                setSelectedConnection(connection);
                fetchMessages(connection.user_id);
              }}
              messages={messages}
              messagesLoading={messagesLoading}
              messageDraft={messageDraft}
              setMessageDraft={setMessageDraft}
              onSendMessage={sendMessage}
              communityPosts={communityPosts}
              groups={groups}
              onToggleGroupMembership={toggleGroupMembership}
            />
          ) : loading ? (
            <motion.div 
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 flex flex-col items-center justify-center"
            >
              <Loader2 className="animate-spin opacity-40 mb-4" size={48} />
              <p className="opacity-60 animate-pulse font-serif text-xl">Cultivating results...</p>
            </motion.div>
          ) : error ? (
            <motion.div 
              key="error"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="bg-red-500/10 border border-red-500/20 p-8 rounded-3xl text-center max-w-md mx-auto"
            >
              <p className="text-red-400 mb-6">{error}</p>
              <button 
                onClick={() => handleSearch(activeTab)}
                className="px-8 py-3 bg-red-500 text-white rounded-full font-medium hover:bg-red-600 transition-colors"
              >
                Try Again
              </button>
            </motion.div>
          ) : viewMode === 'map' ? (
            <motion.div 
              key="map"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="h-[600px] rounded-3xl overflow-hidden border border-white/10 shadow-2xl relative z-0"
            >
              <MapComponent items={displayedItemsWithArtists} userLocation={location} onViewportChange={setViewportBounds} />
            </motion.div>
          ) : viewMode === 'split' ? (
            <motion.div
              key="split"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="grid grid-cols-1 xl:grid-cols-2 gap-6"
            >
              <div className="h-[520px] rounded-3xl overflow-hidden border border-white/10 shadow-2xl relative z-0">
                <MapComponent items={displayedItemsWithArtists} userLocation={location} onViewportChange={setViewportBounds} />
              </div>
              <div className="max-h-[520px] overflow-y-auto pr-1">
                <div className="grid grid-cols-1 gap-4">
                  {displayedItemsWithArtists.length === 0 ? (
                    <div className="text-center py-16 border-2 border-dashed border-white/10 rounded-[28px]">
                      <Filter className="mx-auto opacity-20 mb-4" size={48} />
                      <p className="opacity-40 text-base font-serif">{t(interfaceLanguage, 'no_items')}</p>
                    </div>
                  ) : (
                    displayedItemsWithArtists.map((item) => (
                      <ResultCard
                        key={item.id}
                        item={item}
                        onToggle={() => toggleMyList(item)}
                        isSaved={isInList(item.id)}
                        onViewDetails={() => setSelectedItem(item)}
                        attendanceCounts={attendance[item.id] || { interested: 0, going: 0 }}
                        onInterested={() => incrementAttendance(item.id, 'interested')}
                        onGoing={() => incrementAttendance(item.id, 'going')}
                      />
                    ))
                  )}
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div 
              key="grid"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
            >
              {displayedItemsWithArtists.length === 0 ? (
                <div className="col-span-full text-center py-32 border-2 border-dashed border-white/10 rounded-[40px]">
                  <Filter className="mx-auto opacity-20 mb-4" size={64} />
                  <p className="opacity-40 text-lg font-serif">{t(interfaceLanguage, 'no_items')}</p>
                </div>
              ) : (
                displayedItemsWithArtists.map((item) => (
                  <ResultCard 
                    key={item.id} 
                    item={item} 
                    onToggle={() => toggleMyList(item)}
                    isSaved={isInList(item.id)}
                    onViewDetails={() => setSelectedItem(item)}
                    attendanceCounts={attendance[item.id] || { interested: 0, going: 0 }}
                    onInterested={() => incrementAttendance(item.id, 'interested')}
                    onGoing={() => incrementAttendance(item.id, 'going')}
                  />
                ))
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <AnimatePresence>
        {selectedItem && (
          <DetailsModal item={selectedItem} onClose={() => setSelectedItem(null)} />
        )}
        {showSettings && (
          <SettingsModal 
            appearance={appearance}
            setAppearance={setAppearance}
            interfaceLanguage={interfaceLanguage}
            setInterfaceLanguage={setInterfaceLanguage}
            accentPreset={accentPreset}
            setAccentPreset={setAccentPreset}
            accentCustomHex={accentCustomHex}
            setAccentCustomHex={setAccentCustomHex}
            highContrast={highContrast}
            setHighContrast={setHighContrast}
            largeTextMode={largeTextMode}
            setLargeTextMode={setLargeTextMode}
            reducedMotion={reducedMotion}
            setReducedMotion={setReducedMotion}
            screenReaderLabels={screenReaderLabels}
            setScreenReaderLabels={setScreenReaderLabels}
            onClose={() => setShowSettings(false)} 
          />
        )}
      </AnimatePresence>

      <div className="fixed bottom-5 right-5 z-[130]">
        {assistantOpen && (
          <div className="mb-3 w-[340px] max-w-[90vw] h-[420px] bg-[var(--card-bg)] border border-[var(--border-color)] rounded-2xl shadow-2xl flex flex-col overflow-hidden">
            <div className="px-4 py-3 border-b border-[var(--border-color)] flex items-center justify-between">
              <p className="font-semibold">AI Assistant</p>
              <button onClick={() => setAssistantOpen(false)} className="opacity-60 hover:opacity-100"><X size={16} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {assistantMessages.length === 0 ? (
                <p className="text-sm opacity-60">Ask: "Find Farsi-speaking lawyers" or "Find volunteer events this week".</p>
              ) : (
                assistantMessages.map((m, idx) => (
                  <div key={idx} className={cn("p-2 rounded-lg text-sm", m.role === 'user' ? "bg-white/10 ml-6" : "bg-[#5A5A40]/20 mr-6")}>
                    <p>{m.text}</p>
                    {m.suggestions?.length ? (
                      <ul className="mt-2 text-xs opacity-80 list-disc list-inside">
                        {m.suggestions.slice(0, 3).map((s: any, i: number) => <li key={i}>{s.title}</li>)}
                      </ul>
                    ) : null}
                  </div>
                ))
              )}
            </div>
            <div className="p-3 border-t border-[var(--border-color)] flex gap-2">
              <input
                value={assistantDraft}
                onChange={(e) => setAssistantDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') sendAssistantQuery(); }}
                className="flex-1 px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-sm"
                placeholder="Ask for events, resources, language help..."
              />
              <button onClick={sendAssistantQuery} className="px-3 py-2 rounded-xl bg-[#5A5A40] text-white text-sm">Send</button>
            </div>
          </div>
        )}
        <button
          onClick={() => setAssistantOpen((v) => !v)}
          className="w-14 h-14 rounded-full bg-[#5A5A40] text-white shadow-2xl flex items-center justify-center"
          aria-label="Open AI assistant"
          title="AI Assistant"
        >
          <Bot size={22} />
        </button>
      </div>

      <footer className="py-12 text-center opacity-30 text-xs border-t border-white/5 mt-20">
        <p>&copy; {new Date().getFullYear()} Gratitude. Rooted in Accessibility & Community.</p>
      </footer>
    </div>
    </div>
  );
}

function ConnectionsPanel({
  connections,
  loading,
  error,
  notes,
  page,
  pageSize,
  total,
  radiusMiles,
  setRadiusMiles,
  audience,
  setAudience,
  fieldOfStudy,
  setFieldOfStudy,
  academicLevel,
  setAcademicLevel,
  industry,
  setIndustry,
  experienceLevel,
  setExperienceLevel,
  skills,
  setSkills,
  interests,
  setInterests,
  sortBy,
  setSortBy,
  onPageChange,
  selectedConnection,
  onSelectConnection,
  messages,
  messagesLoading,
  messageDraft,
  setMessageDraft,
  onSendMessage,
  communityPosts,
  groups,
  onToggleGroupMembership,
}: {
  connections: ConnectionProfile[];
  loading: boolean;
  error: string | null;
  notes: string[];
  page: number;
  pageSize: number;
  total: number;
  radiusMiles: number;
  setRadiusMiles: (value: number) => void;
  audience: 'all' | 'student' | 'professional' | 'general';
  setAudience: (value: 'all' | 'student' | 'professional' | 'general') => void;
  fieldOfStudy: string;
  setFieldOfStudy: (value: string) => void;
  academicLevel: string;
  setAcademicLevel: (value: string) => void;
  industry: string;
  setIndustry: (value: string) => void;
  experienceLevel: string;
  setExperienceLevel: (value: string) => void;
  skills: string;
  setSkills: (value: string) => void;
  interests: string;
  setInterests: (value: string) => void;
  sortBy: 'nearest' | 'most_active' | 'newest_members' | 'shared_interests';
  setSortBy: (value: 'nearest' | 'most_active' | 'newest_members' | 'shared_interests') => void;
  onPageChange: (value: number) => void;
  selectedConnection: ConnectionProfile | null;
  onSelectConnection: (connection: ConnectionProfile) => void;
  messages: DirectMessage[];
  messagesLoading: boolean;
  messageDraft: string;
  setMessageDraft: (value: string) => void;
  onSendMessage: () => void;
  communityPosts: Array<{ id: string; title: string; body: string; category: 'General' | 'Help Needed' | 'Local News' | 'Events' | 'Free Items'; neighborhood?: string }>;
  groups: Array<{ group_id: string; name: string; description: string; member_count: number; location: string; joined?: boolean }>;
  onToggleGroupMembership: (groupId: string) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-6">
      <div className="bg-white/5 p-5 rounded-3xl border border-white/10">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <select value={radiusMiles} onChange={(e) => setRadiusMiles(Number(e.target.value))} className="px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-sm">
            {[5, 10, 25, 50].map((r) => <option key={r} value={r}>{r} miles</option>)}
          </select>
          <select value={audience} onChange={(e) => setAudience(e.target.value as 'all' | 'student' | 'professional' | 'general')} className="px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-sm">
            <option value="all">All Audiences</option>
            <option value="student">Students</option>
            <option value="professional">Professionals</option>
            <option value="general">General</option>
          </select>
          <input value={fieldOfStudy} onChange={(e) => setFieldOfStudy(e.target.value)} placeholder="Field of study" className="px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-sm" />
          <input value={industry} onChange={(e) => setIndustry(e.target.value)} placeholder="Industry" className="px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-sm" />
          <input value={skills} onChange={(e) => setSkills(e.target.value)} placeholder="Skills" className="px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-sm" />
          <input value={interests} onChange={(e) => setInterests(e.target.value)} placeholder="Interests" className="px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-sm" />
          <select value={academicLevel} onChange={(e) => setAcademicLevel(e.target.value)} className="px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-sm">
            <option value="">Academic level</option>
            <option value="undergrad">Undergrad</option>
            <option value="grad">Grad</option>
          </select>
          <select value={experienceLevel} onChange={(e) => setExperienceLevel(e.target.value)} className="px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-sm">
            <option value="">Experience level</option>
            <option value="entry">Entry</option>
            <option value="mid">Mid</option>
            <option value="senior">Senior</option>
          </select>
        </div>
        <div className="mt-3">
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value as 'nearest' | 'most_active' | 'newest_members' | 'shared_interests')} className="px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-sm">
            <option value="nearest">Nearest</option>
            <option value="most_active">Most Active</option>
            <option value="newest_members">Newest Members</option>
            <option value="shared_interests">Shared Interests</option>
          </select>
        </div>
      </div>

      {error && <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-300 text-sm">{error}</div>}
      {notes.length > 0 && (
        <div className="p-4 rounded-2xl bg-white/5 border border-white/10 text-sm opacity-80">
          {notes.join(" ")}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
          {loading ? (
            <div className="col-span-full text-center py-16 opacity-60">Loading nearby connections...</div>
          ) : connections.length === 0 ? (
            <div className="col-span-full text-center py-16 opacity-60">No matching users. Try widening your radius or removing filters.</div>
          ) : (
            connections.map((connection) => (
              <button
                key={connection.user_id}
                onClick={() => onSelectConnection(connection)}
                className={cn(
                  "text-left p-5 rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 transition-all",
                  selectedConnection?.user_id === connection.user_id && "ring-2 ring-[#5A5A40]"
                )}
              >
                <div className="flex justify-between items-start gap-3">
                  <div>
                    <h3 className="font-serif text-xl">{connection.display_name}</h3>
                    <p className="text-xs opacity-60 capitalize">{connection.audience_type}</p>
                  </div>
                  <span className="text-xs opacity-70">
                    {connection.distance_miles != null ? `${connection.distance_miles} mi` : 'Distance hidden'}
                  </span>
                </div>
                <p className="text-sm mt-3 opacity-80 line-clamp-2">{connection.profile_summary}</p>
                <p className="text-xs mt-3 opacity-60">Shared: {connection.shared_interests.join(', ') || 'None yet'}</p>
              </button>
            ))
          )}
        </div>

        <div className="bg-white/5 border border-white/10 rounded-2xl p-4 h-[560px] flex flex-col">
          {!selectedConnection ? (
            <div className="m-auto text-center opacity-60">Select a connection to view or send messages.</div>
          ) : (
            <>
              <div className="pb-3 border-b border-white/10">
                <h3 className="font-serif text-xl">{selectedConnection.display_name}</h3>
                <p className="text-xs opacity-60">Direct messages</p>
              </div>
              <div className="flex-1 overflow-y-auto py-3 space-y-2">
                {messagesLoading ? (
                  <div className="opacity-60 text-sm">Loading messages...</div>
                ) : messages.length === 0 ? (
                  <div className="opacity-60 text-sm">No messages yet. Say hello.</div>
                ) : (
                  messages.map((message) => (
                    <div key={message.message_id} className={cn(
                      "p-2 rounded-lg text-sm",
                      message.sender_id === CURRENT_USER_ID ? "bg-[#5A5A40]/20 ml-6" : "bg-white/10 mr-6"
                    )}>
                      <p>{message.message_text}</p>
                      <p className="text-[10px] opacity-60 mt-1">{new Date(message.timestamp).toLocaleString()}</p>
                    </div>
                  ))
                )}
              </div>
              <div className="pt-3 border-t border-white/10 flex gap-2">
                <input
                  value={messageDraft}
                  onChange={(e) => setMessageDraft(e.target.value)}
                  placeholder="Type a message"
                  className="flex-1 px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-sm"
                />
                <button onClick={onSendMessage} className="px-4 py-2 rounded-xl bg-[#5A5A40] text-white text-sm">
                  Send
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs opacity-60">Showing page {page} of {totalPages} ({total} users)</p>
        <div className="flex gap-2">
          <button onClick={() => onPageChange(Math.max(1, page - 1))} disabled={page <= 1} className="px-3 py-1 rounded-lg bg-white/5 disabled:opacity-30">
            Prev
          </button>
          <button onClick={() => onPageChange(Math.min(totalPages, page + 1))} disabled={page >= totalPages} className="px-3 py-1 rounded-lg bg-white/5 disabled:opacity-30">
            Next
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
          <h3 className="font-serif text-2xl mb-3">Community Posts</h3>
          <div className="space-y-3">
            {communityPosts.map((post) => (
              <div key={post.id} className="p-3 rounded-xl bg-white/5 border border-white/10">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold">{post.title}</p>
                  <span className="text-[10px] uppercase px-2 py-1 rounded-full bg-white/10">{post.category}</span>
                </div>
                <p className="text-sm opacity-80 mt-2">{post.body}</p>
                {post.neighborhood && <p className="text-xs opacity-60 mt-2">{post.neighborhood}</p>}
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
          <h3 className="font-serif text-2xl mb-3">Community Groups</h3>
          <div className="space-y-3">
            {groups.map((group) => (
              <div key={group.group_id} className="p-3 rounded-xl bg-white/5 border border-white/10 flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{group.name}</p>
                  <p className="text-sm opacity-80">{group.description}</p>
                  <p className="text-xs opacity-60 mt-1">{group.location} • {group.member_count} members</p>
                </div>
                <button onClick={() => onToggleGroupMembership(group.group_id)} className="px-3 py-1.5 rounded-lg bg-[#5A5A40] text-white text-xs">
                  {group.joined ? 'Leave' : 'Join'}
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function SidebarItem({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: ReactNode, label: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm text-left transition-all border",
        active
          ? "bg-[#5A5A40] text-white border-[#5A5A40]"
          : "bg-transparent border-transparent hover:bg-white/5 opacity-80 hover:opacity-100"
      )}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function SettingsModal({ 
  appearance, setAppearance, interfaceLanguage, setInterfaceLanguage, accentPreset, setAccentPreset, accentCustomHex, setAccentCustomHex,
  highContrast, setHighContrast, largeTextMode, setLargeTextMode, reducedMotion, setReducedMotion,
  screenReaderLabels, setScreenReaderLabels,
  onClose 
}: { 
  appearance: Appearance,
  setAppearance: (t: Appearance) => void,
  interfaceLanguage: string,
  setInterfaceLanguage: (v: string) => void,
  accentPreset: AccentPreset,
  setAccentPreset: (p: AccentPreset) => void,
  accentCustomHex: string,
  setAccentCustomHex: (c: string) => void,
  highContrast: boolean,
  setHighContrast: (v: boolean) => void,
  largeTextMode: boolean,
  setLargeTextMode: (v: boolean) => void,
  reducedMotion: boolean,
  setReducedMotion: (v: boolean) => void,
  screenReaderLabels: boolean,
  setScreenReaderLabels: (v: boolean) => void,
  onClose: () => void 
}) {
  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div 
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, y: 20 }}
        className="bg-[var(--card-bg)] w-full max-w-md rounded-[40px] overflow-hidden shadow-2xl border border-[var(--border-color)]"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-8 max-h-[90vh] overflow-y-auto">
          <div className="flex justify-between items-center mb-8">
            <h2 className="text-2xl font-serif font-medium">Accessibility Settings</h2>
            <button onClick={onClose} className="p-2 opacity-40 hover:opacity-100"><X size={20} /></button>
          </div>

          <div className="space-y-8">
            <div>
              <label className="text-[10px] uppercase tracking-widest font-bold opacity-30 mb-4 block">Appearance</label>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setAppearance('system')} className={cn("p-4 rounded-2xl border border-white/10 flex items-center gap-3", appearance === 'system' && "bg-white/10 border-[#5A5A40]")}>
                  <Settings size={18} /> System
                </button>
                <button onClick={() => setAppearance('light')} className={cn("p-4 rounded-2xl border border-white/10 flex items-center gap-3", appearance === 'light' && "bg-white/10 border-[#5A5A40]")}>
                  <Sun size={18} /> Light
                </button>
                <button onClick={() => setAppearance('dark')} className={cn("p-4 rounded-2xl border border-white/10 flex items-center gap-3", appearance === 'dark' && "bg-white/10 border-[#5A5A40]")}>
                  <Moon size={18} /> Dark
                </button>
              </div>
            </div>

            <div>
              <label className="text-[10px] uppercase tracking-widest font-bold opacity-30 mb-4 block">Accessibility Toggles</label>
              <div className="space-y-3">
                <AccessibilityToggle active={highContrast} onClick={() => setHighContrast(!highContrast)} label="High Contrast Mode" />
                <AccessibilityToggle active={largeTextMode} onClick={() => setLargeTextMode(!largeTextMode)} label="Large Text Mode" />
                <AccessibilityToggle active={reducedMotion} onClick={() => setReducedMotion(!reducedMotion)} label="Reduced Motion" />
                <AccessibilityToggle active={screenReaderLabels} onClick={() => setScreenReaderLabels(!screenReaderLabels)} label="Screen Reader Labels" />
              </div>
            </div>

            <div>
              <label className="text-[10px] uppercase tracking-widest font-bold opacity-30 mb-4 block">App Language</label>
              <div className="grid grid-cols-2 gap-2">
                {["English", "Spanish", "Farsi", "Arabic", "French", "Chinese"].map((lang) => (
                  <button
                    key={lang}
                    onClick={() => setInterfaceLanguage(lang)}
                    className={cn("p-3 rounded-2xl border border-white/10 text-sm", interfaceLanguage === lang && "bg-white/10 border-[#5A5A40]")}
                  >
                    {lang}
                  </button>
                ))}
              </div>
              <input
                value={interfaceLanguage}
                onChange={(e) => setInterfaceLanguage(e.target.value || "English")}
                placeholder="Custom language"
                className="mt-2 w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-sm"
              />
            </div>

            <div>
              <label className="text-[10px] uppercase tracking-widest font-bold opacity-30 mb-4 block">Accent Preset</label>
              <div className="flex items-center flex-wrap gap-2">
                <button
                  onClick={() => setAccentPreset('failover')}
                  className={cn("px-4 py-2 rounded-xl text-xs font-medium transition-all", accentPreset === 'failover' ? "bg-[#5A5A40] text-white" : "bg-white/5 opacity-60")}
                >
                  Failover
                </button>
                <button
                  onClick={() => setAccentPreset('carolina_blue')}
                  className={cn("px-4 py-2 rounded-xl text-xs font-medium transition-all", accentPreset === 'carolina_blue' ? "bg-[#5A5A40] text-white" : "bg-white/5 opacity-60")}
                >
                  Carolina Blue
                </button>
                <button
                  onClick={() => setAccentPreset('custom')}
                  className={cn("px-4 py-2 rounded-xl text-xs font-medium transition-all", accentPreset === 'custom' ? "bg-[#5A5A40] text-white" : "bg-white/5 opacity-60")}
                >
                  Custom
                </button>
                <input 
                  type="color" 
                  value={accentCustomHex}
                  onChange={(e) => {
                    setAccentCustomHex(e.target.value);
                    setAccentPreset('custom');
                  }}
                  className="w-10 h-10 rounded-full bg-transparent border-none cursor-pointer"
                />
              </div>
              <p className="text-xs opacity-50 mt-2">Custom color is only applied when preset is Custom.</p>
            </div>
          </div>

          <button 
            onClick={onClose}
            className="w-full mt-10 py-4 bg-[#5A5A40] text-white rounded-2xl font-medium shadow-lg shadow-[#5A5A40]/20"
          >
            Save & Close
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function AccessibilityToggle({ active, onClick, label }: { active: boolean, onClick: () => void, label: string }) {
  return (
    <button 
      onClick={onClick}
      aria-label={label}
      className={cn(
        "w-full p-4 rounded-2xl border border-white/10 flex items-center justify-between transition-all",
        active ? "bg-white/10 border-[#5A5A40]" : "opacity-60 hover:opacity-100"
      )}
    >
      <span className="text-sm font-medium">{label}</span>
      <div className={cn("w-10 h-5 rounded-full relative transition-all", active ? "bg-[#5A5A40]" : "bg-white/20")}>
        <div className={cn("absolute top-1 w-3 h-3 rounded-full bg-white transition-all", active ? "right-1" : "left-1")} />
      </div>
    </button>
  );
}

function FilterButton({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium transition-all",
        active 
          ? "bg-white/10 text-white shadow-sm" 
          : "opacity-40 hover:opacity-100"
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function ThemeToggle({ current, onSelect }: { current: Appearance, onSelect: (t: Appearance) => void }) {
  return (
    <div className="flex flex-wrap gap-1">
      <ThemeIcon active={current === 'system'} onClick={() => onSelect('system')} icon={<Settings size={18} />} label="System theme" />
      <ThemeIcon active={current === 'light'} onClick={() => onSelect('light')} icon={<Sun size={18} />} label="Light theme" />
      <ThemeIcon active={current === 'dark'} onClick={() => onSelect('dark')} icon={<Moon size={18} />} label="Dark theme" />
    </div>
  );
}

function ThemeIcon({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <button 
      onClick={onClick}
      aria-label={label}
      className={cn(
        "p-2 rounded-xl transition-all",
        active ? "bg-[#5A5A40] text-white" : "opacity-40 hover:opacity-100"
      )}
    >
      {icon}
    </button>
  );
}

function ResultCard({
  item,
  onToggle,
  isSaved,
  onViewDetails,
  attendanceCounts,
  onInterested,
  onGoing,
}: {
  item: CommunityItem,
  onToggle: () => void,
  isSaved: boolean,
  onViewDetails: () => void,
  attendanceCounts: { interested: number; going: number },
  onInterested: () => void,
  onGoing: () => void
}) {
  const uiLanguage = safeGetLocalStorage('gratitude_interface_language') || 'English';
  const title = item.title || item.name;
  const location = item.location_name || item.address || 'Not listed';
  const date = formatEventDate(item.date_start, item.date_unknown);
  const distanceMiles = typeof item.distance_miles === 'number' ? item.distance_miles : Number(item.distance_miles);
  const hasDistance = Number.isFinite(distanceMiles);
  const start = parseDateSafe(item.date_start);
  const isSoon = !!start && start.getTime() >= Date.now() && start.getTime() <= Date.now() + 72 * 60 * 60 * 1000;

  return (
    <motion.div 
      layout
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="bg-[var(--card-bg)] p-8 rounded-[32px] border border-[var(--border-color)] shadow-sm hover:shadow-2xl transition-all duration-500 group flex flex-col"
    >
      <div className="flex justify-between items-start mb-6">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            <span className={cn(
              "text-[10px] uppercase tracking-widest font-bold px-3 py-1 rounded-full",
              item.type === 'event' ? "bg-blue-500/10 text-blue-500" : 
              item.type === 'volunteer' ? "bg-emerald-500/10 text-emerald-500" : 
              item.type === 'foodbank' ? "bg-orange-500/10 text-orange-500" :
              "bg-purple-500/10 text-purple-500"
            )}>
              {item.type.replace('_', ' ')}
            </span>
            <span className="text-[10px] uppercase tracking-widest font-bold px-3 py-1 rounded-full bg-white/5 opacity-50">
              {item.audience}
            </span>
            {item.category && (
              <span className="text-[10px] uppercase tracking-widest font-bold px-3 py-1 rounded-full bg-white/5 opacity-50">
                {item.category.replace('_', ' ')}
              </span>
            )}
            {item.needs_review && (
              <span className="text-[10px] uppercase tracking-widest font-bold px-3 py-1 rounded-full bg-yellow-500/10 text-yellow-500">
                Needs Review
              </span>
            )}
            {isSoon && (
              <span className="text-[10px] uppercase tracking-widest font-bold px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400">
                Soon
              </span>
            )}
          </div>
          <h3 className="text-2xl font-serif font-medium leading-tight">{title}</h3>
        </div>
        <button 
          onClick={onToggle}
          className={cn(
            "p-3 rounded-2xl transition-all duration-300",
            isSaved ? "bg-[#5A5A40] text-white" : "bg-white/5 opacity-30 hover:opacity-100 hover:bg-white/10"
          )}
        >
          {isSaved ? <BookmarkCheck size={20} /> : <Bookmark size={20} />}
        </button>
      </div>
      
      <p className="opacity-70 text-sm mb-6 leading-relaxed line-clamp-2 flex-1">{item.description}</p>
      {(item.cultural_groups?.length || item.supported_languages?.length) && (
        <div className="mb-4 text-[11px] opacity-70 space-y-1">
          {item.cultural_groups?.length ? <p>Cultural groups: {item.cultural_groups.join(', ')}</p> : null}
          {item.supported_languages?.length ? <p>Languages: {item.supported_languages.join(', ')}</p> : null}
          {item.translation_services ? <p>Translation: {item.translation_languages?.join(', ') || 'Available'}</p> : null}
        </div>
      )}
      
      <div className="space-y-3 mb-8">
        <div className="flex items-center gap-3 text-xs opacity-50">
          <Calendar size={14} />
          {date}
        </div>
        {location && (
          <div className="flex items-center gap-3 text-xs opacity-50">
            <MapPin size={14} />
            <span className="truncate">{location}</span>
          </div>
        )}
        {item.phone && (
          <div className="flex items-center gap-3 text-xs opacity-50">
            <ExternalLink size={14} />
            {item.phone}
          </div>
        )}
        {hasDistance && (
          <div className="flex items-center gap-3 text-xs text-[#5A5A40] font-bold">
            <Navigation size={14} />
            {distanceMiles.toFixed(1)} {t(uiLanguage, 'miles_away')}
          </div>
        )}
        {!hasDistance && (
          <div className="flex items-center gap-3 text-xs opacity-60">
            <Navigation size={14} />
            {t(uiLanguage, 'distance_unavailable')}
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <button 
          onClick={onViewDetails}
          className="flex-1 flex items-center justify-center gap-2 py-3 bg-[#5A5A40]/10 hover:bg-[#5A5A40]/20 rounded-2xl text-sm font-medium transition-all text-[#5A5A40]"
        >
          <Info size={14} />
          {t(uiLanguage, 'details')}
        </button>
        {item.source_url && (
          <a 
            href={item.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="p-3 bg-white/5 hover:bg-white/10 rounded-2xl opacity-50 hover:opacity-100 transition-all"
          >
            <ExternalLink size={16} />
          </a>
        )}
      </div>
      {item.type === 'event' && (
        <div className="mt-3 flex items-center gap-2 text-xs">
          <button onClick={onInterested} className="px-2 py-1 rounded-lg bg-white/5 border border-white/10">Interested ({attendanceCounts.interested})</button>
          <button onClick={onGoing} className="px-2 py-1 rounded-lg bg-white/5 border border-white/10">Going ({attendanceCounts.going})</button>
        </div>
      )}
      <div className="mt-2 flex items-center gap-2 text-[10px] opacity-70">
        {item.neighborhood && <span>{item.neighborhood}</span>}
        {item.verified_source && <span className="px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-400">Verified source</span>}
        {!!item.recommended_by_users && <span>{item.recommended_by_users} user recommendations</span>}
      </div>
    </motion.div>
  );
}

function DetailsModal({ item, onClose }: { item: CommunityItem, onClose: () => void }) {
  const uiLanguage = safeGetLocalStorage('gratitude_interface_language') || 'English';
  const title = item.title || item.name;
  const location = item.location_name || item.address || 'Not listed';
  const date = formatEventDate(item.date_start, item.date_unknown);
  const distanceMiles = typeof item.distance_miles === 'number' ? item.distance_miles : Number(item.distance_miles);
  const hasDistance = Number.isFinite(distanceMiles);

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div 
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, y: 20 }}
        className="bg-[var(--card-bg)] w-full max-w-2xl rounded-[40px] overflow-hidden shadow-2xl border border-[var(--border-color)]"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-8 md:p-12 max-h-[90vh] overflow-y-auto">
          <div className="flex justify-between items-start mb-8">
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap gap-2">
                <span className={cn(
                  "text-[10px] uppercase tracking-widest font-bold px-4 py-1.5 rounded-full",
                  item.type === 'event' ? "bg-blue-500/10 text-blue-500" : 
                  item.type === 'volunteer' ? "bg-emerald-500/10 text-emerald-500" : 
                  "bg-orange-500/10 text-orange-500"
                )}>
                  {item.type.replace('_', ' ')}
                </span>
                <span className="text-[10px] uppercase tracking-widest font-bold px-4 py-1.5 rounded-full bg-white/5 opacity-50">
                  {item.audience}
                </span>
              </div>
              <h2 className="text-4xl font-serif font-medium leading-tight">{title}</h2>
            </div>
            <button 
              onClick={onClose}
              className="p-3 rounded-2xl bg-white/5 hover:bg-white/10 transition-all opacity-40 hover:opacity-100"
            >
              <X size={24} />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10">
            <div className="space-y-6">
              <div className="flex items-start gap-4">
                <div className="p-3 bg-white/5 rounded-2xl opacity-40">
                  <Calendar size={20} />
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-widest font-bold opacity-30 mb-1">Date & Time</p>
                  <p className="text-lg opacity-80">{date}</p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="p-3 bg-white/5 rounded-2xl opacity-40">
                  <MapPin size={20} />
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-widest font-bold opacity-30 mb-1">Location</p>
                  <p className="text-lg opacity-80">{location}</p>
                </div>
              </div>
            </div>
            <div className="space-y-6">
              <div className="flex items-start gap-4">
                <div className="p-3 bg-white/5 rounded-2xl opacity-40">
                  <Navigation size={20} />
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-widest font-bold opacity-30 mb-1">Distance</p>
                  <p className="text-lg opacity-80">{hasDistance ? `${distanceMiles.toFixed(1)} ${t(uiLanguage, 'miles_away')}` : t(uiLanguage, 'distance_unavailable')}</p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="p-3 bg-white/5 rounded-2xl opacity-40">
                  <Heart size={20} />
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-widest font-bold opacity-30 mb-1">Audience</p>
                  <p className="text-lg opacity-80 capitalize">{item.audience}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="mb-10">
            <p className="text-[10px] uppercase tracking-widest font-bold opacity-30 mb-4">Description</p>
            <div className="prose prose-stone dark:prose-invert max-w-none opacity-80 leading-relaxed">
              <ReactMarkdown>{item.description}</ReactMarkdown>
            </div>
          </div>

          <div className="mb-10">
            <p className="text-[10px] uppercase tracking-widest font-bold opacity-30 mb-3">Source</p>
            <div className="space-y-2 text-sm opacity-80">
              <p>{item.source_name || 'Not listed'}</p>
              {item.source_url ? (
                <a className="text-[#5A5A40] underline break-all" href={item.source_url} target="_blank" rel="noopener noreferrer">
                  {item.source_url}
                </a>
              ) : (
                <p>Not listed</p>
              )}
              <p className="text-xs opacity-60">
                Retrieved: {item.retrieved_at ? new Date(item.retrieved_at).toLocaleString() : 'Not listed'}
              </p>
            </div>
          </div>

          {item.services && (
            <div className="mb-10">
              <p className="text-[10px] uppercase tracking-widest font-bold opacity-30 mb-4">Services</p>
              <div className="flex flex-wrap gap-2">
                {item.services.map((s, i) => (
                  <span key={i} className="px-3 py-1 bg-white/5 rounded-lg text-sm opacity-70 border border-white/10">{s}</span>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-4">
            {item.latitude != null && item.longitude != null && (
              <a 
                href={`https://www.google.com/maps/search/?api=1&query=${item.latitude},${item.longitude}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 flex items-center justify-center gap-3 py-4 bg-[#5A5A40] text-white rounded-3xl text-lg font-medium transition-all shadow-xl shadow-[#5A5A40]/20 hover:scale-[1.02]"
              >
                <Navigation size={20} />
                Get Directions
              </a>
            )}
            {item.phone && (
              <a 
                href={`tel:${item.phone}`}
                className="flex-1 flex items-center justify-center gap-3 py-4 bg-white/10 text-white rounded-3xl text-lg font-medium transition-all border border-white/20 hover:bg-white/20"
              >
                <ExternalLink size={20} />
                Call Now
              </a>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

function MapComponent({
  items,
  userLocation,
  onViewportChange,
}: {
  items: CommunityItem[],
  userLocation: Location | null,
  onViewportChange?: (bounds: { north: number; south: number; east: number; west: number }) => void
}) {
  const uiLanguage = safeGetLocalStorage('gratitude_interface_language') || 'English';
  const firstMappable = items.find((item) => (item.latitude ?? item.lat) != null && (item.longitude ?? item.lon) != null);
  const center: [number, number] = userLocation
    ? [userLocation.latitude, userLocation.longitude]
    : firstMappable
      ? [Number(firstMappable.latitude ?? firstMappable.lat), Number(firstMappable.longitude ?? firstMappable.lon)]
      : [35.9132, -79.0558];
  
  return (
    <MapContainer center={center} zoom={13} style={{ height: '100%', width: '100%' }}>
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      />
      {userLocation && (
        <Marker position={[userLocation.latitude, userLocation.longitude]} icon={UserLocationIcon}>
          <Popup>You are here</Popup>
        </Marker>
      )}
      {items.map((item) => {
        const normalized = normalizeCoordinates(
          item.latitude != null ? Number(item.latitude) : (item.lat != null ? Number(item.lat) : null),
          item.longitude != null ? Number(item.longitude) : (item.lon != null ? Number(item.lon) : null)
        );
        const lat = normalized?.lat;
        const lon = normalized?.lon;
        const distanceMiles = typeof item.distance_miles === 'number' ? item.distance_miles : Number(item.distance_miles);
        const hasDistance = Number.isFinite(distanceMiles);
        if (lat == null || lon == null) return null;

        return (
          <Marker key={item.id} position={[lat, lon]}>
            <Popup>
              <div className="p-4 min-w-[240px]">
                <div className="flex justify-between items-start mb-2">
                  <span className={cn(
                    "text-[8px] uppercase font-bold px-2 py-0.5 rounded-full",
                    item.type === 'event' ? "bg-blue-500/10 text-blue-500" : 
                    item.type === 'volunteer' ? "bg-emerald-500/10 text-emerald-500" : 
                    "bg-orange-500/10 text-orange-500"
                  )}>
                    {item.type.replace('_', ' ')}
                  </span>
                  {hasDistance && (
                    <span className="text-[8px] font-bold opacity-40">{distanceMiles.toFixed(1)} mi</span>
                  )}
                </div>
                <h4 className="font-serif font-bold text-xl mb-1 leading-tight">{item.title || item.name}</h4>
                <p className="text-xs opacity-60 mb-3 flex items-center gap-1">
                  <Calendar size={10} />
                  {formatEventDate(item.date_start, item.date_unknown)}
                </p>
                <p className="text-xs opacity-80 mb-4 line-clamp-2">{item.description}</p>
                <div className="flex justify-between items-center border-t pt-3">
                  <span className="text-[10px] uppercase font-bold opacity-50">{item.audience}</span>
                  <div className="flex items-center gap-2">
                    {item.source_url && (
                      <a href={item.source_url} target="_blank" rel="noopener noreferrer" className="text-[#5A5A40] text-[10px] font-bold">
                        {t(uiLanguage, 'details')}
                      </a>
                    )}
                    <a 
                      href={`https://www.google.com/maps/search/?api=1&query=${lat},${lon}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#5A5A40] text-[10px] font-bold flex items-center gap-1"
                    >
                      Directions <ExternalLink size={10} />
                    </a>
                  </div>
                </div>
              </div>
            </Popup>
          </Marker>
        );
      })}
      <MapUpdater center={center} />
      {onViewportChange && <MapViewportListener onViewportChange={onViewportChange} />}
    </MapContainer>
  );
}

function MapUpdater({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, map.getZoom());
  }, [center, map]);
  return null;
}

function MapViewportListener({ onViewportChange }: { onViewportChange: (bounds: { north: number; south: number; east: number; west: number }) => void }) {
  const map = useMap();
  useEffect(() => {
    const sync = () => {
      const b = map.getBounds();
      onViewportChange({
        north: b.getNorth(),
        south: b.getSouth(),
        east: b.getEast(),
        west: b.getWest(),
      });
    };
    sync();
    map.on('moveend', sync);
    map.on('zoomend', sync);
    return () => {
      map.off('moveend', sync);
      map.off('zoomend', sync);
    };
  }, [map, onViewportChange]);
  return null;
}
