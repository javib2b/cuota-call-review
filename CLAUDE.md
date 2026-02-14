# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install        # Install dependencies
npm run dev        # Start dev server at http://localhost:5173
npm run build      # Production build (vite build)
npm run preview    # Preview production build locally
```

No testing framework, linter, or formatter is configured.

## Architecture

**Cuota Call Review Engine** — a Vite + React 18 SPA for reviewing sales calls with AI-powered analysis, deployed on Vercel.

### Key files

- `src/App.jsx` — Monolithic main component (~800 lines) containing all application logic: auth screens, call review interface, saved calls list, progression tracking, and admin dashboard. All UI uses inline styles (no CSS modules).
- `src/main.jsx` — React entry point, renders `<App />` into `#root`.
- `src/index.css` — Minimal global styles and resets.
- `api/analyze.js` — Vercel serverless function stub.
- `vercel.json` — Rewrites for SPA routing and API proxy.

### External services (called directly from the frontend)

- **Supabase** — Auth (login/signup, sessions) and database (tables: `call_reviews`, `reps`, `profiles`, `invitations`). A lightweight custom client is built inline in App.jsx rather than using the Supabase SDK.
- **Claude API** (`claude-sonnet-4-20250514`) — Transcript analysis. User provides their own API key, stored in localStorage. Called directly from the browser via `https://api.anthropic.com/v1/messages`.

### Scoring system

The app evaluates calls across 9 weighted dimensions (Opening 8%, Discovery 15%, Qualification/MEDDPICC 15%, Storytelling 10%, Objection Handling 12%, Demo/Value 10%, Multi-threading 10%, Next Steps 12%, Call Control 8%). It also tracks 10 risk flags (high/medium/low severity), computes a momentum score, and derives a close probability from overall score, momentum, and risk penalties.

### State management

All state lives in the root `CuotaCallReview` component via React hooks (useState, useEffect, useCallback). No external state library. User roles are `rep`, `manager`, or `admin`.
