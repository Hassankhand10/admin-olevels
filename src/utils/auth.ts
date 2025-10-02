import Cookies from 'js-cookie';

const AUTH_COOKIE_NAME = 'admin_auth_token';
const USER_COOKIE_NAME = 'admin_user_email';

export const setAuthCookie = (token: string, email: string) => {
  Cookies.set(AUTH_COOKIE_NAME, token, { expires: 7, secure: true, sameSite: 'strict' });
  Cookies.set(USER_COOKIE_NAME, email, { expires: 7, secure: true, sameSite: 'strict' });
};

export const getAuthCookie = () => {
  return Cookies.get(AUTH_COOKIE_NAME);
};

export const getUserEmail = () => {
  return Cookies.get(USER_COOKIE_NAME);
};

export const removeAuthCookie = () => {
  Cookies.remove(AUTH_COOKIE_NAME);
  Cookies.remove(USER_COOKIE_NAME);
};

export const isAuthenticated = () => {
  return !!getAuthCookie();
};
