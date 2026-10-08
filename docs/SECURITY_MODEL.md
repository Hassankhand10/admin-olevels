# Security Model

## Verified controls

- Firebase client configuration is supplied through Vite environment variables.
- Shared teacher sessions are exchanged for Firebase custom tokens.
- Firebase ID tokens are used for authenticated API and Realtime Database access.
- Admin access is checked against shared RTDB teacher records.
- Assignment writes are directed to Firestore, with a guard preventing certain legacy RTDB assignment paths.
- Firebase Hosting uses SPA rewrites and explicit cache headers.

## Important risks and limitations

- Localhost bypasses authentication and authorization in the current code.
- Firebase Security Rules are not present, so server-side enforcement could not be verified.
- The frontend directly reads broad shared database branches for the size scanner.
- The app directly performs production grading and supervision writes.
- There is no visible route-specific permission model or audit-log implementation.
- The access-denied page is rendered through `document.body.innerHTML`.
- Production environment configuration is present in the repository by filename; secret values are not documented here.
- External file URLs are opened in new tabs by report/dashboard views.

These are documented findings only. They were not changed during the inspection/documentation task.

