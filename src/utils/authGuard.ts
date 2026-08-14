import React from 'react';
import { getTeacherPortalUrl } from '../config/constants';
import { database } from '../config/firebase';
import { ref, get } from 'firebase/database';
import { ensureOlevelsSignedIn } from './olevelsAuth';

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

/** Slim SSO cookie from live.olevels.com (password/OTP may be absent). */
interface TeacherAuth {
  id: number;
  username: string;
  password?: string;
  email: string;
  admin: boolean;
  displayName: string;
  OTP?: string;
  isTeacher: boolean;
  sessionProof?: string;
  sessionEpoch?: number;
  customToken?: string;
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
      return null;
    }

    return parseTeacherCookiePayload(teacherCookie);
  } catch {
    return null;
  }
};

export const checkAdminStatusFromFirebase = async (username: string): Promise<boolean> => {
  try {
    // RTDB rules require auth != null — exchange must finish first.
    await ensureOlevelsSignedIn();

    const teacherRef = ref(database, `teachers/${username}`);
    const teacherSnapshot = await get(teacherRef);
    if (teacherSnapshot.exists()) {
      const teacherData = teacherSnapshot.val();
      if (teacherData.admin === true) return true;
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

export const isAuthenticatedAdminAsync = async (): Promise<boolean> => {
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return true;
  }

  const teacherData = checkTeacherCookies();
  if (!teacherData || !teacherData.isTeacher) {
    return false;
  }

  return checkAdminStatusFromFirebase(teacherData.username);
};

export const isAuthenticatedAdmin = (): boolean => {
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return true;
  }

  const teacherData = checkTeacherCookies();
  if (!teacherData) {
    return false;
  }

  return teacherData.isTeacher === true;
};

export const authGuardAsync = async (): Promise<boolean> => {
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return true;
  }

  const teacherData = checkTeacherCookies();
  const currentUrl = encodeURIComponent(window.location.href);

  if (!teacherData) {
    window.location.href = `${getTeacherPortalUrl()}/teacher?redirect=${currentUrl}`;
    return false;
  }

  if (!teacherData.isTeacher) {
    window.location.href = `${getTeacherPortalUrl()}/teacher?redirect=${currentUrl}`;
    return false;
  }

  const firebaseUser = await ensureOlevelsSignedIn();
  if (!firebaseUser) {
    console.warn('[authGuard] teacher cookie present but Firebase session missing — re-SSO');
    window.location.href = `${getTeacherPortalUrl()}/teacher?redirect=${currentUrl}`;
    return false;
  }

  try {
    const isAdmin = await checkAdminStatusFromFirebase(teacherData.username);

    if (!isAdmin) {
      showAdminAccessDeniedPage();
      return false;
    }

    return true;
  } catch {
    if (!teacherData.admin) {
      showAdminAccessDeniedPage();
      return false;
    }
    return true;
  }
};

export const authGuard = (): boolean => {
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return true;
  }

  const teacherData = checkTeacherCookies();
  const currentUrl = encodeURIComponent(window.location.href);

  if (!teacherData) {
    window.location.href = `${getTeacherPortalUrl()}/teacher?redirect=${currentUrl}`;
    return false;
  }

  if (!teacherData.isTeacher) {
    window.location.href = `${getTeacherPortalUrl()}/teacher?redirect=${currentUrl}`;
    return false;
  }

  if (!teacherData.admin) {
    showAdminAccessDeniedPage();
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
    const logoutMessage = encodeURIComponent('You have been logged out successfully.');
    window.open(`${getTeacherPortalUrl()}/teacher?message=${logoutMessage}`, '_blank');
  } catch {
    window.open(`${getTeacherPortalUrl()}/teacher`, '_blank');
  }
};
