import { auth } from './firebase';

const SESSION_TOKEN_KEY = 'pgdesk_token';

export function isEmbeddedIframe(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

export function shouldPersistTokenInLocalStorage(): boolean {
  return !import.meta.env.PROD || isEmbeddedIframe();
}

export function getStoredToken(): string | null {
  if (typeof window === 'undefined' || !shouldPersistTokenInLocalStorage()) return null;
  try {
    return window.localStorage.getItem(SESSION_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token: string | null) {
  if (typeof window === 'undefined') return;
  try {
    if (token && shouldPersistTokenInLocalStorage()) {
      window.localStorage.setItem(SESSION_TOKEN_KEY, token);
    } else {
      window.localStorage.removeItem(SESSION_TOKEN_KEY);
    }
  } catch {
    // ignore storage errors
  }
}

export class ApiError extends Error {
  status: number;
  data?: any;
  constructor(message: string, status: number, data?: any) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

async function buildAuthHeaders(extra?: HeadersInit): Promise<Headers> {
  const headers = new Headers(extra || {});
  const storedToken = getStoredToken();
  if (storedToken) {
    headers.set('Authorization', `Bearer ${storedToken}`);
  } else if (auth?.currentUser) {
    try {
      const fbToken = await auth.currentUser.getIdToken();
      if (fbToken) {
        headers.set('Authorization', `Bearer ${fbToken}`);
      }
    } catch {
      // Fall back to HttpOnly cookie session
    }
  }
  return headers;
}

export async function apiFetch<T = any>(url: string, options: RequestInit = {}): Promise<T> {
  const headers = await buildAuthHeaders(options.headers);
  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(url, {
    ...options,
    headers,
    credentials: 'include',
  });

  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    let payload: any;
    try {
      payload = await res.json();
      if (payload?.error) msg = payload.error;
    } catch {
      // ignore non-json error
    }
    throw new ApiError(msg, res.status, payload);
  }

  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return res.json() as Promise<T>;
  }
  return res.text() as unknown as T;
}

export async function downloadAuthorizedFile(url: string, filename: string): Promise<void> {
  const headers = await buildAuthHeaders();
  const res = await fetch(url, { headers, credentials: 'include' });
  if (!res.ok) {
    throw new ApiError(`Download failed (${res.status})`, res.status);
  }
  const blob = await res.blob();
  const blobUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = blobUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(blobUrl), 2000);
}
