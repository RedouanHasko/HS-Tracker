# HS Tracker — Deployment & Hosting

Reference for the live site, Firebase project, and how to redeploy.

**Last deployed:** June 18, 2026

---

## Live site

| Resource | URL |
|----------|-----|
| **Primary hosting URL** | https://hs-tracker-1.web.app |
| **Alternate hosting URL** | https://hs-tracker-1.firebaseapp.com |
| **Firebase Console** | https://console.firebase.google.com/project/hs-tracker-1/overview |

---

## Firebase project

| Setting | Value |
|---------|--------|
| **Project ID** | `hs-tracker-1` |
| **Auth domain** | `hs-tracker-1.firebaseapp.com` |
| **Storage bucket** | `hs-tracker-1.firebasestorage.app` |
| **Firestore database** | `(default)` |
| **Hosting plan** | Firebase Spark (free) |

Config lives in `src/lib/firebase.ts`. CLI project alias is in `.firebaserc`.

---

## Firebase Console shortcuts

- **Overview:** https://console.firebase.google.com/project/hs-tracker-1/overview
- **Authentication:** https://console.firebase.google.com/project/hs-tracker-1/authentication
- **Firestore:** https://console.firebase.google.com/project/hs-tracker-1/firestore
- **Storage:** https://console.firebase.google.com/project/hs-tracker-1/storage
- **Hosting:** https://console.firebase.google.com/project/hs-tracker-1/hosting
- **Authorized domains (Auth):** https://console.firebase.google.com/project/hs-tracker-1/authentication/settings

---

## Redeploy (after code changes)

From the project root:

```powershell
cd d:\Download\hs-tracker
npm run deploy
```

This runs `npm run build` then deploys **Hosting** + **Firestore rules** only (no Cloud Storage — not used on the free plan).

> **Use `npm run deploy`** instead of bare `npx firebase deploy`. Storage is intentionally excluded; the app stores images in Firestore, not Cloud Storage.

Deploy only the website:

```powershell
npm run deploy:hosting
```

Or manually:

```powershell
npm run build
npx firebase deploy --only hosting
```

Deploy only Firestore security rules (includes task photos + expense receipts in Firestore):

```powershell
npx firebase deploy --only firestore:rules
```

---

## Pre-deploy checklist (June 2026 update)

Before `npm run deploy`, confirm:

| Check | Why |
|-------|-----|
| `npm run build` succeeds | Production bundle goes to `dist/` |
| Logged into Firebase CLI (`firebase login`) | Required to deploy |
| Project alias is `hs-tracker-1` (`.firebaserc`) | Deploys to the correct site |
| **Auth → Authorized domains** includes `hs-tracker-1.web.app` | Sign-in works on live URL |
| **Do not** set `VITE_TASK_MEDIA_BACKEND=firebase` unless on **Blaze** | Spark uses Firestore for images (free) |
| Gemini AI: key in `.env` as `VITE_GEMINI_API_KEY` **at build time**, or users paste key in the app | AI calls run in the browser (free Gemini tier per key) |

### What ships in `dist/` (auto-generated)

- `index.html` — SPA entry (Firebase rewrites all routes here)
- `assets/` — JS, CSS, HS Infinity logo
- `hs-infinity-icon.jpeg`, `site.webmanifest` — favicon & PWA icon

### Free tier (Spark) — what works without paying

| Feature | Free approach |
|---------|----------------|
| **Hosting** | Firebase Hosting on Spark |
| **Auth** | Email + Google sign-in |
| **Database** | Firestore (within free quotas) |
| **Task photos & expense receipts** | Stored in `project_task_media` in Firestore (~180 KB each, compressed) |
| **AI assistant** | Google Gemini free API key ([AI Studio](https://aistudio.google.com/apikey)) — each user can save key in browser, or bake `VITE_GEMINI_API_KEY` into build |
| **Cloud Storage** | Not required on Spark (optional on Blaze only) |

### After deploy — smoke test on live site

1. Open https://hs-tracker-1.web.app — favicon (HS Infinity) and footer load
2. Sign in (Google or email)
3. Dashboard loads; open **AI assistant** (cyan button, bottom-right)
4. Open a project — sidebar, notifications, history panel, task detail
5. Add a task photo or expense receipt — saves without Storage upgrade
6. **Install as app (phone):** see [Install on phone](#install-on-android--iphone) below

---

## Install on Android & iPhone

HS Tracker is a **Progressive Web App (PWA)** — users can add it to their home screen like a native app (free, no app store).

| Platform | How to install |
|----------|----------------|
| **Android (Chrome)** | Open the site → banner **“Install app”** appears, or menu ⋮ → **Install app** / **Add to Home screen** |
| **iPhone (Safari)** | Open the site in **Safari** → Share ↑ → **Add to Home Screen** |

The HS Infinity icon is used on the home screen. The app opens full-screen without the browser bar.

**Requirements:** HTTPS (Firebase Hosting ✓), service worker (included in build), manifest + icons in `public/icons/`.

Icons are regenerated on each `npm run build` from `assets/img/HS INFINITY-icon.jpeg`.

---

**You do not need Firebase Cloud Storage** for task before/after photos.

As of February 2026, [Cloud Storage requires the Blaze plan](https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024) (credit card on file). The app **defaults to Firestore** for task images instead:

- Photos are compressed in the browser (~180 KB each)
- Stored in the `project_task_media` collection
- Works on the **Spark (free) plan** with no upgrade

Optional: if you upgrade to **Blaze** and set `VITE_TASK_MEDIA_BACKEND=firebase`, add this to `firebase.json` and deploy storage rules:

```json
"storage": { "rules": "storage.rules" }
```

```powershell
npx firebase deploy --only storage
```

The file `storage.rules` is kept in the repo for that case only.

Blaze still has **no-cost quotas** (5 GB storage, etc.) if you stay within limits — you are only charged for overage.

---

## Local development

```powershell
npm install
npm run dev
```

App runs at http://localhost:3000

---

## Custom domain (optional, free on Firebase Hosting)

1. Open [Hosting](https://console.firebase.google.com/project/hs-tracker-1/hosting) in Firebase Console.
2. Click **Add custom domain**.
3. Follow the DNS steps for your domain registrar.
4. After the domain is connected, add it under **Authentication → Settings → Authorized domains** so sign-in works on that domain.

---

## Auth providers

Enabled in Firebase Console → Authentication → Sign-in method:

- **Email / Password**
- **Google**

### App Check rollout (Spark-compatible)

The client supports Firebase App Check with an invisible reCAPTCHA v3 provider. App Check is
disabled when `VITE_FIREBASE_APP_CHECK_SITE_KEY` is empty, so local development and existing
production users are not accidentally locked out.

1. Create a reCAPTCHA v3 site for `hs-tracker-1.web.app` and keep its secret outside this repo.
2. Register web app `1:785042769614:web:ac80603d8af1054e62729f` under Firebase Console > App Check.
3. Put only the public site key in `.env` as `VITE_FIREBASE_APP_CHECK_SITE_KEY` and deploy hosting.
4. Monitor App Check metrics until normal Auth and Firestore traffic is reported as verified.
5. Enable enforcement for Authentication and Cloud Firestore only after verified traffic is stable.

Do not enable enforcement before step 4. Older cached clients without App Check tokens would be
rejected. The default one-day token TTL minimizes attestations and is appropriate for this private app.

---

## Key project files

| File | Purpose |
|------|---------|
| `src/lib/firebase.ts` | Firebase client config (Auth + Firestore) |
| `firestore.rules` | Database security rules |
| `firebase.json` | Hosting + Firestore deploy config |
| `.firebaserc` | Firebase CLI project ID |
| `dist/` | Production build output (generated by `npm run build`) |

---

## Private use note

The app is hosted on a public URL. Data is protected by Firestore rules per user, but anyone with the link can attempt to sign up unless you restrict access. For personal use, avoid sharing the URL widely.

---

## Deploy history

| Date | Notes |
|------|--------|
| 2026-06-18 | Initial deploy to `hs-tracker-1`. Live at https://hs-tracker-1.web.app |
| 2026-06-18 | Update: global AI on dashboard, HS Infinity branding, footer, smoother UI, expense receipts |
