export const GRADING_BASE_URL = import.meta.env.VITE_BASE_URL;
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;
export const VITE_BASE_URL = import.meta.env.VITE_BASE_URL || 'https://live.olevels.com';

const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1']);

/** Teacher portal base URL — resolved at runtime so prod never uses a dev build-time env. */
export const getTeacherPortalUrl = (): string => {
  if (typeof window !== 'undefined' && LOCAL_HOSTNAMES.has(window.location.hostname)) {
    return import.meta.env.VITE_BASE_URL || 'http://localhost:4200';
  }
  return 'https://live.olevels.com';
};
