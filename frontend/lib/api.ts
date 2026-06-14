// Typed API client for the Saalai Kural backend.
// Base URL ALWAYS comes from env. No hardcoded localhost.
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "";

export interface ApiError extends Error {
  status?: number;
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let bodyText = "";
    try {
      bodyText = await res.text();
    } catch {
      bodyText = res.statusText;
    }
    const err: ApiError = new Error(`${res.status}: ${bodyText}`);
    err.status = res.status;
    throw err;
  }
  // Some endpoints may return empty body
  const text = await res.text();
  if (!text) return undefined as unknown as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as unknown as T;
  }
}

function authHeaders(token?: string): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export const api = {
  async get<T = any>(path: string, token?: string): Promise<T> {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(token),
      },
    });
    return handleResponse<T>(res);
  },

  async post<T = any>(path: string, body?: any, token?: string): Promise<T> {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(token),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    return handleResponse<T>(res);
  },

  async patch<T = any>(path: string, body?: any, token?: string): Promise<T> {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(token),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    return handleResponse<T>(res);
  },

  async del<T = any>(path: string, token?: string): Promise<T> {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(token),
      },
    });
    return handleResponse<T>(res);
  },

  // For multipart/file upload. Do NOT set Content-Type manually for FormData —
  // the browser sets the correct multipart boundary automatically.
  async upload<T = any>(path: string, formData: FormData, token?: string): Promise<T> {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      method: "POST",
      headers: {
        ...authHeaders(token),
      },
      body: formData,
    });
    return handleResponse<T>(res);
  },
};
