# Backend — Student Learning Portal API

Standalone Express + MongoDB API. Deploy this folder on its own (Render, Railway, VPS, etc.).

## Run locally

```bash
cp .env.example .env
npm install
npm run dev
```

API: http://localhost:5000

## Required env

| Variable | Example |
|----------|---------|
| `MONGODB_URI` | your MongoDB connection string |
| `JWT_SECRET` | long random secret (students) |
| `JWT_ADMIN_SECRET` | different long random secret (admins) |
| `CLIENT_URL` | frontend origin(s), comma-separated |
| `COOKIE_SECURE` | `true` in production HTTPS cross-origin |

## Seed first admin

```bash
npm run seed:admin
```

Defaults (override with `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME`):

- email: `admin@portal.local`
- password: `Admin@12345`

Then open `/admin/login` on the frontend.

## Production notes

1. Set `CLIENT_URL` to your live frontend URL (e.g. `https://app.example.com`).
2. Set `COOKIE_SECURE=true` so auth cookies work across separate domains.
3. Deploy only this `backend` folder — no frontend build is required here.
4. Health check: `GET /api/health`
