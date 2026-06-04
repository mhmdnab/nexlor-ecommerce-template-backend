# Deploying the API to Render

The NestJS API and its Postgres database both run on **Render**, provisioned from
[`render.yaml`](./render.yaml) (a Render Blueprint). This is its own Git repo —
push the contents of this `backend/` folder to GitHub, then point Render at it.

## 1. Push this folder to GitHub

```bash
# from inside backend/
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin git@github.com:<you>/nexlor-api.git
git push -u origin main
```

`.gitignore` already excludes `.env`, `node_modules/`, and `dist/`, so no secrets
are committed.

## 2. Create the service + database (Blueprint)

1. Render Dashboard → **New +** → **Blueprint**.
2. Connect the `nexlor-api` GitHub repo. Render reads `render.yaml` and proposes:
   - **nexlor-db** — a free managed Postgres.
   - **nexlor-api** — a free Node web service.
3. Apply. Render provisions the DB, injects `DATABASE_URL` into the web service,
   generates the JWT secrets, builds, runs `prisma migrate deploy`, and starts.

Build / start are defined in the Blueprint:

| Step  | Command |
| ----- | ------- |
| Build | `npm ci && npx prisma generate && npm run build` |
| Start | `npm run start:render` → `prisma migrate deploy && node dist/main.js` |
| Health| `GET /api/health` |

> **Free tier notes:** the free web service spins down after ~15 min idle (first
> request after that is slow), and the free Postgres expires after 90 days.
> Upgrade both before using this for real traffic.

## 3. Set `CORS_ORIGINS` after the frontends exist

`render.yaml` marks `CORS_ORIGINS` as `sync: false` (not set automatically). Once
the storefront and admin are live on Vercel, set it on the **nexlor-api** service:

```
CORS_ORIGINS=https://<storefront>.vercel.app,https://<admin>.vercel.app
```

Comma-separated, **no trailing slashes**. Save → Render redeploys. Without this,
browsers will block the frontend's requests.

## 4. Cookies & cross-site auth (read this)

Auth and the guest cart use **httpOnly cookies**. Because the frontend (Vercel)
and API (Render) are on **different domains**, the Blueprint sets:

```
COOKIE_DOMAIN=        (empty → host-only cookie on the API domain)
COOKIE_SECURE=true
COOKIE_SAMESITE=none
```

`SameSite=None; Secure` lets the browser send the cookie cross-site.

> ⚠️ **Safari / iOS block third-party cookies**, so cross-domain login can fail
> there. To make auth work in every browser, host the frontend and API on
> subdomains of **one** domain (e.g. `shop.example.com` + `api.example.com`):
> add the custom domains in Render/Vercel, point DNS, then set
> `COOKIE_DOMAIN=.example.com` and `COOKIE_SAMESITE=lax`.

## 5. Seed the database (once, optional)

The free plan has no shell, so seed from your machine against the **External**
connection string (Render → nexlor-db → *Connections* → External Database URL):

```bash
# from inside backend/
DATABASE_URL="postgresql://...@...render.com/nexlor_commerce?sslmode=require" \
  npm run db:seed
```

This creates the demo admin, categories, and products. The external URL **must**
include `?sslmode=require`.

## 6. Verify

```bash
curl https://<your-api>.onrender.com/api/health   # -> {"status":"ok"}
```

API docs (Swagger) are at `https://<your-api>.onrender.com/docs`.

## Environment variables reference

| Var | Local | Render (production) |
| --- | ----- | ------------------- |
| `NODE_ENV` | `development` | `production` |
| `PORT` | `4000` | injected by Render |
| `DATABASE_URL` | local Postgres | from `nexlor-db` (auto) |
| `CORS_ORIGINS` | localhost ports | your Vercel URLs |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | dev strings | generated (auto) |
| `COOKIE_DOMAIN` | `localhost` | empty |
| `COOKIE_SECURE` | `false` | `true` |
| `COOKIE_SAMESITE` | `lax` | `none` |
| `R2_*` | blank (uploads off) | set to enable image uploads |
