import { auth } from './firebase';

const SESSION_TOKEN_KEY = 'pgdesk_token';
let memorySessionToken: string | null = null;

export function isEmbeddedIframe(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (window.self !== window.top) return true;
  } catch {
    return true;
  }
  try {
    const ref = document.referrer || '';
    if (
      ref.includes('aistudio.google.com') ||
      ref.includes('googleusercontent.com') ||
      ref.includes('makersuite.google.com')
    ) {
      return true;
    }
  } catch {
    // ignore referrer access restrictions
  }
  return false;
}

export function shouldPersistTokenInLocalStorage(): boolean {
  return !import.meta.env.PROD || isEmbeddedIframe();
}

export function getStoredToken(): string | null {
  if (typeof window === 'undefined') return null;
  if (memorySessionToken) return memorySessionToken;
  if (!shouldPersistTokenInLocalStorage()) {
    try {
      const fromSession = window.sessionStorage.getItem(SESSION_TOKEN_KEY);
      if (fromSession) return fromSession;
    } catch {
      // ignore storage errors
    }
    return null;
  }
  try {
    const fromLocal = window.localStorage.getItem(SESSION_TOKEN_KEY);
    if (fromLocal) return fromLocal;
  } catch {
    // ignore localStorage restrictions inside sandboxed iframes
  }
  try {
    const fromSession = window.sessionStorage.getItem(SESSION_TOKEN_KEY);
    if (fromSession) return fromSession;
  } catch {
    // ignore sessionStorage restrictions
  }
  return memorySessionToken;
}

export function setStoredToken(token: string | null) {
  memorySessionToken = token || null;
  if (typeof window === 'undefined') return;
  if (token) {
    try {
      window.sessionStorage.setItem(SESSION_TOKEN_KEY, token);
    } catch {
      // ignore storage errors
    }
    if (shouldPersistTokenInLocalStorage()) {
      try {
        window.localStorage.setItem(SESSION_TOKEN_KEY, token);
      } catch {
        // ignore storage errors
      }
    }
  } else {
    try {
      window.localStorage.removeItem(SESSION_TOKEN_KEY);
    } catch {
      // ignore
    }
    try {
      window.sessionStorage.removeItem(SESSION_TOKEN_KEY);
    } catch {
      // ignore
    }
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
  if (isEmbeddedIframe()) {
    headers.set('X-PGDesk-Embedded', '1');
  }
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

  let res: Response;
  try {
    res = await fetch(url, {
      ...options,
      headers,
      credentials: 'include',
    });
  } catch {
    throw new ApiError(
      'Unable to reach the PGDesk server. Check your internet connection and try again.',
      0,
      { code: 'NETWORK_ERROR' }
    );
  }

  const contentType = res.headers.get('content-type') || '';

  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    let payload: any;
    if (contentType.includes('application/json')) {
      try {
        payload = await res.json();
        if (payload?.error) msg = payload.error;
      } catch {
        // ignore malformed json error
      }
    } else if (contentType.includes('text/html')) {
      msg = 'Unexpected HTML response from server. Please refresh the preview and try again.';
      payload = { code: 'INVALID_SERVER_RESPONSE' };
    }
    throw new ApiError(msg, res.status, payload);
  }

  if (contentType.includes('application/json')) {
    return res.json() as Promise<T>;
  }
  if (contentType.includes('text/html') && url.startsWith('/api/')) {
    throw new ApiError(
      'API endpoint returned HTML instead of JSON. Please refresh or restart the preview.',
      502,
      { code: 'INVALID_SERVER_RESPONSE' }
    );
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
