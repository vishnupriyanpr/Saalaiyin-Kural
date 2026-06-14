// Shared domain types for Saalai Kural.
// These were previously defined in seedData.ts. Pages and lib import them from here.

export interface CivilianUser {
  id: string;
  full_name: string;
  phone: string;
  aadhaar_hash?: string;
  district: string;
  city?: string;
  pincode?: string;
  points_total: number;
  points_redeemed: number;
  level: string;
  streak_days: number;
  last_report_date: string | null;
  created_at: string;
  badges: string[];
}

export interface AdminUser {
  id: string;
  name: string;
  role: 'state' | 'district' | 'field';
  district: string;
  created_at: string;
}

export interface Complaint {
  id: string;
  civilian_id: string;
  title: string;
  type: 'pothole' | 'crack' | 'waterlogging' | 'signage' | 'other';
  description: string;
  photo_url: string;
  photo_metadata?: {
    depth_est?: string;
    shadow_analyzed?: boolean;
    reference_object?: string;
  };
  lat: number;
  lng: number;
  address: string;
  district: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  // Nullable: complaints can exist before/without AI analysis, and the backend
  // returns null for those. All read sites must guard with `?.`.
  ai_classification: {
    type: string;
    severity_score: number; // 1-10
    confidence: number; // 0-1
    estimated_cost: number;
    recommended_points: number;
    depth_est?: string;
  } | null;
  status: 'pending' | 'verified' | 'assigned' | 'in_progress' | 'resolved' | 'rejected';
  points_awarded: number;
  worker_id: string | null;
  budget_estimated: number | null;
  budget_actual: number | null;
  created_at: string;
  updated_at: string;
}

export interface Worker {
  id: string;
  name: string;
  phone: string;
  skill_tags: string[];
  district: string;
  availability: 'available' | 'busy' | 'offline';
  rating: number;
  is_civilian_worker: boolean;
  created_at: string;
}

export interface RewardItem {
  id: string;
  name: string;
  icon: string;
  points_cost: number;
  category: string;
  stock: number;
  active: boolean;
}

export interface RewardRedemption {
  id: string;
  civilian_id: string;
  item_name: string;
  points_cost: number;
  status: 'pending' | 'approved' | 'rejected';
  redeemed_at: string;
}

export interface Notification {
  id: string;
  target_role: 'admin' | 'civilian' | 'all';
  target_id: string | null; // civilian_id or admin_id
  title: string;
  body: string;
  type: 'complaint_update' | 'point_gain' | 'cluster_alert' | 'work_assign' | 'reward_approval';
  read: boolean;
  created_at: string;
}

export interface Project {
  id: string;
  complaint_ids: string[];
  title: string;
  district: string;
  budget_total: number;
  budget_spent: number;
  status: 'planning' | 'approved' | 'active' | 'completed';
  worker_ids: string[];
  start_date: string;
  end_date: string;
}

export interface MultiplierEvent {
  district: string;
  multiplier: number;
  startDate: string;
  endDate: string;
}

// ─── Realtime / backend-contract shapes (Agent 4) ──────────────────────────

/** Normalized notification as returned by GET /api/notifications and pushed
 *  over the WebSocket as { type:"NOTIFICATION", notification:{...} }. */
export interface RealtimeNotification {
  id: string;
  title: string;
  message: string;
  type: string;
  complaint_id?: string | null;
  read: boolean;
  created_at: string;
}

/** A single step in a complaint's lifecycle (GET /api/complaints/:id/timeline). */
export interface TimelineStep {
  step: string;
  status: string;
  timestamp: string | null;
  notes?: string | null;
}

/** Road / contractor record (GET /api/roads, GET /api/roads/:id). */
export interface Road {
  id: string;
  name: string;
  type?: string;
  jurisdiction_dept?: string;
  contractor_name?: string;
  contractor_contact?: string;
  budget_sanctioned: number;
  budget_spent: number;
  last_relayed_date?: string | null;
  maintenance_history?: { date: string; notes?: string; cost?: number }[];
  created_at?: string;
}

/** Public transparency dashboard payload (GET /api/dashboard/transparency). */
export interface TransparencyData {
  totalRoads: number;
  budgetSanctionedTotal: number;
  budgetSpentTotal: number;
  complaintsByStatus: {
    pending: number;
    in_progress: number;
    resolved: number;
    rejected: number;
  };
  topRoadsByComplaints: { road_id: string; name: string; count: number }[];
  resolutionRate: number;
  avgResolutionDays: number;
  roads: Road[];
}

/** Lightweight complaint point for the nearby/heatmap endpoint. */
export interface NearbyComplaint {
  id: string;
  lat: number;
  lng: number;
  status: string;
  severity: string;
  road_type?: string;
  created_at: string;
}

// Real aggregate stats from GET /api/stats
export interface Stats {
  totalComplaints: number;
  resolvedComplaints: number;
  inProgressComplaints: number;
  pendingComplaints: number;
  totalCitizens: number;
  activeWorkers: number;
  totalBudget: number;
  spentBudget: number;
  totalSavings: number;
  districts: number;
  // landing-page friendly aliases (optional, backend may or may not provide)
  reportsFixed?: number;
  budgetSavedPercent?: number;
}
