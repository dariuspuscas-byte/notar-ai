# notar-ai backend

Implements `specs/ARCHITECTURE.md` (the authoritative contract). One backend
codebase, one `core` use-case library, currently one active adapter — REST
(`api`) — per spec §1.1.

**Language: Python** (FastAPI + SQLAlchemy 2.0 + Alembic + httpx + Pillow).
`core` and `api` were rewritten from TypeScript to Python in a full-rewrite
pass — same REST contract (spec §3, byte-identical), same data model (spec
§2), same confidence policy (spec §4.4), same module boundaries (spec §1.3).
See "Why Python, and what changed" below for what's identical vs. what
necessarily differs at the implementation-language level.

```
backend/
├── core/   # domain logic, use-cases, DB access, storage, classifier — the ONLY place business rules live (Python: notar_ai_core)
├── api/    # FastAPI REST adapter — imports notar_ai_core, no business logic of its own (Python: notar_ai_api)
├── mcp/    # MCP server adapter (stdio), PARKED — TypeScript, NOT part of this rewrite, see note below
└── data/   # SQLite DB file + uploaded documents (gitignored, created at setup time)
```

**MCP is still paused, and is TypeScript.** The `mcp/` adapter (spec §7, 9
tools) was built and manually verified against the old TypeScript `core` in
an earlier pass, and was already excluded from any active workspace before
this rewrite — it is untouched by this rewrite and left exactly as it was.
One new fact worth flagging (not present in the pre-rewrite version of this
README, since it wasn't true yet): `backend/mcp/package.json` still declares
a dependency on `"@notar-ai/core": "*"`, a TypeScript package that **no
longer exists** — `core` is now the Python package `notar_ai_core`, with no
npm-importable equivalent. Reviving MCP in the future is therefore no longer
"add `mcp` back to `workspaces`, `npm install`, done" — it now requires
either (a) porting `backend/mcp` to Python too (straightforward: it was
always a thin adapter over `core`'s use-case functions, per spec §1.1/§7, so
the port would mirror this one), or (b) a small compatibility layer (e.g. the
MCP server shells out to the REST API, or a tiny Python stdio bridge). This
is a consequence of the rewrite, not a design change — spec §7's contract
(which tools, which inputs/outputs, which `core` functions they map to)
still holds for whichever adapter eventually implements it.

## Why Python, and what changed

- **REST API contract (spec §3): unchanged, verified byte-for-byte** where
  the spec gives an exact shape — same paths, same request/response JSON
  field names (snake_case throughout, so Python's native naming lines up with
  the wire format with no translation layer), same error envelope
  (`{ "error": { "code", "message" } }`, spec §3.8).
- **Data model (spec §2): unchanged** — same 7 tables, same fields, same
  semantics, same physical SQLite file (`backend/data/notar-ai.db`). Prisma
  is replaced by SQLAlchemy 2.0 (typed declarative models) + Alembic
  (migrations). There is no data-migration step: per this rewrite's explicit
  brief, no real production data existed yet (the dev DB only ever held
  manually-created smoke-test rows, cleaned up after each verification pass —
  same discipline continued here), so Alembic starts from one fresh
  `initial schema` migration rather than translating Prisma's migration
  history. If that assumption is ever wrong for a given deployment, restoring
  real data means writing a one-off data migration script before switching —
  not something this rewrite needed to build.
- **Confidence policy (spec §4.4): unchanged**, including the deliberately
  unreached `rejected_unknown` decision value (see ambiguity #1 below,
  carried forward unchanged).
- **Module boundaries (spec §1.3): unchanged** — `notar_ai_core` owns all
  business logic/DB access/Ollama calls; `notar_ai_api` is a thin adapter
  with zero business logic, calling `core`'s use-case functions exactly as
  the Express routes did.
- **What's necessarily different, being a different language/runtime:**
  - **Async model.** `core`'s use-case functions are `async def` throughout
    (SQLAlchemy's async engine via `aiosqlite`, `httpx.AsyncClient` for
    Ollama, blocking file I/O and Pillow/`pdftoppm` calls offloaded to a
    worker thread via `asyncio.to_thread`) — chosen so a slow local Ollama
    call or disk I/O never blocks the event loop, matching the "async-native"
    rationale for picking FastAPI/httpx in the first place. The original
    TypeScript build was async by nature of Node's event loop; this is the
    Python equivalent design decision made explicitly rather than inherited
    for free.
  - **DTOs are stdlib `dataclasses`, not TypeScript interfaces.** `core`
    stays framework-agnostic (no Pydantic dependency) since FastAPI natively
    serializes dataclasses; field names already match the wire format
    1:1, so no mapping layer was needed. One deliberate divergence from a
    naive port: `DocumentDTO` does **not** carry a `classification_error`
    field (unlike the TypeScript `DocumentDTO` interface, which had it as
    optional-but-almost-always-`undefined`) — TypeScript's `JSON.stringify`
    silently drops `undefined` fields, so that field only ever appeared on
    the wire when an upload/classify actually failed; Python has no
    equivalent implicit "sometimes absent" dataclass field (it would
    serialize as `null` always), so instead the route layer
    (`notar_ai_api/routes/documents.py`) adds `classification_error` to the
    *response dict* conditionally, reproducing the exact same "present only
    on failure" wire behavior without a language-specific hack living in
    `core`.
  - **Packaging: `pip` + `pyproject.toml` + a single project-local virtualenv
    (`backend/.venv`)**, not `uv`/`poetry`. Neither was preinstalled in the
    build environment and installing one purely for a from-scratch decision
    wasn't worth the detour per the task's own guidance ("don't spend
    excessive time on this decision") — stdlib `venv` + `pip` needs nothing
    extra and works everywhere Python 3.11+ is installed. `core` and `api`
    are still two separate installable packages (`notar-ai-core`,
    `notar-ai-api`), each with its own `pyproject.toml`, installed
    editable (`pip install -e ./core -e ./api`) into the one shared venv —
    the closest Python equivalent of the TypeScript build's npm workspaces
    (two packages, one dependency install step, `api` depends on `core`).
    Switching to `uv` later is a drop-in change (`uv.sources` for the local
    `core` path dependency is already noted in `api/pyproject.toml`) if the
    team wants faster installs/lockfiles.

## Prerequisites

- Python 3.11+ (built/tested against 3.14.5).
- [Ollama](https://ollama.com) running locally (or on a reachable LAN host) for
  the classification feature — the app runs fine without it, but uploaded
  documents will stay `pending_classification` until it's available (spec
  §4.4, "never guess").
  ```
  ollama pull llama3.2-vision:11b
  ```
- Optional, for PDF classification: [poppler](https://poppler.freedesktop.org/)
  (`pdftoppm`) on PATH — `brew install poppler` on macOS. Without it, uploaded
  PDFs get a clear `classification_error` and stay `pending_classification`;
  images (jpeg/png/webp) are unaffected.

## Setup

```bash
cd backend
cp .env.example .env    # runtime config: OLLAMA_*, PORT, DOCUMENTS_ROOT, DATABASE_URL

python3 -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate

pip install -e ./core -e ./api   # installs notar-ai-core + notar-ai-api and their deps

cd core
alembic upgrade head              # creates backend/data/notar-ai.db with the full §2 schema
python seed.py                    # seeds the two draft act types (spec §8); idempotent, safe to re-run
```

## Running

```bash
# from backend/, with the venv active
uvicorn notar_ai_api.app:app --app-dir api/src --port 3000
# or: python -m notar_ai_api   (from backend/api/src, or with api/src on PYTHONPATH)
```

REST API at `http://localhost:3000` by default (`PORT` in `.env`). Health
check: `GET http://localhost:3000/health`.

(A future MCP adapter, once ported/bridged per the note above, would read the
same `backend/.env` / SQLite DB / documents directory and never talk to the
REST process directly, per spec §1.2.)

## Environment variables

One `.env` file, gitignored (copy from `.env.example` above), loaded by
`notar_ai_core/config.py` and used by `api` (and any future adapter):

| Var | Default | Meaning |
|---|---|---|
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Local Ollama server (spec §4.2). Never a hosted endpoint. |
| `OLLAMA_MODEL` | `llama3.2-vision:11b` | Model tag; must be `ollama pull`ed first. |
| `OLLAMA_KEEP_ALIVE` | `30m` | Keeps the model resident between requests (spec §4.3/§4.6). |
| `OLLAMA_TIMEOUT_MS` | `60000` | Per-request timeout; on timeout the document stays `pending_classification`. |
| `CLASSIFICATION_CONFIDENCE_THRESHOLD` | `0.85` | Spec §4.4 policy threshold — starts conservative/high per the spec's rollout note. |
| `PORT` | `3000` | REST API port. |
| `DOCUMENTS_ROOT` | `./data/documents` | Uploaded-file root (spec §5); relative paths resolve against `backend/`. |
| `DATABASE_URL` | `sqlite+aiosqlite:///<backend>/data/notar-ai.db` if unset | DB connection URL. Spec §5/§6 documents SQLite as the default (and it's still what you get if this is unset), but **this checkout's `backend/.env` currently sets it to a local Postgres instance instead**: `postgresql+asyncpg://admin:admin@localhost:57628/notary_db`, pointing at a Docker container (`notar-ai-db`, started ad hoc, not via the root `docker-compose.yml`) — see "Local Postgres migration" below. Alembic derives its own sync-driver URL from this at migration time (`sqlite://` or `postgresql+psycopg2://`, see `core/alembic/env.py`). |

(Prisma's separate `core/prisma/.env` file is gone along with Prisma — there
is exactly one `.env` file now, `backend/.env`.)

## Local Postgres migration

The spec's documented default is SQLite (§5/§6), but this checkout's backend
currently runs against Postgres instead, per a local request to migrate off
SQLite. Nothing about spec §2/§3 (data model, REST contract) changed — same
schema, same endpoints, same confidence policy — only the DB driver/instance.

What changed to make this work:
- `core/pyproject.toml` gained `asyncpg` (async runtime driver) and
  `psycopg2-binary` (sync driver, used only by Alembic).
- `core/alembic/env.py`'s `_sync_database_url()` now also swaps
  `postgresql+asyncpg://` → `postgresql+psycopg2://` (previously only handled
  the SQLite case).
- `backend/.env`'s `DATABASE_URL` points at the Postgres container instead of
  the SQLite file default; `notar_ai_core/db.py`/`config.py` needed no code
  changes beyond doc comments, since the async engine is driver-agnostic
  given `DATABASE_URL`.
- `alembic upgrade head` was run against the Postgres instance (all three
  migrations applied cleanly) and `python seed.py` re-seeded the two act
  types into it — verified via `psql` and a live `POST /cases` smoke test
  through `uvicorn`.

**The active dev Postgres instance (`notar-ai-db`) was created ad hoc**, not
via this repo's root `docker-compose.yml` — `docker compose ps` shows it as
unmanaged. Its host-published port is whatever Docker assigned (`57628` at
time of writing; container's *internal* port is always 5432) — confirm with
`docker inspect notar-ai-db --format '{{json .NetworkSettings.Ports}}'`
before assuming `backend/.env`'s `DATABASE_URL` is still correct, especially
after recreating the container. The root `docker-compose.yml`/`.env.example`
now default to the same `notary_db`/`admin` credentials for reproducibility,
but running `docker compose up` starts a *second*, separate container
(`notarai-postgres`) — it does not adopt the existing `notar-ai-db` one.

Test suite is unaffected: `core/tests/conftest.py` sets its own throwaway
SQLite `DATABASE_URL` before importing `core`, independent of `backend/.env`.

## Tests

```bash
cd backend/core
source ../.venv/bin/activate
pytest             # or: python -m pytest
```

32 tests, four files — same count and same coverage as the former TypeScript
suite (translated, not just counted):

- `tests/test_compute_status.py` — the §2.7 checklist-item and case-level
  derivation rules (override precedence, received/pending_review/missing,
  ready_to_sign/missing_documents/pending_review), including the "report
  whichever is worse" co-occurrence rule.
- `tests/test_apply_policy.py` — the §4.4 confidence-policy table exhaustively
  (auto-accept boundary, below-threshold, `unknown`/unmapped codes, and that
  `rejected_unknown` is never produced — see the ambiguity note below).
- `tests/test_classify_document.py` — integration tests against a real
  throwaway SQLite DB (schema created via `Base.metadata.create_all` against
  a temp file) with the Ollama HTTP call mocked (`unittest.mock.patch` on
  `notar_ai_core.classification.call_ollama_chat`): verifies the
  graceful-degradation guarantee (unreachable/timeout -> `pending_classification`,
  zero audit rows written) and the happy path (auto-accept -> `ready_to_sign`;
  low confidence -> `pending_review`).
- `tests/test_review_classification.py` — the Phase A `document_reviews`
  audit trail: a row is written on confirm/reassign/reject,
  `prior_document_type_id` correctly captures the pre-review
  state, `classification_result_id` links to the latest attempt for the
  document (or is null when the document was never classified), and
  `reviewed_by` persists.

All four test modules share one throwaway SQLite DB for the whole pytest
session (set up in `tests/conftest.py`, at import time, before any test
module imports `notar_ai_core` — required because `notar_ai_core.config`/
`notar_ai_core.db` read `DATABASE_URL`/`DOCUMENTS_ROOT` and build the
SQLAlchemy engine at *module-evaluation* time, same constraint the old
TypeScript tests had; unlike vitest, a single pytest process doesn't isolate
the module registry per test file, so each test creates its own
uniquely-coded act-type/case fixtures rather than each file getting its own
DB). Integration tests never require Ollama or a pulled model to be running.

Typecheck with `mypy` (strict mode, configured per-package in each
`pyproject.toml`):

```bash
cd backend/core && mypy src/notar_ai_core
cd backend/api  && mypy src/notar_ai_api
```

## What was built (spec §8 phases, all carried over from the TypeScript build)

- **Phase 0**: SQLAlchemy models for every §2 table, one Alembic migration
  (`core/alembic/versions/..._initial_schema.py`), idempotent seed script
  (`core/seed.py`) for `sale_purchase` (8 items) and `succession` (7 items)
  with the exact draft data from §8, including `classification_hints`.
- **Phase 1**: `act_types.py`, `cases/` (+ `compute_status.py`),
  `documents.py`, `storage.py`, `checklist_overrides.py`; every REST endpoint
  in §3.
- **Phase 2**: `classification/` (Ollama client via `httpx`, image/PDF prep
  via Pillow + `pdftoppm`, prompt builder, `apply_policy.py`), wired into
  upload (§3.3) and the manual `/classify` trigger (§3.4); `/review`
  endpoint.
- **Feedback-learning design, Phase A** (durable audit trail for human
  review decisions — no classification behavior change): `document_reviews`
  table (§2.8), created by the same initial migration (this rewrite started
  fresh, so there's no separate "add_document_reviews" migration the way the
  TypeScript build had one — the table was already part of the §2 contract
  by the time this rewrite began). `review_classification` writes one row
  per review in the same DB transaction as the `documents` update;
  `reviewed_by` threaded through from `POST .../review`'s request body.

Deferred / explicitly out of scope (all consistent with §4.7's stated
non-goals, or carried over unchanged from the TypeScript build's own deferred
list):

- HEIC image conversion (spec §4.3 mentions it "after conversion") — no
  converter wired in; a `.heic` upload gets a clear
  `unsupported mime type for classification` error rather than being guessed.
- Per-`document_type` confidence thresholds (§4.4's suggested future
  evolution) — a single global threshold is implemented, as the spec's MVP
  default.
- Rasterizing PDF pages beyond page 1 (§4.3's stated known limitation).
- Any auth/authz — per spec §0/§3, assumed trusted LAN or a basic-auth
  reverse proxy in front; not built here.
- A compiled/frozen production artifact — `api` runs directly via `uvicorn`
  against the installed package for both dev and "prod" in this MVP,
  consistent with the project's "simple internal tool" framing (mirrors the
  TypeScript build running via `tsx` rather than a `dist` build).
- **New to this rewrite**: `backend/mcp` (spec §7) is not ported to Python —
  explicitly out of scope for this task (see the note at the top of this
  file). Its 9-tool design and mapping to `core` use-case functions is
  unchanged and still valid as a contract for whoever picks it up next.

## Spec ambiguities resolved by judgment (flagged, not silently decided)

All four carried over unchanged from the TypeScript build's own resolution —
this rewrite is a language port of already-decided behavior, not a new
design pass:

1. **`classification_results.decision`'s third enum value, `rejected_unknown`
   (§2.5).** §4.4's policy table and §4.5 only ever produce `auto_accepted` or
   `needs_review` from a model response — an unmapped/`unknown` guess is
   explicitly routed to `needs_review` ("never a hard rejection with no
   trace"). Nothing in the spec as written currently triggers
   `rejected_unknown`. `apply_policy.py` documents this and never produces
   that value; the `Literal` type still includes it for forward
   compatibility. **Frontend impact**: none — this decision value should
   just never appear in API responses today.

2. **Where "upload triggers classification synchronously" is composed
   (§3.3/§7).** §1.3's module table has `core/documents` depending only on DB
   + storage, not `classification` — so the upload-then-classify sequencing
   can't live inside `documents.py` without a reverse dependency the table
   doesn't allow. It lives in a new top-level file, `upload_orchestrator.py`
   (`upload_document_and_classify`), one level above both modules — exactly
   the kind of composed use-case function §1.1 already names as living in
   `core`. `POST /cases/{id}/documents` calls this one function. **No
   API-contract impact** — the endpoint's request/response shape is
   unchanged.

3. **Upload multipart field name.** Spec §3.3 writes `files[]` in the
   description but that's an HTML-forms convention, not necessarily the exact
   wire field name a JS `FormData` client would use. The API accepts either
   `files` or `files[]` as the field name to avoid a silent 400 on this
   naming detail.

4. **Human-review audit trail — closed.** §2.4/§3.4 as originally written
   didn't add a `classification_results` row (or any new table) when a human
   reviews a document, since that table is explicitly scoped to "every LLM
   classification attempt." This gap is closed by the `document_reviews`
   table (§2.8, feedback-learning design's Phase A): one row per call to
   `review_classification`/`POST .../review`, recording the decision
   (`confirm`/`reassign`/`reject`), the document's matched type *before* and
   *after* the review, which `classification_results` row (if any) was being
   reviewed, an optional `note`, and `reviewed_by`/`reviewed_at`. Written in
   the same DB transaction as the `documents` update, so the two never
   diverge. This is audit capture only — no change to classification
   behavior; using this data to improve future classifier accuracy
   (confidence-threshold tuning, few-shot exemplars, etc.) is explicitly
   deferred to a later phase.

## Internal rename: `required_document_types` → `document_types` (post-rewrite)

The `required_document_types` table/`RequiredDocumentType` ORM class (spec
§2.2) was renamed to `document_types`/`DocumentType`, along with every FK
column that referenced it (`documents.matched_required_document_type_id` →
`matched_document_type_id`, `classification_results.predicted_required_document_type_id`
→ `predicted_document_type_id`, `document_reviews.prior_matched_required_document_type_id`/
`final_matched_required_document_type_id` → `prior_document_type_id`/
`final_document_type_id`, `checklist_overrides.required_document_type_id` →
`document_type_id`) and the two indexes that named it. Reasoning: the table
already has an `is_mandatory` column that encodes actual requiredness, so
naming the whole table/concept "required" was redundant and misleading — not
every row represents something mandatory.

**This is an internal-only rename — the public REST API contract did not
move.** Every response JSON field name (`required_document_type_id` and its
`matched_`/`predicted_`/`prior_`/`final_`-prefixed variants) and every route
path parameter is byte-identical to before. The `to_*_dto` functions
(`act_types.py`, `documents.py`, `checklist_overrides.py`,
`classification/__init__.py`) now do explicit field-name mapping between the
renamed internal ORM attributes and the unchanged DTO field names, instead of
relying on the names matching 1:1 as they did before. Verified by diffing
live JSON responses from the pre-rename and post-rename code against the same
seed data byte-for-byte (act types/checklist, case/document CRUD, checklist
override, upload + classify-retrigger including the graceful-degradation
`classification_error` path, and the `404`/`400` error envelopes) — all
matched exactly.

Migration: `core/alembic/versions/d2b068edcaa2_rename_required_document_types_to_.py`
uses real `ALTER TABLE ... RENAME TO` / `RENAME COLUMN` statements (SQLite
3.25+ supports both natively and auto-updates dependent FK clauses and index
definitions in other tables — verified empirically before writing the
migration), not a drop-and-recreate. Run against the real dev DB with row
counts confirmed identical before/after per table.

See specs/ARCHITECTURE.md §2.2's naming note for the full rationale and the
explicit statement that §2 (internal names) and §3 (wire contract) now
intentionally differ in this one respect.

## Contract-changing rename: `name_ro`/`name_en` → `name` (post-rewrite)

`ActType` (spec §2.1) had both `name_ro` and `name_en` ("for internal/dev
reference"); `DocumentType` (spec §2.2) had `name_ro`. `name_en` was never
displayed anywhere, so it was dropped entirely; `name_ro` was renamed to
`name` on both tables/ORM classes/DTOs.

**Unlike the `required_document_types` → `document_types` rename above, this
one DOES move the public REST API contract.** Every response that used to
carry `name_ro` (and, for act types, `name_en`) now carries a single `name`
field instead: `GET /act-types`, `GET /act-types/{id}/checklist`, and the
`checklist` array inside `GET /cases/{id}/status` / `POST
/cases/{id}/validate`. This further widens the existing frontend/backend
contract gap — the frontend was not updated (per standing project
instruction) and still expects `name_ro`/`name_en`; that tradeoff was
explicitly accepted, the same way it was for the previous rename, except this
time the divergence is in the wire field name itself rather than only an
internal one.

Migration: `core/alembic/versions/e6098f9d55fa_merge_name_ro_and_name_en_into_name.py`.
`act_types.name_ro` → `act_types.name` and `document_types.name_ro` →
`document_types.name` are straight `RENAME COLUMN` statements (no data
transformation needed, existing values already correct); `act_types.name_en`
is then dropped (`ALTER TABLE ... DROP COLUMN`, accepted data loss — no
reader ever consumed it). Run against the real dev DB: row counts unchanged
across all 7 tables (2 `act_types`, 15 `document_types`, 1 `cases`, 2
`documents`, 3 `classification_results`, 2 `document_reviews`, 1
`checklist_overrides`), every `act_types.name`/`document_types.name` value
spot-checked equal to the pre-migration `name_ro` value (names
preserved exactly; they were translated to English later), `name_en`'s old values
gone as expected, `PRAGMA foreign_key_check`/`PRAGMA integrity_check` both
clean.

See specs/ARCHITECTURE.md §2.1's naming note and §3's naming note for the
full rationale and the explicit "this one changes the wire contract"
statement.

## Verified manually (this rewrite)

- Full REST flow against a real dev DB (SQLite, migrated + seeded via
  Alembic + `seed.py`): create case (`sale_purchase` and, separately,
  `succession`) -> checklist starts `missing_documents` -> upload a real JPEG
  -> classification ran synchronously against a **real local Ollama
  instance** (model `minicpm-v4.5:latest`, already pulled on this dev
  machine — see the caveat below on the configured default) -> got back real
  structured JSON, correctly routed to `needs_review` (`unknown`, since the
  test image was a plain color block) -> `/classify` retrigger returned the
  same real result -> `/review` with `reassign` to `land_registry_extract` -> document
  `confirmed`, checklist item cleared from `missing_mandatory`, confirmed the
  `document_reviews` row (`decision=reassign`, correct
  prior/final matched type, `classification_result_id` linked, `reviewed_by`
  persisted) -> manual `/checklist/.../override` (`not_applicable`) on a
  different item -> also cleared -> `POST /validate` recomputed and persisted
  `cases.status` correctly. Also exercised: PDF upload -> real `pdftoppm`
  rasterization of page 1 -> real classification call succeeded; unsupported
  mime type (`text/plain`) upload -> document correctly stayed
  `pending_classification` with a `classification_error`, **zero**
  `classification_results` rows written (checked via direct SQLite query);
  `GET /cases?status=...` filtering; validation errors (`invalid_client_name`,
  `invalid_override_status`) and a 404 (`case_not_found`) all returned the
  exact §3.8 error shape.
- `mypy` (strict) clean in both `core` and `api`. `pytest` green, 32/32.
- All manual-verification data (test cases, uploaded files) was deleted and
  the DB was re-migrated + re-seeded from scratch afterward, leaving
  `backend/data/` in the same clean, seeded-only state a fresh `setup` would
  produce — same discipline the TypeScript build's own manual-verification
  notes followed.
- **Not exercised**: the actual configured default model
  `llama3.2-vision:11b` — this dev machine has `minicpm-v4.5:latest` pulled
  instead (already configured as `OLLAMA_MODEL` in this machine's `backend/.env`
  before this rewrite started). The classification *pipeline* (request shape,
  structured-output parsing, confidence policy, graceful degradation) was
  verified against that real local vision model instead, so this is a
  model-accuracy/availability question, not a wiring gap — same caveat the
  TypeScript port's own verification history already carried. Per spec §4.2,
  benchmark `llama3.2-vision` (or whichever model is pulled) against this
  office's real documents before relying on the default threshold.
