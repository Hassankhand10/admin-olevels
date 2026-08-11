/**
 * Cookie SSO -> POST /auth/exchange -> Firebase custom token -> Bearer header.
 *
 * `installOlevelsAuth()` wraps `window.fetch` so the scattered API calls in
 * this app gain an Authorization header without touching the call sites.
 */
import { signInWithCustomToken, type User } from 'firebase/auth';

import { auth } from '../config/firebase';
import { API_BASE_URL } from '../config/constants';

type Role = 'student' | 'teacher' | 'admin';

interface OlevelsSession {
  role: Role;
  username?: string;
  displayName?: string;
  sessionProof: string;
  sessionEpoch: number;
}

const EXCHANGE_PATH = 'auth/exchange';

function apiRoot(): string {
  const base = String(API_BASE_URL || 'https://live.olevels.com/functions');
  const trimmed = base.replace(/\/+$/, '');
  return /\/api(Gen2)?$/.test(trimmed) ? `${trimmed}/` : `${trimmed}/api/`;
}

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') {
    return null;
  }
  for (const part of document.cookie ? document.cookie.split(';') : []) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) {
      return rest.join('=');
    }
  }
  return null;
}

function parseCookie(raw: string | null): Record<string, any> | null {
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(decodeURIComponent(raw));
  } catch {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
}

function readSession(): OlevelsSession | null {
  const sources: Array<[Role, Record<string, any> | null]> = [
    ['teacher', parseCookie(readCookie('teacher'))],
    ['student', parseCookie(readCookie('student'))],
  ];

  for (const [role, data] of sources) {
    if (!data || !data.sessionProof) {
      continue;
    }
    return {
      role: role === 'teacher' && data.admin === true ? 'admin' : role,
      username: data.username || data.displayName,
      displayName: data.displayName || data.username,
      sessionProof: String(data.sessionProof),
      sessionEpoch: Number(data.sessionEpoch || 0),
    };
  }
  return null;
}

let baseFetch: typeof fetch =
  typeof window !== 'undefined' ? window.fetch.bind(window) : fetch;
let pending: Promise<User | null> | null = null;

async function exchange(session: OlevelsSession): Promise<User | null> {
  if (!auth) {
    return null;
  }
  const res = await baseFetch(`${apiRoot()}${EXCHANGE_PATH}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      role: session.role,
      username: session.username,
      displayName: session.displayName,
      sessionProof: session.sessionProof,
      sessionEpoch: session.sessionEpoch,
    }),
  });
  if (!res.ok) {
    console.warn(`[olevelsAuth] exchange failed (${res.status})`);
    return null;
  }
  const body = await res.json();
  if (!body.customToken) {
    return null;
  }
  const credential = await signInWithCustomToken(auth, body.customToken);
  return credential.user;
}

export async function ensureOlevelsSignedIn(): Promise<User | null> {
  if (auth?.currentUser) {
    return auth.currentUser;
  }
  const session = readSession();
  if (!session) {
    return null;
  }
  if (!pending) {
    pending = exchange(session)
      .catch((err) => {
        console.warn('[olevelsAuth] exchange error', err);
        return null;
      })
      .finally(() => {
        pending = null;
      });
  }
  return pending;
}

export async function olevelsAuthHeader(): Promise<Record<string, string>> {
  try {
    const user = await ensureOlevelsSignedIn();
    if (!user) {
      return {};
    }
    return { Authorization: `Bearer ${await user.getIdToken(false)}` };
  } catch {
    return {};
  }
}

let installed = false;

export function installOlevelsAuth(): void {
  if (installed || typeof window === 'undefined') {
    return;
  }
  installed = true;
  baseFetch = window.fetch.bind(window);

  // The API base may or may not already end in /api; match on the host root so
  // both `${API_BASE_URL}/api/admin/...` and `${API_BASE_URL}api/openai/...`
  // are covered.
  const host = String(API_BASE_URL || '').replace(/\/+$/, '');

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;

    const isOlevels = Boolean(host) && url.startsWith(host);
    if (!isOlevels || url.includes(EXCHANGE_PATH)) {
      return baseFetch(input as any, init);
    }

    const header = await olevelsAuthHeader();
    if (!header.Authorization) {
      return baseFetch(input as any, init);
    }

    const headers = new Headers(
      (init && init.headers) ||
        (typeof input === 'object' && 'headers' in input
          ? (input as Request).headers
          : undefined)
    );
    if (!headers.has('Authorization')) {
      headers.set('Authorization', header.Authorization);
    }
    return baseFetch(input as any, { ...(init || {}), headers });
  };

  void ensureOlevelsSignedIn();
}
