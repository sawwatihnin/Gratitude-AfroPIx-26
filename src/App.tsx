import { useState, useEffect, useMemo } from 'react';
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
  ArrowUpDown,
  Search
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { fetchCommunityData, Location, calculateDistance } from './services/geminiService';
import { CommunityItem, ConnectionProfile, DirectMessage } from './types';

// Fix Leaflet icon issue
const DefaultIcon = L.icon({
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
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

type Tab = 'events' | 'volunteer' | 'foodbanks' | 'organizations' | 'connections' | 'mylist' | 'all';
type Appearance = 'system' | 'light' | 'dark';
type AccentPreset = 'failover' | 'carolina_blue' | 'custom';
type AudienceFilter = 'all' | 'student' | 'professional' | 'general' | 'families' | 'seniors';
type SortBy = 'date' | 'distance' | 'title';

const FAILOVER_ACCENT = '#5A5A40';
const CAROLINA_BLUE_ACCENT = '#4B9CD3';
const CURRENT_USER_ID = 'user_me';

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
  const [dyslexiaFont, setDyslexiaFont] = useState(() => safeGetLocalStorage('communitree_dyslexiafont') === 'true');
  const [systemPrefersDark, setSystemPrefersDark] = useState(() => getSystemPrefersDark());
  
  const [audienceFilter, setAudienceFilter] = useState<AudienceFilter>('all');
  const [sortBy, setSortBy] = useState<SortBy>('distance');
  const [searchQuery, setSearchQuery] = useState("");
  
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

  const [viewMode, setViewMode] = useState<'grid' | 'map'>('grid');
  const [showSettings, setShowSettings] = useState(false);
  
  const [location, setLocation] = useState<Location | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<CommunityItem[]>([]);
  const [summary, setSummary] = useState<string>("");
  const [selectedItem, setSelectedItem] = useState<CommunityItem | null>(null);
  const [myList, setMyList] = useState<CommunityItem[]>(() => {
    const saved = safeGetLocalStorage('communitree_list');
    if (!saved) return [];
    try {
      const parsed = JSON.parse(saved);
      return Array.isArray(parsed) ? parsed : [];
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
      reducedMotion && "reduced-motion",
      dyslexiaFont && "dyslexia-font"
    );
    document.documentElement.style.setProperty('--accent-color', appliedAccentColor);
    safeSetLocalStorage('communitree_appearance', appearance);
    safeSetLocalStorage('communitree_accent_preset', accentPreset);
    safeSetLocalStorage('communitree_accent_custom_hex', accentCustomHex);
    safeSetLocalStorage('communitree_highcontrast', highContrast.toString());
    safeSetLocalStorage('communitree_largetext', largeTextMode.toString());
    safeSetLocalStorage('communitree_reducedmotion', reducedMotion.toString());
    safeSetLocalStorage('communitree_screenreader_labels', screenReaderLabels.toString());
    safeSetLocalStorage('communitree_dyslexiafont', dyslexiaFont.toString());
  }, [appearance, accentPreset, accentCustomHex, resolvedAppearance, appliedAccentColor, highContrast, largeTextMode, reducedMotion, screenReaderLabels, dyslexiaFont]);

  useEffect(() => {
    safeSetLocalStorage('communitree_list', JSON.stringify(myList));
  }, [myList]);

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
          setError("Please enable location access to find nearby community resources.");
        }
      );
    }
  }, []);

  const CONNECTION_PAGE_SIZE = 8;

  const fetchConnections = async (page = connectionPage) => {
    if (!location) {
      setConnections([]);
      setConnectionTotal(0);
      setConnectionNotes(["Enable location access or provide your city/ZIP to discover nearby users."]);
      return;
    }

    setConnectionsLoading(true);
    setConnectionsError(null);
    try {
      const response = await fetch('/api/connections/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          current_user_id: CURRENT_USER_ID,
          location,
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
      setConnectionNotes(data.notes || []);
    } catch (err) {
      console.error('Connections search failed', err);
      setConnectionsError('Failed to load nearby users.');
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

  const handleSearch = async (tab: Tab, forceRefresh = false) => {
    setLoading(true);
    setError(null);

    if (!forceRefresh) {
      try {
        const cachedResponse = await fetch(`/api/items/${tab}`);
        const cachedData = await cachedResponse.json();
        if (cachedData.items && cachedData.items.length > 0) {
          setItems(cachedData.items);
          setSummary(cachedData.summary);
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
        query = "Find community events nearby. Categorize them as 'student', 'professional', or 'general'. For student events, identify field of study and academic level.";
        break;
      case 'volunteer':
        query = "Find volunteering opportunities nearby. Categorize them as 'student', 'professional', or 'general'.";
        break;
      case 'foodbanks':
        query = "Find food banks nearby. Categorize them as 'general'.";
        break;
      case 'organizations':
        query = "Find local organizations providing essential services like homeless shelters, legal aid, medical clinics, and food assistance.";
        break;
      default:
        setLoading(false);
        return;
    }

    try {
      const data = await fetchCommunityData(query, location || undefined);
      const mappedItems: CommunityItem[] = [
        ...data.items.map((item: any, index: number) => ({
          ...item,
          id: item.id || `result-${tab}-${index}-${(item.title || item.name || 'item').toLowerCase().replace(/\s+/g, '-')}`,
          description: item.description || "",
          latitude: item.lat || item.latitude,
          longitude: item.lon || item.longitude,
          coordinates: (item.lat != null && item.lon != null) ? [item.lat, item.lon] : 
                       (item.latitude != null && item.longitude != null) ? [item.latitude, item.longitude] : undefined
        })),
        ...data.organizations.map((org: any, index: number) => ({
          ...org,
          id: org.id || `org-${tab}-${index}-${(org.name || 'organization').toLowerCase().replace(/\s+/g, '-')}`,
          title: org.name,
          description: org.description || "",
          type: 'organization',
          audience: 'general',
          latitude: org.lat || org.latitude,
          longitude: org.lon || org.longitude,
          coordinates: (org.lat != null && org.lon != null) ? [org.lat, org.lon] : 
                       (org.latitude != null && org.longitude != null) ? [org.latitude, org.longitude] : undefined
        }))
      ];
      
      setItems(mappedItems);
      setSummary(data.summary);

      // Save to server-side cache
      await fetch('/api/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          items: data.items, 
          organizations: data.organizations, 
          summary: data.summary, 
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
    if (activeTab !== 'mylist' && activeTab !== 'connections') {
      handleSearch(activeTab);
    }
  }, [activeTab, location]);

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

  const filteredItems = useMemo(() => {
    const list = activeTab === 'mylist' ? myList : items;
    let filtered = [...list];

    // Search Query
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(item => 
        (item.title || item.name || "").toLowerCase().includes(q) || 
        (item.description || "").toLowerCase().includes(q)
      );
    }

    // Audience Filter
    if (audienceFilter !== 'all') {
      filtered = filtered.filter(item => item.audience === audienceFilter);
    }

    // Student Specific Filters
    if (audienceFilter === 'student') {
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
    if (audienceFilter === 'professional') {
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
      if (orgCategoryFilter !== 'all') {
        filtered = filtered.filter(item => item.category === orgCategoryFilter);
      }
    }
    
    // Add distance and Sort
    if (location) {
      filtered = filtered.map(item => {
        const lat = item.latitude || item.lat;
        const lon = item.longitude || item.lon;
        if (lat != null && lon != null) {
          const dist = calculateDistance(
            location.latitude, 
            location.longitude, 
            lat, 
            lon
          );
          return { ...item, distance_miles: dist };
        }
        return item;
      });
    }

    // Sorting
    filtered.sort((a, b) => {
      if (sortBy === 'distance') {
        return (a.distance_miles || 9999) - (b.distance_miles || 9999);
      } else if (sortBy === 'date') {
        const dateA = a.date_start ? new Date(a.date_start).getTime() : 0;
        const dateB = b.date_start ? new Date(b.date_start).getTime() : 0;
        return dateB - dateA;
      } else {
        return (a.title || a.name || "").localeCompare(b.title || b.name || "");
      }
    });

    return filtered;
  }, [items, myList, activeTab, audienceFilter, location, searchQuery, sortBy, fieldOfStudy, academicLevel, careerFocus, industry, seniorityLevel, networkingVsTraining, orgCategoryFilter]);

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

  return (
    <div className="min-h-screen flex flex-col max-w-6xl mx-auto px-4 py-8">
      <header className="mb-8 flex flex-col md:flex-row justify-between items-center gap-6">
        <div className="text-center md:text-left">
          <motion.h1 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="text-5xl font-serif font-light tracking-tight mb-1"
          >
            Gratitude
          </motion.h1>
          <p className="opacity-60 font-light italic">Rooted in your neighborhood.</p>
        </div>

        <div className="flex items-center gap-3 bg-white/10 backdrop-blur-md p-2 rounded-2xl border border-white/20 shadow-lg">
          <button 
            onClick={() => setShowSettings(true)}
            aria-label="Open settings"
            className="p-2 rounded-xl transition-all opacity-50 hover:opacity-100 hover:bg-white/10"
          >
            <Settings size={20} />
          </button>
          <div className="w-[1px] h-6 bg-white/20 mx-1" />
          <ThemeToggle current={appearance} onSelect={setAppearance} />
          <div className="w-[1px] h-6 bg-white/20 mx-1" />
          <div className="flex gap-1">
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
          </div>
        </div>
      </header>

      <nav className="flex flex-wrap justify-center gap-2 mb-8 bg-white/5 backdrop-blur-sm p-1.5 rounded-3xl border border-white/10 sticky top-4 z-50 shadow-xl">
        <TabButton 
          active={activeTab === 'all'} 
          onClick={() => setActiveTab('all')}
          icon={<LayoutGrid size={18} />}
          label="All"
        />
        <TabButton 
          active={activeTab === 'events'} 
          onClick={() => setActiveTab('events')}
          icon={<Calendar size={18} />}
          label="Events"
        />
        <TabButton 
          active={activeTab === 'volunteer'} 
          onClick={() => setActiveTab('volunteer')}
          icon={<Heart size={18} />}
          label="Volunteer"
        />
        <TabButton 
          active={activeTab === 'foodbanks'} 
          onClick={() => setActiveTab('foodbanks')}
          icon={<ShoppingBasket size={18} />}
          label="Food Banks"
        />
        <TabButton 
          active={activeTab === 'organizations'} 
          onClick={() => setActiveTab('organizations')}
          icon={<Building2 size={18} />}
          label="Organizations"
        />
        <TabButton 
          active={activeTab === 'connections'} 
          onClick={() => setActiveTab('connections')}
          icon={<MessageCircle size={18} />}
          label="Connections"
        />
        <TabButton 
          active={activeTab === 'mylist'} 
          onClick={() => setActiveTab('mylist')}
          icon={<Bookmark size={18} />}
          label="My List"
        />
      </nav>

      {activeTab !== 'connections' && (
      <div className="mb-8 flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2 bg-white/5 p-1 rounded-2xl border border-white/10">
            <FilterButton 
              active={audienceFilter === 'all'} 
              onClick={() => setAudienceFilter('all')}
              icon={<Users size={16} />}
              label="All"
            />
            <FilterButton 
              active={audienceFilter === 'student'} 
              onClick={() => setAudienceFilter('student')}
              icon={<GraduationCap size={16} />}
              label="Student"
            />
            <FilterButton 
              active={audienceFilter === 'professional'} 
              onClick={() => setAudienceFilter('professional')}
              icon={<Briefcase size={16} />}
              label="Professional"
            />
            <FilterButton 
              active={audienceFilter === 'families'} 
              onClick={() => setAudienceFilter('families')}
              icon={<Heart size={16} />}
              label="Families"
            />
          </div>

          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 opacity-30" size={16} />
              <input 
                type="text" 
                placeholder="Search resources..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 pr-4 py-2 bg-white/5 border border-white/10 rounded-xl text-sm focus:outline-none focus:border-[#5A5A40] transition-all w-64"
              />
            </div>
            <select 
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortBy)}
              className="px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-sm focus:outline-none focus:border-[#5A5A40] transition-all"
            >
              <option value="distance">Sort by Distance</option>
              <option value="date">Sort by Date</option>
              <option value="title">Sort by Name</option>
            </select>
          </div>
        </div>

        {/* Advanced Filters */}
        <AnimatePresence>
          {audienceFilter === 'student' && (
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

          {audienceFilter === 'professional' && (
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
                Refresh
              </button>
            )}
            {summary && activeTab !== 'mylist' && (
              <p className="text-sm opacity-60 italic max-w-md text-right hidden md:block">
                {summary}
              </p>
            )}
          </div>
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
              <MapComponent items={filteredItems} userLocation={location} />
            </motion.div>
          ) : (
            <motion.div 
              key="grid"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
            >
              {filteredItems.length === 0 ? (
                <div className="col-span-full text-center py-32 border-2 border-dashed border-white/10 rounded-[40px]">
                  <Filter className="mx-auto opacity-20 mb-4" size={64} />
                  <p className="opacity-40 text-lg font-serif">No items found matching your filters.</p>
                </div>
              ) : (
                filteredItems.map((item) => (
                  <ResultCard 
                    key={item.id} 
                    item={item} 
                    onToggle={() => toggleMyList(item)}
                    isSaved={isInList(item.id)}
                    onViewDetails={() => setSelectedItem(item)}
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
            dyslexiaFont={dyslexiaFont}
            setDyslexiaFont={setDyslexiaFont}
            onClose={() => setShowSettings(false)} 
          />
        )}
      </AnimatePresence>

      <footer className="py-12 text-center opacity-30 text-xs border-t border-white/5 mt-20">
        <p>&copy; {new Date().getFullYear()} Gratitude. Rooted in Accessibility & Community.</p>
      </footer>
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
    </div>
  );
}

function TagToggle({ active, onClick, label }: { active: boolean, onClick: () => void, label: string }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "px-4 py-2 rounded-xl text-xs font-medium transition-all",
        active 
          ? "bg-[#5A5A40] text-white" 
          : "bg-white/5 opacity-40 hover:opacity-100"
      )}
    >
      {label}
    </button>
  );
}

function SettingsModal({ 
  appearance, setAppearance, accentPreset, setAccentPreset, accentCustomHex, setAccentCustomHex,
  highContrast, setHighContrast, largeTextMode, setLargeTextMode, reducedMotion, setReducedMotion,
  screenReaderLabels, setScreenReaderLabels, dyslexiaFont, setDyslexiaFont,
  onClose 
}: { 
  appearance: Appearance,
  setAppearance: (t: Appearance) => void,
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
  dyslexiaFont: boolean,
  setDyslexiaFont: (v: boolean) => void,
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
                <AccessibilityToggle active={dyslexiaFont} onClick={() => setDyslexiaFont(!dyslexiaFont)} label="Dyslexia Friendly Font" />
              </div>
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

function TabButton({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 px-8 py-3 rounded-2xl text-sm font-medium transition-all duration-500",
        active 
          ? "bg-[#5A5A40] text-white shadow-xl shadow-[#5A5A40]/30 scale-105" 
          : "opacity-50 hover:opacity-100 hover:bg-white/5"
      )}
    >
      {icon}
      <span className={cn("hidden sm:inline")}>{label}</span>
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
    <div className="flex gap-1">
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

function ResultCard({ item, onToggle, isSaved, onViewDetails }: { item: CommunityItem, onToggle: () => void, isSaved: boolean, onViewDetails: () => void }) {
  const title = item.title || item.name;
  const location = item.location_name || item.address;
  const date = item.date_start ? new Date(item.date_start).toLocaleString() : (item.date_unknown ? 'Date unknown' : 'Ongoing');
  const distanceMiles = typeof item.distance_miles === 'number' ? item.distance_miles : Number(item.distance_miles);
  const hasDistance = Number.isFinite(distanceMiles);

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
            {distanceMiles.toFixed(1)} miles away
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <button 
          onClick={onViewDetails}
          className="flex-1 flex items-center justify-center gap-2 py-3 bg-[#5A5A40]/10 hover:bg-[#5A5A40]/20 rounded-2xl text-sm font-medium transition-all text-[#5A5A40]"
        >
          <Info size={14} />
          Details
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
    </motion.div>
  );
}

function DetailsModal({ item, onClose }: { item: CommunityItem, onClose: () => void }) {
  const title = item.title || item.name;
  const location = item.location_name || item.address;
  const date = item.date_start ? new Date(item.date_start).toLocaleString() : (item.date_unknown ? 'Date unknown' : 'Ongoing');
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
                  <p className="text-lg opacity-80">{hasDistance ? `${distanceMiles.toFixed(1)} miles away` : 'Unknown'}</p>
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

function MapComponent({ items, userLocation }: { items: CommunityItem[], userLocation: Location | null }) {
  const center: [number, number] = userLocation ? [userLocation.latitude, userLocation.longitude] : [0, 0];
  
  return (
    <MapContainer center={center} zoom={13} style={{ height: '100%', width: '100%' }}>
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      />
      {userLocation && (
        <Marker position={[userLocation.latitude, userLocation.longitude]}>
          <Popup>You are here</Popup>
        </Marker>
      )}
      {items.map((item) => {
        const lat = item.latitude || item.lat;
        const lon = item.longitude || item.lon;
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
                  {item.date_start ? new Date(item.date_start).toLocaleDateString() : (item.date_unknown ? 'Date unknown' : 'Ongoing')}
                </p>
                <p className="text-xs opacity-80 mb-4 line-clamp-2">{item.description}</p>
                <div className="flex justify-between items-center border-t pt-3">
                  <span className="text-[10px] uppercase font-bold opacity-50">{item.audience}</span>
                  <a 
                    href={`https://www.google.com/maps/search/?api=1&query=${lat},${lon}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#5A5A40] text-xs font-bold flex items-center gap-1"
                  >
                    Directions <ExternalLink size={10} />
                  </a>
                </div>
              </div>
            </Popup>
          </Marker>
        );
      })}
      <MapUpdater center={center} />
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
