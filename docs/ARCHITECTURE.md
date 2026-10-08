# Architecture

## Overview

The Admin Portal is a browser-only React single-page application. Vite builds the application into `dist`, and Firebase Hosting serves the SPA. The repository contains no server, Cloud Functions, Firebase Rules, or database migration source.

## Main layers

- `src/main.tsx`: bootstraps React, installs the OLevels fetch/auth integration, and loads global CSS.
- `src/App.tsx`: defines routes and the shared protected-route wrapper.
- `src/components/`: page-level UI and module behavior.
- `src/services/`: Firebase data access, Realtime Database inspection, and data transformation helpers.
- `src/utils/`: shared authentication/session logic.
- `src/config/`: Firebase initialization and endpoint/environment resolution.
- `src/types/`: TypeScript data contracts used by the frontend.

## Data flow

1. The browser receives the shared teacher session from the main OLevels teacher portal.
2. The Admin app exchanges the session proof with `/api/auth/exchange`.
3. Firebase Authentication is established with the returned custom token.
4. Firebase ID tokens are attached to matching OLevels API requests.
5. The app reads/writes shared Firestore and Realtime Database data.
6. Firebase Hosting serves the compiled SPA and rewrites application routes to `index.html`.

## Important coupling

The app is operationally coupled to the main OLevels teacher portal, OLevels API, Firebase Auth project, Firestore collections, Realtime Database paths, and shared data conventions.

