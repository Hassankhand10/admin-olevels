# Local Development

## Prerequisites

The repository uses Node.js tooling, but the required Node.js version is not specified in the repository. Use a compatible Node/npm installation before running the commands below.

## Install dependencies

```bash
npm install
```

## Available scripts

```bash
npm run dev
npm run build
npm run preview
npm run typecheck
npm run lint
```

The development server uses Vite. The exact port is not declared in `vite.config.ts`; the local environment points the teacher portal base URL at `http://localhost:4200`.

## Firebase emulators

`src/config/firebase.ts` supports Auth, Realtime Database, and Firestore emulators when `VITE_USE_EMULATORS=true`. The configured emulator endpoints are Auth `127.0.0.1:9099`, Realtime Database `127.0.0.1:9000`, and Firestore `127.0.0.1:8080`.

The repository does not contain verified emulator seed data or a documented emulator startup command.

## Current validation status

ESLint completes without reported errors. TypeScript currently reports unused declarations/imports in `RealtimeDbSizePage.tsx` and `firebaseService.ts`; these are intentionally not fixed in this documentation task.

