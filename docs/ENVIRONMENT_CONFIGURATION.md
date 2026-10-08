# Environment Configuration

Only variable names are documented here. Secret or project-specific values are intentionally omitted.

## Variables observed

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_DATABASE_URL`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_USE_EMULATORS`
- `VITE_BASE_URL`
- `VITE_API_BASE_URL`

## Development

The local environment file points the app toward local teacher/API endpoints and contains Firebase client configuration. Exact values are not documented here.

## Production

`.env.production` sets production base/API URLs and disables emulator use. It is used by Vite during production builds.

The repository does not document secret management, environment injection in CI, or environment validation. Do not copy production values into documentation or commit new credentials.

