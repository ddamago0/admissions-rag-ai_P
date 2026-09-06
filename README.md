# Admissions RAG AI - Colombia Language Academy System

An enterprise-grade, high-performance intelligent admissions, customer support, and academic advisory system for **Colombia Language Academy (Academia de Idiomas Colombia)**. 

The architecture features an optimized Retrieval-Augmented Generation (RAG) pipeline powered by Google Gemini and Groq, an in-memory sub-millisecond Inverted Token Index Auto-FAQ cache engine, deterministic fast-path local guardrails, an HNSWLib vector index, a Node.js Express backend, a multi-channel Telegram & SMTP SSL escalation automation engine, a secure HMAC-SHA256 Administrator Management Portal with document CRUD, and a responsive institutional web application.

---

## 1. System Architecture

The solution comprises five synchronized core layers:

```
                               ┌──────────────────────────────────────────────┐
                               │             USER QUERY / CLIENT              │
                               └──────────────────────┬───────────────────────┘
                                                      │
                                                      ▼
                               ┌──────────────────────────────────────────────┐
                               │  LAYER 0A: Inverted Token FAQ Cache (<3ms)   │
                               │  LAYER 0B: Dynamic LRU Query Cache (<1ms)    │
                               │  LAYER 0C: Fast-Path Local Guardrails (<1ms) │
                               └──────────────────────┬───────────────────────┘
                                                      │ (If Cache/Guardrail Miss)
                                                      ▼
                               ┌──────────────────────────────────────────────┐
                               │  HNSWLib Vector Store (Multi-Doc Retrieval)  │
                               └──────────────────────┬───────────────────────┘
                                                      │ Grounded Context
                                                      ▼
                               ┌──────────────────────────────────────────────┐
                               │      TIERED LLM GATEWAY & FALLBACK POOL      │
                               │  Tier 1: gemini-3.5-flash-lite (Primary)     │
                               │  Tier 2: gemini-2.5-flash-lite (Economic)    │
                               │  Tier 3: gemini-3.5-flash / gemini-2.5-flash │
                               │  Tier 4: Groq openai/gpt-oss-120b (Fail-Safe)│
                               └──────────────────────┬───────────────────────┘
                                                      │
                                                      ▼
                               ┌──────────────────────────────────────────────┐
                               │       MULTI-CHANNEL ESCALATION ENGINE        │
                               │  • Telegram Bot with 1-Click WhatsApp reply  │
                               │  • Direct SMTP Email (Port 465 SSL / 587)    │
                               │  • Admin Portal Tickets with Auto-Purge      │
                               └──────────────────────────────────────────────┘
```

1. **Public Web Experience (`public/`):**
   - Responsive institutional homepage with language programs (English, French, German, Portuguese, Italian, Spanish), schedule tracks, Colombian COP pricing, international certifications (IELTS, TOEFL, DELF, DELE), and campuses (Bogotá & Medellín).
   - Floating AI Admissions Messenger widget with real-time grounding citations, interactive action suggestions, and escalation handoff.

2. **Fast-Path Local Deterministic Guardrails (`src/services/guardrailService.js`):**
   - Intercepts and short-circuits off-topic queries (arithmetic, code generation, prompt injection, jailbreaks, recipes, medical advice) in Express/Node.js before invoking LLMs.
   - Consumes **0 tokens ($0 API cost)** with sub-millisecond execution (< 1ms).
   - Word boundary checks (`\b`) and whitelist exclusions prevent false positives on legitimate admissions queries (e.g. *"código de conducta"*, *"descuento del 10%"*).

3. **Sub-Millisecond Inverted Token FAQ Cache Engine (`src/services/cacheService.js`):**
   - Auto-generates dynamic FAQs in RAM across all loaded knowledge documents (`data/*.md`).
   - Resolves frequent admissions questions in $< 3\text{ ms}$ with $0 API token consumption.

4. **Tiered LLM Model Fallback Pool (`src/services/aiService.js`):**
   - **Tier 1 (Primary):** `gemini-3.5-flash-lite` (maximum speed, lowest cost).
   - **Tier 2 (Economic Fallback):** `gemini-2.5-flash-lite`.
   - **Tier 3 (Power / Resilience):** `gemini-3.5-flash` with alternate `gemini-2.5-flash`.
   - **Tier 4 (External Fail-Safe):** Native **Groq** (`openai/gpt-oss-120b` / `llama-3.3-70b-versatile`) for 100% uptime resilience.
   - Strict 5-second per-attempt timeout via `AbortController` and `Promise.race`.
   - Automatic non-blocking conmutation on HTTP 429 (`RESOURCE_EXHAUSTED`), timeouts, 503, or rate limits.
   - Enforced `maxOutputTokens: 600` and sliding conversational window to slash token billing.

5. **Administrator Portal (`public/admin.html`):**
   - Protected by HMAC-SHA256 session token authentication.
   - Complete document lifecycle management (CRUD: Create, Read, Update, Delete) on `data/*.md` with automatic vector re-indexing.
   - Escalation ticket manager with real-time text search, status filters (`PENDING`, `RESOLVED`), priority filters (`HIGH`, `MEDIUM`), auto-purge (24-hour TTL), and manual purge action.
   - Live telemetry and KPI dashboard.

6. **Multi-Channel Automation Bridge (`automation/` & `src/services/`):**
   - Real-time Telegram push notifications with interactive 1-click WhatsApp reply buttons.
   - Automated SMTP email dispatch via Port 465 (SSL) / 587 (TLS).
   - Persistent escalation event logging in `automation/escalations.json`.

---

## 2. Prerequisites

- **Node.js**: `v18.0.0` or higher (tested on Node.js `v24.20.0`)
- **Python**: `v3.10` or higher (for optional background orchestrator)
- **Google Gemini API Key** (`GEMINI_API_KEY`)
- **Groq API Key** (`GROQ_API_KEY`, optional fail-safe)

---

## 3. Installation & Setup

### Step 1: Install Node.js Dependencies
```bash
npm install
```

### Step 2: Configure Environment Variables
Copy the template configuration:
```bash
cp .env.example .env
```

Configure `.env` with your settings:
```ini
# Server Configuration
PORT=3000
NODE_ENV=development

# Google Gemini API Configuration
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_EMBEDDING_MODEL=gemini-embedding-001
GEMINI_CHAT_MODEL=gemini-3.5-flash-lite
MAX_OUTPUT_TOKENS=600
GEMINI_TIMEOUT_MS=5000

# Optional External Fail-Safe (Groq)
GROQ_API_KEY=your_optional_groq_api_key
GROQ_MODEL=openai/gpt-oss-120b
GROQ_TIMEOUT_MS=5000

# Vector Store Configuration
VECTOR_STORE_PATH=./vectorstore

# Python Automation & Webhook Integration
PYTHON_ORCHESTRATOR_URL=http://localhost:5000/webhook/escalations

# Escalation Alert Dispatch Targets
ADVISOR_EMAIL=ddamago0@gmail.com
ADVISOR_PHONE=+573014777763

# Direct Telegram Push Notifications
TELEGRAM_BOT_TOKEN=your_telegram_bot_token_optional
TELEGRAM_CHAT_ID=your_telegram_chat_id_optional

# SMTP Email Dispatch (Port 465 SSL / 587 TLS)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email_optional
SMTP_PASS=your_app_password_optional

# Administrator Portal Credentials & Security
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your_strong_admin_password
ADMIN_JWT_SECRET=your_random_secure_jwt_secret_here
```

---

## 4. Knowledge Base Vector Ingestion

Populate the HNSWLib vector index with knowledge base documents from `data/`:
```bash
npm run rag:ingest
```

---

## 5. Execution

### Start the Application Server
```bash
npm start
```

Access the application in your browser:
- **Public Institutional Homepage & AI Chat:** `http://localhost:3000`
- **Administrator Management Portal:** `http://localhost:3000/admin.html`

---

## 6. Administrator Portal Controls

The Admin Portal (`/admin.html`) provides authorized administrators with management controls:

- **Authentication:** Requires `ADMIN_USERNAME` and `ADMIN_PASSWORD` (HMAC-SHA256 signature verification).
- **Document CRUD:**
  - **List:** View active markdown knowledge documents, sizes, and line counts.
  - **Create:** Author new documents directly via the in-browser editor.
  - **Upload:** Upload `.md` or `.txt` curriculum files via drag-and-drop.
  - **Edit:** Update course pricing, schedules, and policies in real time.
  - **Delete:** Remove outdated files with safety thresholds.
  - **Auto Re-indexing:** Creating, modifying, or removing a document automatically executes vector store re-indexing and dynamic Auto-FAQ generation.
- **Ticket Management:**
  - Real-time text search (search by student name, phone, email, issue topic).
  - Status filters (`All`, `Pending`, `Resolved`) and Priority filters (`All`, `High`, `Medium`).
  - **Auto-Purge:** Automatically removes resolved tickets older than 24 hours.
  - **Manual Purge:** 1-click button to purge all resolved tickets.
  - Direct 1-click WhatsApp advisor contact links with pre-filled conversational templates.

---

## 7. API Reference

### Public Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/chat` | Receives `{ "message": string, "sessionId": string }`. Returns grounded RAG answer, escalation status, lead info, telemetry (`tier`, `modelUsed`, `latencyMs`), and sources. |
| `GET` | `/api/metrics` | Returns total queries, escalation rates, average latency, and estimated token usage. |
| `POST` | `/api/ingest` | Triggers vector store re-indexing from current `data/` files. |

### Admin Endpoints (Protected with `Authorization: Bearer <token>`)

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/admin/login` | Authenticates admin credentials and issues HMAC-SHA256 token. |
| `GET` | `/api/admin/verify` | Verifies session token validity and expiration. |
| `GET` | `/api/admin/documents` | Lists all markdown knowledge files in `data/`. |
| `GET` | `/api/admin/documents/:filename` | Retrieves content of a specific document. |
| `POST` | `/api/admin/documents` | Creates a new document and triggers vector re-indexing. |
| `PUT` | `/api/admin/documents/:filename` | Updates an existing document and re-indexes. |
| `DELETE` | `/api/admin/documents/:filename` | Deletes a document and re-indexes. |
| `GET` | `/api/admin/tickets` | Returns all escalation tickets with auto-purge applied. |
| `PUT` | `/api/admin/tickets/:ticketId/status` | Updates escalation ticket status. |
| `DELETE` | `/api/admin/tickets/resolved` | Permanently purges all resolved escalation tickets. |
| `POST` | `/api/admin/reindex` | Manually triggers vector store re-indexing. |

---

## 8. Automated Testing & Quality Assurance

Run the comprehensive test suite verifying all 32 architectural checkpoints:
```bash
npm test
```

### Test Coverage (32/32 Passed):
1. **Suite 1:** Knowledge base completeness, text chunking, and Colombian domain terms (COP pricing, campuses).
2. **Suite 2:** Telemetry metrics tracking and multi-turn session conversational state.
3. **Suite 3:** Admin HMAC-SHA256 authentication, signature validation, and rejection of forged tokens.
4. **Suite 4:** Document CRUD operations and filesystem synchronization.
5. **Suite 5:** Frontend static assets integrity.
6. **Suite 6:** Multi-document Auto-FAQ Inverted Token Index RAM Cache Engine.
7. **Suite 7:** Escalation ticket lifecycle, filtering, and auto-purge logic.
8. **Suite 8:** Local deterministic fast-path guardrails (Math, Code generation, Jailbreaks, Whitelist boundaries).
9. **Suite 9:** Tiered Model Fallback Pool (Tier 1-4), timeouts, and token budget caps.

---

## 9. License

ISC License. Built for Colombia Language Academy.
