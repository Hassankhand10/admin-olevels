import React from 'react';
import { VITE_BASE_URL } from '../config/constants';
import { database } from '../config/firebase';
import { ref, get } from 'firebase/database';

// Teacher authentication interface
interface TeacherAuth {
  id: number;
  username: string;
  password: string;
  email: string;
  admin: boolean;
  displayName: string;
  OTP: string;
  isTeacher: boolean;
}

// Cookie checking function
export const checkTeacherCookies = (): TeacherAuth | null => {
  try {
    const cookies = document.cookie.split("; ");
    let teacherCookie = null;
    
    for (let i = 0; i < cookies.length; i++) {
      const cookie = cookies[i].split("=");
      if (cookie[0] === 'teacher') {
        teacherCookie = cookie[1];
        break;
      }
    }
    
    if (!teacherCookie) {
      return null;
    }
    
    // Decode the cookie data
    const decodedData = decodeURIComponent(teacherCookie);
    const teacherData: TeacherAuth = JSON.parse(decodedData);
    
    return teacherData;
  } catch (error) {
    console.error('Error parsing teacher cookie:', error);
    return null;
  }
};

// Check admin status from Firebase Realtime Database
export const checkAdminStatusFromFirebase = async (username: string): Promise<boolean> => {
  try {
    const teacherRef = ref(database, `teachers/${username}`);
    const snapshot = await get(teacherRef);
    
    if (snapshot.exists()) {
      const teacherData = snapshot.val();
      return teacherData.admin === true;
    }
    
    return false;
  } catch (error) {
    console.error('Error checking admin status from Firebase:', error);
    return false;
  }
};

// Check if user is authenticated and has admin access (async version)
export const isAuthenticatedAdminAsync = async (): Promise<boolean> => {
  // Skip authentication check on localhost for development
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    console.log('Development mode - skipping authentication check');
    return true;
  }
  
  const teacherData = checkTeacherCookies();
  console.log('teacherData', teacherData);
  
  if (!teacherData) {
    return false;
  }
  
  // Check if user is teacher
  if (!teacherData.isTeacher) {
    return false;
  }
  
  // Check admin status from Firebase Realtime Database
  const isAdmin = await checkAdminStatusFromFirebase(teacherData.username);
  return isAdmin;
};

// Check if user is authenticated and has admin access (sync version for immediate checks)
export const isAuthenticatedAdmin = (): boolean => {
  // Skip authentication check on localhost for development
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    console.log('Development mode - skipping authentication check');
    return true;
  }
  
  const teacherData = checkTeacherCookies();
  
  if (!teacherData) {
    return false;
  }
  
  // For immediate checks, use cookie data (may not be up-to-date)
  // Firebase check will be done in authGuard for final verification
  return teacherData.isTeacher === true;
};

// Authentication guard function (async version)
export const authGuardAsync = async (): Promise<boolean> => {
  // Skip authentication check on localhost for development
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    console.log('Development mode - skipping authentication check');
    return true;
  }
  
  const teacherData = checkTeacherCookies();
  
  // Get current URL for redirect after login
  const currentUrl = encodeURIComponent(window.location.href);
  
  // No cookies found - redirect to teacher login
  if (!teacherData) {
    console.log('No teacher cookies found, redirecting to teacher login...');
    window.open(`${VITE_BASE_URL}/teacher?redirect=${currentUrl}`, '_blank');
    return false;
  }
  
  // Not a teacher - redirect to teacher login
  if (!teacherData.isTeacher) {
    console.log('User is not a teacher, redirecting to teacher login...');
    window.open(`${VITE_BASE_URL}/teacher?redirect=${currentUrl}`, '_blank');
    return false;
  }
  
  // Check admin status from Firebase Realtime Database
  try {
    const isAdmin = await checkAdminStatusFromFirebase(teacherData.username);
    
    if (!isAdmin) {
      console.log('Teacher does not have admin access in Firebase, redirecting to login with error...');
      const errorMessage = encodeURIComponent('You are not an admin. Admin access required.');
      window.open(`${VITE_BASE_URL}/teacher?error=${errorMessage}&redirect=${currentUrl}`, '_blank');
      return false;
    }
    
    // All checks passed - user is authenticated admin
    console.log('Teacher authenticated with admin access from Firebase');
    return true;
  } catch (error) {
    console.error('Error checking admin status:', error);
    // Fallback to cookie check if Firebase fails
    if (!teacherData.admin) {
      const errorMessage = encodeURIComponent('You are not an admin. Admin access required.');
      window.open(`${VITE_BASE_URL}/teacher?error=${errorMessage}&redirect=${currentUrl}`, '_blank');
      return false;
    }
    return true;
  }
};

// Authentication guard function (sync version for immediate redirect)
export const authGuard = (): boolean => {
  // Skip authentication check on localhost for development
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    console.log('Development mode - skipping authentication check');
    return true;
  }
  
  const teacherData = checkTeacherCookies();
  
  // Get current URL for redirect after login
  const currentUrl = encodeURIComponent(window.location.href);
  
  // No cookies found - redirect to teacher login
  if (!teacherData) {
    console.log('No teacher cookies found, redirecting to teacher login...');
    window.open(`${VITE_BASE_URL}/teacher?redirect=${currentUrl}`, '_blank');
    return false;
  }
  
  // Not a teacher - redirect to teacher login
  if (!teacherData.isTeacher) {
    console.log('User is not a teacher, redirecting to teacher login...');
    window.open(`${VITE_BASE_URL}/teacher?redirect=${currentUrl}`, '_blank');
    return false;
  }
  
  // For immediate redirect, use cookie data (Firebase check will be done in useAuthGuard)
  if (!teacherData.admin) {
    console.log('Teacher does not have admin access in cookie, redirecting to login with error...');
    const errorMessage = encodeURIComponent('You are not an admin. Admin access required.');
    window.open(`${VITE_BASE_URL}/teacher?error=${errorMessage}&redirect=${currentUrl}`, '_blank');
    return false;
  }
  
  // All checks passed - user is authenticated admin
  console.log('Teacher authenticated with admin access');
  return true;
};

// Hook for React components to use authentication
export const useAuthGuard = () => {
  const [isAuthenticated, setIsAuthenticated] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(true);
  
  React.useEffect(() => {
    const checkAuth = async () => {
      try {
        const authResult = await authGuardAsync();
        setIsAuthenticated(authResult);
      } catch (error) {
        console.error('Authentication check failed:', error);
        setIsAuthenticated(false);
      } finally {
        setIsLoading(false);
      }
    };
    
    checkAuth();
  }, []);
  
  return { isAuthenticated, isLoading };
};

// Logout function to clear cookies and redirect
export const logout = () => {
  try {
    // Clear localStorage
    localStorage.removeItem('teacher_login');
    
    // Clear cookies by setting them to expire
    const pastDate = new Date(0).toUTCString();
    document.cookie = `teacher=; domain=olevels.com; path=/; expires=${pastDate}`;
    
    // Redirect to teacher login with logout message
    const logoutMessage = encodeURIComponent('You have been logged out successfully.');
    window.open(`${VITE_BASE_URL}/teacher?message=${logoutMessage}`, '_blank');
  } catch (error) {
    console.error('Error during logout:', error);
    // Force redirect even if clearing fails
    window.open(`${VITE_BASE_URL}/teacher`, '_blank');
  }
};
