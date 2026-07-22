# STEP/3D Analytics Worker

Cloudflare Worker＋D1 anonymous aggregate analytics for the static STEP/3D GitHub Pages site.

- `POST /v1/event`: allowlisted anonymous usage event endpoint; CORS restricted by `ALLOWED_ORIGIN`.
- `GET /v1/stats?days=30`: aggregate API protected by `ADMIN_TOKEN`.
- `GET /admin`: responsive private dashboard; token is cleared from the input immediately after each request.
- `GET /health`: deployment health response.
- Daily cron removes visitor hashes and event receipts older than 180 days.

The API does not accept file names, model names, dimensions, geometry, hashes, arbitrary metadata, or arbitrary error messages. Production secrets are Cloudflare encrypted secret bindings, preview URLs and workers.dev are disabled, and the admin token is stored only in macOS Keychain outside the repository. See the repository root README for deployment steps.
