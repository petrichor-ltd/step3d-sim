# STEP/3D Analytics Worker

Cloudflare Worker＋D1 anonymous aggregate analytics for the static STEP/3D GitHub Pages site.

- `POST /v1/event`: allowlisted anonymous usage event endpoint; CORS restricted by `ALLOWED_ORIGIN`.
- `GET /v1/public-stats`: public total page views and anonymous sessions active in the last three minutes.
- `GET /v1/stats?days=30`: aggregate API protected by `ADMIN_TOKEN`.
- `GET /admin`: responsive private dashboard; token is cleared from the input immediately after each request.
- `GET /health`: deployment health response.
- Daily cron removes visitor hashes and event receipts older than 180 days, plus stale active-session rows.

The heartbeat stores only a salted session hash and last-seen epoch; it does not increment page views. The API does not accept file names, model names, dimensions, geometry, hashes, arbitrary metadata, or arbitrary error messages. Production secrets are Cloudflare encrypted secret bindings, preview URLs and workers.dev are disabled, and the admin token is stored only in macOS Keychain outside the repository. Production is routed through `/api/analytics/*` on the existing site hostname, avoiding a separate analytics DNS dependency. See the repository root README for deployment steps.
