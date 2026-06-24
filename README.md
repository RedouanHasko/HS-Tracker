# HS Tracker

Construction and renovation project management — expense tracking, workspaces, checklists, documents, and multi-user collaboration. Built with React, Vite, and Firebase.

## Live site

**https://hs-tracker-1.web.app**

Full hosting, Firebase, and redeploy details: **[DEPLOYMENT.md](./DEPLOYMENT.md)**

## Run locally

**Prerequisites:** Node.js

```powershell
npm install
npm run dev
```

Open http://localhost:3000

## Build & deploy

```powershell
npm run build
npx firebase deploy
```

See [DEPLOYMENT.md](./DEPLOYMENT.md) for URLs, Firebase Console links, and custom domain setup.

## Documents (invoices, vouchers, receipts)

In any project, open **Invoices & Vouchers**:

- **Issuer profiles** — save your company or personal identity (name, email, phone, address) and pick from a list when printing.
- **Recipient** — not limited to the client; choose type (client, worker, team member, supplier, other) and save profiles or use quick-fill from project members.
- **Per-type presets** — invoice, voucher, and receipt each remember their own tax rate, paper format (A4/A5), and footer notes (stored in your browser per account).

Profiles and presets are saved in `localStorage` under your Firebase user id.

## Tasks & subtasks

On the **Roadmap** tab, open any task card → **Details**. Use **Subtasks** to add a simple checklist (Jira-style): type a step, press Add, tick when done. Progress shows on the kanban card (`2/5 steps` + bar). Subtasks are saved with the task in Firestore when you click **Save changes**.

## Roles & permissions

| Role | Can do |
|------|--------|
| **Read-only** | View project, expenses, tasks, documents — no edits |
| **Contributor** | Add/edit/delete tasks & expenses |
| **Editor** | Same as contributor (content) |
| **Manager** | Settings, members, settlements; **cannot** edit/delete **your** tasks/expenses |
| **Co-owner** | **Same practical access as you** — can edit/delete anything including your items (only you can assign this role) |
| **Owner** | Project creator — full access; cannot be removed |

Permissions are enforced in the UI and in **Firestore security rules** (`memberRoleByEmail` on each project). After pulling this update, deploy rules: `npx firebase deploy --only firestore:rules,storage`.

Live sync: all members see changes in real time via `subscribeToProject`.

### Content ownership & audit log

- Every **task** and **expense** records who created it (`createdBy`).
- **Your tasks/expenses** (as project owner) are **protected** — even managers cannot edit or delete them; only you can.
- **Managers** can edit/delete content created by contributors/editors.
- **Contributors/editors** can only change items they created themselves.
- **Owners & managers** see a live **Team activity log** on the Overview tab (creates, edits, deletes, subtask changes) — updates in real time.
- Protected tasks show a lock icon on the kanban board.

## AI Assistant (frontend-only)

Works on **free Firebase Hosting** — no Cloud Functions or Blaze plan required.

1. Get a **free** API key from [Google AI Studio](https://aistudio.google.com/apikey)
2. Open any project → tap the **floating bot button** (bottom-right)
3. Paste your key once (saved in your browser only), or set `VITE_GEMINI_API_KEY` at build time

**What it can do:**
- Answer questions, budget reports, settlement summaries, planning advice
- Read **receipt/invoice photos** and propose a new expense
- Propose actions: mark tasks done, create tasks/subtasks, add/delete expenses

**Safety:**
- Nothing writes to Firestore until you tap **Apply changes**
- **Undo** restores the project snapshot from before the last AI apply
- Respects your **role** and **ownership rules** (cannot edit protected owner tasks)

Uses Gemini from the browser via `@google/genai` (already in the project).

## Stack

- **Frontend:** React 19, Vite, Tailwind CSS
- **Backend:** Firebase Authentication, Cloud Firestore
- **Hosting:** Firebase Hosting (free tier)

## Project structure

```
src/
  lib/firebase.ts    # Firebase config
  lib/db.ts          # Firestore helpers
  lib/AuthContext.tsx
  components/        # UI components
firestore.rules      # Security rules
firebase.json        # Deploy config
```
