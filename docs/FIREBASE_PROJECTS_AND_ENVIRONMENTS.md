# Firebase Projects and Environments

## Separate project roles

The repository distinguishes between two Firebase project contexts:

- Hosting project: `admin-olevels`, selected by `.firebaserc`.
- Shared OLevels Firebase/data project: `olevels-live`, referenced by the Firebase environment configuration used by the app.

The Hosting project serves the compiled Admin frontend. The shared OLevels project provides the Firebase Authentication, Realtime Database, and Firestore resources consumed by the Admin app.

## Development

Development configuration points to local API/teacher URLs and can optionally connect to local Firebase emulators through `VITE_USE_EMULATORS`.

## Production

Production configuration points to the live OLevels base/API URLs and disables emulator use. Firebase Hosting serves `dist` from the `admin-olevels` hosting project.

The repository does not verify project-level IAM, Firebase rules, deployment history, or whether all environments use identical indexes and schemas.

