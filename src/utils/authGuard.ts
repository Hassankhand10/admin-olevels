import React from 'react';
import { getTeacherPortalUrl } from '../config/constants';
import { database } from '../config/firebase';
import { ref, get } from 'firebase/database';
import { ensureOlevelsSignedIn } from './olevelsAuth';

/**
 * Shared SSO contract (same as Exam / Redeem / class):
 * - Cookie: slim teacher session with sessionProof (no customToken required)
 * - Auth: POST /auth/exchange as role "teacher" → Firebase
 * - Admin: RTDB teachers/{user}.admin or moduleAccess.admin (never cookie boolean alone)
 */

const showAdminAccessDeniedPage = () => {
  document.body.innerHTML = `
    <div style="
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      height: 100vh;
      font-family: Arial, sans-serif;
      background-color: #f5f5f5;
    ">
      <div style="
        background: white;
        padding: 40px;
        border-radius: 8px;
        box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        text-align: center;
        max-width: 500px;
      ">
        <h2 style="color: #d32f2f; margin-bottom: 20px;">❌ Access Denied</h2>
        <p style="color: #666; font-size: 18px; margin-bottom: 20px;">
          You are not an admin. Admin access required.
        </p>
        <p style="color: #999; font-size: 14px;">
          Redirecting to login page in <span id="countdown">30</span> seconds...
        </p>
        <div style="margin-top: 20px;">
          <button onclick="window.location.href='${getTeacherPortalUrl()}/teacher'" 
                  style="
                    background: #1976d2;
                    color: white;
                    border: none;
                    padding: 10px 20px;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 16px;
                  ">
            Go to Login Now
          </button>
        </div>
      </div>
    </div>
  `;

  let countdown = 30;
  const countdownElement = document.getElementById('countdown');
  const interval = setInterval(() => {
    countdown--;
    if (countdownElement) {
      countdownElement.textContent = countdown.toString();
    }
    if (countdown <= 0) {
      clearInterval(interval);
      window.location.href = `${getTeacherPortalUrl()}/teacher`;
    }
  }, 1000);
};

/** Slim SSO cookie from live.olevels.com — fields may be partial. */
interface TeacherAuth {
  id?: number;
  username?: string;
  password?: string;
  email?: string;
  admin?: boolean | string;
  displayName?: string;
  OTP?: string;
  isTeacher?: boolean | string;
  role?: string;
  sessionProof?: string;
  sessionEpoch?: number;
  name?: string;
  teacherName?: string;
}

function parseTeacherCookiePayload(raw: string): TeacherAuth | null {
  const attempts: string[] = [raw.trim()];
  let current = raw.trim();
  for (let i = 0; i < 3; i += 1) {
    if (!/%[0-9A-Fa-f]{2}/.test(current)) break;
    try {
      const decoded = decodeURIComponent(current);
      if (decoded === current) break;
      attempts.push(decoded);
      current = decoded;
    } catch {
      break;
    }
  }
  const ordered =
    raw.includes('%7B') || raw.includes('%22')
      ? [...attempts].reverse()
      : attempts;
  for (const value of ordered) {
    try {
      return JSON.parse(value) as TeacherAuth;
    } catch {
      /* next */
    }
  }
  return null;
}

/** Staff cookie is enough to attempt SSO — do not require isTeacher/admin booleans. */
export function looksLikeStaffSession(data: TeacherAuth | null): boolean {
  if (!data) return false;
  if (data.isTeacher === false) return false;
  if (data.isTeacher === true || data.admin === true || data.admin === 'true') {
    return true;
  }
  const role = String(data.role || '').toLowerCase();
  if (role === 'teacher' || role === 'admin') return true;
  return !!(
    data.sessionProof &&
    (data.username || data.displayName || data.name || data.teacherName)
  );
}

export function teacherUsername(data: TeacherAuth | null): string {
  return String(
    data?.username || data?.displayName || data?.name || data?.teacherName || ''
  ).trim();
}

export const checkTeacherCookies = (): TeacherAuth | null => {
  try {
    const cookies = document.cookie.split('; ');
    let teacherCookie: string | null = null;

    for (let i = 0; i < cookies.length; i++) {
      const cookie = cookies[i].split('=');
      if (cookie[0] === 'teacher') {
        teacherCookie = cookie.slice(1).join('=');
        break;
      }
    }

    if (!teacherCookie) {
      try {
        const ls = localStorage.getItem('teacher_login');
        if (ls) return JSON.parse(ls) as TeacherAuth;
      } catch {
        /* ignore */
      }
      return null;
    }

    return parseTeacherCookiePayload(teacherCookie);
  } catch {
    return null;
  }
};

export const checkAdminStatusFromFirebase = async (
  username: string
): Promise<boolean> => {
  try {
    await ensureOlevelsSignedIn();

    const teacherRef = ref(database, `teachers/${username}`);
    const teacherSnapshot = await get(teacherRef);
    if (teacherSnapshot.exists()) {
      const teacherData = teacherSnapshot.val();
      if (teacherData.admin === true) return true;
      if (teacherData.moduleAccess?.admin === true) return true;
    }

    const moduleAccessRef = ref(database, `teachers/${username}/moduleAccess`);
    const moduleSnapshot = await get(moduleAccessRef);
    if (moduleSnapshot.exists()) {
      const moduleAccess = moduleSnapshot.val();
      if (moduleAccess.admin === true) return true;
    }

    return false;
  } catch (error) {
    console.warn('[authGuard] admin RTDB check failed', error);
    return false;
  }
};

const isLocalDevHost = () =>
  window.location.hostname === 'localhost' ||
  window.location.hostname === '127.0.0.1';

export const isAuthenticatedAdminAsync = async (): Promise<boolean> => {
  if (isLocalDevHost()) return true;

  const teacherData = checkTeacherCookies();
  if (!looksLikeStaffSession(teacherData)) return false;
  const username = teacherUsername(teacherData);
  if (!username) return false;
  return checkAdminStatusFromFirebase(username);
};

/** Sync hint only — real admin = RTDB via isAuthenticatedAdminAsync / authGuardAsync. */
export const isAuthenticatedAdmin = (): boolean => {
  if (isLocalDevHost()) return true;
  return looksLikeStaffSession(checkTeacherCookies());
};

export const authGuardAsync = async (): Promise<boolean> => {
  if (isLocalDevHost()) return true;

  const teacherData = checkTeacherCookies();
  const currentUrl = encodeURIComponent(window.location.href);

  if (!looksLikeStaffSession(teacherData)) {
    window.location.href = `${getTeacherPortalUrl()}/teacher?redirect=${currentUrl}`;
    return false;
  }

  const username = teacherUsername(teacherData);
  if (!username) {
    window.location.href = `${getTeacherPortalUrl()}/teacher?redirect=${currentUrl}`;
    return false;
  }

  const firebaseUser = await ensureOlevelsSignedIn();
  if (!firebaseUser) {
    console.warn(
      '[authGuard] teacher cookie present but Firebase session missing — re-SSO'
    );
    window.location.href = `${getTeacherPortalUrl()}/teacher?redirect=${currentUrl}`;
    return false;
  }

  const isAdmin = await checkAdminStatusFromFirebase(username);
  if (!isAdmin) {
    showAdminAccessDeniedPage();
    return false;
  }
  return true;
};

/**
 * Sync entry: cookie present only. Never block on cookie.admin / isTeacher —
 * those fields are often missing on slim SSO cookies. Callers that need a
 * hard gate must use authGuardAsync.
 */
export const authGuard = (): boolean => {
  if (isLocalDevHost()) return true;

  const teacherData = checkTeacherCookies();
  const currentUrl = encodeURIComponent(window.location.href);

  if (!looksLikeStaffSession(teacherData)) {
    window.location.href = `${getTeacherPortalUrl()}/teacher?redirect=${currentUrl}`;
    return false;
  }
  return true;
};

export const useAuthGuard = () => {
  const [isAuthenticated, setIsAuthenticated] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    const checkAuth = async () => {
      try {
        const authResult = await authGuardAsync();
        setIsAuthenticated(authResult);
      } catch {
        setIsAuthenticated(false);
      } finally {
        setIsLoading(false);
      }
    };

    void checkAuth();
  }, []);

  return { isAuthenticated, isLoading };
};

export const logout = () => {
  try {
    localStorage.removeItem('teacher_login');
    const pastDate = new Date(0).toUTCString();
    document.cookie = `teacher=; domain=olevels.com; path=/; expires=${pastDate}`;
    const logoutMessage = encodeURIComponent(
      'You have been logged out successfully.'
    );
    window.open(
      `${getTeacherPortalUrl()}/teacher?message=${logoutMessage}`,
      '_blank'
    );
  } catch {
    window.open(`${getTeacherPortalUrl()}/teacher`, '_blank');
  }
};
