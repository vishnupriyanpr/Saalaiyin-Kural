// Data access layer. Every function hits the real backend via the api client.
// No mock/seed/localStorage fallback. A real error is always better than fake success.

import { api, ApiError } from "./api";
import { TOKEN_KEY } from "./useAuth";
import type {
  CivilianUser,
  AdminUser,
  Complaint,
  Worker,
  RewardItem,
  RewardRedemption,
  Notification,
  Project,
  MultiplierEvent,
  Stats,
} from "./types";

// Re-export shared types so existing importers can also pull them from here if needed.
export type {
  CivilianUser,
  AdminUser,
  Complaint,
  Worker,
  RewardItem,
  RewardRedemption,
  Notification,
  Project,
  MultiplierEvent,
  Stats,
};

const isBrowser = typeof window !== "undefined";

function getToken(): string | undefined {
  if (!isBrowser) return undefined;
  return localStorage.getItem(TOKEN_KEY) || undefined;
}

// On 401, clear the token and bounce to /login. Re-throws so callers can show errors.
function handle401(err: unknown): never {
  const e = err as ApiError;
  if (e && e.status === 401 && isBrowser) {
    localStorage.removeItem(TOKEN_KEY);
    window.location.href = "/login";
  }
  throw err;
}

// Backend responses may be either a bare array/object or wrapped under a named key.
function unwrap<T>(data: any, key: string): T {
  if (data == null) return data;
  if (Array.isArray(data)) return data as T;
  if (key in data) return data[key] as T;
  return data as T;
}

async function safeGet<T>(path: string, key: string, requireAuth = false): Promise<T> {
  try {
    const data = await api.get(path, requireAuth ? getToken() : getToken());
    return unwrap<T>(data, key);
  } catch (err) {
    handle401(err);
  }
}

async function safePost<T>(path: string, body: any, key: string): Promise<T> {
  try {
    const data = await api.post(path, body, getToken());
    return unwrap<T>(data, key);
  } catch (err) {
    handle401(err);
  }
}

async function safePatch<T>(path: string, body: any, key: string): Promise<T> {
  try {
    const data = await api.patch(path, body, getToken());
    return unwrap<T>(data, key);
  } catch (err) {
    handle401(err);
  }
}

export const db = {
  // --- STATS (real aggregates) ---
  async getStats(): Promise<Stats> {
    return safeGet<Stats>("/api/stats", "stats");
  },

  // --- CIVILIANS ---
  async getCivilians(): Promise<CivilianUser[]> {
    return safeGet<CivilianUser[]>("/api/users?role=civilian", "users");
  },

  async getCivilianById(id: string): Promise<CivilianUser | null> {
    try {
      const data = await api.get(`/api/users/${id}`, getToken());
      return unwrap<CivilianUser>(data, "user");
    } catch (err) {
      const e = err as ApiError;
      if (e && e.status === 404) return null;
      handle401(err);
    }
  },

  async createCivilian(
    civilian: Partial<CivilianUser> & { id?: string; phone: string }
  ): Promise<CivilianUser> {
    return safePost<CivilianUser>("/api/users", civilian, "user");
  },

  async updateCivilian(id: string, updates: Partial<CivilianUser>): Promise<CivilianUser> {
    return safePatch<CivilianUser>(`/api/users/${id}`, updates, "user");
  },

  // --- ADMINS ---
  async getAdmins(): Promise<AdminUser[]> {
    return safeGet<AdminUser[]>("/api/users?role=admin", "users");
  },

  async getAdminById(id: string): Promise<AdminUser | null> {
    try {
      const data = await api.get(`/api/users/${id}`, getToken());
      return unwrap<AdminUser>(data, "user");
    } catch (err) {
      const e = err as ApiError;
      if (e && e.status === 404) return null;
      handle401(err);
    }
  },

  // --- COMPLAINTS ---
  async getComplaints(): Promise<Complaint[]> {
    return safeGet<Complaint[]>("/api/complaints", "complaints");
  },

  async getComplaintById(id: string): Promise<Complaint | null> {
    try {
      const data = await api.get(`/api/complaints/${id}`, getToken());
      return unwrap<Complaint>(data, "complaint");
    } catch (err) {
      const e = err as ApiError;
      if (e && e.status === 404) return null;
      handle401(err);
    }
  },

  async createComplaint(complaint: Partial<Complaint>): Promise<Complaint> {
    return safePost<Complaint>("/api/complaints", complaint, "complaint");
  },

  async updateComplaint(id: string, updates: Partial<Complaint>): Promise<Complaint> {
    return safePatch<Complaint>(`/api/complaints/${id}`, updates, "complaint");
  },

  // --- WORKERS ---
  async getWorkers(): Promise<Worker[]> {
    return safeGet<Worker[]>("/api/workers", "workers");
  },

  async updateWorker(id: string, updates: Partial<Worker>): Promise<Worker> {
    return safePatch<Worker>(`/api/workers/${id}`, updates, "worker");
  },

  async createWorker(worker: Partial<Worker>): Promise<Worker> {
    return safePost<Worker>("/api/workers", worker, "worker");
  },

  // --- REWARDS & REDEMPTIONS ---
  async getRewards(): Promise<RewardItem[]> {
    return safeGet<RewardItem[]>("/api/rewards", "rewards");
  },

  async updateReward(id: string, updates: Partial<RewardItem>): Promise<RewardItem> {
    return safePatch<RewardItem>(`/api/rewards/${id}`, updates, "reward");
  },

  async createRewardItem(item: Partial<RewardItem>): Promise<RewardItem> {
    return safePost<RewardItem>("/api/rewards", item, "reward");
  },

  async getRedemptions(): Promise<RewardRedemption[]> {
    return safeGet<RewardRedemption[]>("/api/redemptions", "redemptions");
  },

  async createRedemption(
    redemption: Partial<RewardRedemption>
  ): Promise<RewardRedemption> {
    return safePost<RewardRedemption>("/api/redemptions", redemption, "redemption");
  },

  async updateRedemption(
    id: string,
    updates: Partial<RewardRedemption>
  ): Promise<RewardRedemption> {
    return safePatch<RewardRedemption>(`/api/redemptions/${id}`, updates, "redemption");
  },

  // --- NOTIFICATIONS ---
  async getNotifications(): Promise<Notification[]> {
    return safeGet<Notification[]>("/api/notifications", "notifications");
  },

  async createNotification(notif: Partial<Notification>): Promise<Notification> {
    return safePost<Notification>("/api/notifications", notif, "notification");
  },

  async markNotificationRead(id: string): Promise<Notification> {
    return safePatch<Notification>(`/api/notifications/${id}`, { read: true }, "notification");
  },

  // --- PROJECTS ---
  async getProjects(): Promise<Project[]> {
    return safeGet<Project[]>("/api/projects", "projects");
  },

  async createProject(project: Partial<Project>): Promise<Project> {
    return safePost<Project>("/api/projects", project, "project");
  },

  async updateProject(id: string, updates: Partial<Project>): Promise<Project> {
    return safePatch<Project>(`/api/projects/${id}`, updates, "project");
  },

  // --- MULTIPLIER EVENTS ---
  async getMultiplierEvents(): Promise<MultiplierEvent[]> {
    return safeGet<MultiplierEvent[]>("/api/multipliers", "multipliers");
  },

  async createMultiplierEvent(
    district: string,
    multiplier: number,
    startDate: string,
    endDate: string
  ): Promise<MultiplierEvent> {
    return safePost<MultiplierEvent>(
      "/api/multipliers",
      { district, multiplier, startDate, endDate },
      "multiplier"
    );
  },

  // --- ROADS (transparency / contractor data) ---
  async getRoads(): Promise<import("./types").Road[]> {
    return safeGet<import("./types").Road[]>("/api/roads", "roads");
  },

  async getRoadById(id: string): Promise<import("./types").Road | null> {
    try {
      const data = await api.get(`/api/roads/${id}`, getToken());
      return unwrap<import("./types").Road>(data, "road");
    } catch (err) {
      const e = err as ApiError;
      if (e && e.status === 404) return null;
      handle401(err);
    }
  },

  // --- TRANSPARENCY DASHBOARD (public) ---
  async getTransparency(): Promise<import("./types").TransparencyData> {
    return safeGet<import("./types").TransparencyData>(
      "/api/dashboard/transparency",
      "transparency"
    );
  },
};
