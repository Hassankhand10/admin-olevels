# Admin Portal Documentation

This documentation describes behavior verifiable from the current Admin repository. It does not define Firebase rules, backend implementation, undocumented operational procedures, or contracts not visible in source/configuration.

## Documents

- [Architecture](ARCHITECTURE.md)
- [Local development](LOCAL_DEVELOPMENT.md)
- [Environment configuration](ENVIRONMENT_CONFIGURATION.md)
- [Authentication and authorization](AUTHENTICATION_AND_AUTHORIZATION.md)
- [Routes and modules](ROUTES_AND_MODULES.md)
- [API integrations](API_INTEGRATIONS.md)
- [Firebase projects and environments](FIREBASE_PROJECTS_AND_ENVIRONMENTS.md)
- [Firestore schema](FIRESTORE_SCHEMA.md)
- [Realtime Database schema](REALTIME_DATABASE_SCHEMA.md)
- [Security model](SECURITY_MODEL.md)
- [Deployment](DEPLOYMENT.md)
- [Troubleshooting](TROUBLESHOOTING.md)
- [Release process](RELEASE_PROCESS.md)

## Scope and verification

The documents are based on `src/`, package manifests, Vite/TypeScript configuration, `.env` variable names, Firebase Hosting configuration, and `.firebaserc`. Secret values are intentionally omitted.

Not verified from this repository: backend/API implementation, Firebase Security Rules, CI/CD configuration, production deployment history, backend database indexes, and the complete main OLevels system implementation.

