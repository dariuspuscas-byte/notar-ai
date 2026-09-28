# notar-ai — compressed project spec (for a new Claude session)

Read this first, then go to the canonical docs listed inline for full detail. Do not re-derive
architecture decisions — they're already made and documented; treat contradictions between this
file and the sources below as a reason to re-check the source, not to guess.

## What it is

Internal tool for a single Romanian notary office. An assistant picks a legal act type
(sale-purchase, succession, ...), creates a case, uploads client documents as photos/scans/PDFs in
any order, and the app tracks which required documents are received/missing/pending-review so the
office always has an answer to "are we ready to sign?" A local (Ollama) vision LLM auto-classifies
uploads against the act type's checklist; low-confidence/unknown results always require human
confirmation — **never silently auto-accept** is the guiding design bias throughout. Same business
logic is designed to be exposed as a REST API and as an MCP server (stdio), both thin adapters over
one `core` library — **MCP is currently paused** (code preserved, excluded from active workspaces)
while focus is on the web interface; see the status note below.

Canonical sources (read these for anything this file compresses away):
- `specs/ARCHITECTURE.md` — the full, authoritative contract: data model (§2), REST API (§3), LLM
  classification design (§4), storage (§5), tech stack (§6), MCP tool design (§7), phased build
  plan (§8). ~460 lines, dense, was written to be coded against directly.
- `design/UX_SPEC.md` — UI/UX spec (screens, per-document status states, copy in Romanian, generate-
  client-message feature, responsive rules). Companion static mockups in `design/canvas/*.dc.html`.
- `backend/README.md` — **implementation status**: what's built per phase, deferred items, spec
  ambiguities resolved by judgment, and what was manually verified. Read this before assuming
  something in ARCHITECTURE.md isn't implemented yet — most of it is.

## Repo layout

```
backend/
  core/   domain logic, use-cases, SQLAlchemy/SQLite, storage, Ollama classifier — ONLY place business rules live (Python: notar_ai_core)
  api/    FastAPI REST adapter (imports core, no logic of its own) (Python: notar_ai_api)
  mcp/    MCP server adapter, stdio transport (TypeScript, imports core, no logic of its own) — PARKED, not an active workspace
  data/   SQLite db file + uploaded documents (gitignored)
frontend/ React + Vite + TS + Tailwind + TanStack Query, talks to backend/api over HTTP
specs/ARCHITECTURE.md, design/UX_SPEC.md, design/canvas/*.dc.html (static HTML mockups)
```
`core`/`api` were rewritten from TypeScript to Python (full rewrite, same REST contract/data
model/module boundaries — see `backend/README.md`); they're two `pip`-installable packages sharing
one venv at `backend/.venv`. **`backend/package.json` no longer exists at all** — there is no
backend-wide npm workspace anymore. `mcp` is still TypeScript, with its own standalone
`package.json`/`tsconfig.json`, wholly untouched by the rewrite and no longer part of any shared
workspace mechanism. Its `package.json` still declares a dependency on `"@notar-ai/core": "*"`, a
TypeScript package that no longer exists (`core` is now the Python package `notar_ai_core`), so
`mcp` can no longer `import` `core` in-process the way §1.1 originally assumed; reviving it needs a
real design decision (port `mcp` to Python too, or a process boundary — e.g. call the REST API
instead), see `backend/README.md`.

**DB migrated from SQLite to Postgres (this checkout only, per a local request — not a spec
change):** `backend/.env`'s `DATABASE_URL` now points at a local Docker Postgres instance
(`postgresql+asyncpg://admin:admin@localhost:57628/notary_db`, container `notar-ai-db`, created ad
hoc, not via the root `docker-compose.yml`) instead of the spec's documented SQLite default. Schema
migrated (`alembic upgrade head`) and seeded (`python seed.py`) against it; verified with a live
`POST /cases` smoke test. Same data model/REST contract, only the DB driver/instance changed —
`core/pyproject.toml` gained `asyncpg`+`psycopg2-binary`, `core/alembic/env.py` now also maps
`postgresql+asyncpg://` → `postgresql+psycopg2://` for migrations. **Port caveat:** the container's
host-published port (`57628`) is whatever Docker assigned, not `5432` (that's only the *internal*
container port) — reconfirm with `docker inspect notar-ai-db --format '{{json .NetworkSettings.Ports}}'`
before trusting `DATABASE_URL`, especially if the container gets recreated. Tests are unaffected —
`core/tests/conftest.py` uses its own throwaway SQLite DB regardless of `backend/.env`. Root
`docker-compose.yml`/`.env.example` default to matching `notary_db`/`admin` credentials for
reproducibility, but `docker compose up` starts a second, separate container (`notarai-postgres`),
not the one actually in use. Full writeup: `backend/README.md`'s "Local Postgres migration" section.

## Data model (Postgres via SQLAlchemy + Alembic in this checkout, SQLite is still the spec's
documented default — see migration note above; `backend/core/src/notar_ai_core/models.py`)

- `ActType` — catalog (sale_purchase, succession, ... seeded); `code`, `name` (Romanian display
  name — formerly `name_ro`; `name_en` dropped entirely, see the wire-changing rename note below),
  `description`, `is_active`.
- `DocumentType` (table `document_types`; renamed from `RequiredDocumentType`/
  `required_document_types` — `is_mandatory` already encodes actual requiredness, so the
  "required" prefix on the table/class name was redundant/misleading; **internal-only rename**, the
  REST wire field names still say `required_document_type_id` — see ARCHITECTURE.md §2.2) —
  checklist items per act type (code, `name` — formerly `name_ro`, see below — is_mandatory,
  allow_multiple, classification_hints[]).
- **Naming-rename disambiguation, read this if the two renames above/below are confusing:** two
  separate renames happened in this project's history and they are NOT both the same kind of
  change. (1) `required_document_types` → `document_types` (table/class only) was
  **internal-only** — the wire JSON still says `required_document_type_id` etc., unchanged. (2)
  `name_ro`/`name_en` → `name` (this section) **DID change the wire contract** — REST responses
  now carry `name` instead of `name_ro`/`name_en`. Don't assume both renames are "internal-only
  like the first one" just because they happened close together in the project's history — see
  ARCHITECTURE.md §2.1/§2.2/§3 and `backend/README.md`'s two separate rename write-ups for the
  full detail on each.
- `Case` — one dossier (client_name, notes, `status`: `ready_to_sign` | `missing_documents` |
  `pending_review`, derived/cached, never set directly).
- `Document` — one uploaded file (`status`: `pending_classification` | `classified_auto` |
  `needs_review` | `confirmed` | `rejected`; `matched_document_type_id` nullable, wire field
  `matched_required_document_type_id`).
- `ClassificationResult` — append-only audit trail of every LLM classification attempt
  (confidence, reasoning, raw response, `decision`: `auto_accepted` | `needs_review` |
  `rejected_unknown` — the last value is defined but never actually produced, see ambiguity #1
  below).
- `ChecklistOverride` — manual human decisions (`received`/`missing`/`not_applicable`) that always
  win over classification; only the latest row per (case, doc-type) is effective.
- `DocumentReview` — audit trail of every human review decision (`confirm`/`reassign`/`reject`):
  prior/final matched type, linked `classification_results` row (if any), `reviewed_by`/`reviewed_at`.
  Written atomically with the `documents` update inside `reviewClassification`. Added by the
  feedback-learning design's Phase A (audit capture only, no classification behavior change — see
  ambiguity #4 below).

Per-item derived status precedence: override > `received` (auto/confirmed match) > `pending_review`
> `missing`. Case `overall_status` is `ready_to_sign` iff every mandatory item is
`received`/`not_applicable`; otherwise reports whichever is worse of `missing_documents` /
`pending_review` (they can co-occur). Single source of truth:
`backend/core/src/notar_ai_core/cases/compute_status.py`.

## REST API — base path `/api/v1` (full detail: ARCHITECTURE.md §3)

- `GET /act-types`, `GET /act-types/{id}/checklist`
- `POST /cases`, `GET /cases`, `GET /cases/{id}`, `GET /cases/{id}/status`, `POST /cases/{id}/validate`
- `POST /cases/{id}/documents` (multipart, accepts `files` or `files[]`) — classifies synchronously
  in-request by default
- `POST /cases/{id}/documents/{docId}/classify` — retry/retrigger
- `POST /cases/{id}/documents/{docId}/review` — body `{decision: confirm|reassign|reject, ...}`
- `POST /cases/{id}/checklist/{requiredDocTypeId}/override`
- Errors: `{ error: { code, message } }`

**Frontend/backend contract gap found in this pass:** `frontend/src/api/cases.ts` has a
`useUpdateCase` hook that calls `apiPatch` → `PATCH /cases/{id}` (used for renaming a case's
client_name from the Case View header). **No such route exists in `backend/api/src/notar_ai_api/routes/cases.py`
or in ARCHITECTURE.md §3** — the frontend mock server (`src/mocks/handlers.ts`) implements it, but
the real backend does not. Needs either a backend route added (and the spec updated) or the
frontend feature scoped out, before frontend is pointed at the real API.

## LLM classification (ARCHITECTURE.md §4)

- Local **Ollama** only, never a hosted API (deliberate: real personal ID/property documents never
  leave the office network). Default model `llama3.2-vision:11b`, configurable via `OLLAMA_MODEL`.
  `keep_alive` set generously to avoid reload latency.
- One call per document via `/api/chat` with JSON-schema structured output
  (`predicted_type_code`, `confidence`, `alternative_type_code`, `reasoning`), `temperature: 0`.
- Images downscaled (long edge ~1568px); PDFs rasterized to page 1 only via `pdftoppm` (poppler) —
  HEIC not supported (clear error, not a guess).
- Confidence policy (`core/src/notar_ai_core/classification/apply_policy.py`, the one place this logic lives):
  match + `confidence >= CLASSIFICATION_CONFIDENCE_THRESHOLD` (default **0.85**, deliberately
  conservative) → `classified_auto`/`auto_accepted`/checklist `received`; match below threshold or
  unknown/unmapped code → `needs_review`/checklist `pending_review`; Ollama unreachable/timeout →
  stays `pending_classification`, checklist `missing`, **no guessing**. Local model confidence is
  known to be poorly calibrated — treat as a ranking signal, tune per-office over time, not a fixed
  formula to trust blindly.
- Human review (`POST .../review`) is the only way out of `needs_review`; nothing reaches
  `ready_to_sign` without it.

## MCP server (`backend/mcp`, ARCHITECTURE.md §7) — PAUSED

Built (9 tools, stdio transport, each a thin wrapper calling the same `core` functions as REST:
`list_act_types`, `get_checklist`, `create_case`, `upload_document` (file_path or file_base64),
`classify_document`, `review_document`, `override_checklist_item`, `get_case_status`,
`validate_case`; tool descriptions state the confidence policy so an MCP-client LLM doesn't assume
upload alone finishes the job) and previously verified manually against the (then-TypeScript)
`core`, but **already parked (excluded from active development)** before the Python rewrite, to
focus on the web interface — code preserved at `backend/mcp/`, untouched by the rewrite itself.
**Since `core`/`api` were rewritten to Python,
re-enabling `mcp` is no longer just a config change** — its `@notar-ai/core: "*"` dependency points
at a TypeScript package that no longer exists, so reviving it needs either a Python port of `mcp`
(mirroring the `api` rewrite, since it was always a thin adapter per spec §1.1) or a process
boundary of some kind (e.g. calling the REST API instead of an in-process `core` import). See
`backend/README.md`.

## Tech stack

Split by component. Backend `core`/`api` (this rewrite): Python — FastAPI + SQLAlchemy 2.0/Alembic +
SQLite + `httpx` for the Ollama HTTP client (thin wrapper, no SDK dep), `pip`+venv packaging.
Backend `mcp` (untouched, paused): still TypeScript + `@modelcontextprotocol/sdk`.
Frontend: React 19 + Vite + TypeScript + TanStack Query +
Tailwind v4 + react-router. No auth (assumed trusted LAN / basic-auth reverse proxy). No job queue,
no microservices — deliberately a small modular monolith (see ARCHITECTURE.md §1.2 for the "why
not" reasoning if this ever seems worth revisiting).

## Current implementation status

**Backend — both Phase 1 (V1 foundation, zero AI) and Phase 2 (classification) are built**,
per `backend/README.md`: all §3 REST endpoints except the PATCH gap above. `core`/`api` were fully
rewritten from TypeScript to Python in a later pass (same contract, byte-identical) — 32 passing
pytest tests (`test_compute_status`, `test_apply_policy`, classification integration tests with
Ollama mocked, `document_reviews` audit-trail tests — the last added by the feedback-learning
design's Phase A), `mypy` (strict) clean in both `core` and `api`. The 9 MCP tools still exist but
only as TypeScript code calling the now-gone TypeScript `core` — `mcp` was already parked before
the Python rewrite and untouched by it; reviving it now needs a port or a process boundary, not
just a config change (there's no `backend/package.json` left at all for `core`/`api`/`mcp` to
share — see `backend/README.md`). Manually verified
end-to-end against a real dev DB and a real (non-default) local vision model —
`llama3.2-vision:11b` itself was never pulled/exercised on the dev machine, so classification
*accuracy* on the actual default model is unverified (the request/response/policy *pipeline* is
verified). Known deferred items (all intentional, listed in backend/README.md): HEIC conversion,
per-doc-type confidence thresholds, PDF pages beyond 1, any auth, a compiled/frozen production
artifact (runs via `uvicorn` directly against the installed package), and (new since the rewrite)
porting `backend/mcp` to Python.

**Frontend — UI is built out** (CaseListPage, ActTypePickerPage, CaseViewPage + components for
status banner, checklist rows, upload dropzone, unrecognized-files panel, generate-message modal)
implementing the UX_SPEC screens/states, but **defaults to running entirely against an in-browser
mock server (`msw`, `frontend/src/mocks/`), not the real backend** — `VITE_ENABLE_MOCKS=true` and
`VITE_API_BASE_URL=/api/v1` (relative) in `frontend/.env.example`. The backend itself was smoke-
tested directly (curl) against the real Postgres-backed DB in the DB-migration pass above
(`GET /health`, `GET /act-types`, `POST /cases` all verified working) — **but the frontend has still
not been pointed at and exercised against the real `backend/api`** in any pass; the PATCH gap above
would surface immediately if it were. To wire them together: run the backend (`uvicorn notar_ai_api.app:app --app-dir api/src --port 3000`
from `backend/`, with the venv active), set frontend `VITE_ENABLE_MOCKS=false` and
`VITE_API_BASE_URL=http://localhost:3000/api/v1`, then smoke-test the full flow — this is the
natural next step for a session picking this up.

## Setup quick reference

```
# backend (Python — see backend/README.md for full detail)
# NOTE: this checkout's backend/.env DATABASE_URL points at a local Postgres
# container (notar-ai-db, port 57628, see the migration note above), not the
# spec's SQLite default. Confirm it's running (`docker ps`) before the alembic
# step below, and re-check the port with `docker inspect notar-ai-db ...` if
# it was recreated — a from-scratch checkout without that container would
# instead just fall back to SQLite by deleting/unsetting DATABASE_URL.
cd backend
cp .env.example .env
python3 -m venv .venv && source .venv/bin/activate
pip install -e ./core -e ./api
cd core && alembic upgrade head && python seed.py   # seeds sale_purchase + succession
cd .. && uvicorn notar_ai_api.app:app --app-dir api/src --port 3000   # http://localhost:3000, GET /health to check
cd core && pytest  # 32 tests, unaffected by DATABASE_URL — uses its own throwaway SQLite DB

# frontend
cd frontend
cp .env.example .env
npm install && npm run dev   # runs against mocks by default, see status note above
```

## Spec ambiguities already resolved (don't re-litigate, see backend/README.md for full reasoning)

1. `rejected_unknown` decision value exists in the type/enum but the policy as specified never
   produces it (unknown/unmapped always routes to `needs_review`, not a hard rejection).
2. Upload-then-classify sequencing lives in `core/src/notar_ai_core/upload_orchestrator.py`
   (`upload_document_and_classify`), one level above `core/documents` and `core/classification`, since
   the module dependency table in §1.3 doesn't let `documents` depend on `classification` directly.
3. Multipart upload field name accepts both `files` and `files[]`.
4. **Closed.** Human review (`POST .../review`) now writes a `document_reviews` audit row (see
   `DocumentReview` above / ARCHITECTURE.md §2.8) recording who/when reviewed, alongside the
   `classification_results` table (LLM-attempts only, unchanged). Phase A of the feedback-learning
   design; see `backend/README.md`'s ambiguity #4 for the full history.
