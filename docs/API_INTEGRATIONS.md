# API Integrations

The following endpoints are directly observable in the current source. Backend behavior and authorization implementation are not included in this repository.

| Method | Endpoint | Use |
|---|---|---|
| `POST` | `/api/auth/exchange` | Exchange the shared teacher session proof for a Firebase custom token |
| `GET` | `/api/admin/getAllCourses` | Load courses for the weekly test dashboard |
| `GET` | `/api/admin/checker-usage-logs` | Load checker usage logs, filtered by type/student/date and limited to 500 in the current UI |
| `POST` | `/api/openai/generatePdfFromAssistant` | Student performance PDF-related backend integration |

The configured API base is formed from `VITE_API_BASE_URL`. The fetch wrapper adds a Firebase ID-token `Authorization` header to matching OLevels API requests when a Firebase user is available.

Realtime Database REST shallow reads use the Firebase ID token in the `auth` query parameter.

The repository does not verify backend routes, request validation, rate limits, response schemas, OpenAI implementation, or production API gateway behavior.

