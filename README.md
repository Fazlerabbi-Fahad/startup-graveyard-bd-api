# bdgy-api

REST API for an archive of failed Bangladeshi startups, written as business case studies. It serves:

- **bdgy-admin** (React + Vite): a private portal with a single admin user
- **bdgy-web** (Next.js): the public reading site

Stack: Node.js 20+, Express 5, Mongoose 9 (MongoDB), Zod 4, JWT in an httpOnly cookie, Cloudinary uploads, and the GA4 Data API. The code is JavaScript ES modules and the default port is 4000.

---

## Quick start

```bash
cd bdgy-api
npm install
cp .env.example .env        # then fill it in (see below)
npm run hash-password       # paste the output into .env
npm run seed                # 2 fictional draft case studies
npm run dev                 # http://localhost:4000/api/health
```

To test by hand, use `requests.http` (VS Code "REST Client" extension or JetBrains HTTP client).

For automated tests, run `npm test`. They need no setup: each test file starts its own in-memory MongoDB through `mongodb-memory-server`. The suite has one file per build step (`test/01-health` … `test/07-revalidation`) plus production-mode checks.

### Scripts

| Script | What it does |
| --- | --- |
| `npm start` | Start the API (production) |
| `npm run dev` | Start with `--watch` (auto-restart on change) |
| `npm run hash-password` | Prompt for a password (hidden input), print a bcrypt hash for `ADMIN_PASSWORD_HASH` |
| `npm run seed` | Upsert "Sample Startup One" and "Sample Startup Two" as **drafts**. Both are fictional. |
| `npm run seed -- --publish` | Same, but publish them so the public site has data to show |
| `npm test` | Run the test suite |

---

## Environment setup

Copy `.env.example` to `.env`. `.env` is git-ignored, so never commit it. The server validates every variable on boot and exits with a readable list if anything is wrong.

| Variable | Required | Notes |
| --- | --- | --- |
| `NODE_ENV` | yes | `development` or `production` |
| `PORT` | no | default `4000`. Render and Railway set this for you. |
| `MONGODB_URI` | yes | Atlas connection string including the db name, e.g. `.../bdgy?retryWrites=true&w=majority` |
| `JWT_SECRET` | yes | at least 32 chars. Generate: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `JWT_EXPIRES_IN` | no | default `7d`. The cookie lifetime matches it. |
| `ADMIN_EMAIL` | yes | the only account that can log in (case-insensitive) |
| `ADMIN_PASSWORD_HASH` | yes | bcrypt hash from `npm run hash-password` |
| `ADMIN_ORIGIN` | yes | e.g. `https://admin.example.com`. Exact origin, no trailing slash. |
| `WEB_ORIGIN` | yes | e.g. `https://example.com` |
| `CLOUDINARY_URL` | no | `cloudinary://KEY:SECRET@CLOUD`. Without it, uploads return `503`. |
| `GA4_PROPERTY_ID` | no | numeric property ID |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | no | **base64** of the service account key JSON |
| `NEXT_REVALIDATE_URL` | no | e.g. `https://example.com/api/revalidate`. Without it, revalidation is skipped and a warning is logged. |
| `REVALIDATE_SECRET` | no | shared secret, also configured on the Next.js side |
| `TRUST_PROXY` | no | number of reverse proxies. Defaults to `1` in production and `0` otherwise. Per-IP rate limits need it. |

## Generating the admin password hash

There is no registration endpoint and no users collection. The only admin is `ADMIN_EMAIL` + `ADMIN_PASSWORD_HASH`.

```bash
npm run hash-password
# Admin password:      (hidden, min 12 chars)
# Confirm password:
# ADMIN_PASSWORD_HASH='$2b$12$....'
```

Paste the printed line into `.env` and keep the single quotes. Bcrypt hashes contain `$`, which some tools would otherwise try to expand.

In the Render or Railway dashboard, paste the hash **without** quotes. A stray pair of surrounding single quotes is stripped automatically anyway.

To change the password, run the script again, replace the value and restart. Existing sessions stay valid until they expire. To log everyone out immediately, also rotate `JWT_SECRET`.

---

## GA4 analytics: service account setup

`GET /api/admin/analytics` reads GA4 through the **Google Analytics Data API**, using a service account. If `GA4_PROPERTY_ID` or `GOOGLE_SERVICE_ACCOUNT_JSON` is missing, the endpoint still returns the MongoDB data along with `{ "ga4": null, "reason": "not configured" }`.

1. **Create or select a Google Cloud project** at <https://console.cloud.google.com>.
2. **Enable the API.** Go to *APIs & Services → Library*, search for **"Google Analytics Data API"** and click *Enable*.
3. **Create the service account.** Go to *IAM & Admin → Service Accounts → Create service account*. Give it a name such as `bdgy-analytics`. It does **not** need any Cloud IAM roles, so skip that step.
4. **Create a key.** Open the service account, then *Keys → Add key → Create new key → JSON*. A `.json` file downloads. Treat it like a password.
   - If key creation is blocked by the org policy `iam.disableServiceAccountKeyCreation`, an org admin has to allow it for this project.
5. **Give the service account access to GA4.** In Google Analytics, go to *Admin → (Property column) Property access management → + → Add users*. Paste the service account's email (`bdgy-analytics@<project>.iam.gserviceaccount.com`), choose the **Viewer** role, uncheck "Notify by email" and click *Add*.
6. **Find the property ID.** In GA4, go to *Admin → Property settings* and copy the numeric **Property ID** (not the `G-XXXX` measurement ID). Put it in `GA4_PROPERTY_ID`.
7. **Base64-encode the key** and put the result in `GOOGLE_SERVICE_ACCOUNT_JSON`:
   ```bash
   # macOS
   base64 -i key.json | tr -d '\n'
   # Linux
   base64 -w0 key.json
   ```
   ```powershell
   # Windows PowerShell
   [Convert]::ToBase64String([IO.File]::ReadAllBytes("key.json"))
   ```
   Then delete the downloaded `key.json`, or store it in a password manager.

If the credentials are wrong or the service account wasn't added as a Viewer, the endpoint still returns `200`, with `ga4: null` and `reason: "GA4 request failed: ..."` explaining Google's error. GA4 results are cached in memory for 10 minutes per range.

GA4 reports dates in the property's time zone. The zero-filling of the daily series assumes `Asia/Dhaka` (see `src/services/ga4.js`).

---

## MongoDB Atlas network access

Atlas rejects connections from IPs that aren't on the project's access list.

1. In Atlas, go to *Security → Database Access* and create a database user with a **long random password**. Give it *Read and write to any database*, or scope it to the `bdgy` database.
2. Go to *Security → Network Access → Add IP Address*:
   - **Local development:** "Add current IP address".
   - **Render or Railway:** these platforms don't give a fixed outbound IP by default, so there are two options:
     - **Simplest:** allow `0.0.0.0/0` (access from anywhere). Security then rests on the strong DB password and TLS, which Atlas always requires. This is the common setup for small projects.
     - **Tighter:** use the platform's static outbound IPs. On Render, the service's *Connect → Outbound* panel lists them per region. Railway offers static outbound IPs on paid plans. Add those IPs or ranges instead of `0.0.0.0/0`.
3. Go to *Database → Connect → Drivers*, copy the `mongodb+srv://` URI, insert the password (URL-encode special characters) and add the database name before `?`. Example: `...mongodb.net/bdgy?retryWrites=true&w=majority`.

Indexes (`slug` unique, `status + publishedAt`, a text index on `name`, `tagline` and `sections.executiveSummary`, plus `viewCount` and the correction indexes) are created automatically on startup.

---

## Deploying

### Render

1. Push the repo to GitHub.
2. In Render, choose *New → Web Service* and pick the repo.
   - **Root Directory:** `bdgy-api` (if it's in a monorepo)
   - **Runtime:** Node
   - **Build command:** `npm ci`
   - **Start command:** `npm start`
   - **Health check path:** `/api/health` (under *Advanced*)
3. Add every required variable from the table above under *Environment*. Set `NODE_ENV=production`, and `NODE_VERSION=20` or newer if Render's default is older.
4. Deploy. Your URL will look like `https://bdgy-api.onrender.com`.
5. Seed once, if you want sample data: open the *Shell* tab and run `npm run seed`. Or run it locally with `MONGODB_URI` pointing at Atlas.

The free instance spins down when idle. The first request after a sleep takes about 30–60 seconds, and the in-memory caches and rate-limit counters reset.

### Railway

1. Choose *New Project → Deploy from GitHub repo*.
2. In the service's *Settings*:
   - **Root Directory:** `bdgy-api`
   - Build and start are auto-detected (`npm ci` and `npm start`).
   - **Healthcheck Path:** `/api/health`
3. Add the environment variables under *Variables*, with `NODE_ENV=production`.
4. Under *Settings → Networking → Generate Domain*, create a domain or attach a custom one.

### Production checklist

- `NODE_ENV=production`. This makes the auth cookie `Secure; SameSite=None`, hides stack traces and trusts one proxy hop.
- `ADMIN_ORIGIN` and `WEB_ORIGIN` exactly match the deployed front-end origins: `https`, no trailing slash. Any other browser origin gets no CORS headers, and its write requests to `/api/auth` and `/api/admin` are rejected.
- **Use custom domains under one registrable domain**, e.g. `api.example.com`, `admin.example.com` and `example.com`. Safari, and Chrome when third-party cookies are blocked, refuse cross-site cookies. Platform subdomains like `*.onrender.com` and `*.up.railway.app` count as *different sites* because they're on the Public Suffix List, so admin login can break there.
- The admin front end must send requests with `credentials: 'include'` (fetch) or `withCredentials: true` (axios).
- Keep one instance. The rate limiters, view-dedupe map and caches are in memory. If you scale out, move them to Redis.

---

## API reference

Base URL: `/api`. Every response is JSON.

**Errors** use one shape:

```json
{ "error": { "message": "Validation failed", "code": "VALIDATION_ERROR", "details": [{ "path": "atAGlance.sector", "message": "..." }] } }
```

Common codes: `VALIDATION_ERROR` / `BAD_REQUEST` (400), `UNAUTHORIZED` (401), `FORBIDDEN` (403, foreign Origin), `NOT_FOUND` (404), `DUPLICATE` (409), `PAYLOAD_TOO_LARGE` / `LIMIT_FILE_SIZE` (413), `PUBLISH_REQUIREMENTS_NOT_MET` (422), `RATE_LIMITED` (429), `UPLOADS_NOT_CONFIGURED` (503), `INTERNAL_ERROR` (500).

**Paginated lists** return:

```json
{ "items": [], "total": 0, "page": 1, "limit": 12, "totalPages": 1, "hasNextPage": false, "hasPrevPage": false }
```

### Case study document

```jsonc
{
  "_id": "…", "slug": "sample-startup-one", "status": "draft | published",
  "publishedAt": "ISO | null", "createdAt": "ISO", "updatedAt": "ISO", "lastVerifiedAt": "ISO | null",
  "name": "…", "tagline": "…", "logoUrl": "", "coverImageUrl": "",
  "atAGlance": {
    "sector": "Fintech | … | null", "city": "Dhaka | … | null",
    "foundedYear": 2017, "shutDownYear": 2021, "lifespanYears": 4,      // lifespanYears is computed
    "founders": [{ "name": "…", "role": "…" }],
    "fundingAmountUSD": 1500000, "fundingRounds": 2, "investors": ["…"],
    "outcome": "Shut down | Acquired | Dormant | Pivoted | null", "peakTeamSize": 85
  },
  "failureReasons": [{ "category": "Ran out of funding", "summary": "…" }],
  "sections": {                                                      // Markdown strings; never rendered server-side
    "executiveSummary": "", "companyBackground": "", "marketContext": "", "whatWentWrong": "",
    "whatCouldHaveBeenDone": "", "conclusion": "", "researchNotes": ""
  },
  "timeline": [{ "year": 2018, "month": 6, "event": "…" }],
  "lessons": ["…"],
  "competitors": [{ "name": "…", "url": "https://…" }],
  "sources": [{ "title": "…", "url": "https://…", "publisher": "…", "date": "2021-05" }],
  "readingTimeMinutes": 3,                                           // computed: words in all sections / 220
  "viewCount": 0
}
```

All URLs must be `http(s)`.

### Public

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/public/case-studies?sector=&reason=&city=&year=&q=&page=&limit=` | Published only, newest first (`publishedAt` desc). `reason` is a failure category, `year` is the shut-down year and `q` is a full-text search. Default `limit` is 12 (max 50). Items **exclude `sections`**. Invalid enum values return 400. |
| GET | `/public/case-studies/:slug` | Full published document plus `prevSlug` and `nextSlug`. `prevSlug` is the case study published just **before** this one, `nextSlug` the one just **after**. Either can be `null`. |
| POST | `/public/case-studies/:slug/view` | Returns `{ counted: true, viewCount }` or `{ counted: false }`. Each IP counts at most once per slug per 6 hours. Doesn't change `updatedAt`. |
| GET | `/public/stats` | `{ totalCaseStudies, totalFundingLostUSD, averageLifespanYears, byFailureCategory: [{category,count}], bySector: [{sector,count}], generatedAt }`. Every category and sector is listed, including zero counts. Cached for 10 minutes and refreshed on publish, unpublish, delete or edit of a published item. |
| GET | `/public/taxonomies` | `{ sectors, failureCategories, cities, outcomes }` |
| POST | `/public/corrections` | Body `{ caseStudySlug, name?, email?, message (10–5000 chars), website }`. `website` is a honeypot: when it's filled, the API returns 201 but stores nothing. The slug must belong to a published case study. Limited to 3 per hour per IP. Returns `201 { ok: true }`. |

### Auth

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/auth/login` | `{ email, password }` sets the httpOnly cookie `bdgy_admin` and returns `{ admin: { email } }`. A wrong email and a wrong password get the same `401`. Limited to 5 attempts per 15 minutes per IP. |
| POST | `/auth/logout` | Clears the cookie. Returns `{ ok: true }`. |
| GET | `/auth/me` | `{ admin: { email } }` or `401` |

### Admin (cookie required)

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/admin/case-studies?status=&slug=&q=&page=&limit=` | All statuses, sorted by `updatedAt` desc, without `sections`. `slug` is an exact match, used to resolve a correction's case study. |
| POST | `/admin/case-studies` | Creates a draft (`name` required). Returns `201` with the document. |
| GET | `/admin/case-studies/:id` | Full document |
| PUT | `/admin/case-studies/:id` | Partial or full update. Omitted fields stay unchanged. `atAGlance` and `sections` merge field by field, while arrays are replaced. Read-only keys (`_id`, `status`, `viewCount`, computed fields) are ignored, so you can send back a fetched document. An empty `slug` regenerates it from `name`; renaming doesn't change the slug. On a published item, an update that breaks the publish rules returns `422`. |
| DELETE | `/admin/case-studies/:id` | `{ ok: true, id, slug }` |
| POST | `/admin/case-studies/:id/publish` | Requires `tagline`, `sections.executiveSummary`, `sections.whatWentWrong` and at least one each of `failureReasons`, `lessons` and `sources`. If anything is missing it returns `422 { error: { code: "PUBLISH_REQUIREMENTS_NOT_MET", missing: [...] } }`. Re-publishing keeps the original `publishedAt`. |
| POST | `/admin/case-studies/:id/unpublish` | Sets the status back to draft |
| POST | `/admin/uploads` | `multipart/form-data` with field `file`. JPG, PNG or WebP only (checked by magic bytes), max 5 MB. Uploads to the Cloudinary folder `bdgy` and returns `201 { url, publicId, width, height, format, bytes }`. |
| GET | `/admin/analytics?range=7d\|28d\|90d` | `{ range, topCaseStudies: [{slug,name,status,viewCount,publishedAt}], ga4: { totals: {users,sessions,pageViews}, dailyUsers: [{date,users}], topPages: [{path,views}], topCountries: [{country,users}], topSources: [{source,sessions}] } }`, or `ga4: null` with a `reason` |
| GET | `/admin/corrections?status=&caseStudySlug=&page=&limit=` | Newest first |
| PATCH | `/admin/corrections/:id` | `{ status: "new" \| "resolved" }` |

### On-demand revalidation (contract for bdgy-web)

These actions make the API send `POST NEXT_REVALIDATE_URL` with `{ "secret": REVALIDATE_SECRET, "slug": "<slug>" }`:

- publish
- unpublish
- update of a published item (when the slug changes, both the old and the new slug are sent)
- delete of a published item

The call is fire-and-forget with a 5-second timeout. Failures are logged and never fail the admin request.

The Next.js route should check the secret, then revalidate `/case-studies/<slug>` plus any listing or home pages.

---

## Security notes

- `helmet`, a 1 MB JSON body limit, and Zod validation on every write and every query string.
- CORS is limited to `ADMIN_ORIGIN` and `WEB_ORIGIN` with `credentials: true`.
- The JWT lives in an httpOnly cookie, signed with HS256 and verified on every `/api/admin` request.
- CSRF: the cookie must be `SameSite=None` in production, so every state-changing request to `/api/auth` and `/api/admin` that carries a foreign `Origin` header is rejected with `403`.
- Login always runs bcrypt, even for an unknown email, so a wrong email and a wrong password take the same time and return the same error.
- In production, the central error handler returns only a generic message for unexpected errors: no stack traces.
- Markdown is stored as-is and never rendered to HTML on the server. The front ends must render it with a sanitizing renderer.
- Uploaded images are checked by their file content, not just by the declared mimetype.

## Project layout

```
src/
  server.js              boot: env -> Mongo -> listen, graceful shutdown
  app.js                 express app (middleware + routes)
  config/                env validation (zod), Mongo connection
  constants/taxonomies.js
  middleware/            requireAuth, validate, rate limiters, CORS/CSRF, error handler
  models/                CaseStudy, Correction
  routes/                health, auth, public (+ views, corrections), admin/*
  services/              stats, ga4, images (Cloudinary), revalidate
  utils/                 slug/word-count/publish rules, pagination, TTL cache, errors, logger
  validation/            zod schemas
scripts/                 hash-password.js, seed.js
test/                    node:test + supertest + mongodb-memory-server
requests.http            manual requests for every endpoint
```
