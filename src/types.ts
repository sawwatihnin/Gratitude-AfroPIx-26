export interface CommunityItem {
  id: string;
  entity_kind?: 'event' | 'volunteer' | 'resource' | 'organization' | 'clinic_legal';
  title: string;
  name?: string; // For organizations
  description: string;
  location_name?: string;
  address?: string;
  date_start?: string;
  date_end?: string;
  date_unknown?: boolean;
  is_upcoming?: boolean;
  type: 'event' | 'volunteer' | 'foodbank' | 'donation' | 'class' | 'workshop' | 'networking' | 'support_group' | 'clinic' | 'legal_aid' | 'shelter' | 'resource_center' | 'organization';
  audience: 'student' | 'professional' | 'general' | 'families' | 'seniors';
  latitude?: number;
  longitude?: number;
  lat?: number;
  lon?: number;
  distance_miles?: number;
  organizer?: string;
  accessibility_notes?: string;
  source_name?: string;
  source_url?: string;
  retrieved_at?: string;
  location_confidence?: 'high' | 'medium' | 'low';
  neighborhood?: string;
  verified_source?: boolean;
  recommended_by_users?: number;
  event_attendance?: {
    interested_count: number;
    going_count: number;
  };
  cultural_groups?: string[];
  supported_languages?: string[];
  translation_services?: boolean;
  translation_languages?: string[];
  immigrant_support?: boolean;
  newcomer_support?: boolean;
  primary_category?: 'event' | 'volunteer' | 'food_assistance' | 'organization' | 'clinic_legal' | 'cultural' | 'language_support' | 'artist' | 'education' | 'networking' | 'social' | 'resource' | 'other';
  subcategory?: string;
  ai_tags?: string[];
  relevance_score?: number;
  quality_score?: number;
  classification_confidence?: 'high' | 'medium' | 'low';
  low_relevance?: boolean;
  low_quality?: boolean;
  source_category?: string;
  duplicate_of?: string | null;
  user_reports?: number;
  report_types?: string[];
  classification_checked_at?: string;
  confidence?: {
    overall: 'high' | 'medium' | 'low';
    date: string;
    location: string;
    type: string;
  };
  needs_review?: boolean;
  
  // Organization specific
  category?: 'shelter' | 'legal_aid' | 'free_clinic' | 'lawyer' | 'food_assistance' | 'resource_center' | 'other';
  phone?: string;
  hours?: string;
  services?: string[];
  eligibility?: string;

  // Student specific filters
  fieldOfStudy?: string;
  academicLevel?: 'undergrad' | 'grad' | 'any';
  careerFocus?: 'internship' | 'networking' | 'skills' | 'social' | 'any';
  
  // Professional specific
  industry?: string;
  seniorityLevel?: string;
  networkingVsTraining?: string;

  // UI Helper
  coordinates?: [number, number];
}

export interface GroundingChunk {
  maps?: {
    uri: string;
    title: string;
  };
}

export interface ConnectionProfile {
  user_id: string;
  display_name: string;
  audience_type: 'student' | 'professional' | 'general';
  distance_miles: number | null;
  field_of_study?: string;
  industry?: string;
  skills: string[];
  interests: string[];
  shared_interests: string[];
  profile_summary: string;
  profile_color_theme?: string;
  last_active: string;
}

export interface DirectMessage {
  message_id: string;
  sender_id: string;
  receiver_id: string;
  timestamp: string;
  message_text: string;
  read_status: boolean;
}

export interface CommunityVideo {
  video_id: string;
  title: string;
  channel_name: string;
  channel_type?: 'organization' | 'educational' | 'individual';
  published_date: string | null;
  duration: string;
  duration_minutes?: number;
  thumbnail: string;
  description: string;
  watch_url: string;
  embed_url: string;
  local_relevance: 'high' | 'medium' | 'low';
}

export interface LocalArtist {
  artist_name: string;
  category: 'music' | 'visual_art' | 'performance' | 'digital' | 'other';
  style: string;
  location: string;
  distance_miles: number | null;
  description: string;
  website: string;
  social_links: string[];
  upcoming_events: string[];
  lat: number | null;
  lon: number | null;
  confidence: {
    overall: 'high' | 'medium' | 'low';
  };
}

export interface TranslatorEntity {
  name: string;
  service_type: 'translator' | 'interpreter' | 'both';
  languages_supported: string[];
  specializations: Array<'medical' | 'legal' | 'education' | 'general'>;
  mode: 'in_person' | 'remote' | 'phone' | 'any';
  cost: 'free' | 'paid' | 'any';
  service_area: string;
  address: string;
  lat: number | null;
  lon: number | null;
  phone: string;
  email: string;
  website: string;
  hours: string;
  notes: string;
  source_name: string;
  source_url: string;
  retrieved_at: string;
  confidence: { overall: 'high' | 'medium' | 'low' };
}

export interface NewcomerGuide {
  title: string;
  topic: 'documentation' | 'healthcare' | 'housing' | 'education' | 'employment' | 'banking' | 'transportation' | 'legal_rights_general' | 'emergency_services';
  language: string;
  format: 'article' | 'pdf' | 'video' | 'checklist' | 'local_program';
  summary: string;
  source_name: string;
  source_url: string;
  retrieved_at: string;
  local_relevance: 'high' | 'medium' | 'low';
  confidence: { overall: 'high' | 'medium' | 'low' };
}
