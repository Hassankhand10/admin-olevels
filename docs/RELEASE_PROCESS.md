# Release Process

## Verified release mechanics

The repository provides these relevant commands:

```bash
npm run typecheck
npm run lint
npm run build
```

The generated `dist` directory is configured for Firebase Hosting deployment through `firebase.json` and the `admin-olevels` Firebase Hosting project.

## Recommended verification before release

Before any future release, verify the intended environment variables, run lint/typecheck/build, confirm authentication and admin authorization, test read-only reporting modules, and separately verify grading writes in an approved environment.

These checks are recommendations, not an existing verified release policy.

## Not verified

The repository does not contain a formal branching strategy, CI/CD workflow, review requirement, deployment approval process, versioning policy, changelog, rollback procedure, or production smoke-test checklist.

No release changes were made during this documentation task.

