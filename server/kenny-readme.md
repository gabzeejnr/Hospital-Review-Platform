# Dreel — Hospital Review Platform: Backend

# Dreel — Hospital Review Platform: Backend

Express 5 API for the Hospital Review Platform (Nigeria first). Authentication is handled by Supabase Auth, data lives in Supabase Postgres, and the app talks to the database through Prisma 7 with the `pg` driver adapter.

> **Keep this README up to date.** Every time a file is added, changed or removed, update this file and the change log at the bottom in the same step.

---

## 1. How this code got here (read this first)

* **Original files** (marked *original* below) came from the backend zip uploaded on 2026-11-21. They were built before the hardening work started.
* **Files marked *added* or *updated*** were created or changed during the hardening work (the database SSL fix and roadmap tasks 1-6b).
* No code has been edited by hand: every change was applied exactly as supplied, so this README describes the current state of the project.
* The files marked *added* or *updated* are what has been **delivered**. Use the install checklist in section 8 to tick off what has been applied, and correct this README if any delivered file has not been applied yet.

---

## 2. Roadmap status


| #  | Task                                                                                                                                                                                                                | Status                         |
| -- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| 1  | API rate limiting                                                                                                                                                                                                   | Delivered                      |
| 2  | Request validation and sanitization                                                                                                                                                                                 | Delivered                      |
| 3  | Centralized error handling                                                                                                                                                                                          | Delivered                      |
| 4  | Security hardening (Helmet, CORS, token handling, audit logging, enumeration protection)                                                                                                                            | Delivered                      |
| 5  | User profile and preferences (notifications, language, timezone, theme)                                                                                                                                             | Delivered                      |
| 6  | Hospital functionality:**6a hospital directory: delivered. 6b reviews, ratings and basic moderation: delivered.**6c claims and verification, 6d reports, hospital responses and the moderation history: not started | In progress                    |
| 7  | Role management: admin-only role changes, and a guard that stops the last admin being changed                                                                                                                       | Not started (last on the list) |
| – | Manual: raise the minimum password length to 8 in the Supabase dashboard's auth settings                                                                                                                            | Needs doing by you             |

---

## 3. Project structure

```
backend/
├── server.js
├── package.json / package-lock.json
├── .env                      (secrets, never commit)
├── .gitignore
├── prisma7.config.ts
├── schema.prisma.backup
├── skills-lock.json
├── README.md
│
├── controllers/
│   ├── auth.controller.js
│   ├── user.controller.js
│   ├── hospital.controller.js
│   ├── location.controller.js
│   ├── review.controller.js
│   └── moderation.controller.js
│
├── prisma/
│   ├── schema.prisma
│   ├── baseline.prisma
│   ├── superbase-auth-trigger.sql
│   └── migrations/
│       ├── 0_init/migration.sql
│       ├── 20261120_add_auth_tables/migration.sql
│       └── 20261122_add_reviews/migration.sql
│
└── src/
    ├── config/
    │   ├── prisma.js
    │   ├── supabase.js
    │   ├── swagger.js
    │   ├── cors.js
    │   └── test*.js            (diagnostic scripts)
    ├── middleware/
    │   ├── auth.middleware.js
    │   ├── errorHandler.js
    │   ├── rateLimiter.js
    │   ├── requestId.js
    │   ├── security.js
    │   └── validate.js
    ├── routes/
    │   ├── authRoutes.js
    │   ├── userRoutes.js
    │   ├── hospitalRoutes.js
    │   ├── locationRoutes.js
    │   ├── reviewRoutes.js
    │   └── moderationRoutes.js
    ├── services/
    │   └── audit.service.js
    ├── utils/
    │   ├── ApiError.js
    │   ├── formatZodIssues.js
    │   ├── geo.js
    │   ├── hospitalDetails.js
    │   ├── phone.js
    │   └── requestContext.js
    └── validation/
        ├── common.js
        ├── auth.schemas.js
        ├── user.schemas.js
        ├── hospital.schemas.js
        └── review.schemas.js
```

---

## 4. File reference

### Root


| File                                                                                                                           | Origin                          | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `server.js`                                                                                                                    | original, updated (tasks 1–6b) | App entry point. Sets`trust proxy`(when`TRUST_PROXY`is set), then registers middleware in this order: request ID → Helmet → CORS → JSON body parser (10 KB limit) → Swagger docs (hidden in production unless`ENABLE_API_DOCS=true`) →`GET /`→`/api`rate limiter →`/api/hospitals`and`/api/states`(public directory) →`/api/auth`routes and`/api/users`routes (both with`no-store`caching) →`/api/reviews`and`/api/moderation`routes (also`no-store`) → 404 handler → central error handler. Starts the server on`PORT`(default 5000). |
| `package.json`                                                                                                                 | original                        | Dependencies and scripts (`npm run dev`= watch mode,`npm start`).**Needs`express-rate-limit`,`zod`and`helmet`added**(`npm install express-rate-limit zod helmet`). It still has a`postinstall`script (`prisma skills sync`) that creates the AI-skill folders listed below; it can be removed.                                                                                                                                                                                                                                                    |
| `package-lock.json`                                                                                                            | original                        | Exact dependency versions. Generated by npm; don't edit.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `.env`                                                                                                                         | original                        | Secrets and settings. Never commit or share it. Variables are listed in section 6.                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `.gitignore`                                                                                                                   | original                        | Keeps`node_modules/`,`.env`and`/generated/prisma`out of git.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `prisma7.config.ts`                                                                                                            | original                        | Prisma CLI configuration (schema path, migrations path, database URL).**Misnamed:**Prisma only auto-loads`prisma.config.ts`. It also still reads`DIRECT_URL`; the plan is to switch it to`DATABASE_URL`. See section 9.                                                                                                                                                                                                                                                                                                                           |
| `schema.prisma.backup`                                                                                                         | original                        | Backup of an earlier, larger schema design (29 models: reviews, ratings, claims, moderation, favourites, notifications, audit log and more). Not used by the app. It is the starting point for task 6.                                                                                                                                                                                                                                                                                                                                            |
| `skills-lock.json`and the hidden AI-tool folders in the project root (`.agents/`,`.cursor/`,`.devin/`,`.windsurf/`and similar) | original                        | AI-assistant "skill" files created by`prisma skills sync`. Not part of the application; safe to delete.                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `generated/prisma/`                                                                                                            | original                        | An old generated Prisma client from the larger schema. Stale and unused (the app imports`@prisma/client`). Git-ignored; safe to delete.                                                                                                                                                                                                                                                                                                                                                                                                           |
| `README.md`                                                                                                                    | added                           | This file.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |

### `controllers/`


| File                       | Origin                         | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| -------------------------- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `auth.controller.js`       | original, updated (tasks 1–4) | The auth handlers:`register`,`login`,`logout`,`getMe`,`forgotPassword`,`resendConfirmation`. Supabase creates and signs in accounts; Prisma reads and updates the`users`table. Errors are thrown and handled centrally. Registration returns the same 201 response for new and already-registered emails (account-enumeration protection) and builds its response from the signup result with no database read. Audit events are written fire-and-forget.                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `user.controller.js`       | added (task 5)                 | Profile and notification-preference handlers for the signed-in user only:`getProfile`,`updateProfile`(a taken username returns 409`USERNAME_TAKEN`),`getNotificationPreferences`(creates the default row on first use) and`updateNotificationPreferences`. No user ID appears in any URL, so one user can never reach another's data. Audit events store field names, never values.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `hospital.controller.js`   | added (tasks 6a, 6b)           | Public hospital directory:`listHospitals`(text search, filters, sorting, pagination and near-me search),`getHospital`and`getHospitalFilters`. Search text is matched word by word against name, city, LGA and state with`%`,`_`and`\`treated literally. Near-me search lets the database discard everything outside a bounding box, then works out exact distances (haversine) for the rest. Detail pages include a`details`object built from`hospital_data`by`src/utils/hospitalDetails.js`; the raw column is never sent. The public only sees three verification states (`verified`,`claimed`,`unclaimed`); the seven internal workflow values are mapped in`PUBLIC_VERIFICATION_STATUS`, so a rejected claim or a suspension is never shown. Every hospital carries its`rating`(average and count of published reviews), and`sort=rating`ranks by a damped score so one 5-star review does not beat a well-reviewed hospital. |
| `location.controller.js`   | added (task 6a)                | `listStates`and`listLgas`: reference data for the search filters, with hospital counts, cacheable for an hour.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `review.controller.js`     | added (task 6b)                | Reviews. Public:`listHospitalReviews`and`getRatingSummary`(average, star distribution, category averages). Signed-in authors:`createReview`(one per hospital per user, email must be confirmed, held for moderation unless`REVIEWS_REQUIRE_MODERATION=false`),`updateReview`(editing the wording, ratings or department sends it back to moderation),`deleteReview`and`getMyReviews`. Anonymous reviews, and reviews of deleted accounts, show the author as "Anonymous".                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `moderation.controller.js` | added (task 6b)                | For moderators and admins:`listReviewQueue`(oldest first),`approveReview`and`rejectReview`(a reason is required; it also takes down a published review). Each action is one atomic database step, so two moderators acting at once cannot both succeed, and nobody can moderate their own review.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `hospitalControllers.js`   | original                       | Empty placeholder, now superseded by`hospital.controller.js`.**Delete it.**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

### `prisma/`


| File                                                | Origin                      | What it does                                                                                                                                                                                                                                                                                                                                                      |
| --------------------------------------------------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `schema.prisma`                                     | original, updated (task 6b) | The current database models:`hospital_types`,`hospitals`,`lgas`,`states`(introspected from Supabase), plus`User`(table`users`),`NotificationPreference`,`LoginActivity`,`SecurityEvent`and the enums`UserRole`and`Theme`. Age/consent fields are**not**added yet (paused by you). Task 6b adds`Review`,`ReviewRating`and`HospitalRatingStats`and their relations. |
| `baseline.prisma`                                   | original                    | Snapshot of the hospital/state/LGA models used to create the baseline migration. Not used at runtime.                                                                                                                                                                                                                                                             |
| `superbase-auth-trigger.sql`                        | original                    | SQL run in Supabase that creates a row in`public.users`whenever a Supabase Auth user is created (the filename has a typo, "superbase"). It only fires on insert, so`email_verified_at`is refreshed at login rather than when the confirmation link is clicked.                                                                                                    |
| `migrations/0_init/migration.sql`                   | original                    | Baseline migration for the existing hospital, state and LGA tables.**Saved as UTF-16**(a PowerShell redirect side effect); convert it to UTF-8 before running Prisma migrate commands.                                                                                                                                                                            |
| `migrations/20261120_add_auth_tables/migration.sql` | original                    | Creates`users`,`notification_preferences`,`login_activities`and`security_events`(with row-level security enabled).                                                                                                                                                                                                                                                |
| `migrations/20261122_add_reviews/migration.sql`     | added (task 6b)             | Creates`reviews`,`review_ratings`and`hospital_rating_stats`with their constraints, and the triggers that keep each hospital's rating up to date (including a statistics row for every hospital).**Run it once in the Supabase SQL editor**; Prisma only reads these tables.                                                                                       |

### `src/config/`


| File                                                                                              | Origin                      | What it does                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `prisma.js`                                                                                       | original, updated (SSL fix) | Creates the single Prisma client. Uses a`pg`pool with SSL (certificate check relaxed for development), keep-alive, and a**connection-level retry**(up to 6 attempts) because opening connections to Supabase's pooler fails intermittently. Also exports`pool`. |
| `supabase.js`                                                                                     | original                    | `createSupabaseAuthClient()`makes a fresh Supabase client (no session persistence) for sign-up, sign-in and similar calls. The default export is a shared client used only to verify access tokens. Needs`SUPABASE_URL`and`SUPABASE_ANON_KEY`.                  |
| `swagger.js`                                                                                      | original                    | OpenAPI settings for the docs page at`/api-docs`; reads the`@swagger`comments in`src/routes/*.js`.                                                                                                                                                              |
| `cors.js`                                                                                         | added (task 4)              | CORS allowlist. Reads`CORS_ORIGINS`(falls back to`FRONTEND_URL`, then to`localhost:3000`and`localhost:5173`outside production). Blocked origins get a 403`CORS_ERROR`. Exposes`X-Request-Id`,`Retry-After`and`RateLimit`headers to browser code.                |
| `testDB.js`,`testPrisma.js`,`testSslByte.js`(+`testRetry.js`,`testConnect.js`if you created them) | original/added              | Diagnostic scripts from the database SSL investigation. Not used by the app; safe to delete. Note that`testPrisma.js`holds a no-SSL connection test despite its name.                                                                                           |

### `src/middleware/`


| File                 | Origin                         | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| -------------------- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `auth.middleware.js` | original, updated (tasks 3–4) | `authenticate`: checks the Bearer token (shape check first, then Supabase`getUser`), loads the user from the database, rejects deactivated accounts, sets`req.user`and`req.accessToken`.`authorize(...roles)`: role check for later routes.                                                                                                                                                                                                                                                                                                                                               |
| `rateLimiter.js`     | added (tasks 1, 3, 6)          | Rate limiters: general API, register, login (failed attempts only, per IP and per IP + email), forgot-password and resend-confirmation (per IP and per target email), and`sensitiveLimiter`for signed-in users (30 per 15 minutes per user; used on the profile and notification update routes),`searchLimiter`(60 hospital searches per minute per IP),`reviewCreateLimiter`(5 new reviews per user per day) and`moderationLimiter`(300 actions per 15 minutes per moderator). 429 responses include`code`and`requestId`. In-memory store: resets on restart and covers one server only. |
| `validate.js`        | added (tasks 2, 3)             | `validate({ body, params, query })`runs Zod schemas, replaces`req.body`/`req.params`with the cleaned data (parsed query is`req.validatedQuery`) and forwards failures as a`ValidationError`.                                                                                                                                                                                                                                                                                                                                                                                              |
| `errorHandler.js`    | added (task 3)                 | `notFoundHandler`(404) and`errorHandler`. Maps Prisma errors (connection failures become 503 with`Retry-After`), Supabase auth errors, Zod errors, bad or oversized JSON and unknown errors to a safe JSON shape. Logs server errors with the request ID. Hides internals in production; adds a`debug`field in development.                                                                                                                                                                                                                                                               |
| `requestId.js`       | added (tasks 3, 4)             | Gives each request an ID (`req.id`,`X-Request-Id`header) and stores the ID, client IP and user agent in the request context for audit logging.                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `security.js`        | added (task 4)                 | `securityHeaders`(Helmet; the`/api-docs`pages skip only the CSP so Swagger UI works) and`noStore`(no caching of auth responses).                                                                                                                                                                                                                                                                                                                                                                                                                                                          |

### `src/routes/`


| File                  | Origin                         | What it does                                                                                                                                                                                                                                                                                                                 |
| --------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `authRoutes.js`       | original, updated (tasks 1–2) | Defines the`/api/auth/*`routes (section 5) and wires each one as: rate limiter → validation → controller. Holds the Swagger documentation comments.                                                                                                                                                                        |
| `userRoutes.js`       | added (task 5)                 | The`/api/users/*`routes (section 5). Every route requires a signed-in user; the update routes also go through`sensitiveLimiter`and validation. Holds the Swagger comments. Also`GET /me/reviews`.                                                                                                                            |
| `hospitalRoutes.js`   | added (task 6a)                | `/api/hospitals`:`GET /filters`,`GET /`(search; goes through`searchLimiter`and validation) and`GET /:id`.`/filters`is declared first so it is not read as an ID. Holds the Swagger comments. Also the review routes:`GET /:id/reviews`,`GET /:id/rating-summary`and`POST /:id/reviews`(sign-in, daily limit and validation). |
| `locationRoutes.js`   | added (task 6a)                | `/api/states`:`GET /`and`GET /:stateId/lgas`.                                                                                                                                                                                                                                                                                |
| `reviewRoutes.js`     | added (task 6b)                | `/api/reviews`:`PATCH /:id`and`DELETE /:id`for your own reviews. Everything requires sign-in.                                                                                                                                                                                                                                |
| `moderationRoutes.js` | added (task 6b)                | `/api/moderation`: the review queue, approve and reject. The whole router is behind`authenticate`,`authorize("MODERATOR", "ADMIN")`and`moderationLimiter`; the role is read from the database on every request.                                                                                                              |

### `src/services/`


| File               | Origin         | What it does                                                                                                                                                                                                                                                                                                              |
| ------------------ | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `audit.service.js` | added (task 4) | `recordSecurityEvent(userId, eventType, metadata)`writes to`security_events`(adds request ID, IP and user agent automatically);`recordLogin(...)`writes to`login_activities`;`hashEmail(email)`makes the short hash stored instead of an address. They never throw; call them with`void`so they don't delay the response. |

### `src/utils/`


| File                 | Origin          | What it does                                                                                                                                                                                                                                                                                                                     |
| -------------------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ApiError.js`        | added (task 3)  | `ApiError(status, message, { code, errors, headers })`and`ValidationError`. Throw these from controllers; the central handler formats them.                                                                                                                                                                                      |
| `formatZodIssues.js` | added (task 3)  | Turns Zod issues into`[{ field, message }]`without ever echoing submitted values.                                                                                                                                                                                                                                                |
| `requestContext.js`  | added (task 4)  | Per-request storage (request ID, IP, user agent) so audit logging can read them without passing`req`around.                                                                                                                                                                                                                      |
| `geo.js`             | added (task 6a) | `distanceKm`(haversine) and`boundingBox`for near-me search.                                                                                                                                                                                                                                                                      |
| `hospitalDetails.js` | added (task 6a) | The only route from the unvetted`hospitals.hospital_data`column to the public API.`publicHospitalDetails()`builds a small, strictly checked`details`object (website, phone numbers, emails, opening hours, services, facilities, insurance, accreditation) and ignores everything else, including images and social-media links. |
| `phone.js`           | added (task 6a) | `normalizePhone`and the E.164 pattern, shared by user profiles and hospital contact details. Hospital numbers also accept Nigerian landlines such as`01 234 5678`.                                                                                                                                                               |

### `src/validation/`


| File                  | Origin             | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --------------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `common.js`           | added (tasks 2, 5) | Reusable rules: email, new-password and login-password, display name, UUID, integer IDs (route/body), pagination query.                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `auth.schemas.js`     | added (task 2)     | Strict body schemas for register, login, forgot-password, resend-confirmation and logout. Unknown fields are rejected.                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `user.schemas.js`     | added (task 5)     | Rules for profile and notification updates. Username (3-30 characters, starts with a letter, lower-cased, reserved names blocked), phone number (stored as`+234…`; Nigerian local numbers are converted, via`src/utils/phone.js`), avatar URL (only files in this project's Supabase Storage), language (`en`,`yo`,`ig`,`ha`,`pcm`: edit`SUPPORTED_LANGUAGES`to change), IANA timezone, theme (light/dark/system in any case) and the notification flags. Unknown fields are rejected, and`securityAlerts`, email and role cannot be changed here.            |
| `hospital.schemas.js` | added (task 6a)    | Query and parameter rules for the directory: search text (2-100 characters), state / LGA / type IDs, ownership (`federal`,`state`or`private`, any letter case),`lat`and`lng`(must come together),`radiusKm`(1-100),`sort`(`name`,`newest`,`rating`,`distance`),`page`,`limit`(max 50), UUID hospital IDs and state IDs. Unknown query parameters are rejected.                                                                                                                                                                                                 |
| `review.schemas.js`   | added (task 6b)    | Rules for reviews: title 3-150 characters, review text 20-5000 characters (links refused, plain text only), overall rating 1-5, optional ratings for eight categories (`staff_professionalism`,`waiting_time`,`cleanliness`,`communication`,`service_experience`,`facility_quality`,`billing_transparency`,`accessibility`), a real visit date (not in the future, within 10 years), department,`isAnonymous`. Status, owner, hospital and dates can never be set by the client. Also the moderation reason (5-500 characters) and the list and queue queries. |

---

## 5. API endpoints


| Method and path                                | Auth               | Notes                                                                                                                                                                                                                                                                                                                                                                            |
| ---------------------------------------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /`                                        | none               | Basic status message.                                                                                                                                                                                                                                                                                                                                                            |
| `GET /api-docs`                                | none               | Swagger UI (production: only with`ENABLE_API_DOCS=true`).                                                                                                                                                                                                                                                                                                                        |
| `GET /api/hospitals`                           | none               | Search and list. Parameters:`q`,`stateId`,`lgaId`,`typeId`,`ownership`(`federal`/`state`/`private`),`lat`+`lng`(+`radiusKm`, default 25),`sort`(`name`,`newest`,`rating`,`distance`),`page`,`limit`. Every hospital includes`rating`(average and count of published reviews). With`lat`and`lng`results are nearest first and include`distanceKm`. 60 searches per minute per IP. |
| `GET /api/hospitals/filters`                   | none               | Hospital types, and the three ownership values with labels and counts (all three always listed), for the search filters. Cacheable for an hour.                                                                                                                                                                                                                                  |
| `GET /api/hospitals/:id`                       | none               | One hospital with description, year established, accessibility information and, when valid data exists,`details`(website, phone numbers, emails, opening hours, services, facilities, insurance, accreditation). 404`HOSPITAL_NOT_FOUND`if unknown.                                                                                                                              |
| `GET /api/states`                              | none               | All states with hospital counts.                                                                                                                                                                                                                                                                                                                                                 |
| `GET /api/states/:stateId/lgas`                | none               | The LGAs of a state with hospital counts. 404`STATE_NOT_FOUND`if unknown.                                                                                                                                                                                                                                                                                                        |
| `GET /api/hospitals/:id/reviews`               | none               | Published reviews, 10 per page by default.`sort`:`newest`(default),`oldest`,`highest`,`lowest`.                                                                                                                                                                                                                                                                                  |
| `GET /api/hospitals/:id/rating-summary`        | none               | Average rating, review count, how many reviews gave each star rating, and the average per category.                                                                                                                                                                                                                                                                              |
| `POST /api/hospitals/:id/reviews`              | Bearer             | Write a review. Needs a confirmed email. One per hospital per user (409`REVIEW_ALREADY_EXISTS`), 5 new reviews per user per day. Returns the review with its status.                                                                                                                                                                                                             |
| `PATCH /api/reviews/:id`                       | Bearer             | Edit your own review (404 for anyone else's). Changing the wording, ratings or department sends it back to moderation.                                                                                                                                                                                                                                                           |
| `DELETE /api/reviews/:id`                      | Bearer             | Delete your own review. You can then write a new one.                                                                                                                                                                                                                                                                                                                            |
| `GET /api/users/me/reviews`                    | Bearer             | Your own reviews in every status, with the moderator's reason for rejected ones. Filter with`status`.                                                                                                                                                                                                                                                                            |
| `GET /api/moderation/reviews`                  | Moderator or admin | The queue (`status`, default`pending_moderation`), oldest first. Shows each author's id and name, never an email.                                                                                                                                                                                                                                                                |
| `POST /api/moderation/reviews/:id/approve`     | Moderator or admin | Publish a pending or rejected review (409 if already moderated; 403 for your own).                                                                                                                                                                                                                                                                                               |
| `POST /api/moderation/reviews/:id/reject`      | Moderator or admin | Body`{ "reason": "…" }`. Rejects a pending review or takes down a published one.                                                                                                                                                                                                                                                                                                |
| `POST /api/auth/register`                      | none               | Limited to 10/hour per IP. Same response for new and existing emails.                                                                                                                                                                                                                                                                                                            |
| `POST /api/auth/login`                         | none               | 5 failed attempts per 15 min per IP + email.                                                                                                                                                                                                                                                                                                                                     |
| `POST /api/auth/forgot-password`               | none               | 3/hour per email address. Always answers 200.                                                                                                                                                                                                                                                                                                                                    |
| `POST /api/auth/resend-confirmation`           | none               | 3/hour per email address. Always answers 200.                                                                                                                                                                                                                                                                                                                                    |
| `POST /api/auth/logout`                        | Bearer             | Body:`{ "refreshToken": "…" }`.                                                                                                                                                                                                                                                                                                                                                 |
| `GET /api/auth/me`                             | Bearer             | Returns the signed-in user.                                                                                                                                                                                                                                                                                                                                                      |
| `GET /api/users/me`                            | Bearer             | Full profile: name, username, avatar, phone, language, timezone, theme and more.                                                                                                                                                                                                                                                                                                 |
| `PATCH /api/users/me`                          | Bearer             | Update any of those fields (send only what changes;`null`clears name, username, phone and avatar). 30 changes per 15 min per user.                                                                                                                                                                                                                                               |
| `GET /api/users/me/notification-preferences`   | Bearer             | Returns the settings, creating defaults on first use.                                                                                                                                                                                                                                                                                                                            |
| `PATCH /api/users/me/notification-preferences` | Bearer             | Update notification switches. Security alerts can't be turned off.                                                                                                                                                                                                                                                                                                               |

All error responses look like: `{ "success": false, "message": "…", "code": "…", "requestId": "…", "errors": [{ "field", "message" }] }` (`errors` appears only for validation failures).

### Database rules the API relies on

These are CHECK constraints on the `hospitals` table in Supabase (they do not appear in the migration files):


| Column                | Allowed values                                                                                                                                                      |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ownership`           | `federal`,`state`,`private`                                                                                                                                         |
| `verification_status` | `unclaimed`,`claim_pending`,`claimed`,`verification_pending`,`verified`,`rejected`,`suspended`(the workflow for claiming and verifying a hospital, used in task 6c) |
| `year_established`    | empty, or between 1000 and 9999                                                                                                                                     |

Public responses show `verificationStatus` as only `verified`, `claimed` or `unclaimed`.

Rules added by the reviews migration (task 6b):


| Table and column                                 | Rule                                                                                                             |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| `reviews.overall_rating`,`review_ratings.rating` | 1 to 5                                                                                                           |
| `reviews.status`                                 | `pending_moderation`,`published`,`rejected`,`removed`(`removed`is reserved for the moderation work in task 6d)   |
| `reviews.title`,`reviews.comment`                | 3-150 and 20-5000 characters                                                                                     |
| `reviews.published_at`                           | set exactly when the status is`published`                                                                        |
| `reviews (user_id, hospital_id)`                 | unique: one review per user per hospital.`user_id`becomes empty when an account is deleted, and the review stays |
| `review_ratings (review_id, category)`           | unique, and the category must be one of the eight names above                                                    |

### How reviews work

* **Lifecycle:** a new review is `pending_moderation`. A moderator approves it (`published`) or rejects it with a reason (`rejected`). An author can edit a rejected review, which sends it back to `pending_moderation`. Setting `REVIEWS_REQUIRE_MODERATION=false` publishes reviews immediately (useful while testing).
* **Editing:** changing the title, comment, overall rating, category ratings or department re-queues the review, and while it waits it is hidden and not counted. Changing only `isAnonymous` or the visit date does not.
* **Ratings:** a hospital's average counts published reviews only. Database triggers keep `hospital_rating_stats` correct however a review changes (API, SQL editor, deletion), and they serialize overlapping updates per hospital. `ranking_score` is a damped average, `(count × average + 5 × 3.5) ÷ (count + 5)`, and is 0 for hospitals without reviews, which is what `sort=rating` uses.
* **Privacy:** anonymous reviews, and reviews whose author deleted their account, show "Anonymous". Moderators can still see who wrote a review, so abuse can be dealt with. The audit log records review ids, never review text.
* **Who moderates:** accounts with the role `MODERATOR` or `ADMIN`. Until task 7 (role management) exists, grant a role in the Supabase SQL editor: `update users set role = 'MODERATOR' where email = 'someone@example.com';` and the change applies on the next request.
* **Reviews are plain text.** Links are refused, but the frontend must still show them as text, never as HTML.

### What `hospital_data` holds and what the public sees

`hospitals.hospital_data` is imported, unvetted JSON. In the one sample checked (University College Hospital, Ibadan) it contained spam image links on what looks like a hijacked subdomain (gambling-site file names), social-media links belonging to an unrelated company, and placeholders such as "TBD - TBD" and "unknown". It is therefore never sent as it is.


| Part of`hospital_data`                                                                     | Shown publicly?                                                                                              |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `contact.website`                                                                          | Yes, if it is a valid http(s) address without embedded passwords                                             |
| `contact.phone_number`,`contact.email`                                                     | Yes, if valid; phone numbers are converted to`+234…`format                                                  |
| `info.hours`,`info.insurance`,`info.facilities`,`info.accreditation`,`services`            | Yes, as clean plain text: placeholders, markup and duplicates removed, at most 30 items, 100 characters each |
| `images`(hero image, icon)                                                                 | **No**: spam risk                                                                                            |
| `contact.social_media`                                                                     | **No**: wrong accounts were found                                                                            |
| everything else (`location`,`ownership`,`hospital_type`,`verification_status`, other keys) | No: the real table columns are used instead                                                                  |

Audit queries to run in the Supabase SQL editor (read-only):

```sql
-- Which hosts do hero images come from?
select coalesce(substring(hospital_data->'images'->>'hero_image' from '^https?://([^/]+)'), '(none)') as host, count(*)
from hospitals group by 1 order by 2 desc limit 20;

-- Anything that looks like gambling spam?
select id, hospital_name, hospital_data->'images' as images, hospital_data->'contact'->>'website' as website
from hospitals where hospital_data::text ~* '(toto|slot|gacor|togel|judi|casino|poker)' limit 50;

-- Is the TeePublic social link a bulk default?
select hospital_data->'contact'->'social_media'->>'twitter' as twitter, count(*)
from hospitals group by 1 order by 2 desc limit 5;
```

If any frontend code reads `hospital_data` straight from Supabase instead of through this API, it will show the unfiltered data.

---

## 6. Environment variables (`.env`)


| Variable                           | Needed              | Purpose                                                                                                               |
| ---------------------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                     | yes                 | Postgres connection string (Supabase pooler).                                                                         |
| `DIRECT_URL`                       | being removed       | Only read by`prisma7.config.ts`. To be merged into`DATABASE_URL`.                                                     |
| `SUPABASE_URL`,`SUPABASE_ANON_KEY` | yes                 | Supabase project and public key.`SUPABASE_URL`is also used to check that avatar URLs point at this project's storage. |
| `PASSWORD_RESET_REDIRECT_URL`      | yes                 | Where the password-reset email link sends the user.                                                                   |
| `FRONTEND_URL`                     | recommended         | Frontend address: redirect after email confirmation, and CORS fallback.                                               |
| `CORS_ORIGINS`                     | production          | Comma-separated frontend origins allowed to call the API.                                                             |
| `TRUST_PROXY`                      | when behind a proxy | Number of proxy hops (usually`1`), so rate limits and audit logs see real client IPs. Leave unset locally.            |
| `ENABLE_API_DOCS`                  | optional            | `true`to expose`/api-docs`in production.                                                                              |
| `PORT`                             | optional            | Defaults to 5000.                                                                                                     |
| `NODE_ENV`                         | production          | Set to`production`when deployed (hides debug detail, tightens CORS and docs).                                         |
| `REVIEWS_REQUIRE_MODERATION`       | optional            | `false`publishes new and edited reviews immediately. Anything else, or unset, holds them for a moderator.             |

---

## 7. Audit events (table `security_events`)

Each row stores `metadata` with `requestId`, `ip` and `userAgent` (plus extras). Events: `ACCOUNT_REGISTERED`, `REGISTRATION_DUPLICATE_EMAIL`, `LOGIN_SUCCESSFUL`, `LOGIN_FAILED`, `LOGIN_BLOCKED_DEACTIVATED`, `LOGOUT`, `PASSWORD_RESET_REQUESTED`, `CONFIRMATION_EMAIL_REQUESTED`, `PROFILE_UPDATED` and `NOTIFICATION_PREFERENCES_UPDATED` (these two list the changed field names only), `REVIEW_CREATED`, `REVIEW_UPDATED`, `REVIEW_DELETED`, `REVIEW_APPROVED` and `REVIEW_REJECTED` (review and hospital ids only; the text and the moderator's reason are never logged). Emails are stored only as a 16-character hash (`emailHash`).

**Finding what happened for a user's error report:**`select * from security_events where metadata->>'requestId' = '<id from the error>';` and search the server logs for `[<id>]`.

---

## 8. Install checklist (tick as you apply each delivery)

**Packages:**`npm install express-rate-limit zod helmet`


| Task    | Files delivered                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1       | `src/middleware/rateLimiter.js`(new),`server.js`,`src/routes/authRoutes.js`,`controllers/auth.controller.js`(adds`resendConfirmation`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 2       | `src/validation/common.js`,`src/validation/auth.schemas.js`,`src/middleware/validate.js`(new),`src/routes/authRoutes.js`,`server.js`                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 3       | `src/utils/ApiError.js`,`src/utils/formatZodIssues.js`,`src/middleware/errorHandler.js`,`src/middleware/requestId.js`(new),`src/middleware/validate.js`,`src/middleware/rateLimiter.js`,`server.js`,`controllers/auth.controller.js`,`src/middleware/auth.middleware.js`                                                                                                                                                                                                                                                                                                                                      |
| 4       | `src/utils/requestContext.js`,`src/services/audit.service.js`,`src/config/cors.js`,`src/middleware/security.js`(new),`src/middleware/requestId.js`,`server.js`,`controllers/auth.controller.js`,`src/middleware/auth.middleware.js`                                                                                                                                                                                                                                                                                                                                                                           |
| 5       | `src/validation/user.schemas.js`,`controllers/user.controller.js`,`src/routes/userRoutes.js`(new),`src/validation/common.js`,`server.js`                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 6a      | `src/utils/geo.js`,`src/utils/phone.js`,`src/utils/hospitalDetails.js`,`src/validation/hospital.schemas.js`,`controllers/hospital.controller.js`,`controllers/location.controller.js`,`src/routes/hospitalRoutes.js`,`src/routes/locationRoutes.js`(new),`src/validation/user.schemas.js`,`src/middleware/rateLimiter.js`,`server.js`. Also delete the empty`controllers/hospitalControllers.js`.                                                                                                                                                                                                             |
| 6b      | **First**run`prisma/migrations/20261122_add_reviews/migration.sql`in the Supabase SQL editor. Then add`src/validation/review.schemas.js`,`controllers/review.controller.js`,`controllers/moderation.controller.js`,`src/routes/reviewRoutes.js`,`src/routes/moderationRoutes.js`(new) and replace`prisma/schema.prisma`,`src/validation/hospital.schemas.js`,`controllers/hospital.controller.js`,`src/routes/hospitalRoutes.js`,`src/routes/userRoutes.js`,`src/middleware/rateLimiter.js`,`server.js`. Then run`npx prisma generate`, and give yourself a moderator or admin role (see "How reviews work"). |
| SSL fix | `src/config/prisma.js`(connection-level retry)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |

When a file appears in several rows, the **latest** delivery is the one to use (it already contains the earlier changes).

---

## 9. Pending and manual items

1. Apply any deliveries above that are not installed yet, and run `npm install express-rate-limit zod helmet`.
2. **Reset the database password** in Supabase (it was shared in chat and in an uploaded `.env`), then update `DATABASE_URL`.
3. Rename `prisma7.config.ts` to `prisma.config.ts`, point it at `DATABASE_URL`, then delete `DIRECT_URL` from `.env` and drop `?connect_timeout=60` from the URL.
4. Supabase dashboard: set the minimum password length to 8 (and optionally require letters and numbers).
5. Production: set `CORS_ORIGINS`, `NODE_ENV=production` and `TRUST_PROXY`; configure a custom SMTP provider (Supabase's built-in sender has a low hourly email cap).
6. Convert `prisma/migrations/0_init/migration.sql` from UTF-16 to UTF-8.
7. Clean-up: delete `generated/prisma/`, the AI-skill folders, `skills-lock.json`, the `postinstall` script and the diagnostic `test*.js` scripts.
8. Move `superbase-auth-trigger.sql` into a properly named, tracked file, and add a trigger that sets `email_verified_at` when the confirmation link is clicked.
9. Decide a retention period and a scheduled purge for `security_events` and `login_activities` (they hold IP addresses).
10. Not built yet for profiles: avatar upload (an avatar URL is only accepted for files already in this project's Supabase Storage), phone number verification, and the flexible `preferences` / privacy-settings and saved-location fields. Check that the language list in `src/validation/user.schemas.js` matches what the frontend supports.
11. **Clean the imported `hospital_data`:** run the audit queries in section 5, remove spam image links and wrong social-media links, and decide when images and social links may be shown (the plan: hospitals supply their own after a verified claim, task 6c). Also decide whether suspended hospitals should stay visible in search.
12. If the hospital table grows well beyond tens of thousands of rows, add a `pg_trgm` index to speed up text search and consider PostGIS for near-me search. Current speed with 30,000 test rows: searches 20-200 ms.
13. Review follow-ups: authors are not told when a review is approved or rejected (there is no notifications table yet; they see the status under `GET /api/users/me/reviews`), and there is no way for users to report a review or for hospitals to respond (task 6d).
14. Still to do from the roadmap: tasks 6c (claims and verification), 6d (reports, hospital responses, moderation history) and task 7 (role management). Paused: age confirmation, onboarding and consent fields.

---

## 10. Change log


| Date       | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2026-11-21 | Database SSL fix:`src/config/prisma.js`now retries failed connections (intermittent Supabase pooler handshake failures).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 2026-11-21 | Task 1: rate limiting added; new`POST /api/auth/resend-confirmation`endpoint.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 2026-11-21 | Task 2: Zod validation and sanitization for all auth routes; JSON body limit 10 KB.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 2026-11-21 | Task 3: central error handling and request IDs; controllers and auth middleware now throw`ApiError`; unconfirmed-email login returns 403`EMAIL_NOT_CONFIRMED`; outages return 503 instead of a false 401.                                                                                                                                                                                                                                                                                                                                                                                                                |
| 2026-11-21 | Task 4: Helmet, CORS allowlist,`no-store`on auth responses, JWT-shape check, audit logging service, same registration response for existing emails, post-signup database lookup removed, Swagger hidden in production.                                                                                                                                                                                                                                                                                                                                                                                                   |
| 2026-11-21 | README created.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 2026-11-21 | Task 5: profile and notification-preference endpoints under`/api/users/me`(profile read/update, username, phone, avatar, language, timezone, theme, notification switches);`sensitiveLimiter`now in use;`common.js`gains`displayNameUpdateSchema`and exports`typed`.                                                                                                                                                                                                                                                                                                                                                     |
| 2026-11-21 | Task 6a: public hospital directory (`/api/hospitals`,`/api/hospitals/filters`,`/api/hospitals/:id`,`/api/states`,`/api/states/:stateId/lgas`) with text search, filters, sorting, pagination and near-me search;`searchLimiter`added; temporary hospital stub removed. Tested against a real PostgreSQL database; search now treats`%`,`_`and`\`literally.                                                                                                                                                                                                                                                               |
| 2026-11-21 | Task 6a update: ownership is now validated against the database's allowed values (`federal`,`state`,`private`) and`/api/hospitals/filters`always lists all three with labels; the public API shows only`verified`/`claimed`/`unclaimed`instead of the seven internal verification statuses. Re-tested against a PostgreSQL database with the same CHECK constraints (110 checks).                                                                                                                                                                                                                                        |
| 2026-11-21 | Task 6a update:`hospital_data`(imported, unvetted: spam images, wrong social links, placeholders found in the sample) now reaches the public only through`src/utils/hospitalDetails.js`, which exposes a cleaned`details`object on the detail endpoint and never images or social links. Phone helper moved to`src/utils/phone.js`and shared with user profiles. Tested: 115 directory checks on PostgreSQL, 38 cleaner checks, 73 profile checks.                                                                                                                                                                       |
| 2026-11-22 | Task 6b: reviews, category ratings and per-hospital statistics. New migration`20261122_add_reviews`(tables, constraints, triggers), new models in`schema.prisma`, public review and rating-summary endpoints, authors can write, edit and delete their review, a basic moderation queue for moderators and admins,`rating`on every hospital and`sort=rating`in the directory, new limiters (5 reviews per user per day, moderation). Fixed while testing: impossible visit dates such as 31 February were silently shifted. Tested on PostgreSQL: 123 review checks, 115 directory, 38 cleaner, 73 profile, 49 security. |

# Dreel — Hospital Review Platform: Backend

Express 5 API for the Hospital Review Platform (Nigeria first). Authentication is handled by Supabase Auth, data lives in Supabase Postgres, and the app talks to the database through Prisma 7 with the `pg` driver adapter.

> **Keep this README up to date.** Every time a file is added, changed or removed, update this file and the change log at the bottom in the same step.

---

## 1. How this code got here (read this first)

* **Original files** (marked *original* below) came from the backend zip uploaded on 2026-11-21. They were built before the hardening work started.
* **Files marked *added* or *updated*** were created or changed during the hardening work (the database SSL fix and roadmap tasks 1-6).
* No code has been edited by hand: every change was applied exactly as supplied, so this README describes the current state of the project.
* The files marked *added* or *updated* are what has been **delivered**. Use the install checklist in section 8 to tick off what has been applied, and correct this README if any delivered file has not been applied yet.

---

## 2. Roadmap status


| #  | Task                                                                                                                                                                                           | Status                         |
| -- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| 1  | API rate limiting                                                                                                                                                                              | Delivered                      |
| 2  | Request validation and sanitization                                                                                                                                                            | Delivered                      |
| 3  | Centralized error handling                                                                                                                                                                     | Delivered                      |
| 4  | Security hardening (Helmet, CORS, token handling, audit logging, enumeration protection)                                                                                                       | Delivered                      |
| 5  | User profile and preferences (notifications, language, timezone, theme)                                                                                                                        | Delivered                      |
| 6  | Hospital functionality:**6a hospital directory (search, near-me, detail, filters, states and LGAs): delivered.**6b reviews and ratings, 6c claims and verification, 6d moderation: not started | In progress                    |
| 7  | Role management: admin-only role changes, and a guard that stops the last admin being changed                                                                                                  | Not started (last on the list) |
| – | Manual: raise the minimum password length to 8 in the Supabase dashboard's auth settings                                                                                                       | Needs doing by you             |

---

## 3. Project structure

```
backend/
├── server.js
├── package.json / package-lock.json
├── .env                      (secrets, never commit)
├── .gitignore
├── prisma7.config.ts
├── schema.prisma.backup
├── skills-lock.json
├── README.md
│
├── controllers/
│   ├── auth.controller.js
│   ├── user.controller.js
│   ├── hospital.controller.js
│   └── location.controller.js
│
├── prisma/
│   ├── schema.prisma
│   ├── baseline.prisma
│   ├── superbase-auth-trigger.sql
│   └── migrations/
│       ├── 0_init/migration.sql
│       └── 20261120_add_auth_tables/migration.sql
│
└── src/
    ├── config/
    │   ├── prisma.js
    │   ├── supabase.js
    │   ├── swagger.js
    │   ├── cors.js
    │   └── test*.js            (diagnostic scripts)
    ├── middleware/
    │   ├── auth.middleware.js
    │   ├── errorHandler.js
    │   ├── rateLimiter.js
    │   ├── requestId.js
    │   ├── security.js
    │   └── validate.js
    ├── routes/
    │   ├── authRoutes.js
    │   ├── userRoutes.js
    │   ├── hospitalRoutes.js
    │   └── locationRoutes.js
    ├── services/
    │   └── audit.service.js
    ├── utils/
    │   ├── ApiError.js
    │   ├── formatZodIssues.js
    │   ├── geo.js
    │   └── requestContext.js
    └── validation/
        ├── common.js
        ├── auth.schemas.js
        ├── user.schemas.js
        └── hospital.schemas.js
```

---

## 4. File reference

### Root


| File                                                                                                                           | Origin                         | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `server.js`                                                                                                                    | original, updated (tasks 1–6) | App entry point. Sets`trust proxy`(when`TRUST_PROXY`is set), then registers middleware in this order: request ID → Helmet → CORS → JSON body parser (10 KB limit) → Swagger docs (hidden in production unless`ENABLE_API_DOCS=true`) →`GET /`→`/api`rate limiter →`/api/hospitals`and`/api/states`(public directory) →`/api/auth`routes and`/api/users`routes (both with`no-store`caching) → 404 handler → central error handler. Starts the server on`PORT`(default 5000). |
| `package.json`                                                                                                                 | original                       | Dependencies and scripts (`npm run dev`= watch mode,`npm start`).**Needs`express-rate-limit`,`zod`and`helmet`added**(`npm install express-rate-limit zod helmet`). It still has a`postinstall`script (`prisma skills sync`) that creates the AI-skill folders listed below; it can be removed.                                                                                                                                                                                        |
| `package-lock.json`                                                                                                            | original                       | Exact dependency versions. Generated by npm; don't edit.                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `.env`                                                                                                                         | original                       | Secrets and settings. Never commit or share it. Variables are listed in section 6.                                                                                                                                                                                                                                                                                                                                                                                                    |
| `.gitignore`                                                                                                                   | original                       | Keeps`node_modules/`,`.env`and`/generated/prisma`out of git.                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `prisma7.config.ts`                                                                                                            | original                       | Prisma CLI configuration (schema path, migrations path, database URL).**Misnamed:**Prisma only auto-loads`prisma.config.ts`. It also still reads`DIRECT_URL`; the plan is to switch it to`DATABASE_URL`. See section 9.                                                                                                                                                                                                                                                               |
| `schema.prisma.backup`                                                                                                         | original                       | Backup of an earlier, larger schema design (29 models: reviews, ratings, claims, moderation, favourites, notifications, audit log and more). Not used by the app. It is the starting point for task 6.                                                                                                                                                                                                                                                                                |
| `skills-lock.json`and the hidden AI-tool folders in the project root (`.agents/`,`.cursor/`,`.devin/`,`.windsurf/`and similar) | original                       | AI-assistant "skill" files created by`prisma skills sync`. Not part of the application; safe to delete.                                                                                                                                                                                                                                                                                                                                                                               |
| `generated/prisma/`                                                                                                            | original                       | An old generated Prisma client from the larger schema. Stale and unused (the app imports`@prisma/client`). Git-ignored; safe to delete.                                                                                                                                                                                                                                                                                                                                               |
| `README.md`                                                                                                                    | added                          | This file.                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |

### `controllers/`


| File                     | Origin                         | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------ | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `auth.controller.js`     | original, updated (tasks 1–4) | The auth handlers:`register`,`login`,`logout`,`getMe`,`forgotPassword`,`resendConfirmation`. Supabase creates and signs in accounts; Prisma reads and updates the`users`table. Errors are thrown and handled centrally. Registration returns the same 201 response for new and already-registered emails (account-enumeration protection) and builds its response from the signup result with no database read. Audit events are written fire-and-forget.                                                                                                                                                                                                                                                             |
| `user.controller.js`     | added (task 5)                 | Profile and notification-preference handlers for the signed-in user only:`getProfile`,`updateProfile`(a taken username returns 409`USERNAME_TAKEN`),`getNotificationPreferences`(creates the default row on first use) and`updateNotificationPreferences`. No user ID appears in any URL, so one user can never reach another's data. Audit events store field names, never values.                                                                                                                                                                                                                                                                                                                                   |
| `hospital.controller.js` | added (task 6a)                | Public hospital directory:`listHospitals`(text search, filters, sorting, pagination and near-me search),`getHospital`and`getHospitalFilters`. Search text is matched word by word against name, city, LGA and state with`%`,`_`and`\`treated literally. Near-me search lets the database discard everything outside a bounding box, then works out exact distances (haversine) for the rest.`hospital_data`is never exposed unless a key is listed in`PUBLIC_HOSPITAL_DATA_KEYS`(empty for now). The public only sees three verification states (`verified`,`claimed`,`unclaimed`); the seven internal workflow values are mapped in`PUBLIC_VERIFICATION_STATUS`, so a rejected claim or a suspension is never shown. |
| `location.controller.js` | added (task 6a)                | `listStates`and`listLgas`: reference data for the search filters, with hospital counts, cacheable for an hour.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `hospitalControllers.js` | original                       | Empty placeholder, now superseded by`hospital.controller.js`.**Delete it.**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

### `prisma/`


| File                                                | Origin   | What it does                                                                                                                                                                                                                                                                                        |
| --------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `schema.prisma`                                     | original | The current database models:`hospital_types`,`hospitals`,`lgas`,`states`(introspected from Supabase), plus`User`(table`users`),`NotificationPreference`,`LoginActivity`,`SecurityEvent`and the enums`UserRole`and`Theme`. Age/consent fields and review models are**not**added yet (paused by you). |
| `baseline.prisma`                                   | original | Snapshot of the hospital/state/LGA models used to create the baseline migration. Not used at runtime.                                                                                                                                                                                               |
| `superbase-auth-trigger.sql`                        | original | SQL run in Supabase that creates a row in`public.users`whenever a Supabase Auth user is created (the filename has a typo, "superbase"). It only fires on insert, so`email_verified_at`is refreshed at login rather than when the confirmation link is clicked.                                      |
| `migrations/0_init/migration.sql`                   | original | Baseline migration for the existing hospital, state and LGA tables.**Saved as UTF-16**(a PowerShell redirect side effect); convert it to UTF-8 before running Prisma migrate commands.                                                                                                              |
| `migrations/20261120_add_auth_tables/migration.sql` | original | Creates`users`,`notification_preferences`,`login_activities`and`security_events`(with row-level security enabled).                                                                                                                                                                                  |

### `src/config/`


| File                                                                                              | Origin                      | What it does                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `prisma.js`                                                                                       | original, updated (SSL fix) | Creates the single Prisma client. Uses a`pg`pool with SSL (certificate check relaxed for development), keep-alive, and a**connection-level retry**(up to 6 attempts) because opening connections to Supabase's pooler fails intermittently. Also exports`pool`. |
| `supabase.js`                                                                                     | original                    | `createSupabaseAuthClient()`makes a fresh Supabase client (no session persistence) for sign-up, sign-in and similar calls. The default export is a shared client used only to verify access tokens. Needs`SUPABASE_URL`and`SUPABASE_ANON_KEY`.                  |
| `swagger.js`                                                                                      | original                    | OpenAPI settings for the docs page at`/api-docs`; reads the`@swagger`comments in`src/routes/*.js`.                                                                                                                                                              |
| `cors.js`                                                                                         | added (task 4)              | CORS allowlist. Reads`CORS_ORIGINS`(falls back to`FRONTEND_URL`, then to`localhost:3000`and`localhost:5173`outside production). Blocked origins get a 403`CORS_ERROR`. Exposes`X-Request-Id`,`Retry-After`and`RateLimit`headers to browser code.                |
| `testDB.js`,`testPrisma.js`,`testSslByte.js`(+`testRetry.js`,`testConnect.js`if you created them) | original/added              | Diagnostic scripts from the database SSL investigation. Not used by the app; safe to delete. Note that`testPrisma.js`holds a no-SSL connection test despite its name.                                                                                           |

### `src/middleware/`


| File                 | Origin                         | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| -------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `auth.middleware.js` | original, updated (tasks 3–4) | `authenticate`: checks the Bearer token (shape check first, then Supabase`getUser`), loads the user from the database, rejects deactivated accounts, sets`req.user`and`req.accessToken`.`authorize(...roles)`: role check for later routes.                                                                                                                                                                                                                            |
| `rateLimiter.js`     | added (tasks 1, 3, 6)          | Rate limiters: general API, register, login (failed attempts only, per IP and per IP + email), forgot-password and resend-confirmation (per IP and per target email), and`sensitiveLimiter`for signed-in users (30 per 15 minutes per user; used on the profile and notification update routes), and`searchLimiter`(60 hospital searches per minute per IP). 429 responses include`code`and`requestId`. In-memory store: resets on restart and covers one server only. |
| `validate.js`        | added (tasks 2, 3)             | `validate({ body, params, query })`runs Zod schemas, replaces`req.body`/`req.params`with the cleaned data (parsed query is`req.validatedQuery`) and forwards failures as a`ValidationError`.                                                                                                                                                                                                                                                                           |
| `errorHandler.js`    | added (task 3)                 | `notFoundHandler`(404) and`errorHandler`. Maps Prisma errors (connection failures become 503 with`Retry-After`), Supabase auth errors, Zod errors, bad or oversized JSON and unknown errors to a safe JSON shape. Logs server errors with the request ID. Hides internals in production; adds a`debug`field in development.                                                                                                                                            |
| `requestId.js`       | added (tasks 3, 4)             | Gives each request an ID (`req.id`,`X-Request-Id`header) and stores the ID, client IP and user agent in the request context for audit logging.                                                                                                                                                                                                                                                                                                                         |
| `security.js`        | added (task 4)                 | `securityHeaders`(Helmet; the`/api-docs`pages skip only the CSP so Swagger UI works) and`noStore`(no caching of auth responses).                                                                                                                                                                                                                                                                                                                                       |

### `src/routes/`


| File                | Origin                         | What it does                                                                                                                                                                                 |
| ------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `authRoutes.js`     | original, updated (tasks 1–2) | Defines the`/api/auth/*`routes (section 5) and wires each one as: rate limiter → validation → controller. Holds the Swagger documentation comments.                                        |
| `userRoutes.js`     | added (task 5)                 | The`/api/users/*`routes (section 5). Every route requires a signed-in user; the update routes also go through`sensitiveLimiter`and validation. Holds the Swagger comments.                   |
| `hospitalRoutes.js` | added (task 6a)                | `/api/hospitals`:`GET /filters`,`GET /`(search; goes through`searchLimiter`and validation) and`GET /:id`.`/filters`is declared first so it is not read as an ID. Holds the Swagger comments. |
| `locationRoutes.js` | added (task 6a)                | `/api/states`:`GET /`and`GET /:stateId/lgas`.                                                                                                                                                |

### `src/services/`


| File               | Origin         | What it does                                                                                                                                                                                                                                                                                                              |
| ------------------ | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `audit.service.js` | added (task 4) | `recordSecurityEvent(userId, eventType, metadata)`writes to`security_events`(adds request ID, IP and user agent automatically);`recordLogin(...)`writes to`login_activities`;`hashEmail(email)`makes the short hash stored instead of an address. They never throw; call them with`void`so they don't delay the response. |

### `src/utils/`


| File                 | Origin          | What it does                                                                                                                                |
| -------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `ApiError.js`        | added (task 3)  | `ApiError(status, message, { code, errors, headers })`and`ValidationError`. Throw these from controllers; the central handler formats them. |
| `formatZodIssues.js` | added (task 3)  | Turns Zod issues into`[{ field, message }]`without ever echoing submitted values.                                                           |
| `requestContext.js`  | added (task 4)  | Per-request storage (request ID, IP, user agent) so audit logging can read them without passing`req`around.                                 |
| `geo.js`             | added (task 6a) | `distanceKm`(haversine) and`boundingBox`for near-me search.                                                                                 |

### `src/validation/`


| File                  | Origin             | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| --------------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `common.js`           | added (tasks 2, 5) | Reusable rules: email, new-password and login-password, display name, UUID, integer IDs (route/body), pagination query.                                                                                                                                                                                                                                                                                                                                                                                                    |
| `auth.schemas.js`     | added (task 2)     | Strict body schemas for register, login, forgot-password, resend-confirmation and logout. Unknown fields are rejected.                                                                                                                                                                                                                                                                                                                                                                                                     |
| `user.schemas.js`     | added (task 5)     | Rules for profile and notification updates. Username (3-30 characters, starts with a letter, lower-cased, reserved names blocked), phone number (stored as`+234…`; Nigerian local numbers are converted), avatar URL (only files in this project's Supabase Storage), language (`en`,`yo`,`ig`,`ha`,`pcm`: edit`SUPPORTED_LANGUAGES`to change), IANA timezone, theme (light/dark/system in any case) and the notification flags. Unknown fields are rejected, and`securityAlerts`, email and role cannot be changed here. |
| `hospital.schemas.js` | added (task 6a)    | Query and parameter rules for the directory: search text (2-100 characters), state / LGA / type IDs, ownership (`federal`,`state`or`private`, any letter case),`lat`and`lng`(must come together),`radiusKm`(1-100),`sort`(`name`,`newest`,`distance`),`page`,`limit`(max 50), UUID hospital IDs and state IDs. Unknown query parameters are rejected.                                                                                                                                                                      |

---

## 5. API endpoints


| Method and path                                | Auth   | Notes                                                                                                                                                                                                                                                              |
| ---------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /`                                        | none   | Basic status message.                                                                                                                                                                                                                                              |
| `GET /api-docs`                                | none   | Swagger UI (production: only with`ENABLE_API_DOCS=true`).                                                                                                                                                                                                          |
| `GET /api/hospitals`                           | none   | Search and list. Parameters:`q`,`stateId`,`lgaId`,`typeId`,`ownership`(`federal`/`state`/`private`),`lat`+`lng`(+`radiusKm`, default 25),`sort`,`page`,`limit`. With`lat`and`lng`results are nearest first and include`distanceKm`. 60 searches per minute per IP. |
| `GET /api/hospitals/filters`                   | none   | Hospital types, and the three ownership values with labels and counts (all three always listed), for the search filters. Cacheable for an hour.                                                                                                                    |
| `GET /api/hospitals/:id`                       | none   | One hospital with description, year established and accessibility information. 404`HOSPITAL_NOT_FOUND`if unknown.                                                                                                                                                  |
| `GET /api/states`                              | none   | All states with hospital counts.                                                                                                                                                                                                                                   |
| `GET /api/states/:stateId/lgas`                | none   | The LGAs of a state with hospital counts. 404`STATE_NOT_FOUND`if unknown.                                                                                                                                                                                          |
| `POST /api/auth/register`                      | none   | Limited to 10/hour per IP. Same response for new and existing emails.                                                                                                                                                                                              |
| `POST /api/auth/login`                         | none   | 5 failed attempts per 15 min per IP + email.                                                                                                                                                                                                                       |
| `POST /api/auth/forgot-password`               | none   | 3/hour per email address. Always answers 200.                                                                                                                                                                                                                      |
| `POST /api/auth/resend-confirmation`           | none   | 3/hour per email address. Always answers 200.                                                                                                                                                                                                                      |
| `POST /api/auth/logout`                        | Bearer | Body:`{ "refreshToken": "…" }`.                                                                                                                                                                                                                                   |
| `GET /api/auth/me`                             | Bearer | Returns the signed-in user.                                                                                                                                                                                                                                        |
| `GET /api/users/me`                            | Bearer | Full profile: name, username, avatar, phone, language, timezone, theme and more.                                                                                                                                                                                   |
| `PATCH /api/users/me`                          | Bearer | Update any of those fields (send only what changes;`null`clears name, username, phone and avatar). 30 changes per 15 min per user.                                                                                                                                 |
| `GET /api/users/me/notification-preferences`   | Bearer | Returns the settings, creating defaults on first use.                                                                                                                                                                                                              |
| `PATCH /api/users/me/notification-preferences` | Bearer | Update notification switches. Security alerts can't be turned off.                                                                                                                                                                                                 |

All error responses look like: `{ "success": false, "message": "…", "code": "…", "requestId": "…", "errors": [{ "field", "message" }] }` (`errors` appears only for validation failures).

### Database rules the API relies on

These are CHECK constraints on the `hospitals` table in Supabase (they do not appear in the migration files):


| Column                | Allowed values                                                                                                                                                      |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ownership`           | `federal`,`state`,`private`                                                                                                                                         |
| `verification_status` | `unclaimed`,`claim_pending`,`claimed`,`verification_pending`,`verified`,`rejected`,`suspended`(the workflow for claiming and verifying a hospital, used in task 6c) |
| `year_established`    | empty, or between 1000 and 9999                                                                                                                                     |

Public responses show `verificationStatus` as only `verified`, `claimed` or `unclaimed`.

---

## 6. Environment variables (`.env`)


| Variable                           | Needed              | Purpose                                                                                                               |
| ---------------------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                     | yes                 | Postgres connection string (Supabase pooler).                                                                         |
| `DIRECT_URL`                       | being removed       | Only read by`prisma7.config.ts`. To be merged into`DATABASE_URL`.                                                     |
| `SUPABASE_URL`,`SUPABASE_ANON_KEY` | yes                 | Supabase project and public key.`SUPABASE_URL`is also used to check that avatar URLs point at this project's storage. |
| `PASSWORD_RESET_REDIRECT_URL`      | yes                 | Where the password-reset email link sends the user.                                                                   |
| `FRONTEND_URL`                     | recommended         | Frontend address: redirect after email confirmation, and CORS fallback.                                               |
| `CORS_ORIGINS`                     | production          | Comma-separated frontend origins allowed to call the API.                                                             |
| `TRUST_PROXY`                      | when behind a proxy | Number of proxy hops (usually`1`), so rate limits and audit logs see real client IPs. Leave unset locally.            |
| `ENABLE_API_DOCS`                  | optional            | `true`to expose`/api-docs`in production.                                                                              |
| `PORT`                             | optional            | Defaults to 5000.                                                                                                     |
| `NODE_ENV`                         | production          | Set to`production`when deployed (hides debug detail, tightens CORS and docs).                                         |

---

## 7. Audit events (table `security_events`)

Each row stores `metadata` with `requestId`, `ip` and `userAgent` (plus extras). Events: `ACCOUNT_REGISTERED`, `REGISTRATION_DUPLICATE_EMAIL`, `LOGIN_SUCCESSFUL`, `LOGIN_FAILED`, `LOGIN_BLOCKED_DEACTIVATED`, `LOGOUT`, `PASSWORD_RESET_REQUESTED`, `CONFIRMATION_EMAIL_REQUESTED`, `PROFILE_UPDATED` and `NOTIFICATION_PREFERENCES_UPDATED` (these two list the changed field names only). Emails are stored only as a 16-character hash (`emailHash`).

**Finding what happened for a user's error report:**`select * from security_events where metadata->>'requestId' = '<id from the error>';` and search the server logs for `[<id>]`.

---

## 8. Install checklist (tick as you apply each delivery)

**Packages:**`npm install express-rate-limit zod helmet`


| Task    | Files delivered                                                                                                                                                                                                                                                                                              |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1       | `src/middleware/rateLimiter.js`(new),`server.js`,`src/routes/authRoutes.js`,`controllers/auth.controller.js`(adds`resendConfirmation`)                                                                                                                                                                       |
| 2       | `src/validation/common.js`,`src/validation/auth.schemas.js`,`src/middleware/validate.js`(new),`src/routes/authRoutes.js`,`server.js`                                                                                                                                                                         |
| 3       | `src/utils/ApiError.js`,`src/utils/formatZodIssues.js`,`src/middleware/errorHandler.js`,`src/middleware/requestId.js`(new),`src/middleware/validate.js`,`src/middleware/rateLimiter.js`,`server.js`,`controllers/auth.controller.js`,`src/middleware/auth.middleware.js`                                     |
| 4       | `src/utils/requestContext.js`,`src/services/audit.service.js`,`src/config/cors.js`,`src/middleware/security.js`(new),`src/middleware/requestId.js`,`server.js`,`controllers/auth.controller.js`,`src/middleware/auth.middleware.js`                                                                          |
| 5       | `src/validation/user.schemas.js`,`controllers/user.controller.js`,`src/routes/userRoutes.js`(new),`src/validation/common.js`,`server.js`                                                                                                                                                                     |
| 6a      | `src/utils/geo.js`,`src/validation/hospital.schemas.js`,`controllers/hospital.controller.js`,`controllers/location.controller.js`,`src/routes/hospitalRoutes.js`,`src/routes/locationRoutes.js`(new),`src/middleware/rateLimiter.js`,`server.js`. Also delete the empty`controllers/hospitalControllers.js`. |
| SSL fix | `src/config/prisma.js`(connection-level retry)                                                                                                                                                                                                                                                               |

When a file appears in several rows, the **latest** delivery is the one to use (it already contains the earlier changes).

---

## 9. Pending and manual items

1. Apply any deliveries above that are not installed yet, and run `npm install express-rate-limit zod helmet`.
2. **Reset the database password** in Supabase (it was shared in chat and in an uploaded `.env`), then update `DATABASE_URL`.
3. Rename `prisma7.config.ts` to `prisma.config.ts`, point it at `DATABASE_URL`, then delete `DIRECT_URL` from `.env` and drop `?connect_timeout=60` from the URL.
4. Supabase dashboard: set the minimum password length to 8 (and optionally require letters and numbers).
5. Production: set `CORS_ORIGINS`, `NODE_ENV=production` and `TRUST_PROXY`; configure a custom SMTP provider (Supabase's built-in sender has a low hourly email cap).
6. Convert `prisma/migrations/0_init/migration.sql` from UTF-16 to UTF-8.
7. Clean-up: delete `generated/prisma/`, the AI-skill folders, `skills-lock.json`, the `postinstall` script and the diagnostic `test*.js` scripts.
8. Move `superbase-auth-trigger.sql` into a properly named, tracked file, and add a trigger that sets `email_verified_at` when the confirmation link is clicked.
9. Decide a retention period and a scheduled purge for `security_events` and `login_activities` (they hold IP addresses).
10. Not built yet for profiles: avatar upload (an avatar URL is only accepted for files already in this project's Supabase Storage), phone number verification, and the flexible `preferences` / privacy-settings and saved-location fields. Check that the language list in `src/validation/user.schemas.js` matches what the frontend supports.
11. **Hospital data to confirm:** what keys `hospitals.hospital_data` holds (phone, services, etc.). Nothing from it is shown publicly until its keys are added to `PUBLIC_HOSPITAL_DATA_KEYS` in `controllers/hospital.controller.js`. (The allowed values of `ownership` and `verification_status` are now known: see "Database rules" above.) Decide whether suspended hospitals should stay visible in search.
12. If the hospital table grows well beyond tens of thousands of rows, add a `pg_trgm` index to speed up text search and consider PostGIS for near-me search. Current speed with 30,000 test rows: searches 20-200 ms.
13. Still to do from the roadmap: tasks 6b-6d (reviews and ratings, claims and verification, moderation) and task 7. Paused: age confirmation, onboarding and consent fields.

---

## 10. Change log


| Date       | Change                                                                                                                                                                                                                                                                                                                                                                            |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-11-21 | Database SSL fix:`src/config/prisma.js`now retries failed connections (intermittent Supabase pooler handshake failures).                                                                                                                                                                                                                                                          |
| 2026-11-21 | Task 1: rate limiting added; new`POST /api/auth/resend-confirmation`endpoint.                                                                                                                                                                                                                                                                                                     |
| 2026-11-21 | Task 2: Zod validation and sanitization for all auth routes; JSON body limit 10 KB.                                                                                                                                                                                                                                                                                               |
| 2026-11-21 | Task 3: central error handling and request IDs; controllers and auth middleware now throw`ApiError`; unconfirmed-email login returns 403`EMAIL_NOT_CONFIRMED`; outages return 503 instead of a false 401.                                                                                                                                                                         |
| 2026-11-21 | Task 4: Helmet, CORS allowlist,`no-store`on auth responses, JWT-shape check, audit logging service, same registration response for existing emails, post-signup database lookup removed, Swagger hidden in production.                                                                                                                                                            |
| 2026-11-21 | README created.                                                                                                                                                                                                                                                                                                                                                                   |
| 2026-11-21 | Task 5: profile and notification-preference endpoints under`/api/users/me`(profile read/update, username, phone, avatar, language, timezone, theme, notification switches);`sensitiveLimiter`now in use;`common.js`gains`displayNameUpdateSchema`and exports`typed`.                                                                                                              |
| 2026-11-21 | Task 6a: public hospital directory (`/api/hospitals`,`/api/hospitals/filters`,`/api/hospitals/:id`,`/api/states`,`/api/states/:stateId/lgas`) with text search, filters, sorting, pagination and near-me search;`searchLimiter`added; temporary hospital stub removed. Tested against a real PostgreSQL database; search now treats`%`,`_`and`\`literally.                        |
| 2026-11-21 | Task 6a update: ownership is now validated against the database's allowed values (`federal`,`state`,`private`) and`/api/hospitals/filters`always lists all three with labels; the public API shows only`verified`/`claimed`/`unclaimed`instead of the seven internal verification statuses. Re-tested against a PostgreSQL database with the same CHECK constraints (110 checks). |

# Dreel — Hospital Review Platform: Backend

Express 5 API for the Hospital Review Platform (Nigeria first). Authentication is handled by Supabase Auth, data lives in Supabase Postgres, and the app talks to the database through Prisma 7 with the `pg` driver adapter.

> **Keep this README up to date.** Every time a file is added, changed or removed, update this file and the change log at the bottom in the same step.

---

## 1. How this code got here (read this first)

* **Original files** (marked *original* below) came from the backend zip uploaded on 2026-11-21. They were built before the hardening work started.
* **Files marked *added* or *updated*** were created or changed during the hardening work (the database SSL fix and roadmap tasks 1-6).
* No code has been edited by hand: every change was applied exactly as supplied, so this README describes the current state of the project.
* The files marked *added* or *updated* are what has been **delivered**. Use the install checklist in section 8 to tick off what has been applied, and correct this README if any delivered file has not been applied yet.

---

## 2. Roadmap status


| #  | Task                                                                                                                                                                                           | Status                         |
| -- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| 1  | API rate limiting                                                                                                                                                                              | Delivered                      |
| 2  | Request validation and sanitization                                                                                                                                                            | Delivered                      |
| 3  | Centralized error handling                                                                                                                                                                     | Delivered                      |
| 4  | Security hardening (Helmet, CORS, token handling, audit logging, enumeration protection)                                                                                                       | Delivered                      |
| 5  | User profile and preferences (notifications, language, timezone, theme)                                                                                                                        | Delivered                      |
| 6  | Hospital functionality:**6a hospital directory (search, near-me, detail, filters, states and LGAs): delivered.**6b reviews and ratings, 6c claims and verification, 6d moderation: not started | In progress                    |
| 7  | Role management: admin-only role changes, and a guard that stops the last admin being changed                                                                                                  | Not started (last on the list) |
| – | Manual: raise the minimum password length to 8 in the Supabase dashboard's auth settings                                                                                                       | Needs doing by you             |

---

## 3. Project structure

```
backend/
├── server.js
├── package.json / package-lock.json
├── .env                      (secrets, never commit)
├── .gitignore
├── prisma7.config.ts
├── schema.prisma.backup
├── skills-lock.json
├── README.md
│
├── controllers/
│   ├── auth.controller.js
│   ├── user.controller.js
│   ├── hospital.controller.js
│   └── location.controller.js
│
├── prisma/
│   ├── schema.prisma
│   ├── baseline.prisma
│   ├── superbase-auth-trigger.sql
│   └── migrations/
│       ├── 0_init/migration.sql
│       └── 20261120_add_auth_tables/migration.sql
│
└── src/
    ├── config/
    │   ├── prisma.js
    │   ├── supabase.js
    │   ├── swagger.js
    │   ├── cors.js
    │   └── test*.js            (diagnostic scripts)
    ├── middleware/
    │   ├── auth.middleware.js
    │   ├── errorHandler.js
    │   ├── rateLimiter.js
    │   ├── requestId.js
    │   ├── security.js
    │   └── validate.js
    ├── routes/
    │   ├── authRoutes.js
    │   ├── userRoutes.js
    │   ├── hospitalRoutes.js
    │   └── locationRoutes.js
    ├── services/
    │   └── audit.service.js
    ├── utils/
    │   ├── ApiError.js
    │   ├── formatZodIssues.js
    │   ├── geo.js
    │   └── requestContext.js
    └── validation/
        ├── common.js
        ├── auth.schemas.js
        ├── user.schemas.js
        └── hospital.schemas.js
```

---

## 4. File reference

### Root


| File                                                                                                                           | Origin                         | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `server.js`                                                                                                                    | original, updated (tasks 1–6) | App entry point. Sets`trust proxy`(when`TRUST_PROXY`is set), then registers middleware in this order: request ID → Helmet → CORS → JSON body parser (10 KB limit) → Swagger docs (hidden in production unless`ENABLE_API_DOCS=true`) →`GET /`→`/api`rate limiter →`/api/hospitals`and`/api/states`(public directory) →`/api/auth`routes and`/api/users`routes (both with`no-store`caching) → 404 handler → central error handler. Starts the server on`PORT`(default 5000). |
| `package.json`                                                                                                                 | original                       | Dependencies and scripts (`npm run dev`= watch mode,`npm start`).**Needs`express-rate-limit`,`zod`and`helmet`added**(`npm install express-rate-limit zod helmet`). It still has a`postinstall`script (`prisma skills sync`) that creates the AI-skill folders listed below; it can be removed.                                                                                                                                                                                        |
| `package-lock.json`                                                                                                            | original                       | Exact dependency versions. Generated by npm; don't edit.                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `.env`                                                                                                                         | original                       | Secrets and settings. Never commit or share it. Variables are listed in section 6.                                                                                                                                                                                                                                                                                                                                                                                                    |
| `.gitignore`                                                                                                                   | original                       | Keeps`node_modules/`,`.env`and`/generated/prisma`out of git.                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `prisma7.config.ts`                                                                                                            | original                       | Prisma CLI configuration (schema path, migrations path, database URL).**Misnamed:**Prisma only auto-loads`prisma.config.ts`. It also still reads`DIRECT_URL`; the plan is to switch it to`DATABASE_URL`. See section 9.                                                                                                                                                                                                                                                               |
| `schema.prisma.backup`                                                                                                         | original                       | Backup of an earlier, larger schema design (29 models: reviews, ratings, claims, moderation, favourites, notifications, audit log and more). Not used by the app. It is the starting point for task 6.                                                                                                                                                                                                                                                                                |
| `skills-lock.json`and the hidden AI-tool folders in the project root (`.agents/`,`.cursor/`,`.devin/`,`.windsurf/`and similar) | original                       | AI-assistant "skill" files created by`prisma skills sync`. Not part of the application; safe to delete.                                                                                                                                                                                                                                                                                                                                                                               |
| `generated/prisma/`                                                                                                            | original                       | An old generated Prisma client from the larger schema. Stale and unused (the app imports`@prisma/client`). Git-ignored; safe to delete.                                                                                                                                                                                                                                                                                                                                               |
| `README.md`                                                                                                                    | added                          | This file.                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |

### `controllers/`


| File                     | Origin                         | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------ | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `auth.controller.js`     | original, updated (tasks 1–4) | The auth handlers:`register`,`login`,`logout`,`getMe`,`forgotPassword`,`resendConfirmation`. Supabase creates and signs in accounts; Prisma reads and updates the`users`table. Errors are thrown and handled centrally. Registration returns the same 201 response for new and already-registered emails (account-enumeration protection) and builds its response from the signup result with no database read. Audit events are written fire-and-forget.                                        |
| `user.controller.js`     | added (task 5)                 | Profile and notification-preference handlers for the signed-in user only:`getProfile`,`updateProfile`(a taken username returns 409`USERNAME_TAKEN`),`getNotificationPreferences`(creates the default row on first use) and`updateNotificationPreferences`. No user ID appears in any URL, so one user can never reach another's data. Audit events store field names, never values.                                                                                                              |
| `hospital.controller.js` | added (task 6a)                | Public hospital directory:`listHospitals`(text search, filters, sorting, pagination and near-me search),`getHospital`and`getHospitalFilters`. Search text is matched word by word against name, city, LGA and state with`%`,`_`and`\`treated literally. Near-me search lets the database discard everything outside a bounding box, then works out exact distances (haversine) for the rest.`hospital_data`is never exposed unless a key is listed in`PUBLIC_HOSPITAL_DATA_KEYS`(empty for now). |
| `location.controller.js` | added (task 6a)                | `listStates`and`listLgas`: reference data for the search filters, with hospital counts, cacheable for an hour.                                                                                                                                                                                                                                                                                                                                                                                   |
| `hospitalControllers.js` | original                       | Empty placeholder, now superseded by`hospital.controller.js`.**Delete it.**                                                                                                                                                                                                                                                                                                                                                                                                                      |

### `prisma/`


| File                                                | Origin   | What it does                                                                                                                                                                                                                                                                                        |
| --------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `schema.prisma`                                     | original | The current database models:`hospital_types`,`hospitals`,`lgas`,`states`(introspected from Supabase), plus`User`(table`users`),`NotificationPreference`,`LoginActivity`,`SecurityEvent`and the enums`UserRole`and`Theme`. Age/consent fields and review models are**not**added yet (paused by you). |
| `baseline.prisma`                                   | original | Snapshot of the hospital/state/LGA models used to create the baseline migration. Not used at runtime.                                                                                                                                                                                               |
| `superbase-auth-trigger.sql`                        | original | SQL run in Supabase that creates a row in`public.users`whenever a Supabase Auth user is created (the filename has a typo, "superbase"). It only fires on insert, so`email_verified_at`is refreshed at login rather than when the confirmation link is clicked.                                      |
| `migrations/0_init/migration.sql`                   | original | Baseline migration for the existing hospital, state and LGA tables.**Saved as UTF-16**(a PowerShell redirect side effect); convert it to UTF-8 before running Prisma migrate commands.                                                                                                              |
| `migrations/20261120_add_auth_tables/migration.sql` | original | Creates`users`,`notification_preferences`,`login_activities`and`security_events`(with row-level security enabled).                                                                                                                                                                                  |

### `src/config/`


| File                                                                                              | Origin                      | What it does                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `prisma.js`                                                                                       | original, updated (SSL fix) | Creates the single Prisma client. Uses a`pg`pool with SSL (certificate check relaxed for development), keep-alive, and a**connection-level retry**(up to 6 attempts) because opening connections to Supabase's pooler fails intermittently. Also exports`pool`. |
| `supabase.js`                                                                                     | original                    | `createSupabaseAuthClient()`makes a fresh Supabase client (no session persistence) for sign-up, sign-in and similar calls. The default export is a shared client used only to verify access tokens. Needs`SUPABASE_URL`and`SUPABASE_ANON_KEY`.                  |
| `swagger.js`                                                                                      | original                    | OpenAPI settings for the docs page at`/api-docs`; reads the`@swagger`comments in`src/routes/*.js`.                                                                                                                                                              |
| `cors.js`                                                                                         | added (task 4)              | CORS allowlist. Reads`CORS_ORIGINS`(falls back to`FRONTEND_URL`, then to`localhost:3000`and`localhost:5173`outside production). Blocked origins get a 403`CORS_ERROR`. Exposes`X-Request-Id`,`Retry-After`and`RateLimit`headers to browser code.                |
| `testDB.js`,`testPrisma.js`,`testSslByte.js`(+`testRetry.js`,`testConnect.js`if you created them) | original/added              | Diagnostic scripts from the database SSL investigation. Not used by the app; safe to delete. Note that`testPrisma.js`holds a no-SSL connection test despite its name.                                                                                           |

### `src/middleware/`


| File                 | Origin                         | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| -------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `auth.middleware.js` | original, updated (tasks 3–4) | `authenticate`: checks the Bearer token (shape check first, then Supabase`getUser`), loads the user from the database, rejects deactivated accounts, sets`req.user`and`req.accessToken`.`authorize(...roles)`: role check for later routes.                                                                                                                                                                                                                            |
| `rateLimiter.js`     | added (tasks 1, 3, 6)          | Rate limiters: general API, register, login (failed attempts only, per IP and per IP + email), forgot-password and resend-confirmation (per IP and per target email), and`sensitiveLimiter`for signed-in users (30 per 15 minutes per user; used on the profile and notification update routes), and`searchLimiter`(60 hospital searches per minute per IP). 429 responses include`code`and`requestId`. In-memory store: resets on restart and covers one server only. |
| `validate.js`        | added (tasks 2, 3)             | `validate({ body, params, query })`runs Zod schemas, replaces`req.body`/`req.params`with the cleaned data (parsed query is`req.validatedQuery`) and forwards failures as a`ValidationError`.                                                                                                                                                                                                                                                                           |
| `errorHandler.js`    | added (task 3)                 | `notFoundHandler`(404) and`errorHandler`. Maps Prisma errors (connection failures become 503 with`Retry-After`), Supabase auth errors, Zod errors, bad or oversized JSON and unknown errors to a safe JSON shape. Logs server errors with the request ID. Hides internals in production; adds a`debug`field in development.                                                                                                                                            |
| `requestId.js`       | added (tasks 3, 4)             | Gives each request an ID (`req.id`,`X-Request-Id`header) and stores the ID, client IP and user agent in the request context for audit logging.                                                                                                                                                                                                                                                                                                                         |
| `security.js`        | added (task 4)                 | `securityHeaders`(Helmet; the`/api-docs`pages skip only the CSP so Swagger UI works) and`noStore`(no caching of auth responses).                                                                                                                                                                                                                                                                                                                                       |

### `src/routes/`


| File                | Origin                         | What it does                                                                                                                                                                                 |
| ------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `authRoutes.js`     | original, updated (tasks 1–2) | Defines the`/api/auth/*`routes (section 5) and wires each one as: rate limiter → validation → controller. Holds the Swagger documentation comments.                                        |
| `userRoutes.js`     | added (task 5)                 | The`/api/users/*`routes (section 5). Every route requires a signed-in user; the update routes also go through`sensitiveLimiter`and validation. Holds the Swagger comments.                   |
| `hospitalRoutes.js` | added (task 6a)                | `/api/hospitals`:`GET /filters`,`GET /`(search; goes through`searchLimiter`and validation) and`GET /:id`.`/filters`is declared first so it is not read as an ID. Holds the Swagger comments. |
| `locationRoutes.js` | added (task 6a)                | `/api/states`:`GET /`and`GET /:stateId/lgas`.                                                                                                                                                |

### `src/services/`


| File               | Origin         | What it does                                                                                                                                                                                                                                                                                                              |
| ------------------ | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `audit.service.js` | added (task 4) | `recordSecurityEvent(userId, eventType, metadata)`writes to`security_events`(adds request ID, IP and user agent automatically);`recordLogin(...)`writes to`login_activities`;`hashEmail(email)`makes the short hash stored instead of an address. They never throw; call them with`void`so they don't delay the response. |

### `src/utils/`


| File                 | Origin          | What it does                                                                                                                                |
| -------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `ApiError.js`        | added (task 3)  | `ApiError(status, message, { code, errors, headers })`and`ValidationError`. Throw these from controllers; the central handler formats them. |
| `formatZodIssues.js` | added (task 3)  | Turns Zod issues into`[{ field, message }]`without ever echoing submitted values.                                                           |
| `requestContext.js`  | added (task 4)  | Per-request storage (request ID, IP, user agent) so audit logging can read them without passing`req`around.                                 |
| `geo.js`             | added (task 6a) | `distanceKm`(haversine) and`boundingBox`for near-me search.                                                                                 |

### `src/validation/`


| File                  | Origin             | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| --------------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `common.js`           | added (tasks 2, 5) | Reusable rules: email, new-password and login-password, display name, UUID, integer IDs (route/body), pagination query.                                                                                                                                                                                                                                                                                                                                                                                                    |
| `auth.schemas.js`     | added (task 2)     | Strict body schemas for register, login, forgot-password, resend-confirmation and logout. Unknown fields are rejected.                                                                                                                                                                                                                                                                                                                                                                                                     |
| `user.schemas.js`     | added (task 5)     | Rules for profile and notification updates. Username (3-30 characters, starts with a letter, lower-cased, reserved names blocked), phone number (stored as`+234…`; Nigerian local numbers are converted), avatar URL (only files in this project's Supabase Storage), language (`en`,`yo`,`ig`,`ha`,`pcm`: edit`SUPPORTED_LANGUAGES`to change), IANA timezone, theme (light/dark/system in any case) and the notification flags. Unknown fields are rejected, and`securityAlerts`, email and role cannot be changed here. |
| `hospital.schemas.js` | added (task 6a)    | Query and parameter rules for the directory: search text (2-100 characters), state / LGA / type IDs, ownership,`lat`and`lng`(must come together),`radiusKm`(1-100),`sort`(`name`,`newest`,`distance`),`page`,`limit`(max 50), UUID hospital IDs and state IDs. Unknown query parameters are rejected.                                                                                                                                                                                                                      |

---

## 5. API endpoints


| Method and path                                | Auth   | Notes                                                                                                                                                                                                                                 |
| ---------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /`                                        | none   | Basic status message.                                                                                                                                                                                                                 |
| `GET /api-docs`                                | none   | Swagger UI (production: only with`ENABLE_API_DOCS=true`).                                                                                                                                                                             |
| `GET /api/hospitals`                           | none   | Search and list. Parameters:`q`,`stateId`,`lgaId`,`typeId`,`ownership`,`lat`+`lng`(+`radiusKm`, default 25),`sort`,`page`,`limit`. With`lat`and`lng`results are nearest first and include`distanceKm`. 60 searches per minute per IP. |
| `GET /api/hospitals/filters`                   | none   | Hospital types and ownership values with counts, for the search filters. Cacheable for an hour.                                                                                                                                       |
| `GET /api/hospitals/:id`                       | none   | One hospital with description, year established and accessibility information. 404`HOSPITAL_NOT_FOUND`if unknown.                                                                                                                     |
| `GET /api/states`                              | none   | All states with hospital counts.                                                                                                                                                                                                      |
| `GET /api/states/:stateId/lgas`                | none   | The LGAs of a state with hospital counts. 404`STATE_NOT_FOUND`if unknown.                                                                                                                                                             |
| `POST /api/auth/register`                      | none   | Limited to 10/hour per IP. Same response for new and existing emails.                                                                                                                                                                 |
| `POST /api/auth/login`                         | none   | 5 failed attempts per 15 min per IP + email.                                                                                                                                                                                          |
| `POST /api/auth/forgot-password`               | none   | 3/hour per email address. Always answers 200.                                                                                                                                                                                         |
| `POST /api/auth/resend-confirmation`           | none   | 3/hour per email address. Always answers 200.                                                                                                                                                                                         |
| `POST /api/auth/logout`                        | Bearer | Body:`{ "refreshToken": "…" }`.                                                                                                                                                                                                      |
| `GET /api/auth/me`                             | Bearer | Returns the signed-in user.                                                                                                                                                                                                           |
| `GET /api/users/me`                            | Bearer | Full profile: name, username, avatar, phone, language, timezone, theme and more.                                                                                                                                                      |
| `PATCH /api/users/me`                          | Bearer | Update any of those fields (send only what changes;`null`clears name, username, phone and avatar). 30 changes per 15 min per user.                                                                                                    |
| `GET /api/users/me/notification-preferences`   | Bearer | Returns the settings, creating defaults on first use.                                                                                                                                                                                 |
| `PATCH /api/users/me/notification-preferences` | Bearer | Update notification switches. Security alerts can't be turned off.                                                                                                                                                                    |

All error responses look like: `{ "success": false, "message": "…", "code": "…", "requestId": "…", "errors": [{ "field", "message" }] }` (`errors` appears only for validation failures).

---

## 6. Environment variables (`.env`)


| Variable                           | Needed              | Purpose                                                                                                               |
| ---------------------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                     | yes                 | Postgres connection string (Supabase pooler).                                                                         |
| `DIRECT_URL`                       | being removed       | Only read by`prisma7.config.ts`. To be merged into`DATABASE_URL`.                                                     |
| `SUPABASE_URL`,`SUPABASE_ANON_KEY` | yes                 | Supabase project and public key.`SUPABASE_URL`is also used to check that avatar URLs point at this project's storage. |
| `PASSWORD_RESET_REDIRECT_URL`      | yes                 | Where the password-reset email link sends the user.                                                                   |
| `FRONTEND_URL`                     | recommended         | Frontend address: redirect after email confirmation, and CORS fallback.                                               |
| `CORS_ORIGINS`                     | production          | Comma-separated frontend origins allowed to call the API.                                                             |
| `TRUST_PROXY`                      | when behind a proxy | Number of proxy hops (usually`1`), so rate limits and audit logs see real client IPs. Leave unset locally.            |
| `ENABLE_API_DOCS`                  | optional            | `true`to expose`/api-docs`in production.                                                                              |
| `PORT`                             | optional            | Defaults to 5000.                                                                                                     |
| `NODE_ENV`                         | production          | Set to`production`when deployed (hides debug detail, tightens CORS and docs).                                         |

---

## 7. Audit events (table `security_events`)

Each row stores `metadata` with `requestId`, `ip` and `userAgent` (plus extras). Events: `ACCOUNT_REGISTERED`, `REGISTRATION_DUPLICATE_EMAIL`, `LOGIN_SUCCESSFUL`, `LOGIN_FAILED`, `LOGIN_BLOCKED_DEACTIVATED`, `LOGOUT`, `PASSWORD_RESET_REQUESTED`, `CONFIRMATION_EMAIL_REQUESTED`, `PROFILE_UPDATED` and `NOTIFICATION_PREFERENCES_UPDATED` (these two list the changed field names only). Emails are stored only as a 16-character hash (`emailHash`).

**Finding what happened for a user's error report:**`select * from security_events where metadata->>'requestId' = '<id from the error>';` and search the server logs for `[<id>]`.

---

## 8. Install checklist (tick as you apply each delivery)

**Packages:**`npm install express-rate-limit zod helmet`


| Task    | Files delivered                                                                                                                                                                                                                                                                                              |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1       | `src/middleware/rateLimiter.js`(new),`server.js`,`src/routes/authRoutes.js`,`controllers/auth.controller.js`(adds`resendConfirmation`)                                                                                                                                                                       |
| 2       | `src/validation/common.js`,`src/validation/auth.schemas.js`,`src/middleware/validate.js`(new),`src/routes/authRoutes.js`,`server.js`                                                                                                                                                                         |
| 3       | `src/utils/ApiError.js`,`src/utils/formatZodIssues.js`,`src/middleware/errorHandler.js`,`src/middleware/requestId.js`(new),`src/middleware/validate.js`,`src/middleware/rateLimiter.js`,`server.js`,`controllers/auth.controller.js`,`src/middleware/auth.middleware.js`                                     |
| 4       | `src/utils/requestContext.js`,`src/services/audit.service.js`,`src/config/cors.js`,`src/middleware/security.js`(new),`src/middleware/requestId.js`,`server.js`,`controllers/auth.controller.js`,`src/middleware/auth.middleware.js`                                                                          |
| 5       | `src/validation/user.schemas.js`,`controllers/user.controller.js`,`src/routes/userRoutes.js`(new),`src/validation/common.js`,`server.js`                                                                                                                                                                     |
| 6a      | `src/utils/geo.js`,`src/validation/hospital.schemas.js`,`controllers/hospital.controller.js`,`controllers/location.controller.js`,`src/routes/hospitalRoutes.js`,`src/routes/locationRoutes.js`(new),`src/middleware/rateLimiter.js`,`server.js`. Also delete the empty`controllers/hospitalControllers.js`. |
| SSL fix | `src/config/prisma.js`(connection-level retry)                                                                                                                                                                                                                                                               |

When a file appears in several rows, the **latest** delivery is the one to use (it already contains the earlier changes).

---

## 9. Pending and manual items

1. Apply any deliveries above that are not installed yet, and run `npm install express-rate-limit zod helmet`.
2. **Reset the database password** in Supabase (it was shared in chat and in an uploaded `.env`), then update `DATABASE_URL`.
3. Rename `prisma7.config.ts` to `prisma.config.ts`, point it at `DATABASE_URL`, then delete `DIRECT_URL` from `.env` and drop `?connect_timeout=60` from the URL.
4. Supabase dashboard: set the minimum password length to 8 (and optionally require letters and numbers).
5. Production: set `CORS_ORIGINS`, `NODE_ENV=production` and `TRUST_PROXY`; configure a custom SMTP provider (Supabase's built-in sender has a low hourly email cap).
6. Convert `prisma/migrations/0_init/migration.sql` from UTF-16 to UTF-8.
7. Clean-up: delete `generated/prisma/`, the AI-skill folders, `skills-lock.json`, the `postinstall` script and the diagnostic `test*.js` scripts.
8. Move `superbase-auth-trigger.sql` into a properly named, tracked file, and add a trigger that sets `email_verified_at` when the confirmation link is clicked.
9. Decide a retention period and a scheduled purge for `security_events` and `login_activities` (they hold IP addresses).
10. Not built yet for profiles: avatar upload (an avatar URL is only accepted for files already in this project's Supabase Storage), phone number verification, and the flexible `preferences` / privacy-settings and saved-location fields. Check that the language list in `src/validation/user.schemas.js` matches what the frontend supports.
11. **Hospital data to confirm:** what keys `hospitals.hospital_data` holds (phone, services, etc.). Nothing from it is shown publicly until its keys are added to `PUBLIC_HOSPITAL_DATA_KEYS` in `controllers/hospital.controller.js`. Also confirm the allowed values of `ownership` and `verification_status` (the database has check constraints that are not visible in the migrations).
12. If the hospital table grows well beyond tens of thousands of rows, add a `pg_trgm` index to speed up text search and consider PostGIS for near-me search. Current speed with 30,000 test rows: searches 20-200 ms.
13. Still to do from the roadmap: tasks 6b-6d (reviews and ratings, claims and verification, moderation) and task 7. Paused: age confirmation, onboarding and consent fields.

---

## 10. Change log


| Date       | Change                                                                                                                                                                                                                                                                                                                                                     |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-11-21 | Database SSL fix:`src/config/prisma.js`now retries failed connections (intermittent Supabase pooler handshake failures).                                                                                                                                                                                                                                   |
| 2026-11-21 | Task 1: rate limiting added; new`POST /api/auth/resend-confirmation`endpoint.                                                                                                                                                                                                                                                                              |
| 2026-11-21 | Task 2: Zod validation and sanitization for all auth routes; JSON body limit 10 KB.                                                                                                                                                                                                                                                                        |
| 2026-11-21 | Task 3: central error handling and request IDs; controllers and auth middleware now throw`ApiError`; unconfirmed-email login returns 403`EMAIL_NOT_CONFIRMED`; outages return 503 instead of a false 401.                                                                                                                                                  |
| 2026-11-21 | Task 4: Helmet, CORS allowlist,`no-store`on auth responses, JWT-shape check, audit logging service, same registration response for existing emails, post-signup database lookup removed, Swagger hidden in production.                                                                                                                                     |
| 2026-11-21 | README created.                                                                                                                                                                                                                                                                                                                                            |
| 2026-11-21 | Task 5: profile and notification-preference endpoints under`/api/users/me`(profile read/update, username, phone, avatar, language, timezone, theme, notification switches);`sensitiveLimiter`now in use;`common.js`gains`displayNameUpdateSchema`and exports`typed`.                                                                                       |
| 2026-11-21 | Task 6a: public hospital directory (`/api/hospitals`,`/api/hospitals/filters`,`/api/hospitals/:id`,`/api/states`,`/api/states/:stateId/lgas`) with text search, filters, sorting, pagination and near-me search;`searchLimiter`added; temporary hospital stub removed. Tested against a real PostgreSQL database; search now treats`%`,`_`and`\`literally. |

# Dreel — Hospital Review Platform: Backend

Express 5 API for the Hospital Review Platform (Nigeria first). Authentication is handled by Supabase Auth, data lives in Supabase Postgres, and the app talks to the database through Prisma 7 with the `pg` driver adapter.

> **Keep this README up to date.** Every time a file is added, changed or removed, update this file and the change log at the bottom in the same step.

---

## 1. How this code got here (read this first)

* **Original files** (marked *original* below) came from the backend zip uploaded on 2026-11-21. They were built before the hardening work started.
* **Files marked *added* or *updated*** were created or changed during the hardening work (the database SSL fix and roadmap tasks 1-6).
* No code has been edited by hand: every change was applied exactly as supplied, so this README describes the current state of the project.
* The files marked *added* or *updated* are what has been **delivered**. Use the install checklist in section 8 to tick off what has been applied, and correct this README if any delivered file has not been applied yet.

---

## 2. Roadmap status


| #  | Task                                                                                                                                                                                           | Status                         |
| -- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| 1  | API rate limiting                                                                                                                                                                              | Delivered                      |
| 2  | Request validation and sanitization                                                                                                                                                            | Delivered                      |
| 3  | Centralized error handling                                                                                                                                                                     | Delivered                      |
| 4  | Security hardening (Helmet, CORS, token handling, audit logging, enumeration protection)                                                                                                       | Delivered                      |
| 5  | User profile and preferences (notifications, language, timezone, theme)                                                                                                                        | Delivered                      |
| 6  | Hospital functionality:**6a hospital directory (search, near-me, detail, filters, states and LGAs): delivered.**6b reviews and ratings, 6c claims and verification, 6d moderation: not started | In progress                    |
| 7  | Role management: admin-only role changes, and a guard that stops the last admin being changed                                                                                                  | Not started (last on the list) |
| – | Manual: raise the minimum password length to 8 in the Supabase dashboard's auth settings                                                                                                       | Needs doing by you             |

---

## 3. Project structure

```
backend/
├── server.js
├── package.json / package-lock.json
├── .env                      (secrets, never commit)
├── .gitignore
├── prisma7.config.ts
├── schema.prisma.backup
├── skills-lock.json
├── README.md
│
├── controllers/
│   ├── auth.controller.js
│   ├── user.controller.js
│   ├── hospital.controller.js
│   └── location.controller.js
│
├── prisma/
│   ├── schema.prisma
│   ├── baseline.prisma
│   ├── superbase-auth-trigger.sql
│   └── migrations/
│       ├── 0_init/migration.sql
│       └── 20261120_add_auth_tables/migration.sql
│
└── src/
    ├── config/
    │   ├── prisma.js
    │   ├── supabase.js
    │   ├── swagger.js
    │   ├── cors.js
    │   └── test*.js            (diagnostic scripts)
    ├── middleware/
    │   ├── auth.middleware.js
    │   ├── errorHandler.js
    │   ├── rateLimiter.js
    │   ├── requestId.js
    │   ├── security.js
    │   └── validate.js
    ├── routes/
    │   ├── authRoutes.js
    │   ├── userRoutes.js
    │   ├── hospitalRoutes.js
    │   └── locationRoutes.js
    ├── services/
    │   └── audit.service.js
    ├── utils/
    │   ├── ApiError.js
    │   ├── formatZodIssues.js
    │   ├── geo.js
    │   └── requestContext.js
    └── validation/
        ├── common.js
        ├── auth.schemas.js
        ├── user.schemas.js
        └── hospital.schemas.js
```

---

## 4. File reference

### Root


| File                                                                                                                           | Origin                         | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `server.js`                                                                                                                    | original, updated (tasks 1–6) | App entry point. Sets`trust proxy`(when`TRUST_PROXY`is set), then registers middleware in this order: request ID → Helmet → CORS → JSON body parser (10 KB limit) → Swagger docs (hidden in production unless`ENABLE_API_DOCS=true`) →`GET /`→`/api`rate limiter →`/api/hospitals`and`/api/states`(public directory) →`/api/auth`routes and`/api/users`routes (both with`no-store`caching) → 404 handler → central error handler. Starts the server on`PORT`(default 5000). |
| `package.json`                                                                                                                 | original                       | Dependencies and scripts (`npm run dev`= watch mode,`npm start`).**Needs`express-rate-limit`,`zod`and`helmet`added**(`npm install express-rate-limit zod helmet`). It still has a`postinstall`script (`prisma skills sync`) that creates the AI-skill folders listed below; it can be removed.                                                                                                                                                                                        |
| `package-lock.json`                                                                                                            | original                       | Exact dependency versions. Generated by npm; don't edit.                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `.env`                                                                                                                         | original                       | Secrets and settings. Never commit or share it. Variables are listed in section 6.                                                                                                                                                                                                                                                                                                                                                                                                    |
| `.gitignore`                                                                                                                   | original                       | Keeps`node_modules/`,`.env`and`/generated/prisma`out of git.                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `prisma7.config.ts`                                                                                                            | original                       | Prisma CLI configuration (schema path, migrations path, database URL).**Misnamed:**Prisma only auto-loads`prisma.config.ts`. It also still reads`DIRECT_URL`; the plan is to switch it to`DATABASE_URL`. See section 9.                                                                                                                                                                                                                                                               |
| `schema.prisma.backup`                                                                                                         | original                       | Backup of an earlier, larger schema design (29 models: reviews, ratings, claims, moderation, favourites, notifications, audit log and more). Not used by the app. It is the starting point for task 6.                                                                                                                                                                                                                                                                                |
| `skills-lock.json`and the hidden AI-tool folders in the project root (`.agents/`,`.cursor/`,`.devin/`,`.windsurf/`and similar) | original                       | AI-assistant "skill" files created by`prisma skills sync`. Not part of the application; safe to delete.                                                                                                                                                                                                                                                                                                                                                                               |
| `generated/prisma/`                                                                                                            | original                       | An old generated Prisma client from the larger schema. Stale and unused (the app imports`@prisma/client`). Git-ignored; safe to delete.                                                                                                                                                                                                                                                                                                                                               |
| `README.md`                                                                                                                    | added                          | This file.                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |

### `controllers/`


| File                     | Origin                         | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------ | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `auth.controller.js`     | original, updated (tasks 1–4) | The auth handlers:`register`,`login`,`logout`,`getMe`,`forgotPassword`,`resendConfirmation`. Supabase creates and signs in accounts; Prisma reads and updates the`users`table. Errors are thrown and handled centrally. Registration returns the same 201 response for new and already-registered emails (account-enumeration protection) and builds its response from the signup result with no database read. Audit events are written fire-and-forget.                                        |
| `user.controller.js`     | added (task 5)                 | Profile and notification-preference handlers for the signed-in user only:`getProfile`,`updateProfile`(a taken username returns 409`USERNAME_TAKEN`),`getNotificationPreferences`(creates the default row on first use) and`updateNotificationPreferences`. No user ID appears in any URL, so one user can never reach another's data. Audit events store field names, never values.                                                                                                              |
| `hospital.controller.js` | added (task 6a)                | Public hospital directory:`listHospitals`(text search, filters, sorting, pagination and near-me search),`getHospital`and`getHospitalFilters`. Search text is matched word by word against name, city, LGA and state with`%`,`_`and`\`treated literally. Near-me search lets the database discard everything outside a bounding box, then works out exact distances (haversine) for the rest.`hospital_data`is never exposed unless a key is listed in`PUBLIC_HOSPITAL_DATA_KEYS`(empty for now). |
| `location.controller.js` | added (task 6a)                | `listStates`and`listLgas`: reference data for the search filters, with hospital counts, cacheable for an hour.                                                                                                                                                                                                                                                                                                                                                                                   |
| `hospitalControllers.js` | original                       | Empty placeholder, now superseded by`hospital.controller.js`.**Delete it.**                                                                                                                                                                                                                                                                                                                                                                                                                      |

### `prisma/`


| File                                                | Origin   | What it does                                                                                                                                                                                                                                                                                        |
| --------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `schema.prisma`                                     | original | The current database models:`hospital_types`,`hospitals`,`lgas`,`states`(introspected from Supabase), plus`User`(table`users`),`NotificationPreference`,`LoginActivity`,`SecurityEvent`and the enums`UserRole`and`Theme`. Age/consent fields and review models are**not**added yet (paused by you). |
| `baseline.prisma`                                   | original | Snapshot of the hospital/state/LGA models used to create the baseline migration. Not used at runtime.                                                                                                                                                                                               |
| `superbase-auth-trigger.sql`                        | original | SQL run in Supabase that creates a row in`public.users`whenever a Supabase Auth user is created (the filename has a typo, "superbase"). It only fires on insert, so`email_verified_at`is refreshed at login rather than when the confirmation link is clicked.                                      |
| `migrations/0_init/migration.sql`                   | original | Baseline migration for the existing hospital, state and LGA tables.**Saved as UTF-16**(a PowerShell redirect side effect); convert it to UTF-8 before running Prisma migrate commands.                                                                                                              |
| `migrations/20261120_add_auth_tables/migration.sql` | original | Creates`users`,`notification_preferences`,`login_activities`and`security_events`(with row-level security enabled).                                                                                                                                                                                  |

### `src/config/`


| File                                                                                              | Origin                      | What it does                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `prisma.js`                                                                                       | original, updated (SSL fix) | Creates the single Prisma client. Uses a`pg`pool with SSL (certificate check relaxed for development), keep-alive, and a**connection-level retry**(up to 6 attempts) because opening connections to Supabase's pooler fails intermittently. Also exports`pool`. |
| `supabase.js`                                                                                     | original                    | `createSupabaseAuthClient()`makes a fresh Supabase client (no session persistence) for sign-up, sign-in and similar calls. The default export is a shared client used only to verify access tokens. Needs`SUPABASE_URL`and`SUPABASE_ANON_KEY`.                  |
| `swagger.js`                                                                                      | original                    | OpenAPI settings for the docs page at`/api-docs`; reads the`@swagger`comments in`src/routes/*.js`.                                                                                                                                                              |
| `cors.js`                                                                                         | added (task 4)              | CORS allowlist. Reads`CORS_ORIGINS`(falls back to`FRONTEND_URL`, then to`localhost:3000`and`localhost:5173`outside production). Blocked origins get a 403`CORS_ERROR`. Exposes`X-Request-Id`,`Retry-After`and`RateLimit`headers to browser code.                |
| `testDB.js`,`testPrisma.js`,`testSslByte.js`(+`testRetry.js`,`testConnect.js`if you created them) | original/added              | Diagnostic scripts from the database SSL investigation. Not used by the app; safe to delete. Note that`testPrisma.js`holds a no-SSL connection test despite its name.                                                                                           |

### `src/middleware/`


| File                 | Origin                         | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| -------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `auth.middleware.js` | original, updated (tasks 3–4) | `authenticate`: checks the Bearer token (shape check first, then Supabase`getUser`), loads the user from the database, rejects deactivated accounts, sets`req.user`and`req.accessToken`.`authorize(...roles)`: role check for later routes.                                                                                                                                                                                                                            |
| `rateLimiter.js`     | added (tasks 1, 3, 6)          | Rate limiters: general API, register, login (failed attempts only, per IP and per IP + email), forgot-password and resend-confirmation (per IP and per target email), and`sensitiveLimiter`for signed-in users (30 per 15 minutes per user; used on the profile and notification update routes), and`searchLimiter`(60 hospital searches per minute per IP). 429 responses include`code`and`requestId`. In-memory store: resets on restart and covers one server only. |
| `validate.js`        | added (tasks 2, 3)             | `validate({ body, params, query })`runs Zod schemas, replaces`req.body`/`req.params`with the cleaned data (parsed query is`req.validatedQuery`) and forwards failures as a`ValidationError`.                                                                                                                                                                                                                                                                           |
| `errorHandler.js`    | added (task 3)                 | `notFoundHandler`(404) and`errorHandler`. Maps Prisma errors (connection failures become 503 with`Retry-After`), Supabase auth errors, Zod errors, bad or oversized JSON and unknown errors to a safe JSON shape. Logs server errors with the request ID. Hides internals in production; adds a`debug`field in development.                                                                                                                                            |
| `requestId.js`       | added (tasks 3, 4)             | Gives each request an ID (`req.id`,`X-Request-Id`header) and stores the ID, client IP and user agent in the request context for audit logging.                                                                                                                                                                                                                                                                                                                         |
| `security.js`        | added (task 4)                 | `securityHeaders`(Helmet; the`/api-docs`pages skip only the CSP so Swagger UI works) and`noStore`(no caching of auth responses).                                                                                                                                                                                                                                                                                                                                       |

### `src/routes/`


| File                | Origin                         | What it does                                                                                                                                                                                 |
| ------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `authRoutes.js`     | original, updated (tasks 1–2) | Defines the`/api/auth/*`routes (section 5) and wires each one as: rate limiter → validation → controller. Holds the Swagger documentation comments.                                        |
| `userRoutes.js`     | added (task 5)                 | The`/api/users/*`routes (section 5). Every route requires a signed-in user; the update routes also go through`sensitiveLimiter`and validation. Holds the Swagger comments.                   |
| `hospitalRoutes.js` | added (task 6a)                | `/api/hospitals`:`GET /filters`,`GET /`(search; goes through`searchLimiter`and validation) and`GET /:id`.`/filters`is declared first so it is not read as an ID. Holds the Swagger comments. |
| `locationRoutes.js` | added (task 6a)                | `/api/states`:`GET /`and`GET /:stateId/lgas`.                                                                                                                                                |

### `src/services/`


| File               | Origin         | What it does                                                                                                                                                                                                                                                                                                              |
| ------------------ | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `audit.service.js` | added (task 4) | `recordSecurityEvent(userId, eventType, metadata)`writes to`security_events`(adds request ID, IP and user agent automatically);`recordLogin(...)`writes to`login_activities`;`hashEmail(email)`makes the short hash stored instead of an address. They never throw; call them with`void`so they don't delay the response. |

### `src/utils/`


| File                 | Origin          | What it does                                                                                                                                |
| -------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `ApiError.js`        | added (task 3)  | `ApiError(status, message, { code, errors, headers })`and`ValidationError`. Throw these from controllers; the central handler formats them. |
| `formatZodIssues.js` | added (task 3)  | Turns Zod issues into`[{ field, message }]`without ever echoing submitted values.                                                           |
| `requestContext.js`  | added (task 4)  | Per-request storage (request ID, IP, user agent) so audit logging can read them without passing`req`around.                                 |
| `geo.js`             | added (task 6a) | `distanceKm`(haversine) and`boundingBox`for near-me search.                                                                                 |

### `src/validation/`


| File                  | Origin             | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| --------------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `common.js`           | added (tasks 2, 5) | Reusable rules: email, new-password and login-password, display name, UUID, integer IDs (route/body), pagination query.                                                                                                                                                                                                                                                                                                                                                                                                    |
| `auth.schemas.js`     | added (task 2)     | Strict body schemas for register, login, forgot-password, resend-confirmation and logout. Unknown fields are rejected.                                                                                                                                                                                                                                                                                                                                                                                                     |
| `user.schemas.js`     | added (task 5)     | Rules for profile and notification updates. Username (3-30 characters, starts with a letter, lower-cased, reserved names blocked), phone number (stored as`+234…`; Nigerian local numbers are converted), avatar URL (only files in this project's Supabase Storage), language (`en`,`yo`,`ig`,`ha`,`pcm`: edit`SUPPORTED_LANGUAGES`to change), IANA timezone, theme (light/dark/system in any case) and the notification flags. Unknown fields are rejected, and`securityAlerts`, email and role cannot be changed here. |
| `hospital.schemas.js` | added (task 6a)    | Query and parameter rules for the directory: search text (2-100 characters), state / LGA / type IDs, ownership,`lat`and`lng`(must come together),`radiusKm`(1-100),`sort`(`name`,`newest`,`distance`),`page`,`limit`(max 50), UUID hospital IDs and state IDs. Unknown query parameters are rejected.                                                                                                                                                                                                                      |

---

## 5. API endpoints


| Method and path                                | Auth   | Notes                                                                                                                                                                                                                                 |
| ---------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /`                                        | none   | Basic status message.                                                                                                                                                                                                                 |
| `GET /api-docs`                                | none   | Swagger UI (production: only with`ENABLE_API_DOCS=true`).                                                                                                                                                                             |
| `GET /api/hospitals`                           | none   | Search and list. Parameters:`q`,`stateId`,`lgaId`,`typeId`,`ownership`,`lat`+`lng`(+`radiusKm`, default 25),`sort`,`page`,`limit`. With`lat`and`lng`results are nearest first and include`distanceKm`. 60 searches per minute per IP. |
| `GET /api/hospitals/filters`                   | none   | Hospital types and ownership values with counts, for the search filters. Cacheable for an hour.                                                                                                                                       |
| `GET /api/hospitals/:id`                       | none   | One hospital with description, year established and accessibility information. 404`HOSPITAL_NOT_FOUND`if unknown.                                                                                                                     |
| `GET /api/states`                              | none   | All states with hospital counts.                                                                                                                                                                                                      |
| `GET /api/states/:stateId/lgas`                | none   | The LGAs of a state with hospital counts. 404`STATE_NOT_FOUND`if unknown.                                                                                                                                                             |
| `POST /api/auth/register`                      | none   | Limited to 10/hour per IP. Same response for new and existing emails.                                                                                                                                                                 |
| `POST /api/auth/login`                         | none   | 5 failed attempts per 15 min per IP + email.                                                                                                                                                                                          |
| `POST /api/auth/forgot-password`               | none   | 3/hour per email address. Always answers 200.                                                                                                                                                                                         |
| `POST /api/auth/resend-confirmation`           | none   | 3/hour per email address. Always answers 200.                                                                                                                                                                                         |
| `POST /api/auth/logout`                        | Bearer | Body:`{ "refreshToken": "…" }`.                                                                                                                                                                                                      |
| `GET /api/auth/me`                             | Bearer | Returns the signed-in user.                                                                                                                                                                                                           |
| `GET /api/users/me`                            | Bearer | Full profile: name, username, avatar, phone, language, timezone, theme and more.                                                                                                                                                      |
| `PATCH /api/users/me`                          | Bearer | Update any of those fields (send only what changes;`null`clears name, username, phone and avatar). 30 changes per 15 min per user.                                                                                                    |
| `GET /api/users/me/notification-preferences`   | Bearer | Returns the settings, creating defaults on first use.                                                                                                                                                                                 |
| `PATCH /api/users/me/notification-preferences` | Bearer | Update notification switches. Security alerts can't be turned off.                                                                                                                                                                    |

All error responses look like: `{ "success": false, "message": "…", "code": "…", "requestId": "…", "errors": [{ "field", "message" }] }` (`errors` appears only for validation failures).

---

## 6. Environment variables (`.env`)


| Variable                           | Needed              | Purpose                                                                                                               |
| ---------------------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                     | yes                 | Postgres connection string (Supabase pooler).                                                                         |
| `DIRECT_URL`                       | being removed       | Only read by`prisma7.config.ts`. To be merged into`DATABASE_URL`.                                                     |
| `SUPABASE_URL`,`SUPABASE_ANON_KEY` | yes                 | Supabase project and public key.`SUPABASE_URL`is also used to check that avatar URLs point at this project's storage. |
| `PASSWORD_RESET_REDIRECT_URL`      | yes                 | Where the password-reset email link sends the user.                                                                   |
| `FRONTEND_URL`                     | recommended         | Frontend address: redirect after email confirmation, and CORS fallback.                                               |
| `CORS_ORIGINS`                     | production          | Comma-separated frontend origins allowed to call the API.                                                             |
| `TRUST_PROXY`                      | when behind a proxy | Number of proxy hops (usually`1`), so rate limits and audit logs see real client IPs. Leave unset locally.            |
| `ENABLE_API_DOCS`                  | optional            | `true`to expose`/api-docs`in production.                                                                              |
| `PORT`                             | optional            | Defaults to 5000.                                                                                                     |
| `NODE_ENV`                         | production          | Set to`production`when deployed (hides debug detail, tightens CORS and docs).                                         |

---

## 7. Audit events (table `security_events`)

Each row stores `metadata` with `requestId`, `ip` and `userAgent` (plus extras). Events: `ACCOUNT_REGISTERED`, `REGISTRATION_DUPLICATE_EMAIL`, `LOGIN_SUCCESSFUL`, `LOGIN_FAILED`, `LOGIN_BLOCKED_DEACTIVATED`, `LOGOUT`, `PASSWORD_RESET_REQUESTED`, `CONFIRMATION_EMAIL_REQUESTED`, `PROFILE_UPDATED` and `NOTIFICATION_PREFERENCES_UPDATED` (these two list the changed field names only). Emails are stored only as a 16-character hash (`emailHash`).

**Finding what happened for a user's error report:**`select * from security_events where metadata->>'requestId' = '<id from the error>';` and search the server logs for `[<id>]`.

---

## 8. Install checklist (tick as you apply each delivery)

**Packages:**`npm install express-rate-limit zod helmet`


| Task    | Files delivered                                                                                                                                                                                                                                                                                              |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1       | `src/middleware/rateLimiter.js`(new),`server.js`,`src/routes/authRoutes.js`,`controllers/auth.controller.js`(adds`resendConfirmation`)                                                                                                                                                                       |
| 2       | `src/validation/common.js`,`src/validation/auth.schemas.js`,`src/middleware/validate.js`(new),`src/routes/authRoutes.js`,`server.js`                                                                                                                                                                         |
| 3       | `src/utils/ApiError.js`,`src/utils/formatZodIssues.js`,`src/middleware/errorHandler.js`,`src/middleware/requestId.js`(new),`src/middleware/validate.js`,`src/middleware/rateLimiter.js`,`server.js`,`controllers/auth.controller.js`,`src/middleware/auth.middleware.js`                                     |
| 4       | `src/utils/requestContext.js`,`src/services/audit.service.js`,`src/config/cors.js`,`src/middleware/security.js`(new),`src/middleware/requestId.js`,`server.js`,`controllers/auth.controller.js`,`src/middleware/auth.middleware.js`                                                                          |
| 5       | `src/validation/user.schemas.js`,`controllers/user.controller.js`,`src/routes/userRoutes.js`(new),`src/validation/common.js`,`server.js`                                                                                                                                                                     |
| 6a      | `src/utils/geo.js`,`src/validation/hospital.schemas.js`,`controllers/hospital.controller.js`,`controllers/location.controller.js`,`src/routes/hospitalRoutes.js`,`src/routes/locationRoutes.js`(new),`src/middleware/rateLimiter.js`,`server.js`. Also delete the empty`controllers/hospitalControllers.js`. |
| SSL fix | `src/config/prisma.js`(connection-level retry)                                                                                                                                                                                                                                                               |

When a file appears in several rows, the **latest** delivery is the one to use (it already contains the earlier changes).

---

## 9. Pending and manual items

1. Apply any deliveries above that are not installed yet, and run `npm install express-rate-limit zod helmet`.
2. **Reset the database password** in Supabase (it was shared in chat and in an uploaded `.env`), then update `DATABASE_URL`.
3. Rename `prisma7.config.ts` to `prisma.config.ts`, point it at `DATABASE_URL`, then delete `DIRECT_URL` from `.env` and drop `?connect_timeout=60` from the URL.
4. Supabase dashboard: set the minimum password length to 8 (and optionally require letters and numbers).
5. Production: set `CORS_ORIGINS`, `NODE_ENV=production` and `TRUST_PROXY`; configure a custom SMTP provider (Supabase's built-in sender has a low hourly email cap).
6. Convert `prisma/migrations/0_init/migration.sql` from UTF-16 to UTF-8.
7. Clean-up: delete `generated/prisma/`, the AI-skill folders, `skills-lock.json`, the `postinstall` script and the diagnostic `test*.js` scripts.
8. Move `superbase-auth-trigger.sql` into a properly named, tracked file, and add a trigger that sets `email_verified_at` when the confirmation link is clicked.
9. Decide a retention period and a scheduled purge for `security_events` and `login_activities` (they hold IP addresses).
10. Not built yet for profiles: avatar upload (an avatar URL is only accepted for files already in this project's Supabase Storage), phone number verification, and the flexible `preferences` / privacy-settings and saved-location fields. Check that the language list in `src/validation/user.schemas.js` matches what the frontend supports.
11. **Hospital data to confirm:** what keys `hospitals.hospital_data` holds (phone, services, etc.). Nothing from it is shown publicly until its keys are added to `PUBLIC_HOSPITAL_DATA_KEYS` in `controllers/hospital.controller.js`. Also confirm the allowed values of `ownership` and `verification_status` (the database has check constraints that are not visible in the migrations).
12. If the hospital table grows well beyond tens of thousands of rows, add a `pg_trgm` index to speed up text search and consider PostGIS for near-me search. Current speed with 30,000 test rows: searches 20-200 ms.
13. Still to do from the roadmap: tasks 6b-6d (reviews and ratings, claims and verification, moderation) and task 7. Paused: age confirmation, onboarding and consent fields.

---

## 10. Change log


| Date       | Change                                                                                                                                                                                                                                                                                                                                                     |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-11-21 | Database SSL fix:`src/config/prisma.js`now retries failed connections (intermittent Supabase pooler handshake failures).                                                                                                                                                                                                                                   |
| 2026-11-21 | Task 1: rate limiting added; new`POST /api/auth/resend-confirmation`endpoint.                                                                                                                                                                                                                                                                              |
| 2026-11-21 | Task 2: Zod validation and sanitization for all auth routes; JSON body limit 10 KB.                                                                                                                                                                                                                                                                        |
| 2026-11-21 | Task 3: central error handling and request IDs; controllers and auth middleware now throw`ApiError`; unconfirmed-email login returns 403`EMAIL_NOT_CONFIRMED`; outages return 503 instead of a false 401.                                                                                                                                                  |
| 2026-11-21 | Task 4: Helmet, CORS allowlist,`no-store`on auth responses, JWT-shape check, audit logging service, same registration response for existing emails, post-signup database lookup removed, Swagger hidden in production.                                                                                                                                     |
| 2026-11-21 | README created.                                                                                                                                                                                                                                                                                                                                            |
| 2026-11-21 | Task 5: profile and notification-preference endpoints under`/api/users/me`(profile read/update, username, phone, avatar, language, timezone, theme, notification switches);`sensitiveLimiter`now in use;`common.js`gains`displayNameUpdateSchema`and exports`typed`.                                                                                       |
| 2026-11-21 | Task 6a: public hospital directory (`/api/hospitals`,`/api/hospitals/filters`,`/api/hospitals/:id`,`/api/states`,`/api/states/:stateId/lgas`) with text search, filters, sorting, pagination and near-me search;`searchLimiter`added; temporary hospital stub removed. Tested against a real PostgreSQL database; search now treats`%`,`_`and`\`literally. |

# Dreel — Hospital Review Platform: Backend

Express 5 API for the Hospital Review Platform (Nigeria first). Authentication is handled by Supabase Auth, data lives in Supabase Postgres, and the app talks to the database through Prisma 7 with the `pg` driver adapter.

> **Keep this README up to date.** Every time a file is added, changed or removed, update this file and the change log at the bottom in the same step.

---

## 1. How this code got here (read this first)

* **Original files** (marked *original* below) came from the backend zip uploaded on 2026-11-21. They were built before the hardening work started.
* **Files marked *added* or *updated*** were created or changed during the hardening work (the database SSL fix and roadmap tasks 1-6).
* No code has been edited by hand: every change was applied exactly as supplied, so this README describes the current state of the project.
* The files marked *added* or *updated* are what has been **delivered**. Use the install checklist in section 8 to tick off what has been applied, and correct this README if any delivered file has not been applied yet.

---

## 2. Roadmap status


| #  | Task                                                                                                                                                                                           | Status                         |
| -- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| 1  | API rate limiting                                                                                                                                                                              | Delivered                      |
| 2  | Request validation and sanitization                                                                                                                                                            | Delivered                      |
| 3  | Centralized error handling                                                                                                                                                                     | Delivered                      |
| 4  | Security hardening (Helmet, CORS, token handling, audit logging, enumeration protection)                                                                                                       | Delivered                      |
| 5  | User profile and preferences (notifications, language, timezone, theme)                                                                                                                        | Delivered                      |
| 6  | Hospital functionality:**6a hospital directory (search, near-me, detail, filters, states and LGAs): delivered.**6b reviews and ratings, 6c claims and verification, 6d moderation: not started | In progress                    |
| 7  | Role management: admin-only role changes, and a guard that stops the last admin being changed                                                                                                  | Not started (last on the list) |
| – | Manual: raise the minimum password length to 8 in the Supabase dashboard's auth settings                                                                                                       | Needs doing by you             |

---

## 3. Project structure

```
backend/
├── server.js
├── package.json / package-lock.json
├── .env                      (secrets, never commit)
├── .gitignore
├── prisma7.config.ts
├── schema.prisma.backup
├── skills-lock.json
├── README.md
│
├── controllers/
│   ├── auth.controller.js
│   ├── user.controller.js
│   ├── hospital.controller.js
│   └── location.controller.js
│
├── prisma/
│   ├── schema.prisma
│   ├── baseline.prisma
│   ├── superbase-auth-trigger.sql
│   └── migrations/
│       ├── 0_init/migration.sql
│       └── 20261120_add_auth_tables/migration.sql
│
└── src/
    ├── config/
    │   ├── prisma.js
    │   ├── supabase.js
    │   ├── swagger.js
    │   ├── cors.js
    │   └── test*.js            (diagnostic scripts)
    ├── middleware/
    │   ├── auth.middleware.js
    │   ├── errorHandler.js
    │   ├── rateLimiter.js
    │   ├── requestId.js
    │   ├── security.js
    │   └── validate.js
    ├── routes/
    │   ├── authRoutes.js
    │   ├── userRoutes.js
    │   ├── hospitalRoutes.js
    │   └── locationRoutes.js
    ├── services/
    │   └── audit.service.js
    ├── utils/
    │   ├── ApiError.js
    │   ├── formatZodIssues.js
    │   ├── geo.js
    │   └── requestContext.js
    └── validation/
        ├── common.js
        ├── auth.schemas.js
        ├── user.schemas.js
        └── hospital.schemas.js
```

---

## 4. File reference

### Root


| File                                                                                                                           | Origin                         | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `server.js`                                                                                                                    | original, updated (tasks 1–6) | App entry point. Sets`trust proxy`(when`TRUST_PROXY`is set), then registers middleware in this order: request ID → Helmet → CORS → JSON body parser (10 KB limit) → Swagger docs (hidden in production unless`ENABLE_API_DOCS=true`) →`GET /`→`/api`rate limiter →`/api/hospitals`and`/api/states`(public directory) →`/api/auth`routes and`/api/users`routes (both with`no-store`caching) → 404 handler → central error handler. Starts the server on`PORT`(default 5000). |
| `package.json`                                                                                                                 | original                       | Dependencies and scripts (`npm run dev`= watch mode,`npm start`).**Needs`express-rate-limit`,`zod`and`helmet`added**(`npm install express-rate-limit zod helmet`). It still has a`postinstall`script (`prisma skills sync`) that creates the AI-skill folders listed below; it can be removed.                                                                                                                                                                                        |
| `package-lock.json`                                                                                                            | original                       | Exact dependency versions. Generated by npm; don't edit.                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `.env`                                                                                                                         | original                       | Secrets and settings. Never commit or share it. Variables are listed in section 6.                                                                                                                                                                                                                                                                                                                                                                                                    |
| `.gitignore`                                                                                                                   | original                       | Keeps`node_modules/`,`.env`and`/generated/prisma`out of git.                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `prisma7.config.ts`                                                                                                            | original                       | Prisma CLI configuration (schema path, migrations path, database URL).**Misnamed:**Prisma only auto-loads`prisma.config.ts`. It also still reads`DIRECT_URL`; the plan is to switch it to`DATABASE_URL`. See section 9.                                                                                                                                                                                                                                                               |
| `schema.prisma.backup`                                                                                                         | original                       | Backup of an earlier, larger schema design (29 models: reviews, ratings, claims, moderation, favourites, notifications, audit log and more). Not used by the app. It is the starting point for task 6.                                                                                                                                                                                                                                                                                |
| `skills-lock.json`and the hidden AI-tool folders in the project root (`.agents/`,`.cursor/`,`.devin/`,`.windsurf/`and similar) | original                       | AI-assistant "skill" files created by`prisma skills sync`. Not part of the application; safe to delete.                                                                                                                                                                                                                                                                                                                                                                               |
| `generated/prisma/`                                                                                                            | original                       | An old generated Prisma client from the larger schema. Stale and unused (the app imports`@prisma/client`). Git-ignored; safe to delete.                                                                                                                                                                                                                                                                                                                                               |
| `README.md`                                                                                                                    | added                          | This file.                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |

### `controllers/`


| File                     | Origin                         | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------ | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `auth.controller.js`     | original, updated (tasks 1–4) | The auth handlers:`register`,`login`,`logout`,`getMe`,`forgotPassword`,`resendConfirmation`. Supabase creates and signs in accounts; Prisma reads and updates the`users`table. Errors are thrown and handled centrally. Registration returns the same 201 response for new and already-registered emails (account-enumeration protection) and builds its response from the signup result with no database read. Audit events are written fire-and-forget.                                        |
| `user.controller.js`     | added (task 5)                 | Profile and notification-preference handlers for the signed-in user only:`getProfile`,`updateProfile`(a taken username returns 409`USERNAME_TAKEN`),`getNotificationPreferences`(creates the default row on first use) and`updateNotificationPreferences`. No user ID appears in any URL, so one user can never reach another's data. Audit events store field names, never values.                                                                                                              |
| `hospital.controller.js` | added (task 6a)                | Public hospital directory:`listHospitals`(text search, filters, sorting, pagination and near-me search),`getHospital`and`getHospitalFilters`. Search text is matched word by word against name, city, LGA and state with`%`,`_`and`\`treated literally. Near-me search lets the database discard everything outside a bounding box, then works out exact distances (haversine) for the rest.`hospital_data`is never exposed unless a key is listed in`PUBLIC_HOSPITAL_DATA_KEYS`(empty for now). |
| `location.controller.js` | added (task 6a)                | `listStates`and`listLgas`: reference data for the search filters, with hospital counts, cacheable for an hour.                                                                                                                                                                                                                                                                                                                                                                                   |
| `hospitalControllers.js` | original                       | Empty placeholder, now superseded by`hospital.controller.js`.**Delete it.**                                                                                                                                                                                                                                                                                                                                                                                                                      |

### `prisma/`


| File                                                | Origin   | What it does                                                                                                                                                                                                                                                                                        |
| --------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `schema.prisma`                                     | original | The current database models:`hospital_types`,`hospitals`,`lgas`,`states`(introspected from Supabase), plus`User`(table`users`),`NotificationPreference`,`LoginActivity`,`SecurityEvent`and the enums`UserRole`and`Theme`. Age/consent fields and review models are**not**added yet (paused by you). |
| `baseline.prisma`                                   | original | Snapshot of the hospital/state/LGA models used to create the baseline migration. Not used at runtime.                                                                                                                                                                                               |
| `superbase-auth-trigger.sql`                        | original | SQL run in Supabase that creates a row in`public.users`whenever a Supabase Auth user is created (the filename has a typo, "superbase"). It only fires on insert, so`email_verified_at`is refreshed at login rather than when the confirmation link is clicked.                                      |
| `migrations/0_init/migration.sql`                   | original | Baseline migration for the existing hospital, state and LGA tables.**Saved as UTF-16**(a PowerShell redirect side effect); convert it to UTF-8 before running Prisma migrate commands.                                                                                                              |
| `migrations/20261120_add_auth_tables/migration.sql` | original | Creates`users`,`notification_preferences`,`login_activities`and`security_events`(with row-level security enabled).                                                                                                                                                                                  |

### `src/config/`


| File                                                                                              | Origin                      | What it does                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `prisma.js`                                                                                       | original, updated (SSL fix) | Creates the single Prisma client. Uses a`pg`pool with SSL (certificate check relaxed for development), keep-alive, and a**connection-level retry**(up to 6 attempts) because opening connections to Supabase's pooler fails intermittently. Also exports`pool`. |
| `supabase.js`                                                                                     | original                    | `createSupabaseAuthClient()`makes a fresh Supabase client (no session persistence) for sign-up, sign-in and similar calls. The default export is a shared client used only to verify access tokens. Needs`SUPABASE_URL`and`SUPABASE_ANON_KEY`.                  |
| `swagger.js`                                                                                      | original                    | OpenAPI settings for the docs page at`/api-docs`; reads the`@swagger`comments in`src/routes/*.js`.                                                                                                                                                              |
| `cors.js`                                                                                         | added (task 4)              | CORS allowlist. Reads`CORS_ORIGINS`(falls back to`FRONTEND_URL`, then to`localhost:3000`and`localhost:5173`outside production). Blocked origins get a 403`CORS_ERROR`. Exposes`X-Request-Id`,`Retry-After`and`RateLimit`headers to browser code.                |
| `testDB.js`,`testPrisma.js`,`testSslByte.js`(+`testRetry.js`,`testConnect.js`if you created them) | original/added              | Diagnostic scripts from the database SSL investigation. Not used by the app; safe to delete. Note that`testPrisma.js`holds a no-SSL connection test despite its name.                                                                                           |

### `src/middleware/`


| File                 | Origin                         | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| -------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `auth.middleware.js` | original, updated (tasks 3–4) | `authenticate`: checks the Bearer token (shape check first, then Supabase`getUser`), loads the user from the database, rejects deactivated accounts, sets`req.user`and`req.accessToken`.`authorize(...roles)`: role check for later routes.                                                                                                                                                                                                                            |
| `rateLimiter.js`     | added (tasks 1, 3, 6)          | Rate limiters: general API, register, login (failed attempts only, per IP and per IP + email), forgot-password and resend-confirmation (per IP and per target email), and`sensitiveLimiter`for signed-in users (30 per 15 minutes per user; used on the profile and notification update routes), and`searchLimiter`(60 hospital searches per minute per IP). 429 responses include`code`and`requestId`. In-memory store: resets on restart and covers one server only. |
| `validate.js`        | added (tasks 2, 3)             | `validate({ body, params, query })`runs Zod schemas, replaces`req.body`/`req.params`with the cleaned data (parsed query is`req.validatedQuery`) and forwards failures as a`ValidationError`.                                                                                                                                                                                                                                                                           |
| `errorHandler.js`    | added (task 3)                 | `notFoundHandler`(404) and`errorHandler`. Maps Prisma errors (connection failures become 503 with`Retry-After`), Supabase auth errors, Zod errors, bad or oversized JSON and unknown errors to a safe JSON shape. Logs server errors with the request ID. Hides internals in production; adds a`debug`field in development.                                                                                                                                            |
| `requestId.js`       | added (tasks 3, 4)             | Gives each request an ID (`req.id`,`X-Request-Id`header) and stores the ID, client IP and user agent in the request context for audit logging.                                                                                                                                                                                                                                                                                                                         |
| `security.js`        | added (task 4)                 | `securityHeaders`(Helmet; the`/api-docs`pages skip only the CSP so Swagger UI works) and`noStore`(no caching of auth responses).                                                                                                                                                                                                                                                                                                                                       |

### `src/routes/`


| File                | Origin                         | What it does                                                                                                                                                                                 |
| ------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `authRoutes.js`     | original, updated (tasks 1–2) | Defines the`/api/auth/*`routes (section 5) and wires each one as: rate limiter → validation → controller. Holds the Swagger documentation comments.                                        |
| `userRoutes.js`     | added (task 5)                 | The`/api/users/*`routes (section 5). Every route requires a signed-in user; the update routes also go through`sensitiveLimiter`and validation. Holds the Swagger comments.                   |
| `hospitalRoutes.js` | added (task 6a)                | `/api/hospitals`:`GET /filters`,`GET /`(search; goes through`searchLimiter`and validation) and`GET /:id`.`/filters`is declared first so it is not read as an ID. Holds the Swagger comments. |
| `locationRoutes.js` | added (task 6a)                | `/api/states`:`GET /`and`GET /:stateId/lgas`.                                                                                                                                                |

### `src/services/`


| File               | Origin         | What it does                                                                                                                                                                                                                                                                                                              |
| ------------------ | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `audit.service.js` | added (task 4) | `recordSecurityEvent(userId, eventType, metadata)`writes to`security_events`(adds request ID, IP and user agent automatically);`recordLogin(...)`writes to`login_activities`;`hashEmail(email)`makes the short hash stored instead of an address. They never throw; call them with`void`so they don't delay the response. |

### `src/utils/`


| File                 | Origin          | What it does                                                                                                                                |
| -------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `ApiError.js`        | added (task 3)  | `ApiError(status, message, { code, errors, headers })`and`ValidationError`. Throw these from controllers; the central handler formats them. |
| `formatZodIssues.js` | added (task 3)  | Turns Zod issues into`[{ field, message }]`without ever echoing submitted values.                                                           |
| `requestContext.js`  | added (task 4)  | Per-request storage (request ID, IP, user agent) so audit logging can read them without passing`req`around.                                 |
| `geo.js`             | added (task 6a) | `distanceKm`(haversine) and`boundingBox`for near-me search.                                                                                 |

### `src/validation/`


| File                  | Origin             | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| --------------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `common.js`           | added (tasks 2, 5) | Reusable rules: email, new-password and login-password, display name, UUID, integer IDs (route/body), pagination query.                                                                                                                                                                                                                                                                                                                                                                                                    |
| `auth.schemas.js`     | added (task 2)     | Strict body schemas for register, login, forgot-password, resend-confirmation and logout. Unknown fields are rejected.                                                                                                                                                                                                                                                                                                                                                                                                     |
| `user.schemas.js`     | added (task 5)     | Rules for profile and notification updates. Username (3-30 characters, starts with a letter, lower-cased, reserved names blocked), phone number (stored as`+234…`; Nigerian local numbers are converted), avatar URL (only files in this project's Supabase Storage), language (`en`,`yo`,`ig`,`ha`,`pcm`: edit`SUPPORTED_LANGUAGES`to change), IANA timezone, theme (light/dark/system in any case) and the notification flags. Unknown fields are rejected, and`securityAlerts`, email and role cannot be changed here. |
| `hospital.schemas.js` | added (task 6a)    | Query and parameter rules for the directory: search text (2-100 characters), state / LGA / type IDs, ownership,`lat`and`lng`(must come together),`radiusKm`(1-100),`sort`(`name`,`newest`,`distance`),`page`,`limit`(max 50), UUID hospital IDs and state IDs. Unknown query parameters are rejected.                                                                                                                                                                                                                      |

---

## 5. API endpoints


| Method and path                                | Auth   | Notes                                                                                                                                                                                                                                 |
| ---------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /`                                        | none   | Basic status message.                                                                                                                                                                                                                 |
| `GET /api-docs`                                | none   | Swagger UI (production: only with`ENABLE_API_DOCS=true`).                                                                                                                                                                             |
| `GET /api/hospitals`                           | none   | Search and list. Parameters:`q`,`stateId`,`lgaId`,`typeId`,`ownership`,`lat`+`lng`(+`radiusKm`, default 25),`sort`,`page`,`limit`. With`lat`and`lng`results are nearest first and include`distanceKm`. 60 searches per minute per IP. |
| `GET /api/hospitals/filters`                   | none   | Hospital types and ownership values with counts, for the search filters. Cacheable for an hour.                                                                                                                                       |
| `GET /api/hospitals/:id`                       | none   | One hospital with description, year established and accessibility information. 404`HOSPITAL_NOT_FOUND`if unknown.                                                                                                                     |
| `GET /api/states`                              | none   | All states with hospital counts.                                                                                                                                                                                                      |
| `GET /api/states/:stateId/lgas`                | none   | The LGAs of a state with hospital counts. 404`STATE_NOT_FOUND`if unknown.                                                                                                                                                             |
| `POST /api/auth/register`                      | none   | Limited to 10/hour per IP. Same response for new and existing emails.                                                                                                                                                                 |
| `POST /api/auth/login`                         | none   | 5 failed attempts per 15 min per IP + email.                                                                                                                                                                                          |
| `POST /api/auth/forgot-password`               | none   | 3/hour per email address. Always answers 200.                                                                                                                                                                                         |
| `POST /api/auth/resend-confirmation`           | none   | 3/hour per email address. Always answers 200.                                                                                                                                                                                         |
| `POST /api/auth/logout`                        | Bearer | Body:`{ "refreshToken": "…" }`.                                                                                                                                                                                                      |
| `GET /api/auth/me`                             | Bearer | Returns the signed-in user.                                                                                                                                                                                                           |
| `GET /api/users/me`                            | Bearer | Full profile: name, username, avatar, phone, language, timezone, theme and more.                                                                                                                                                      |
| `PATCH /api/users/me`                          | Bearer | Update any of those fields (send only what changes;`null`clears name, username, phone and avatar). 30 changes per 15 min per user.                                                                                                    |
| `GET /api/users/me/notification-preferences`   | Bearer | Returns the settings, creating defaults on first use.                                                                                                                                                                                 |
| `PATCH /api/users/me/notification-preferences` | Bearer | Update notification switches. Security alerts can't be turned off.                                                                                                                                                                    |

All error responses look like: `{ "success": false, "message": "…", "code": "…", "requestId": "…", "errors": [{ "field", "message" }] }` (`errors` appears only for validation failures).

---

## 6. Environment variables (`.env`)


| Variable                           | Needed              | Purpose                                                                                                               |
| ---------------------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                     | yes                 | Postgres connection string (Supabase pooler).                                                                         |
| `DIRECT_URL`                       | being removed       | Only read by`prisma7.config.ts`. To be merged into`DATABASE_URL`.                                                     |
| `SUPABASE_URL`,`SUPABASE_ANON_KEY` | yes                 | Supabase project and public key.`SUPABASE_URL`is also used to check that avatar URLs point at this project's storage. |
| `PASSWORD_RESET_REDIRECT_URL`      | yes                 | Where the password-reset email link sends the user.                                                                   |
| `FRONTEND_URL`                     | recommended         | Frontend address: redirect after email confirmation, and CORS fallback.                                               |
| `CORS_ORIGINS`                     | production          | Comma-separated frontend origins allowed to call the API.                                                             |
| `TRUST_PROXY`                      | when behind a proxy | Number of proxy hops (usually`1`), so rate limits and audit logs see real client IPs. Leave unset locally.            |
| `ENABLE_API_DOCS`                  | optional            | `true`to expose`/api-docs`in production.                                                                              |
| `PORT`                             | optional            | Defaults to 5000.                                                                                                     |
| `NODE_ENV`                         | production          | Set to`production`when deployed (hides debug detail, tightens CORS and docs).                                         |

---

## 7. Audit events (table `security_events`)

Each row stores `metadata` with `requestId`, `ip` and `userAgent` (plus extras). Events: `ACCOUNT_REGISTERED`, `REGISTRATION_DUPLICATE_EMAIL`, `LOGIN_SUCCESSFUL`, `LOGIN_FAILED`, `LOGIN_BLOCKED_DEACTIVATED`, `LOGOUT`, `PASSWORD_RESET_REQUESTED`, `CONFIRMATION_EMAIL_REQUESTED`, `PROFILE_UPDATED` and `NOTIFICATION_PREFERENCES_UPDATED` (these two list the changed field names only). Emails are stored only as a 16-character hash (`emailHash`).

**Finding what happened for a user's error report:**`select * from security_events where metadata->>'requestId' = '<id from the error>';` and search the server logs for `[<id>]`.

---

## 8. Install checklist (tick as you apply each delivery)

**Packages:**`npm install express-rate-limit zod helmet`


| Task    | Files delivered                                                                                                                                                                                                                                                                                              |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1       | `src/middleware/rateLimiter.js`(new),`server.js`,`src/routes/authRoutes.js`,`controllers/auth.controller.js`(adds`resendConfirmation`)                                                                                                                                                                       |
| 2       | `src/validation/common.js`,`src/validation/auth.schemas.js`,`src/middleware/validate.js`(new),`src/routes/authRoutes.js`,`server.js`                                                                                                                                                                         |
| 3       | `src/utils/ApiError.js`,`src/utils/formatZodIssues.js`,`src/middleware/errorHandler.js`,`src/middleware/requestId.js`(new),`src/middleware/validate.js`,`src/middleware/rateLimiter.js`,`server.js`,`controllers/auth.controller.js`,`src/middleware/auth.middleware.js`                                     |
| 4       | `src/utils/requestContext.js`,`src/services/audit.service.js`,`src/config/cors.js`,`src/middleware/security.js`(new),`src/middleware/requestId.js`,`server.js`,`controllers/auth.controller.js`,`src/middleware/auth.middleware.js`                                                                          |
| 5       | `src/validation/user.schemas.js`,`controllers/user.controller.js`,`src/routes/userRoutes.js`(new),`src/validation/common.js`,`server.js`                                                                                                                                                                     |
| 6a      | `src/utils/geo.js`,`src/validation/hospital.schemas.js`,`controllers/hospital.controller.js`,`controllers/location.controller.js`,`src/routes/hospitalRoutes.js`,`src/routes/locationRoutes.js`(new),`src/middleware/rateLimiter.js`,`server.js`. Also delete the empty`controllers/hospitalControllers.js`. |
| SSL fix | `src/config/prisma.js`(connection-level retry)                                                                                                                                                                                                                                                               |

When a file appears in several rows, the **latest** delivery is the one to use (it already contains the earlier changes).

---

## 9. Pending and manual items

1. Apply any deliveries above that are not installed yet, and run `npm install express-rate-limit zod helmet`.
2. **Reset the database password** in Supabase (it was shared in chat and in an uploaded `.env`), then update `DATABASE_URL`.
3. Rename `prisma7.config.ts` to `prisma.config.ts`, point it at `DATABASE_URL`, then delete `DIRECT_URL` from `.env` and drop `?connect_timeout=60` from the URL.
4. Supabase dashboard: set the minimum password length to 8 (and optionally require letters and numbers).
5. Production: set `CORS_ORIGINS`, `NODE_ENV=production` and `TRUST_PROXY`; configure a custom SMTP provider (Supabase's built-in sender has a low hourly email cap).
6. Convert `prisma/migrations/0_init/migration.sql` from UTF-16 to UTF-8.
7. Clean-up: delete `generated/prisma/`, the AI-skill folders, `skills-lock.json`, the `postinstall` script and the diagnostic `test*.js` scripts.
8. Move `superbase-auth-trigger.sql` into a properly named, tracked file, and add a trigger that sets `email_verified_at` when the confirmation link is clicked.
9. Decide a retention period and a scheduled purge for `security_events` and `login_activities` (they hold IP addresses).
10. Not built yet for profiles: avatar upload (an avatar URL is only accepted for files already in this project's Supabase Storage), phone number verification, and the flexible `preferences` / privacy-settings and saved-location fields. Check that the language list in `src/validation/user.schemas.js` matches what the frontend supports.
11. **Hospital data to confirm:** what keys `hospitals.hospital_data` holds (phone, services, etc.). Nothing from it is shown publicly until its keys are added to `PUBLIC_HOSPITAL_DATA_KEYS` in `controllers/hospital.controller.js`. Also confirm the allowed values of `ownership` and `verification_status` (the database has check constraints that are not visible in the migrations).
12. If the hospital table grows well beyond tens of thousands of rows, add a `pg_trgm` index to speed up text search and consider PostGIS for near-me search. Current speed with 30,000 test rows: searches 20-200 ms.
13. Still to do from the roadmap: tasks 6b-6d (reviews and ratings, claims and verification, moderation) and task 7. Paused: age confirmation, onboarding and consent fields.

---

## 10. Change log


| Date       | Change                                                                                                                                                                                                                                                                                                                                                     |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-11-21 | Database SSL fix:`src/config/prisma.js`now retries failed connections (intermittent Supabase pooler handshake failures).                                                                                                                                                                                                                                   |
| 2026-11-21 | Task 1: rate limiting added; new`POST /api/auth/resend-confirmation`endpoint.                                                                                                                                                                                                                                                                              |
| 2026-11-21 | Task 2: Zod validation and sanitization for all auth routes; JSON body limit 10 KB.                                                                                                                                                                                                                                                                        |
| 2026-11-21 | Task 3: central error handling and request IDs; controllers and auth middleware now throw`ApiError`; unconfirmed-email login returns 403`EMAIL_NOT_CONFIRMED`; outages return 503 instead of a false 401.                                                                                                                                                  |
| 2026-11-21 | Task 4: Helmet, CORS allowlist,`no-store`on auth responses, JWT-shape check, audit logging service, same registration response for existing emails, post-signup database lookup removed, Swagger hidden in production.                                                                                                                                     |
| 2026-11-21 | README created.                                                                                                                                                                                                                                                                                                                                            |
| 2026-11-21 | Task 5: profile and notification-preference endpoints under`/api/users/me`(profile read/update, username, phone, avatar, language, timezone, theme, notification switches);`sensitiveLimiter`now in use;`common.js`gains`displayNameUpdateSchema`and exports`typed`.                                                                                       |
| 2026-11-21 | Task 6a: public hospital directory (`/api/hospitals`,`/api/hospitals/filters`,`/api/hospitals/:id`,`/api/states`,`/api/states/:stateId/lgas`) with text search, filters, sorting, pagination and near-me search;`searchLimiter`added; temporary hospital stub removed. Tested against a real PostgreSQL database; search now treats`%`,`_`and`\`literally. |

# Dreel — Hospital Review Platform: Backend

Express 5 API for the Hospital Review Platform (Nigeria first). Authentication is handled by Supabase Auth, data lives in Supabase Postgres, and the app talks to the database through Prisma 7 with the `pg` driver adapter.

> **Keep this README up to date.** Every time a file is added, changed or removed, update this file and the change log at the bottom in the same step.

---

## 1. How this code got here (read this first)

* **Original files** (marked *original* below) came from the backend zip uploaded on 2026-11-21. They were built before the hardening work started.
* **Files marked *added* or *updated*** were created or changed during the hardening work (the database SSL fix and roadmap tasks 1-4).
* No code has been edited by hand: every change was applied exactly as supplied, so this README describes the current state of the project.
* The files marked *added* or *updated* are what has been **delivered**. Use the install checklist in section 8 to tick off what has been applied, and correct this README if any delivered file has not been applied yet.

---

## 2. Roadmap status


| #  | Task                                                                                          | Status                         |
| -- | --------------------------------------------------------------------------------------------- | ------------------------------ |
| 1  | API rate limiting                                                                             | Delivered                      |
| 2  | Request validation and sanitization                                                           | Delivered                      |
| 3  | Centralized error handling                                                                    | Delivered                      |
| 4  | Security hardening (Helmet, CORS, token handling, audit logging, enumeration protection)      | Delivered                      |
| 5  | User profile and preferences (notifications, language, timezone, theme)                       | Not started                    |
| 6  | Hospital functionality (claiming, verification, reviews, ratings, moderation)                 | Not started                    |
| 7  | Role management: admin-only role changes, and a guard that stops the last admin being changed | Not started (last on the list) |
| – | Manual: raise the minimum password length to 8 in the Supabase dashboard's auth settings      | Needs doing by you             |

---

## 3. Project structure

```
backend/
├── server.js
├── package.json / package-lock.json
├── .env                      (secrets, never commit)
├── .gitignore
├── prisma7.config.ts
├── schema.prisma.backup
├── skills-lock.json
├── README.md
│
├── controllers/
│   ├── auth.controller.js
│   └── hospitalControllers.js
│
├── prisma/
│   ├── schema.prisma
│   ├── baseline.prisma
│   ├── superbase-auth-trigger.sql
│   └── migrations/
│       ├── 0_init/migration.sql
│       └── 20261120_add_auth_tables/migration.sql
│
└── src/
    ├── config/
    │   ├── prisma.js
    │   ├── supabase.js
    │   ├── swagger.js
    │   ├── cors.js
    │   └── test*.js            (diagnostic scripts)
    ├── middleware/
    │   ├── auth.middleware.js
    │   ├── errorHandler.js
    │   ├── rateLimiter.js
    │   ├── requestId.js
    │   ├── security.js
    │   └── validate.js
    ├── routes/
    │   └── authRoutes.js
    ├── services/
    │   └── audit.service.js
    ├── utils/
    │   ├── ApiError.js
    │   ├── formatZodIssues.js
    │   └── requestContext.js
    └── validation/
        ├── common.js
        └── auth.schemas.js
```

---

## 4. File reference

### Root


| File                                                                                                                           | Origin                         | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `server.js`                                                                                                                    | original, updated (tasks 1–4) | App entry point. Sets`trust proxy`(when`TRUST_PROXY`is set), then registers middleware in this order: request ID → Helmet → CORS → JSON body parser (10 KB limit) → Swagger docs (hidden in production unless`ENABLE_API_DOCS=true`) →`GET /`→`/api`rate limiter →`GET /api/hospitals`(temporary stub) →`/api/auth`routes (with`no-store`caching) → 404 handler → central error handler. Starts the server on`PORT`(default 5000). |
| `package.json`                                                                                                                 | original                       | Dependencies and scripts (`npm run dev`= watch mode,`npm start`).**Needs`express-rate-limit`,`zod`and`helmet`added**(`npm install express-rate-limit zod helmet`). It still has a`postinstall`script (`prisma skills sync`) that creates the AI-skill folders listed below; it can be removed.                                                                                                                                               |
| `package-lock.json`                                                                                                            | original                       | Exact dependency versions. Generated by npm; don't edit.                                                                                                                                                                                                                                                                                                                                                                                     |
| `.env`                                                                                                                         | original                       | Secrets and settings. Never commit or share it. Variables are listed in section 6.                                                                                                                                                                                                                                                                                                                                                           |
| `.gitignore`                                                                                                                   | original                       | Keeps`node_modules/`,`.env`and`/generated/prisma`out of git.                                                                                                                                                                                                                                                                                                                                                                                 |
| `prisma7.config.ts`                                                                                                            | original                       | Prisma CLI configuration (schema path, migrations path, database URL).**Misnamed:**Prisma only auto-loads`prisma.config.ts`. It also still reads`DIRECT_URL`; the plan is to switch it to`DATABASE_URL`. See section 9.                                                                                                                                                                                                                      |
| `schema.prisma.backup`                                                                                                         | original                       | Backup of an earlier, larger schema design (29 models: reviews, ratings, claims, moderation, favourites, notifications, audit log and more). Not used by the app. It is the starting point for task 6.                                                                                                                                                                                                                                       |
| `skills-lock.json`and the hidden AI-tool folders in the project root (`.agents/`,`.cursor/`,`.devin/`,`.windsurf/`and similar) | original                       | AI-assistant "skill" files created by`prisma skills sync`. Not part of the application; safe to delete.                                                                                                                                                                                                                                                                                                                                      |
| `generated/prisma/`                                                                                                            | original                       | An old generated Prisma client from the larger schema. Stale and unused (the app imports`@prisma/client`). Git-ignored; safe to delete.                                                                                                                                                                                                                                                                                                      |
| `README.md`                                                                                                                    | added                          | This file.                                                                                                                                                                                                                                                                                                                                                                                                                                   |

### `controllers/`


| File                     | Origin                         | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------ | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `auth.controller.js`     | original, updated (tasks 1–4) | The auth handlers:`register`,`login`,`logout`,`getMe`,`forgotPassword`,`resendConfirmation`. Supabase creates and signs in accounts; Prisma reads and updates the`users`table. Errors are thrown and handled centrally. Registration returns the same 201 response for new and already-registered emails (account-enumeration protection) and builds its response from the signup result with no database read. Audit events are written fire-and-forget. |
| `hospitalControllers.js` | original                       | Empty placeholder for the hospital endpoints (task 6).                                                                                                                                                                                                                                                                                                                                                                                                    |

### `prisma/`


| File                                                | Origin   | What it does                                                                                                                                                                                                                                                                                        |
| --------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `schema.prisma`                                     | original | The current database models:`hospital_types`,`hospitals`,`lgas`,`states`(introspected from Supabase), plus`User`(table`users`),`NotificationPreference`,`LoginActivity`,`SecurityEvent`and the enums`UserRole`and`Theme`. Age/consent fields and review models are**not**added yet (paused by you). |
| `baseline.prisma`                                   | original | Snapshot of the hospital/state/LGA models used to create the baseline migration. Not used at runtime.                                                                                                                                                                                               |
| `superbase-auth-trigger.sql`                        | original | SQL run in Supabase that creates a row in`public.users`whenever a Supabase Auth user is created (the filename has a typo, "superbase"). It only fires on insert, so`email_verified_at`is refreshed at login rather than when the confirmation link is clicked.                                      |
| `migrations/0_init/migration.sql`                   | original | Baseline migration for the existing hospital, state and LGA tables.**Saved as UTF-16**(a PowerShell redirect side effect); convert it to UTF-8 before running Prisma migrate commands.                                                                                                              |
| `migrations/20261120_add_auth_tables/migration.sql` | original | Creates`users`,`notification_preferences`,`login_activities`and`security_events`(with row-level security enabled).                                                                                                                                                                                  |

### `src/config/`


| File                                                                                              | Origin                      | What it does                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `prisma.js`                                                                                       | original, updated (SSL fix) | Creates the single Prisma client. Uses a`pg`pool with SSL (certificate check relaxed for development), keep-alive, and a**connection-level retry**(up to 6 attempts) because opening connections to Supabase's pooler fails intermittently. Also exports`pool`. |
| `supabase.js`                                                                                     | original                    | `createSupabaseAuthClient()`makes a fresh Supabase client (no session persistence) for sign-up, sign-in and similar calls. The default export is a shared client used only to verify access tokens. Needs`SUPABASE_URL`and`SUPABASE_ANON_KEY`.                  |
| `swagger.js`                                                                                      | original                    | OpenAPI settings for the docs page at`/api-docs`; reads the`@swagger`comments in`src/routes/*.js`.                                                                                                                                                              |
| `cors.js`                                                                                         | added (task 4)              | CORS allowlist. Reads`CORS_ORIGINS`(falls back to`FRONTEND_URL`, then to`localhost:3000`and`localhost:5173`outside production). Blocked origins get a 403`CORS_ERROR`. Exposes`X-Request-Id`,`Retry-After`and`RateLimit`headers to browser code.                |
| `testDB.js`,`testPrisma.js`,`testSslByte.js`(+`testRetry.js`,`testConnect.js`if you created them) | original/added              | Diagnostic scripts from the database SSL investigation. Not used by the app; safe to delete. Note that`testPrisma.js`holds a no-SSL connection test despite its name.                                                                                           |

### `src/middleware/`


| File                 | Origin                         | What it does                                                                                                                                                                                                                                                                                                                                              |
| -------------------- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `auth.middleware.js` | original, updated (tasks 3–4) | `authenticate`: checks the Bearer token (shape check first, then Supabase`getUser`), loads the user from the database, rejects deactivated accounts, sets`req.user`and`req.accessToken`.`authorize(...roles)`: role check for later routes.                                                                                                               |
| `rateLimiter.js`     | added (tasks 1, 3)             | Rate limiters: general API, register, login (failed attempts only, per IP and per IP + email), forgot-password and resend-confirmation (per IP and per target email), and`sensitiveLimiter`for signed-in users (not attached to any route yet). 429 responses include`code`and`requestId`. In-memory store: resets on restart and covers one server only. |
| `validate.js`        | added (tasks 2, 3)             | `validate({ body, params, query })`runs Zod schemas, replaces`req.body`/`req.params`with the cleaned data (parsed query is`req.validatedQuery`) and forwards failures as a`ValidationError`.                                                                                                                                                              |
| `errorHandler.js`    | added (task 3)                 | `notFoundHandler`(404) and`errorHandler`. Maps Prisma errors (connection failures become 503 with`Retry-After`), Supabase auth errors, Zod errors, bad or oversized JSON and unknown errors to a safe JSON shape. Logs server errors with the request ID. Hides internals in production; adds a`debug`field in development.                               |
| `requestId.js`       | added (tasks 3, 4)             | Gives each request an ID (`req.id`,`X-Request-Id`header) and stores the ID, client IP and user agent in the request context for audit logging.                                                                                                                                                                                                            |
| `security.js`        | added (task 4)                 | `securityHeaders`(Helmet; the`/api-docs`pages skip only the CSP so Swagger UI works) and`noStore`(no caching of auth responses).                                                                                                                                                                                                                          |

### `src/routes/`


| File            | Origin                         | What it does                                                                                                                                          |
| --------------- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `authRoutes.js` | original, updated (tasks 1–2) | Defines the`/api/auth/*`routes (section 5) and wires each one as: rate limiter → validation → controller. Holds the Swagger documentation comments. |

### `src/services/`


| File               | Origin         | What it does                                                                                                                                                                                                                                                                                                              |
| ------------------ | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `audit.service.js` | added (task 4) | `recordSecurityEvent(userId, eventType, metadata)`writes to`security_events`(adds request ID, IP and user agent automatically);`recordLogin(...)`writes to`login_activities`;`hashEmail(email)`makes the short hash stored instead of an address. They never throw; call them with`void`so they don't delay the response. |

### `src/utils/`


| File                 | Origin         | What it does                                                                                                                                |
| -------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `ApiError.js`        | added (task 3) | `ApiError(status, message, { code, errors, headers })`and`ValidationError`. Throw these from controllers; the central handler formats them. |
| `formatZodIssues.js` | added (task 3) | Turns Zod issues into`[{ field, message }]`without ever echoing submitted values.                                                           |
| `requestContext.js`  | added (task 4) | Per-request storage (request ID, IP, user agent) so audit logging can read them without passing`req`around.                                 |

### `src/validation/`


| File              | Origin         | What it does                                                                                                            |
| ----------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `common.js`       | added (task 2) | Reusable rules: email, new-password and login-password, display name, UUID, integer IDs (route/body), pagination query. |
| `auth.schemas.js` | added (task 2) | Strict body schemas for register, login, forgot-password, resend-confirmation and logout. Unknown fields are rejected.  |

---

## 5. API endpoints


| Method and path                      | Auth   | Notes                                                                 |
| ------------------------------------ | ------ | --------------------------------------------------------------------- |
| `GET /`                              | none   | Basic status message.                                                 |
| `GET /api-docs`                      | none   | Swagger UI (production: only with`ENABLE_API_DOCS=true`).             |
| `GET /api/hospitals`                 | none   | Temporary stub; real endpoints come in task 6.                        |
| `POST /api/auth/register`            | none   | Limited to 10/hour per IP. Same response for new and existing emails. |
| `POST /api/auth/login`               | none   | 5 failed attempts per 15 min per IP + email.                          |
| `POST /api/auth/forgot-password`     | none   | 3/hour per email address. Always answers 200.                         |
| `POST /api/auth/resend-confirmation` | none   | 3/hour per email address. Always answers 200.                         |
| `POST /api/auth/logout`              | Bearer | Body:`{ "refreshToken": "…" }`.                                      |
| `GET /api/auth/me`                   | Bearer | Returns the signed-in user.                                           |

All error responses look like: `{ "success": false, "message": "…", "code": "…", "requestId": "…", "errors": [{ "field", "message" }] }` (`errors` appears only for validation failures).

---

## 6. Environment variables (`.env`)


| Variable                           | Needed              | Purpose                                                                                                    |
| ---------------------------------- | ------------------- | ---------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                     | yes                 | Postgres connection string (Supabase pooler).                                                              |
| `DIRECT_URL`                       | being removed       | Only read by`prisma7.config.ts`. To be merged into`DATABASE_URL`.                                          |
| `SUPABASE_URL`,`SUPABASE_ANON_KEY` | yes                 | Supabase project and public key.                                                                           |
| `PASSWORD_RESET_REDIRECT_URL`      | yes                 | Where the password-reset email link sends the user.                                                        |
| `FRONTEND_URL`                     | recommended         | Frontend address: redirect after email confirmation, and CORS fallback.                                    |
| `CORS_ORIGINS`                     | production          | Comma-separated frontend origins allowed to call the API.                                                  |
| `TRUST_PROXY`                      | when behind a proxy | Number of proxy hops (usually`1`), so rate limits and audit logs see real client IPs. Leave unset locally. |
| `ENABLE_API_DOCS`                  | optional            | `true`to expose`/api-docs`in production.                                                                   |
| `PORT`                             | optional            | Defaults to 5000.                                                                                          |
| `NODE_ENV`                         | production          | Set to`production`when deployed (hides debug detail, tightens CORS and docs).                              |

---

## 7. Audit events (table `security_events`)

Each row stores `metadata` with `requestId`, `ip` and `userAgent` (plus extras). Events: `ACCOUNT_REGISTERED`, `REGISTRATION_DUPLICATE_EMAIL`, `LOGIN_SUCCESSFUL`, `LOGIN_FAILED`, `LOGIN_BLOCKED_DEACTIVATED`, `LOGOUT`, `PASSWORD_RESET_REQUESTED`, `CONFIRMATION_EMAIL_REQUESTED`. Emails are stored only as a 16-character hash (`emailHash`).

**Finding what happened for a user's error report:**`select * from security_events where metadata->>'requestId' = '<id from the error>';` and search the server logs for `[<id>]`.

---

## 8. Install checklist (tick as you apply each delivery)

**Packages:**`npm install express-rate-limit zod helmet`


| Task    | Files delivered                                                                                                                                                                                                                                                          |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1       | `src/middleware/rateLimiter.js`(new),`server.js`,`src/routes/authRoutes.js`,`controllers/auth.controller.js`(adds`resendConfirmation`)                                                                                                                                   |
| 2       | `src/validation/common.js`,`src/validation/auth.schemas.js`,`src/middleware/validate.js`(new),`src/routes/authRoutes.js`,`server.js`                                                                                                                                     |
| 3       | `src/utils/ApiError.js`,`src/utils/formatZodIssues.js`,`src/middleware/errorHandler.js`,`src/middleware/requestId.js`(new),`src/middleware/validate.js`,`src/middleware/rateLimiter.js`,`server.js`,`controllers/auth.controller.js`,`src/middleware/auth.middleware.js` |
| 4       | `src/utils/requestContext.js`,`src/services/audit.service.js`,`src/config/cors.js`,`src/middleware/security.js`(new),`src/middleware/requestId.js`,`server.js`,`controllers/auth.controller.js`,`src/middleware/auth.middleware.js`                                      |
| SSL fix | `src/config/prisma.js`(connection-level retry)                                                                                                                                                                                                                           |

When a file appears in several rows, the **latest** delivery is the one to use (it already contains the earlier changes).

---

## 9. Pending and manual items

1. Apply any deliveries above that are not installed yet, and run `npm install express-rate-limit zod helmet`.
2. **Reset the database password** in Supabase (it was shared in chat and in an uploaded `.env`), then update `DATABASE_URL`.
3. Rename `prisma7.config.ts` to `prisma.config.ts`, point it at `DATABASE_URL`, then delete `DIRECT_URL` from `.env` and drop `?connect_timeout=60` from the URL.
4. Supabase dashboard: set the minimum password length to 8 (and optionally require letters and numbers).
5. Production: set `CORS_ORIGINS`, `NODE_ENV=production` and `TRUST_PROXY`; configure a custom SMTP provider (Supabase's built-in sender has a low hourly email cap).
6. Convert `prisma/migrations/0_init/migration.sql` from UTF-16 to UTF-8.
7. Clean-up: delete `generated/prisma/`, the AI-skill folders, `skills-lock.json`, the `postinstall` script and the diagnostic `test*.js` scripts.
8. Move `superbase-auth-trigger.sql` into a properly named, tracked file, and add a trigger that sets `email_verified_at` when the confirmation link is clicked.
9. Decide a retention period and a scheduled purge for `security_events` and `login_activities` (they hold IP addresses).
10. Still to do from the roadmap: tasks 5, 6 and 7. Paused: age confirmation, onboarding and consent fields.

---

## 10. Change log


| Date       | Change                                                                                                                                                                                                                 |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-11-21 | Database SSL fix:`src/config/prisma.js`now retries failed connections (intermittent Supabase pooler handshake failures).                                                                                               |
| 2026-11-21 | Task 1: rate limiting added; new`POST /api/auth/resend-confirmation`endpoint.                                                                                                                                          |
| 2026-11-21 | Task 2: Zod validation and sanitization for all auth routes; JSON body limit 10 KB.                                                                                                                                    |
| 2026-11-21 | Task 3: central error handling and request IDs; controllers and auth middleware now throw`ApiError`; unconfirmed-email login returns 403`EMAIL_NOT_CONFIRMED`; outages return 503 instead of a false 401.              |
| 2026-11-21 | Task 4: Helmet, CORS allowlist,`no-store`on auth responses, JWT-shape check, audit logging service, same registration response for existing emails, post-signup database lookup removed, Swagger hidden in production. |
| 2026-11-21 | README created.                                                                                                                                                                                                        |

Express 5 API for the Hospital Review Platform (Nigeria first). Authentication is handled by Supabase Auth, data lives in Supabase Postgres, and the app talks to the database through Prisma 7 with the `pg` driver adapter.

---

## 1. How this code got here (read this first)

* **Original files** (marked *original* below) came from the backend zip uploaded on 2026-11-21. They were built before the current work started.
* **Everything changed or added since then was written by Claude** in this conversation.
* The developer (Kehinde) states that **no code was edited by hand**: only code supplied by Claude was used, and nothing was changed without telling Claude. Claude therefore treats this README as the exact state of the project.
* Claude cannot see your disk. The files marked **Claude** are what has been *delivered*; the install checklist in section 8 lets you tick off what has been applied. If a delivered file is not applied yet, tell Claude so this README can be corrected.

---

## 2. Roadmap status


| #  | Task                                                                                          | Status                         |
| -- | --------------------------------------------------------------------------------------------- | ------------------------------ |
| 1  | API rate limiting                                                                             | Delivered                      |
| 2  | Request validation and sanitization                                                           | Delivered                      |
| 3  | Centralized error handling                                                                    | Delivered                      |
| 4  | Security hardening (Helmet, CORS, token handling, audit logging, enumeration protection)      | Delivered                      |
| 5  | User profile and preferences (notifications, language, timezone, theme)                       | Not started                    |
| 6  | Hospital functionality (claiming, verification, reviews, ratings, moderation)                 | Not started                    |
| 7  | Role management: admin-only role changes, and a guard that stops the last admin being changed | Not started (last on the list) |
| – | Manual: raise the minimum password length to 8 in the Supabase dashboard's auth settings      | Needs doing by you             |

---

## 3. Project structure

```
backend/
├── server.js
├── package.json / package-lock.json
├── .env                      (secrets, never commit)
├── .gitignore
├── prisma7.config.ts
├── schema.prisma.backup
├── skills-lock.json
├── README.md
│
├── controllers/
│   ├── auth.controller.js
│   └── hospitalControllers.js
│
├── prisma/
│   ├── schema.prisma
│   ├── baseline.prisma
│   ├── superbase-auth-trigger.sql
│   └── migrations/
│       ├── 0_init/migration.sql
│       └── 20261120_add_auth_tables/migration.sql
│
└── src/
    ├── config/
    │   ├── prisma.js
    │   ├── supabase.js
    │   ├── swagger.js
    │   ├── cors.js
    │   └── test*.js            (diagnostic scripts)
    ├── middleware/
    │   ├── auth.middleware.js
    │   ├── errorHandler.js
    │   ├── rateLimiter.js
    │   ├── requestId.js
    │   ├── security.js
    │   └── validate.js
    ├── routes/
    │   └── authRoutes.js
    ├── services/
    │   └── audit.service.js
    ├── utils/
    │   ├── ApiError.js
    │   ├── formatZodIssues.js
    │   └── requestContext.js
    └── validation/
        ├── common.js
        └── auth.schemas.js
```

---

## 4. File reference

### Root


| File                                                                       | Origin                          | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| -------------------------------------------------------------------------- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `server.js`                                                                | original,**Claude**(tasks 1–4) | App entry point. Sets`trust proxy`(when`TRUST_PROXY`is set), then registers middleware in this order: request ID → Helmet → CORS → JSON body parser (10 KB limit) → Swagger docs (hidden in production unless`ENABLE_API_DOCS=true`) →`GET /`→`/api`rate limiter →`GET /api/hospitals`(temporary stub) →`/api/auth`routes (with`no-store`caching) → 404 handler → central error handler. Starts the server on`PORT`(default 5000). |
| `package.json`                                                             | original                        | Dependencies and scripts (`npm run dev`= watch mode,`npm start`).**Needs`express-rate-limit`,`zod`and`helmet`added**(`npm install express-rate-limit zod helmet`). It still has a`postinstall`script (`prisma skills sync`) that creates the AI-skill folders listed below; it can be removed.                                                                                                                                               |
| `package-lock.json`                                                        | original                        | Exact dependency versions. Generated by npm; don't edit.                                                                                                                                                                                                                                                                                                                                                                                     |
| `.env`                                                                     | original                        | Secrets and settings. Never commit or share it. Variables are listed in section 6.                                                                                                                                                                                                                                                                                                                                                           |
| `.gitignore`                                                               | original                        | Keeps`node_modules/`,`.env`and`/generated/prisma`out of git.                                                                                                                                                                                                                                                                                                                                                                                 |
| `prisma7.config.ts`                                                        | original                        | Prisma CLI configuration (schema path, migrations path, database URL).**Misnamed:**Prisma only auto-loads`prisma.config.ts`. It also still reads`DIRECT_URL`; the plan is to switch it to`DATABASE_URL`. See section 9.                                                                                                                                                                                                                      |
| `schema.prisma.backup`                                                     | original                        | Backup of an earlier, larger schema design (29 models: reviews, ratings, claims, moderation, favourites, notifications, audit log and more). Not used by the app. It is the starting point for task 6.                                                                                                                                                                                                                                       |
| `skills-lock.json`,`.agents/`,`.claude/`,`.cursor/`,`.devin/`,`.windsurf/` | original                        | AI-assistant "skill" files created by`prisma skills sync`. Not part of the application; safe to delete.                                                                                                                                                                                                                                                                                                                                      |
| `generated/prisma/`                                                        | original                        | An old generated Prisma client from the larger schema. Stale and unused (the app imports`@prisma/client`). Git-ignored; safe to delete.                                                                                                                                                                                                                                                                                                      |
| `README.md`                                                                | **Claude**                      | This file.                                                                                                                                                                                                                                                                                                                                                                                                                                   |

### `controllers/`


| File                     | Origin                          | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------ | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `auth.controller.js`     | original,**Claude**(tasks 1–4) | The auth handlers:`register`,`login`,`logout`,`getMe`,`forgotPassword`,`resendConfirmation`. Supabase creates and signs in accounts; Prisma reads and updates the`users`table. Errors are thrown and handled centrally. Registration returns the same 201 response for new and already-registered emails (account-enumeration protection) and builds its response from the signup result with no database read. Audit events are written fire-and-forget. |
| `hospitalControllers.js` | original                        | Empty placeholder for the hospital endpoints (task 6).                                                                                                                                                                                                                                                                                                                                                                                                    |

### `prisma/`


| File                                                | Origin   | What it does                                                                                                                                                                                                                                                                                        |
| --------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `schema.prisma`                                     | original | The current database models:`hospital_types`,`hospitals`,`lgas`,`states`(introspected from Supabase), plus`User`(table`users`),`NotificationPreference`,`LoginActivity`,`SecurityEvent`and the enums`UserRole`and`Theme`. Age/consent fields and review models are**not**added yet (paused by you). |
| `baseline.prisma`                                   | original | Snapshot of the hospital/state/LGA models used to create the baseline migration. Not used at runtime.                                                                                                                                                                                               |
| `superbase-auth-trigger.sql`                        | original | SQL run in Supabase that creates a row in`public.users`whenever a Supabase Auth user is created (the filename has a typo, "superbase"). It only fires on insert, so`email_verified_at`is refreshed at login rather than when the confirmation link is clicked.                                      |
| `migrations/0_init/migration.sql`                   | original | Baseline migration for the existing hospital, state and LGA tables.**Saved as UTF-16**(a PowerShell redirect side effect); convert it to UTF-8 before running Prisma migrate commands.                                                                                                              |
| `migrations/20261120_add_auth_tables/migration.sql` | original | Creates`users`,`notification_preferences`,`login_activities`and`security_events`(with row-level security enabled).                                                                                                                                                                                  |

### `src/config/`


| File                                                                                              | Origin                       | What it does                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `prisma.js`                                                                                       | original,**Claude**(SSL fix) | Creates the single Prisma client. Uses a`pg`pool with SSL (certificate check relaxed for development), keep-alive, and a**connection-level retry**(up to 6 attempts) because opening connections to Supabase's pooler fails intermittently. Also exports`pool`. |
| `supabase.js`                                                                                     | original                     | `createSupabaseAuthClient()`makes a fresh Supabase client (no session persistence) for sign-up, sign-in and similar calls. The default export is a shared client used only to verify access tokens. Needs`SUPABASE_URL`and`SUPABASE_ANON_KEY`.                  |
| `swagger.js`                                                                                      | original                     | OpenAPI settings for the docs page at`/api-docs`; reads the`@swagger`comments in`src/routes/*.js`.                                                                                                                                                              |
| `cors.js`                                                                                         | **Claude**(task 4)           | CORS allowlist. Reads`CORS_ORIGINS`(falls back to`FRONTEND_URL`, then to`localhost:3000`and`localhost:5173`outside production). Blocked origins get a 403`CORS_ERROR`. Exposes`X-Request-Id`,`Retry-After`and`RateLimit`headers to browser code.                |
| `testDB.js`,`testPrisma.js`,`testSslByte.js`(+`testRetry.js`,`testConnect.js`if you created them) | original/**Claude**          | Diagnostic scripts from the database SSL investigation. Not used by the app; safe to delete. Note that`testPrisma.js`holds a no-SSL connection test despite its name.                                                                                           |

### `src/middleware/`


| File                 | Origin                          | What it does                                                                                                                                                                                                                                                                                                                                              |
| -------------------- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `auth.middleware.js` | original,**Claude**(tasks 3–4) | `authenticate`: checks the Bearer token (shape check first, then Supabase`getUser`), loads the user from the database, rejects deactivated accounts, sets`req.user`and`req.accessToken`.`authorize(...roles)`: role check for later routes.                                                                                                               |
| `rateLimiter.js`     | **Claude**(tasks 1, 3)          | Rate limiters: general API, register, login (failed attempts only, per IP and per IP + email), forgot-password and resend-confirmation (per IP and per target email), and`sensitiveLimiter`for signed-in users (not attached to any route yet). 429 responses include`code`and`requestId`. In-memory store: resets on restart and covers one server only. |
| `validate.js`        | **Claude**(tasks 2, 3)          | `validate({ body, params, query })`runs Zod schemas, replaces`req.body`/`req.params`with the cleaned data (parsed query is`req.validatedQuery`) and forwards failures as a`ValidationError`.                                                                                                                                                              |
| `errorHandler.js`    | **Claude**(task 3)              | `notFoundHandler`(404) and`errorHandler`. Maps Prisma errors (connection failures become 503 with`Retry-After`), Supabase auth errors, Zod errors, bad or oversized JSON and unknown errors to a safe JSON shape. Logs server errors with the request ID. Hides internals in production; adds a`debug`field in development.                               |
| `requestId.js`       | **Claude**(tasks 3, 4)          | Gives each request an ID (`req.id`,`X-Request-Id`header) and stores the ID, client IP and user agent in the request context for audit logging.                                                                                                                                                                                                            |
| `security.js`        | **Claude**(task 4)              | `securityHeaders`(Helmet; the`/api-docs`pages skip only the CSP so Swagger UI works) and`noStore`(no caching of auth responses).                                                                                                                                                                                                                          |

### `src/routes/`


| File            | Origin                          | What it does                                                                                                                                          |
| --------------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `authRoutes.js` | original,**Claude**(tasks 1–2) | Defines the`/api/auth/*`routes (section 5) and wires each one as: rate limiter → validation → controller. Holds the Swagger documentation comments. |

### `src/services/`


| File               | Origin             | What it does                                                                                                                                                                                                                                                                                                              |
| ------------------ | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `audit.service.js` | **Claude**(task 4) | `recordSecurityEvent(userId, eventType, metadata)`writes to`security_events`(adds request ID, IP and user agent automatically);`recordLogin(...)`writes to`login_activities`;`hashEmail(email)`makes the short hash stored instead of an address. They never throw; call them with`void`so they don't delay the response. |

### `src/utils/`


| File                 | Origin             | What it does                                                                                                                                |
| -------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `ApiError.js`        | **Claude**(task 3) | `ApiError(status, message, { code, errors, headers })`and`ValidationError`. Throw these from controllers; the central handler formats them. |
| `formatZodIssues.js` | **Claude**(task 3) | Turns Zod issues into`[{ field, message }]`without ever echoing submitted values.                                                           |
| `requestContext.js`  | **Claude**(task 4) | Per-request storage (request ID, IP, user agent) so audit logging can read them without passing`req`around.                                 |

### `src/validation/`


| File              | Origin             | What it does                                                                                                            |
| ----------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `common.js`       | **Claude**(task 2) | Reusable rules: email, new-password and login-password, display name, UUID, integer IDs (route/body), pagination query. |
| `auth.schemas.js` | **Claude**(task 2) | Strict body schemas for register, login, forgot-password, resend-confirmation and logout. Unknown fields are rejected.  |

---

## 5. API endpoints


| Method and path                      | Auth   | Notes                                                                 |
| ------------------------------------ | ------ | --------------------------------------------------------------------- |
| `GET /`                              | none   | Basic status message.                                                 |
| `GET /api-docs`                      | none   | Swagger UI (production: only with`ENABLE_API_DOCS=true`).             |
| `GET /api/hospitals`                 | none   | Temporary stub; real endpoints come in task 6.                        |
| `POST /api/auth/register`            | none   | Limited to 10/hour per IP. Same response for new and existing emails. |
| `POST /api/auth/login`               | none   | 5 failed attempts per 15 min per IP + email.                          |
| `POST /api/auth/forgot-password`     | none   | 3/hour per email address. Always answers 200.                         |
| `POST /api/auth/resend-confirmation` | none   | 3/hour per email address. Always answers 200.                         |
| `POST /api/auth/logout`              | Bearer | Body:`{ "refreshToken": "…" }`.                                      |
| `GET /api/auth/me`                   | Bearer | Returns the signed-in user.                                           |

All error responses look like: `{ "success": false, "message": "…", "code": "…", "requestId": "…", "errors": [{ "field", "message" }] }` (`errors` appears only for validation failures).

---

## 6. Environment variables (`.env`)


| Variable                           | Needed              | Purpose                                                                                                    |
| ---------------------------------- | ------------------- | ---------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                     | yes                 | Postgres connection string (Supabase pooler).                                                              |
| `DIRECT_URL`                       | being removed       | Only read by`prisma7.config.ts`. To be merged into`DATABASE_URL`.                                          |
| `SUPABASE_URL`,`SUPABASE_ANON_KEY` | yes                 | Supabase project and public key.                                                                           |
| `PASSWORD_RESET_REDIRECT_URL`      | yes                 | Where the password-reset email link sends the user.                                                        |
| `FRONTEND_URL`                     | recommended         | Frontend address: redirect after email confirmation, and CORS fallback.                                    |
| `CORS_ORIGINS`                     | production          | Comma-separated frontend origins allowed to call the API.                                                  |
| `TRUST_PROXY`                      | when behind a proxy | Number of proxy hops (usually`1`), so rate limits and audit logs see real client IPs. Leave unset locally. |
| `ENABLE_API_DOCS`                  | optional            | `true`to expose`/api-docs`in production.                                                                   |
| `PORT`                             | optional            | Defaults to 5000.                                                                                          |
| `NODE_ENV`                         | production          | Set to`production`when deployed (hides debug detail, tightens CORS and docs).                              |

---

## 7. Audit events (table `security_events`)

Each row stores `metadata` with `requestId`, `ip` and `userAgent` (plus extras). Events: `ACCOUNT_REGISTERED`, `REGISTRATION_DUPLICATE_EMAIL`, `LOGIN_SUCCESSFUL`, `LOGIN_FAILED`, `LOGIN_BLOCKED_DEACTIVATED`, `LOGOUT`, `PASSWORD_RESET_REQUESTED`, `CONFIRMATION_EMAIL_REQUESTED`. Emails are stored only as a 16-character hash (`emailHash`).

**Finding what happened for a user's error report:**`select * from security_events where metadata->>'requestId' = '<id from the error>';` and search the server logs for `[<id>]`.

---

## 8. Install checklist (tick as you apply each delivery)

**Packages:**`npm install express-rate-limit zod helmet`


| Task    | Files delivered                                                                                                                                                                                                                                                          |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1       | `src/middleware/rateLimiter.js`(new),`server.js`,`src/routes/authRoutes.js`,`controllers/auth.controller.js`(adds`resendConfirmation`)                                                                                                                                   |
| 2       | `src/validation/common.js`,`src/validation/auth.schemas.js`,`src/middleware/validate.js`(new),`src/routes/authRoutes.js`,`server.js`                                                                                                                                     |
| 3       | `src/utils/ApiError.js`,`src/utils/formatZodIssues.js`,`src/middleware/errorHandler.js`,`src/middleware/requestId.js`(new),`src/middleware/validate.js`,`src/middleware/rateLimiter.js`,`server.js`,`controllers/auth.controller.js`,`src/middleware/auth.middleware.js` |
| 4       | `src/utils/requestContext.js`,`src/services/audit.service.js`,`src/config/cors.js`,`src/middleware/security.js`(new),`src/middleware/requestId.js`,`server.js`,`controllers/auth.controller.js`,`src/middleware/auth.middleware.js`                                      |
| SSL fix | `src/config/prisma.js`(connection-level retry)                                                                                                                                                                                                                           |

When a file appears in several rows, the **latest** delivery is the one to use (it already contains the earlier changes).

---

## 9. Pending and manual items

1. Apply any deliveries above that are not installed yet, and run `npm install express-rate-limit zod helmet`.
2. **Reset the database password** in Supabase (it was shared in chat and in an uploaded `.env`), then update `DATABASE_URL`.
3. Rename `prisma7.config.ts` to `prisma.config.ts`, point it at `DATABASE_URL`, then delete `DIRECT_URL` from `.env` and drop `?connect_timeout=60` from the URL.
4. Supabase dashboard: set the minimum password length to 8 (and optionally require letters and numbers).
5. Production: set `CORS_ORIGINS`, `NODE_ENV=production` and `TRUST_PROXY`; configure a custom SMTP provider (Supabase's built-in sender has a low hourly email cap).
6. Convert `prisma/migrations/0_init/migration.sql` from UTF-16 to UTF-8.
7. Clean-up: delete `generated/prisma/`, the AI-skill folders, `skills-lock.json`, the `postinstall` script and the diagnostic `test*.js` scripts.
8. Move `superbase-auth-trigger.sql` into a properly named, tracked file, and add a trigger that sets `email_verified_at` when the confirmation link is clicked.
9. Decide a retention period and a scheduled purge for `security_events` and `login_activities` (they hold IP addresses).
10. Still to do from the roadmap: tasks 5, 6 and 7. Paused: age confirmation, onboarding and consent fields.

---

## 10. Change log


| Date       | Change                                                                                                                                                                                                                 |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-11-21 | Database SSL fix:`src/config/prisma.js`now retries failed connections (intermittent Supabase pooler handshake failures).                                                                                               |
| 2026-11-21 | Task 1: rate limiting added; new`POST /api/auth/resend-confirmation`endpoint.                                                                                                                                          |
| 2026-11-21 | Task 2: Zod validation and sanitization for all auth routes; JSON body limit 10 KB.                                                                                                                                    |
| 2026-11-21 | Task 3: central error handling and request IDs; controllers and auth middleware now throw`ApiError`; unconfirmed-email login returns 403`EMAIL_NOT_CONFIRMED`; outages return 503 instead of a false 401.              |
| 2026-11-21 | Task 4: Helmet, CORS allowlist,`no-store`on auth responses, JWT-shape check, audit logging service, same registration response for existing emails, post-signup database lookup removed, Swagger hidden in production. |
| 2026-11-21 | README created.                                                                                                                                                                                                        |
