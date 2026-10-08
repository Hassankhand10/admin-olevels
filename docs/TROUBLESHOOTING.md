# Troubleshooting

## Authentication redirects or access denied

Check that the browser has a valid shared teacher session, the session contains a session proof and username, the auth exchange endpoint is reachable, Firebase sign-in succeeds, and the shared RTDB teacher record grants `admin` or `moduleAccess.admin`.

The exact backend exchange behavior and Firebase Rules are not available in this repository.

## Firebase data cannot load

Check the Firebase environment variable names, selected environment, Firebase Auth state, database URL, Firestore availability, and applicable server-side rules. The Admin app uses both Firestore and Realtime Database; a successful read in one does not prove access to the other.

## API requests fail

Check `VITE_API_BASE_URL`, endpoint path construction, Firebase ID-token availability, and the backend response status. The fetch wrapper only attaches tokens to requests matching the configured OLevels API host.

## TypeScript validation

`npm run lint` completes without reported errors. `npm run typecheck` currently reports unused declarations/imports in `RealtimeDbSizePage.tsx` and `firebaseService.ts`. These issues were intentionally left unchanged.

## Deployment issues

Confirm that `dist` exists, the intended Hosting project is selected, the production environment is loaded during build, and SPA rewrites remain present. Deployment history and CI configuration are not documented in the repository.

