<div align="center">

# InlineExplainer

**Understand any codebase, inline.**

Paste a public repository URL → get AI-generated, structural explanations anchored directly to the code.

[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.136-009688?logo=fastapi)](https://fastapi.tiangolo.com/)
[![Supabase](https://img.shields.io/badge/Supabase-Auth%20%2B%20DB-3FCF8E?logo=supabase)](https://supabase.com/)
[![Turborepo](https://img.shields.io/badge/Turborepo-Monorepo-EF4444?logo=turborepo)](https://turbo.build/)

</div>

---

## Overview

InlineExplainer is a full-stack AI-powered tool that helps developers understand unfamiliar codebases. It combines **AST-based code graph extraction** with **LLM-powered explanations** to generate context-aware, file-level documentation — streamed in real time and displayed alongside the source code in an IDE-like workspace.

### How It Works

1. **Paste a repo URL** — GitHub, GitLab, or Bitbucket (public, up to 50 MB).
2. **AST extraction** — The backend clones the repo, runs [Graphify](https://pypi.org/project/graphifyy/) to build a full code graph (functions, classes, imports, call relationships).
3. **Browse the workspace** — A file tree, Monaco code editor, and explanation panel are presented side by side.
4. **AI explanations** — When you select a file, InlineExplainer identifies connected files via the code graph (callers, callees, imports) and sends the code + cross-file context to an LLM for a detailed, structural explanation. Responses stream token-by-token.
5. **Deep Dive chat** — Ask follow-up questions at the **repo level** (architecture, structure) or the **file level** (specific logic, functions). Select code in the editor or explanation panel to attach it as context to your question.

---

## Features

| Feature | Description |
|---|---|
| **AST Code Graph** | Extracts function/class definitions, call relationships, and import edges using tree-sitter via Graphify |
| **Cross-File Context** | Explanations are enriched with snippets from connected files (callers, callees, imports) — not just the file in isolation |
| **Streaming Explanations** | Token-by-token SSE streaming from the LLM so you see the explanation build in real time |
| **Multi-Provider Waterfall Router** | Fallback router across Groq (Llama 3.3 70B), Google Gemini (1.5/2.0/2.5), and NVIDIA NIM (Llama 3.1/3.3) |
| **Repo & File Chat** | Two-tab chat system — repo-level (uses README + file tree) and file-level (uses file code + explanation + selected text) |
| **Code Selection → Ask AI** | Select any code in the Monaco editor or text in the explanation panel → a floating "Ask AI" button opens the chat with that selection as context |
| **Pending Context Attachment** | Selected code appears as a dismissible chip above the chat input before sending, so you can see exactly what context will be included |
| **Model Tier Toggle** | Switch between Fast (Low Latency / High Speed) and Smart (Deep Reasoning / High Accuracy) per-message |
| **Explanation & Session Caching** | Explanations are cached in Supabase — revisiting a file loads instantly. Chat sessions persist across page reloads |
| **GitHub OAuth** | Sign in with GitHub via Supabase Auth. JWT verified on the backend using JWKS (no shared secrets) |
| **Profile & Account Management** | View all analysed repos, sign out, or permanently delete your account (with username confirmation) |
| **Per-User Rate Limiting** | In-memory rate limiter with per-minute and per-day caps per endpoint (ingest, explain, chat) |
| **Light / Dark Theme** | System-aware theme toggle with CSS custom properties. Monaco editor syncs theme automatically |
| **Resizable Panels** | File tree, code, explanation, and chat panels are all resizable with drag handles. Sidebar is collapsible |
| **Privacy & Terms Pages** | Static legal pages linked from the landing page footer |

---

## Tech Stack

### Frontend (`apps/web`)

| Technology | Purpose |
|---|---|
| [Next.js 16](https://nextjs.org/) | React framework with App Router, SSR, middleware |
| [React 19](https://react.dev/) | UI library |
| [TypeScript](https://www.typescriptlang.org/) | Type safety |
| [Monaco Editor](https://microsoft.github.io/monaco-editor/) | VS Code's editor component for read-only code viewing |
| [Supabase SSR](https://supabase.com/docs/guides/auth/server-side/nextjs) | Auth (GitHub OAuth), session management, middleware |
| [react-resizable-panels](https://github.com/bvaughn/react-resizable-panels) | Draggable panel layout |
| [react-markdown](https://github.com/remarkjs/react-markdown) | Rendering LLM markdown output |
| [Tailwind CSS 4](https://tailwindcss.com/) | Utility-first CSS (with CSS custom property design tokens) |

### Backend (`apps/api`)

| Technology | Purpose |
|---|---|
| [FastAPI](https://fastapi.tiangolo.com/) | Async Python web framework |
| [Graphify](https://pypi.org/project/graphifyy/) | AST extraction — builds code graph with tree-sitter |
| [GitPython](https://gitpython.readthedocs.io/) | Shallow-cloning repositories |
| [httpx](https://www.python-httpx.org/) | Async HTTP client for Supabase REST, NVIDIA NIM, Gemini API |
| [PyJWT](https://pyjwt.readthedocs.io/) | JWT verification via Supabase JWKS |
| [psutil](https://psutil.readthedocs.io/) | Memory monitoring during AST extraction |

### Infrastructure

| Service | Purpose |
|---|---|
| [Supabase](https://supabase.com/) | PostgreSQL database (repositories, explanations, chat_sessions, users), Auth, RLS |
| [Vercel](https://vercel.com/) | Frontend hosting |
| [Render](https://render.com/) | Backend hosting (free tier) |
| [Turborepo](https://turbo.build/) | Monorepo build orchestration |

---

## Project Structure

```
inline_explainer/
├── apps/
│   ├── api/                          # FastAPI backend
│   │   ├── main.py                   # App entry point, CORS, router registration
│   │   ├── requirements.txt          # Python dependencies
│   │   ├── core/
│   │   │   ├── config.py             # Central env var loader
│   │   │   ├── auth.py               # JWT verification via Supabase JWKS
│   │   │   ├── rate_limiter.py       # In-memory per-user rate limiter
│   │   │   └── supabase.py           # Thin httpx wrapper for Supabase PostgREST
│   │   ├── routers/
│   │   │   ├── ingest.py             # POST /api/ingest — clone, extract AST graph
│   │   │   ├── explain.py            # POST /api/explain — streaming file explanations
│   │   │   ├── chat.py               # POST /api/chat, GET /api/chat/session
│   │   │   └── user.py               # GET /api/user/repositories, DELETE /api/user
│   │   └── services/
│   │       └── repo_service.py       # Clone, validate, run Graphify AST extraction
│   │
│   └── web/                          # Next.js frontend
│       ├── app/
│       │   ├── page.tsx              # Landing page — repo URL input
│       │   ├── layout.tsx            # Root layout with ThemeToggle
│       │   ├── globals.css           # Design tokens (light/dark), base styles
│       │   ├── (auth)/login/         # GitHub OAuth login page
│       │   ├── (workspace)/[owner]/[repo]/  # Workspace route
│       │   ├── auth/callback/        # Supabase OAuth callback handler
│       │   ├── profile/              # User profile, repo list, account deletion
│       │   ├── privacy/              # Privacy policy
│       │   └── terms/                # Terms of service
│       ├── components/
│       │   ├── ui/
│       │   │   └── ThemeToggle.tsx    # Light/dark theme switcher
│       │   └── workspace/
│       │       ├── WorkspaceShell.tsx # Main layout orchestrator
│       │       ├── FileTree.tsx       # Recursive file tree from GitHub API
│       │       ├── CodePanel.tsx      # Monaco editor + "Ask AI" selection widget
│       │       ├── ExplanationPanel.tsx  # Streaming explanation renderer
│       │       ├── ChatTray.tsx       # Dual-tab chat (repo + file level)
│       │       └── ResizeHandle.tsx   # Panel resize handle
│       ├── hooks/
│       │   └── useChatSession.ts     # Chat state, streaming, session persistence
│       ├── lib/supabase/
│       │   ├── client.ts             # Browser Supabase client
│       │   └── server.ts             # Server-side Supabase client
│       ├── types/
│       │   └── index.ts              # Shared TypeScript interfaces
│       └── middleware.ts             # Auth guard, session refresh
│
├── package.json                      # Root workspace config
├── turbo.json                        # Turborepo task pipeline
├── .env.example                      # Environment variable template
└── .gitignore
```

---

## Getting Started

### Prerequisites

- **Node.js** ≥ 20.0.0
- **Python** ≥ 3.11
- **Git** (for cloning repos at runtime)
- A [Supabase](https://supabase.com/) project
- At least one AI API key: [Google Gemini](https://aistudio.google.com/) or [NVIDIA NIM](https://build.nvidia.com/)

### 1. Clone the repository

```bash
git clone https://github.com/AmeyaSingh23/inline_explainer.git
cd inline_explainer
```

### 2. Set up environment variables

Copy the template and fill in your values:

```bash
cp .env.example .env
```

**Required variables:**

| Variable | Where | Description |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Frontend | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Frontend | Supabase anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Backend | Supabase service role key (bypasses RLS) |
| `SUPABASE_JWKS_URL` | Backend | Supabase JWKS endpoint for JWT verification |
| `GEMINI_API_KEY` | Backend | Google Gemini API key |
| `GROQ_API_KEY` | Backend | Groq API key |
| `NVIDIA_API_KEY` | Backend | *(Optional)* NVIDIA NIM API key |
| `NEXT_PUBLIC_API_URL` | Frontend | Backend URL (`http://localhost:8000` for local dev) |
| `NEXT_PUBLIC_APP_URL` | Frontend | Frontend URL (`http://localhost:3000` for local dev) |

Create `apps/web/.env.local` with the `NEXT_PUBLIC_*` variables, and `apps/api/.env` with the backend variables.

### 3. Set up the database

Create the following tables in your Supabase project:

- **`repositories`** — `id (uuid, PK)`, `user_id`, `repo_url`, `repo_name`, `graph_json (jsonb)`, `processing_status`, `created_at`
  - Unique constraint on `(user_id, repo_url)`
- **`explanations`** — `id (uuid, PK)`, `user_id`, `repository_id (FK)`, `file_path`, `explanation (text)`, `created_at`
  - Unique constraint on `(repository_id, file_path)`
- **`chat_sessions`** — `id (uuid, PK)`, `user_id`, `repository_id (FK)`, `file_path`, `messages (jsonb)`, `updated_at`
  - Unique constraint on `(repository_id, file_path)`
- **`users`** — `id (uuid, PK, FK → auth.users)`, `username`, `github_id`, `created_at`
  - Set up `ON DELETE CASCADE` from `auth.users`

Enable **GitHub OAuth** in Supabase Auth settings.

### 4. Install dependencies

```bash
# Frontend (from project root)
npm install

# Backend
cd apps/api
python -m venv .venv
.venv/Scripts/activate      # Windows
# source .venv/bin/activate  # macOS/Linux
pip install -r requirements.txt
```

### 5. Run locally

```bash
# Terminal 1 — Backend
cd apps/api
uvicorn main:app --reload

# Terminal 2 — Frontend
cd apps/web
npm run dev
```

Or use Turborepo from the root:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## API Endpoints

All endpoints are prefixed with `/api` and require a `Bearer` token (Supabase JWT) in the `Authorization` header.

| Method | Endpoint | Description | Rate Limit |
|---|---|---|---|
| `POST` | `/api/ingest` | Clone repo, extract AST graph, cache in Supabase | 2/min, 5/day |
| `POST` | `/api/explain` | Generate streaming file explanation (SSE) | 10/min, 200/day |
| `POST` | `/api/chat` | Send chat message, receive streaming response (SSE) | 10/min, 150/day |
| `GET` | `/api/chat/session` | Load persisted chat history for a file | — |
| `GET` | `/api/user/repositories` | List user's analysed repos + profile | — |
| `DELETE` | `/api/user` | Permanently delete user account + all data | — |
| `GET` | `/api/health` | Health check (pinged by cron to prevent cold starts) | — |

### Rate Limiting

Rate limits are enforced **per-user, per-endpoint** using an in-memory tracker. Cache hits (explanations, ingest) do **not** count against the limit.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Browser                               │
│  ┌──────────┬───────────┬──────────────┬──────────────────┐ │
│  │ FileTree │   Code    │ Explanation  │   Chat Tray      │ │
│  │ (GitHub  │  (Monaco) │  (Streaming  │ (Repo + File     │ │
│  │   API)   │           │   Markdown)  │   tabs)          │ │
│  └──────────┴─────┬─────┴──────┬───────┴────────┬─────────┘ │
│                   │            │                │            │
│            GitHub API    Supabase Auth     FastAPI Backend   │
└───────────────────┼────────────┼────────────────┼────────────┘
                    │            │                │
                    │            │     ┌──────────▼──────────┐
                    │            │     │   FastAPI Backend    │
                    │            │     │                      │
                    │            │     │  /ingest  → Graphify │
                    │            │     │  /explain → LLM SSE  │
                    │            │     │  /chat    → LLM SSE  │
                    │            │     │                      │
                    │            │     │  ┌─── AI Router ──┐  │
                    │            │     │  │  Groq / Gemini │  │
                    │            │     │  │   / NVIDIA NIM │  │
                    │            │     │  └────────────────┘  │
                    │            │     └──────────┬───────────┘
                    │            │                │
                    │     ┌──────▼────────────────▼──────┐
                    │     │       Supabase (Postgres)     │
                    │     │  repositories | explanations  │
                    │     │  chat_sessions | users        │
                    │     └──────────────────────────────┘
```

---

## Deployment

### Frontend (Vercel)

1. Connect the GitHub repo to Vercel.
2. Set root directory to `apps/web`.
3. Add environment variables (`NEXT_PUBLIC_*`).
4. Deploy.

### Backend (Render)

1. Create a new Web Service on Render.
2. Set root directory to `apps/api`.
3. Build command: `pip install -r requirements.txt`
4. Start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
5. Add all backend environment variables.
6. Set up a cron job (e.g., [cron-job.org](https://cron-job.org)) to ping `/api/health` every 10 minutes to prevent cold starts.

---

## License

This project is for educational and portfolio purposes.

---

<div align="center">
  <sub>Built by <a href="https://github.com/AmeyaSingh23">Ameya Singh</a></sub>
</div>
