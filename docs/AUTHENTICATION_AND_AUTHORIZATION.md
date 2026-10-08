# Authentication and Authorization

## Shared teacher session

The Admin app consumes the main OLevels teacher session. It reads the `teacher` cookie and can fall back to `teacher_login` in local storage. The session is expected to contain a `sessionProof` and a username/display-name field. The cookie may be encoded more than once; the client progressively decodes it.

## Firebase session exchange

When no Firebase user is already active, the app sends a `POST` request to `/api/auth/exchange` with the session role, username/display name, session proof, and session epoch. The returned Firebase custom token is exchanged through Firebase Authentication.

The current source sends staff sessions as role `teacher`; it does not rely on a cookie-provided custom token or admin boolean for the final check.

## Admin check

After Firebase sign-in, the app reads `teachers/{username}` from Realtime Database and accepts administrative access when either is true:

- `teachers/{username}.admin`
- `teachers/{username}.moduleAccess.admin`

Missing sessions redirect to the teacher portal. A valid teacher session without admin access receives an access-denied page.

## Important limitations

- Localhost and `127.0.0.1` bypass the admin check in the current source.
- Authorization is applied globally through the route wrapper; module-specific authorization is not visible.
- Firebase Security Rules are not included in this repository and were not verified.
- `src/utils/auth.ts` contains a separate cookie helper for `admin_auth_token`, but no active route usage was found during inspection.

