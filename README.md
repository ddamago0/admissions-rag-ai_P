# Admissions RAG AI - Colombia Language Academy System

An intelligent admissions, customer support, and academic advisory system for Colombia Language Academy (Academia de Idiomas Colombia). The application integrates a retrieval-augmented generation (RAG) architecture powered by Google Gemini, an HNSWLib vector index, a Node.js and Express backend, a multi-channel Python automation orchestrator, a secure Administrator Management Portal with document CRUD, and a responsive institutional web homepage with an interactive floating AI admissions messenger.

---

## 1. System Architecture

The solution comprises the following integrated layers:

1. **Public Web Experience (`public/`):**
   - Responsive institutional homepage presenting language programs (English, French, German, Portuguese, Italian, Spanish), schedule tracks, Bogotá and Medellín campuses, and Colombian payment options (PSE, Addi).
   - Floating AI Admissions Messenger widget with real-time markdown streaming, grounding sources, and human escalation alerts.

2. **Administrator Portal (`public/admin.html`):**
   - Protected by HMAC-SHA256 session token authentication.
   - Complete document lifecycle management (CRUD: Create, Read, Update, Delete) on `data/*.md` files with automatic vector store re-indexing.
   - Escalation ticket manager with direct 1-click WhatsApp advisor contact links and status tracking.

3. **Backend API (`src/`):**
   - Express server handling chat orchestration, grounding context retrieval, telemetry metrics, and admin operations.
   - Dual-layer model pool fallback (`gemini-2.5-flash-lite`, `gemini-3.5-flash-lite`, `gemini-3.1-flash-lite`, `gemini-3.5-flash`) for rate-limit resilience.
   - Out-of-scope guardrails preventing off-topic computation (e.g. arithmetic, code generation).

4. **Multi-Channel Automation Bridge (`automation/`):**
   - Real-time Telegram push notifications with interactive 1-click reply buttons containing pre-filled conversational templates.
   - Automated HTML email dispatch to the designated advisor.
   - Persistent escalation event logging in `automation/escalations.json` and `automation/escalations.log`.

---

## 2. Prerequisites

- Node.js (v18.0.0 or higher)
- Python (v3.10 or higher)
- Google Gemini API Key (`GEMINI_API_KEY`)

---

## 3. Installation & Setup

### Step 1: Install Node.js Dependencies
```bash
npm install
```

### Step 2: Configure Python Virtual Environment
```bash
python3 -m venv automation/venv
source automation/venv/bin/activate
pip install -r automation/requirements.txt
```

### Step 3: Configure Environment Variables
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
GEMINI_CHAT_MODEL=gemini-2.5-flash-lite

# Vector Store Configuration
VECTOR_STORE_PATH=./vectorstore

# Python Automation & Webhook Integration
PYTHON_ORCHESTRATOR_URL=http://localhost:5000/webhook/escalations

# Escalation Alert Dispatch Targets
ADVISOR_EMAIL=ddamago0@gmail.com
ADVISOR_PHONE=+573014777763

# Direct Telegram Push Notifications (Optional)
TELEGRAM_BOT_TOKEN=your_telegram_bot_token_optional
TELEGRAM_CHAT_ID=your_telegram_chat_id_optional

# SMTP Email Dispatch (Optional)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=

# Administrator Portal Credentials
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin2026
ADMIN_JWT_SECRET=cla_super_secret_admin_jwt_key_2026_secure
```

---

## 4. Knowledge Base Vector Ingestion

Populate the HNSWLib vector index with knowledge base documents from `data/`:
```bash
npm run rag:ingest
```

---

## 5. Execution

### Terminal 1: Python Automation Orchestrator (Optional Background Daemon)
```bash
./automation/venv/bin/python automation/orchestrator.py --mode server --port 5000
```

### Terminal 2: Main Application Server
```bash
npm start
```

Access the application in your browser:
- **Public Institutional Homepage & AI Chat:** `http://localhost:3000`
- **Administrator Management Portal:** `http://localhost:3000/admin.html`

---

## 6. Administrator Portal & Document CRUD

The Admin Portal (`/admin.html`) provides authorized administrators with management controls:

- **Authentication:** Requires `ADMIN_USERNAME` and `ADMIN_PASSWORD` (default: `admin` / `admin2026`).
- **Document CRUD:**
  - **List:** View active markdown knowledge documents, sizes, and line counts.
  - **Create:** Author new documents directly via the in-browser editor.
  - **Upload:** Upload `.md` or `.txt` curriculum files via drag-and-drop.
  - **Edit:** Update course pricing, schedules, and policies in real time.
  - **Delete:** Remove outdated files with safety thresholds.
  - **Auto Re-indexing:** Creating, modifying, or removing a document automatically executes vector store re-indexing.
- **Ticket Management:** View student leads, change resolution status, and open pre-formatted WhatsApp chat sessions.

---

## 7. Multi-Channel Notification Flow

When a user reports a billing dispute, corporate training request, or explicit management escalation requiring human review:

1. **Lead Qualification:** The assistant prompts the user for their **Full Name**, **Phone/Telegram Number**, and **Email Address**.
2. **Alert Dispatch:**
   - **Telegram:** Sends a formatted alert card with an interactive action button linking to the student's phone with a pre-filled greeting.
   - **Email:** Dispatches a styled HTML escalation summary to the advisor's inbox.
   - **Local Store:** Records the ticket in `automation/escalations.json`.

---

## 8. API Reference

### Public Endpoints

- `POST /api/chat`
  - Receives `{ "message": string, "sessionId": string }`.
  - Returns grounded RAG answer, escalation status, lead info, and sources.

- `GET /api/metrics`
  - Returns total queries, escalation rates, average latency, and estimated token usage.

- `POST /api/ingest`
  - Triggers vector store re-indexing from current `data/` files.

### Admin Endpoints (Protected with `Authorization: Bearer <token>`)

- `POST /api/admin/login` - Authenticates admin credentials.
- `GET /api/admin/verify` - Verifies session token validity.
- `GET /api/admin/documents` - Lists all markdown files in `data/`.
- `GET /api/admin/documents/:filename` - Retrieves content of a specific document.
- `POST /api/admin/documents` - Creates a new document and triggers vector re-indexing.
- `PUT /api/admin/documents/:filename` - Updates an existing document and re-indexes.
- `DELETE /api/admin/documents/:filename` - Deletes a document and re-indexes.
- `GET /api/admin/tickets` - Returns all escalation tickets.
- `PUT /api/admin/tickets/:ticketId/status` - Updates escalation ticket status.
- `POST /api/admin/reindex` - Manually triggers vector store re-indexing.

---

## 9. Automated Testing & Quality Assurance

Run the comprehensive test suite verifying all 16 architectural checkpoints:
```bash
npm test
```

Test coverage includes:
- Knowledge base markdown completeness and Colombian regional grounding (COP pricing, campuses).
- Metrics tracking and multi-turn session state management.
- Admin HMAC-SHA256 authentication, signature validation, and rejection of forged tokens.
- Document CRUD operations and filesystem synchronization.
- Frontend static asset integrity.
