export interface CommunityItem {
  id: string;
  title: string;
  name?: string; // For organizations
  description: string;
  location_name?: string;
  address?: string;
  date_start?: string;
  date_end?: string;
  date_unknown?: boolean;
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
