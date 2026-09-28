# notar-ai — Architecture Specification

Status: v1.0 (initial spec). Audience: backend-developer and frontend-developer implementing against this contract directly. Do not re-derive architectural decisions — if something here is ambiguous or wrong, raise it rather than silently deciding differently, since the other side is coding against the same contract in parallel.

## 0. Scope and constraints

- Single notary office, small internal tool. Users: the notary + a handful of assistants. No public internet exposure required (LAN or a single small VPS behind basic auth is enough).
- Expected load: tens of cases open at a time, a few dozen document uploads/classifications a day. This is not a scale problem — it is a correctness/UX/legal-reliability problem.
- Legal context matters for design defaults: a wrong "ready to sign" is worse than an over-cautious "needs review." The architecture is biased toward **never silently auto-accepting an uncertain classification** — see §4.
- **The classification LLM is local, served via Ollama, not a hosted API.** This is a deliberate constraint (given), not a cost-optimization default — and it fits well here independent of that: uploaded documents are copies of ID cards, death certificates, property deeds, i.e. real personal data, so keeping classification entirely on-premises (nothing leaves the office network) is a genuine benefit, not just a preference. The tradeoff, made explicit in §4, is that open local vision models are less proven on scanned Romanian documents than a top-tier hosted multimodal model, so the confidence policy starts conservative and the section calls for measuring accuracy on this office's real documents before loosening it.
- Build order: V1 (checklist + status tracking + document storage, zero AI) is the foundation. V2 (LLM classification) is layered on top without changing V1's data model or API shape — only adding to it. Both are in scope for this build; they are phased (see §8), not separate products.
- "Simple enough to be exposed as an MCP server": the checklist/verification capability must be usable both as a web app and as a set of MCP tools, calling identical business logic. See §1 and §7.

---

## 1. Service boundaries

### 1.1 Decision: one backend codebase, one core use-case library, two thin front-ends (REST + MCP)

> **Status (current build): MCP is paused, not removed as a decision.** The
> `mcp/` adapter below was fully implemented (§7, 9 tools) and is preserved
> on disk at `backend/mcp/`, but is currently excluded from
> `backend/package.json`'s `workspaces` array while the team focuses on the
> web interface. This section's reasoning (why one `core` library, why two
> thin adapters rather than duplicated logic) still holds and is why
> re-enabling MCP later is a config change, not a rebuild — see
> `backend/README.md` for the re-enable steps.

```
notar-ai/
├── backend/
│   ├── core/            # domain logic, use-cases, DB access, storage, classifier — the ONLY place business rules live
│   ├── api/             # REST/HTTP adapter — imports core, no business logic of its own
│   └── mcp/             # MCP server adapter — imports core, no business logic of its own; PARKED, see status note above
├── frontend/            # web UI, talks to backend/api over HTTP
└── specs/
```

`core` exposes a set of **use-case functions** (plain async functions, one per action: `createCase`, `uploadDocument`, `classifyDocument`, `reviewClassification`, `setChecklistOverride`, `recomputeCaseStatus`, `getCaseStatus`, `listActTypes`, ...). Both `api` (Express HTTP handlers) and `mcp` (MCP tool handlers) are **pure adapters**: they parse/validate the transport-specific input, call the exact same `core` function, and serialize the result for their transport. Neither adapter talks to the database, the filesystem, or the Ollama runtime directly.

### 1.2 Why this shape, and why not alternatives

- **Why not "MCP server calls the REST API over HTTP"**: it would work, but it means running two processes, an extra network hop, and duplicating auth/error-shape logic for no benefit at this scale — the MCP server would just be a REST client wearing a costume. In-process function calls are simpler to build, test, and reason about, and this is explicitly a "simple app" per the brief.
- **Why not "duplicate the logic in both adapters"**: guarantees drift — the classification-confidence threshold or the checklist-recompute rule would eventually differ between the web UI and MCP, which is exactly the kind of bug that erodes trust in a notary tool. One `core` library is the single source of truth.
- **Why not full microservices (separate classification service, separate storage service)**: no independent scaling, deployment, or failure-isolation requirement exists at this load. A modular monolith with clean internal boundaries (`core/cases`, `core/documents`, `core/classification`, `core/storage`) gets the same maintainability without operational overhead. Revisit if/when this becomes multi-office or high-volume.
- **Deployment**: `api` and `mcp` can run as two small Node processes (or the MCP server can be launched on-demand by the MCP client, per the stdio-transport convention) that both import the same `core` package from the monorepo. No shared network service is needed between them; they only share a SQLite file and a documents directory on the same disk. This is a deliberate simplification for the MVP — see §5 for the migration path off single-disk storage.

### 1.3 Internal module boundaries inside `core`

| Module | Owns | Depends on |
|---|---|---|
| `core/act-types` | Act type + document-type catalog (seeded, rarely changes) | DB |
| `core/cases` | Case lifecycle, checklist status computation | DB, `act-types` |
| `core/documents` | Document upload, storage path management, status | DB, storage adapter |
| `core/classification` | Calls the local Ollama vision model, applies confidence policy, records results | Ollama (local HTTP API), DB, `documents` |
| `core/storage` | Filesystem read/write abstraction (swappable for S3 later) | Disk |

Each module owns its own tables and exposes functions — no cross-module raw SQL.

---

## 2. Data model

Relational schema (SQLite for MVP — see §5). All timestamps UTC ISO-8601. All IDs are UUID v4 strings unless noted.

### 2.1 `act_types`
Catalog of legal act types (sale-purchase, succession, donation, etc.). Seeded via migration, editable later via an admin screen (not MVP-required).

> **Naming note (contract-changing rename):** this table originally had both
> `name_ro` and `name_en` ("for internal/dev reference"). `name_en` was
> never shown in the UI, so it was dropped entirely; `name_ro` was renamed to
> `name`. The app is English-only: all seeded names (and codes, descriptions,
> classification hints) are English. **Unlike §2.2's rename below, this one DOES change the public REST
> API contract** — see §3's naming note for the wire-level consequences.

| Field | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `code` | text, unique | machine key, e.g. `sale_purchase`, `succession` |
| `name` | text | display name, e.g. "Sale-purchase" (formerly `name_ro`; `name_en` was dropped, see naming note above) |
| `description` | text, nullable | |
| `status` | text, default `draft` | one of `draft`, `in_progress`, `ready`, `completed`; replaced the former `is_active` boolean. Enforced in `core` (`ActTypeStatus`), not by a DB constraint. `GET /act-types` returns act types in every status |
| `created_at` | datetime | |

### 2.2 `document_types`
The checklist items for a given act type.

> **Naming note (internal-only rename):** this table was originally named
> `required_document_types` (ORM class `RequiredDocumentType`). It was
> renamed to `document_types`/`DocumentType` because `is_mandatory` below
> already encodes whether a given row is actually required — naming the
> whole table/concept "required" was redundant and misleading, since not
> every row represents something mandatory. **This is an internal-only
> rename**: it does not touch the public REST API contract. The wire JSON
> still uses `required_document_type_id` (and its `matched_`/`predicted_`/
> `prior_`/`final_`-prefixed variants) exactly as before — see §3 — so
> wherever you see the internal name `document_type`/`document_types` in
> this §2 and the ORM/DB layer, and the wire name `required_document_type`
> in §3, that is deliberate, not a bug: the `to_*_dto` conversion functions
> (`notar_ai_core/act_types.py`, `documents.py`, `checklist_overrides.py`,
> `classification/__init__.py`) are the explicit translation boundary
> between the two.

| Field | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `act_type_id` | uuid FK → act_types | |
| `code` | text | unique within act type, e.g. `land_registry_extract`, `id_card_seller` |
| `name` | text | e.g. "Up-to-date land registry extract" (formerly `name_ro`; see §2.1's naming note — `name_en` never existed on this table) |
| `description` | text, nullable | assistant-facing hint text |
| `is_mandatory` | boolean, default true | if false, item can never block "ready to sign" but is still tracked |
| `allow_multiple` | boolean, default false | e.g. one ID card per party — multiple documents can satisfy one checklist item |
| `sort_order` | integer | display order |
| `classification_hints` | text (json array), nullable | keywords/aliases fed to the LLM prompt to help disambiguate this type, e.g. `["carte funciara", "CF", "extras de carte funciara"]` |

### 2.3 `cases`
A dossier for one client / one legal act in progress.

| Field | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `act_type_id` | uuid FK → act_types | set at creation, immutable |
| `client_name` | text | free text for MVP (no separate client entity — a case can involve multiple parties, tracked as free text/notes, not modeled) |
| `notes` | text, nullable | |
| `status` | enum: `in_progress`, `ready_to_sign`, `blocked` | **derived/cached** — recomputed by `recomputeCaseStatus`, never set directly by a client request |
| `created_at` | datetime | |
| `updated_at` | datetime | |
| `created_by` | text, nullable | assistant's name/email, no full auth system in MVP |

### 2.4 `documents`
One uploaded file (photo, scan, PDF).

| Field | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `case_id` | uuid FK → cases | |
| `matched_document_type_id` | uuid FK → document_types, nullable | set once classified/confirmed; null while pending or if classified as "unknown". Maps to the unchanged wire field `matched_required_document_type_id` — see §2.2's naming note. |
| `original_filename` | text | |
| `storage_path` | text | relative path under the documents root, see §5 |
| `mime_type` | text | e.g. `image/jpeg`, `application/pdf` |
| `file_size_bytes` | integer | |
| `status` | enum: `pending_classification`, `classified_auto`, `needs_review`, `confirmed`, `rejected` | see §4 for the state machine |
| `uploaded_at` | datetime | |
| `uploaded_by` | text, nullable | |

### 2.5 `classification_results`
Audit trail of every LLM classification attempt (kept even on retry — never overwritten, always appended) — this is the record a notary could point to if a client disputes "you said my document was accepted."

| Field | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `document_id` | uuid FK → documents | |
| `predicted_document_type_id` | uuid FK → document_types, nullable | null if model returned "unknown/none of the above". Maps to the unchanged wire field `predicted_required_document_type_id` — see §2.2's naming note. |
| `predicted_type_code_raw` | text | the raw code string the model returned, kept even if it didn't map to a known type (helps catch taxonomy gaps) |
| `confidence` | real, 0.0–1.0 | model's self-reported confidence, see §4 |
| `alternative_type_code_raw` | text, nullable | model's second-choice guess, if any |
| `reasoning` | text | short model-provided justification, shown to the reviewer |
| `decision` | enum: `auto_accepted`, `needs_review`, `rejected_unknown` | the policy outcome applied to this result, see §4 |
| `model_used` | text | e.g. `llama3.2-vision:11b` (the local Ollama model tag) |
| `raw_response_json` | text (json) | full API response content, for debugging/audit |
| `created_at` | datetime | |

### 2.6 `checklist_overrides`
Manual human decisions that take precedence over (or substitute for) classification — e.g. marking an item "not applicable" for this case, manually confirming/reassigning a document's type, or manually marking an item received when no digital scan will ever exist.

| Field | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `case_id` | uuid FK → cases | |
| `document_type_id` | uuid FK → document_types | Maps to the unchanged wire field `required_document_type_id` — see §2.2's naming note. |
| `override_status` | enum: `received`, `missing`, `not_applicable` | |
| `note` | text, nullable | |
| `set_by` | text, nullable | |
| `set_at` | datetime | |

Only the latest override per `(case_id, document_type_id)` is effective; keep history by inserting new rows rather than updating (small table, cheap).

### 2.7 Derived: checklist item status (not a stored table)

Computed on read by `getCaseStatus` / `recomputeCaseStatus`, per `(case, document_type)`:

1. If a `checklist_overrides` row exists for this pair → its `override_status` wins, full stop.
2. Else if any `documents` row for this case has `matched_document_type_id` = this type and `status` in (`classified_auto`, `confirmed`) → `received`.
3. Else if any `documents` row for this case has `matched_document_type_id` = this type and `status` = `needs_review` → `pending_review`.
4. Else → `missing`.

Case-level `status`:
- `blocked` if any *mandatory* required document type resolves to `missing` **or** `pending_review` still exists for a mandatory type.

  Wait — clarify: `pending_review` is not the same as `missing`. Case status rule:
  - `ready_to_sign` iff every mandatory required document type resolves to `received` or `not_applicable`.
  - `in_progress` if none are stuck needing review but at least one mandatory item is `missing`.
  - `blocked`... **not used as a separate state from `in_progress` in MVP** — collapse to two effective states for case status plus an explicit flag: `overall_status`: `ready_to_sign` | `missing_documents` | `pending_review` (pending_review can co-occur with missing_documents; report whichever is worse, `pending_review` and `missing_documents` both prevent `ready_to_sign`, and the API returns both the per-item detail and one summary tag — see §3.5). This replaces the three-way `cases.status` enum in §2.3 with these three values for API purposes; store the same three values in `cases.status` (rename enum values in the migration: `ready_to_sign`, `missing_documents`, `pending_review`).

This derivation must live in exactly one function (`core/cases/computeStatus.ts`) — both the REST and MCP status endpoints call it, and so does the classification pipeline after it records a result.

### 2.8 `document_reviews`
Audit trail of every human review decision on a document's classification (`confirm`/`reassign`/`reject`) — the record a notary could point to for "who signed off on this document, and when." Added in the feedback-learning design's Phase A (durable audit capture only; using this data to improve future classifier accuracy — confidence-threshold tuning, few-shot exemplars, etc. — is a later phase). One row per call to `POST .../review` / `review_document`, written atomically with the `documents` status update; never overwritten.

| Field | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `document_id` | uuid FK → documents | |
| `classification_result_id` | uuid FK → classification_results, nullable | the latest classification attempt for this document at review time; null if the document was never successfully classified (e.g. Ollama was down and the assistant matched it manually) |
| `decision` | enum: `confirm`, `reassign`, `reject` | |
| `prior_document_type_id` | uuid FK → document_types, nullable | what the document was matched to *before* this review. Not exposed via any API response today (§2.8 audit data isn't returned by an endpoint), so no wire field name to preserve here. |
| `final_document_type_id` | uuid FK → document_types, nullable | what it's matched to *after* this review; null on `reject`. Same note as above — internal-only. |
| `note` | text, nullable | |
| `reviewed_by` | text, nullable | |
| `reviewed_at` | datetime | defaults to now() |

Indexed on `final_document_type_id` for later per-type aggregation (e.g. "which document types get reassigned most often").

---

## 3. API contract (REST, JSON, `Content-Type: application/json` unless uploading files)

Base path: `/api/v1`. No auth system specified for MVP (assume trusted LAN or a basic-auth reverse proxy in front); every endpoint below is backend-developer-implementable without further design decisions. All list endpoints return `{ "items": [...] }`.

> **Naming note:** the JSON field names below (`required_document_type_id`
> and its `matched_`/`predicted_` variants) are the frozen wire contract and
> intentionally still say "required" even though the underlying table/ORM
> class was internally renamed to `document_types`/`DocumentType` (§2.2) —
> this is deliberate, not a stale rename. Do not "fix" these field names to
> match §2 without treating it as the contract-breaking change it would be.
>
> **Contract-changing rename (`name_ro`/`name_en` → `name`):** unlike the
> rename above, this one DID move the wire contract. Every response below
> that used to carry `name_ro` and (for act types) `name_en` now carries a
> single `name` field (`name_en` dropped — see §2.1's naming note). The
> frontend reads `name`.

### 3.1 Act types & checklist — step 1 of the flow

```
GET /api/v1/act-types
→ 200 { "items": [ { "id": "...", "code": "sale_purchase", "name": "Sale-purchase", "status": "draft" } ] }

GET /api/v1/act-types/{actTypeId}/checklist
→ 200 { "items": [
    { "id": "...", "code": "land_registry_extract", "name": "Up-to-date land registry extract",
      "description": "...", "is_mandatory": true, "allow_multiple": false, "sort_order": 1 }
  ] }
```

### 3.2 Create case — step 1

```
POST /api/v1/cases
Body: { "act_type_id": "uuid", "client_name": "Ion Popescu", "notes": "optional", "created_by": "assistant@office" }
→ 201 {
  "id": "uuid", "act_type_id": "uuid", "client_name": "Ion Popescu", "notes": "optional",
  "status": "missing_documents", "created_at": "...", "updated_at": "..."
}
```

```
GET /api/v1/cases/{caseId}          → 200 <Case>
GET /api/v1/cases?status=missing_documents  → 200 { "items": [<Case>, ...] }
```

```
PATCH /api/v1/cases/{caseId}
Body: { "client_name"?: "Ion Popescu", "notes"?: "..." }   (only fields present are changed)
→ 200 <Case>
```

Added to support renaming a case / saving its client name from the Case View. `client_name`, if sent, is trimmed and must be non-blank (400 `invalid_client_name`); unknown case → 404 `case_not_found`. `act_type_id` (immutable) and `status` (derived, §2.7) are not updatable — such fields in the body are ignored, as are any other unknown fields. `updated_at` is bumped on every update that carries at least one field.

### 3.3 Upload document(s) — step 2

Multipart form upload, one request may carry multiple files.

```
POST /api/v1/cases/{caseId}/documents
Content-Type: multipart/form-data
Fields: files[] (one or more), uploaded_by (optional)

→ 201 { "items": [
    { "id": "uuid", "case_id": "uuid", "original_filename": "img_0231.jpg",
      "mime_type": "image/jpeg", "file_size_bytes": 812331,
      "status": "pending_classification", "matched_required_document_type_id": null,
      "uploaded_at": "..." }
  ] }
```

Uploading triggers classification **synchronously in-request by default** for MVP (a single local Ollama vision call per image — latency depends on office hardware, likely a few seconds on GPU and up to tens of seconds on CPU-only; acceptable for a one-at-a-time assistant workflow, see §4 for latency notes). The response's `status` field reflects the *post-classification* state, i.e. the client does not need a separate poll for the common case. If classification errors out (Ollama unreachable, timeout), the document is left `pending_classification` and the response includes a `"classification_error"` field per item so the UI can offer a manual retry (§3.4).

```
GET /api/v1/cases/{caseId}/documents → 200 { "items": [<Document>, ...] }

GET /api/v1/cases/{caseId}/documents/{documentId}/file
→ 200 raw file bytes, `Content-Type: <document.mime_type>`,
  `Content-Disposition: inline; filename*=UTF-8''<original_filename>`
→ 404 `document_not_found` (unknown id, or the document belongs to another case)
→ 404 `document_file_not_found` (row exists but the stored file is gone)
```
Used by the case view for thumbnails and the "View" link.

### 3.4 Trigger/retrigger classification — step 3

Used for retrying a failed classification, or re-running after editing `classification_hints`.

```
POST /api/v1/cases/{caseId}/documents/{documentId}/classify
→ 200 {
  "document": <Document>,
  "classification_result": {
    "id": "uuid", "predicted_required_document_type_id": "uuid|null",
    "predicted_type_code_raw": "land_registry_extract", "confidence": 0.92,
    "alternative_type_code_raw": null, "reasoning": "Document header reads 'Extras de Carte Funciara pentru Informare', shows CF number and property description.",
    "decision": "auto_accepted", "model_used": "llama3.2-vision:11b", "created_at": "..."
  }
}
```

Human review / correction of a classification (also step 3, the human-in-the-loop half of "verifies documents are the correct ones"):

```
POST /api/v1/cases/{caseId}/documents/{documentId}/review
Body: { "decision": "confirm", "reviewed_by": "optional" }
   or { "decision": "reassign", "required_document_type_id": "uuid", "reviewed_by": "optional" }
   or { "decision": "reject", "note": "blurry photo, unreadable", "reviewed_by": "optional" }
→ 200 <Document>   (status becomes "confirmed", "confirmed" with new match, or "rejected" respectively)
```

Every call also writes a `document_reviews` audit row (§2.8) capturing the decision, the prior/final matched type, which `classification_results` row (if any) was being reviewed, and `reviewed_by`/`reviewed_at` — see §2.8. This is audit capture only; it does not change the response shape above.

### 3.5 Manual checklist override

```
POST /api/v1/cases/{caseId}/checklist/{requiredDocumentTypeId}/override
Body: { "override_status": "not_applicable", "note": "no mortgage on this property", "set_by": "assistant@office" }
→ 200 { "required_document_type_id": "uuid", "override_status": "not_applicable", ... }
```

### 3.6 Validate / recompute — step 4

```
POST /api/v1/cases/{caseId}/validate
→ 200 <CaseStatusResponse>   (forces recomputation; same shape as GET status below — POST exists as an explicit
                               "check now" action for the UI, e.g. a "Validate" button, though status is always
                               kept fresh on every mutating call too)
```

### 3.7 Get case status — step 5

```
GET /api/v1/cases/{caseId}/status
→ 200 {
  "case_id": "uuid",
  "overall_status": "missing_documents",   // "ready_to_sign" | "missing_documents" | "pending_review"
  "checklist": [
    { "required_document_type_id": "uuid", "code": "land_registry_extract", "name": "Up-to-date land registry extract",
      "is_mandatory": true, "status": "received",
      "matched_document_id": "uuid", "confidence": 0.92 },
    { "required_document_type_id": "uuid", "code": "tax_certificate", "name": "Tax certificate",
      "is_mandatory": true, "status": "missing", "matched_document_id": null, "confidence": null },
    { "required_document_type_id": "uuid", "code": "energy_certificate", "name": "Energy performance certificate",
      "is_mandatory": true, "status": "pending_review", "matched_document_id": "uuid", "confidence": 0.55 }
  ],
  "missing_mandatory": ["tax_certificate"],
  "pending_review_count": 1
}
```

This single response is what drives the "invalid/missing documents (with which ones)" vs. "ready to sign" display required by the product flow's step 5.

### 3.8 Error shape (all endpoints)

```
→ 4xx/5xx { "error": { "code": "case_not_found", "message": "..." } }
```

---

## 4. LLM classification approach

**The classification model is local, served by Ollama — not the Anthropic API.** This is a given constraint, not a cost-optimization choice, and it has a real upside for this domain: uploaded documents are copies of ID cards, death certificates, property deeds — real personal data — so nothing about an uploaded image or its content ever needs to leave the office network. The corresponding downside, addressed throughout this section, is that open local vision models are less proven on scanned/photographed Romanian documents than a top-tier hosted multimodal model, so the design leans conservative until that's measured.

### 4.1 Where it sits in the pipeline

Upload (§3.3) → normalize file (downscale image / rasterize PDF page, see §4.3) → **classification call to the local Ollama server** → apply confidence policy → write `classification_results` row → update `documents.status` → recompute case status. Synchronous in the upload request for MVP simplicity (no job queue). Local inference latency is the main reason to watch this: on CPU-only hardware an 11B vision model can take tens of seconds per image, which is tolerable for one assistant uploading a few documents at a time but should be measured on the actual office hardware before committing to synchronous-in-request; if it's too slow, the fix is making `POST /documents` return immediately with `status: "pending_classification"` and running the same `core/classification` call in the background — the use-case function itself doesn't change, only which adapter awaits it.

### 4.2 Runtime and model choice

- **Runtime**: [Ollama](https://ollama.com), self-hosted on office hardware — either the same machine as the backend or another machine on the LAN, reachable at a configured `OLLAMA_BASE_URL` (default `http://localhost:11434`). `core/classification` talks to it over Ollama's local HTTP API, never anything on the public internet.
- **Model**: start with **`llama3.2-vision:11b`** as the default (`ollama pull llama3.2-vision:11b`) — the best-supported general-purpose vision model in the Ollama library at a size that runs on a single consumer GPU (~8–16GB VRAM) with acceptable latency, and a reasonable CPU fallback if no GPU is available (slower, still usable at this office's volume). Keep the model name in one config value (`core/classification/config.ts`).
- **Alternatives worth benchmarking, not guessing at**: `minicpm-v` and `granite3.2-vision` are smaller and specifically tuned for document/text-in-image understanding, which may fit this "read a scanned form" task better than a general vision model at a fraction of the resource cost — worth an A/B accuracy comparison against `llama3.2-vision` on a small labeled set of real (or realistic sample) notary documents before picking a final default. Do not swap models based on benchmarks alone; swap based on this office's own documents.
- **Hardware note (deployment prerequisite, not a code change):** document, at implementation time, whichever machine runs Ollama and its available RAM/VRAM — this determines which model sizes are even viable and is a fact to gather once, not re-derive per feature.

### 4.3 Request shape

One call per document, per uploaded file, against Ollama's `POST /api/chat`:

- **Images** (`image/jpeg`, `image/png`, `image/webp`, `image/heic` after conversion): base64-encoded in the message's `images` array, downscaled server-side first (long edge ~1568px is plenty for legibility and keeps inference fast — do not feed full-resolution phone photos to a local model).
- **PDF scans**: Ollama vision models take images, not native PDF input (no equivalent to Claude's PDF content block), so rasterize each page to an image first (e.g. via `pdf-to-img`/`pdftoppm`) as a preprocessing step in `core/classification`. For MVP, classify page 1 only (the identifying header — document type, title, stamp — is almost always on the first page of these document types); note this as a known limitation if a specific document type later needs a later page (flag for a small follow-up, not a redesign).
- **System/instruction prompt**: the closed list of the case's act type's `document_types` (code, `name`, `description`, `classification_hints`), plus an explicit "respond only with one of these codes, or `unknown` if none match" instruction, plus the target JSON shape.
- **Structured output**: pass `format` as a JSON schema on the `/api/chat` request (Ollama supports grammar-constrained structured output this way) so the response is guaranteed parseable — same shape Claude would have used:
  ```json
  {
    "type": "object",
    "properties": {
      "predicted_type_code": { "type": "string" },
      "confidence": { "type": "number", "minimum": 0, "maximum": 1 },
      "alternative_type_code": { "type": ["string", "null"] },
      "reasoning": { "type": "string" }
    },
    "required": ["predicted_type_code", "confidence", "reasoning"]
  }
  ```
- **Sampling**: `temperature: 0` (or as close to deterministic as the model allows) — classification should be repeatable given the same image, not creative.
- **`keep_alive`**: set generously (e.g. `"30m"`) so Ollama keeps the vision model resident in memory between requests instead of reloading it on every upload, which otherwise dominates latency on modest hardware.

### 4.4 Confidence and ambiguity policy — never silently auto-accept, and start extra conservative here

Applied uniformly in `core/classification/applyPolicy.ts`, the single place this logic lives:

| Condition | `documents.status` | `classification_results.decision` | Checklist effect |
|---|---|---|---|
| `predicted_type_code` matches a known required-document-type **and** `confidence >= threshold` | `classified_auto` | `auto_accepted` | item → `received` |
| `predicted_type_code` matches a known type but `confidence < threshold`, or model returns `unknown`/unmapped code | `needs_review` | `needs_review` | item → `pending_review` |
| Classification call errors (Ollama unreachable, timeout, malformed response) | stays `pending_classification` | (no row, or an error-flagged row) | item → `missing` (never guess) |

A human always resolves `needs_review` via `POST /review` (§3.4); nothing in this system moves a document straight from "uncertain" to "ready to sign" without that step. Two things are specific to a local open-weight model and matter more here than they would with a top-tier hosted model:

- **Self-reported confidence from smaller/local models tends to be poorly calibrated** — a model can say `0.9` on a wrong answer more readily than a frontier model would. Treat the `confidence` field as a useful *ranking* signal, not a trustworthy probability, at least initially.
- **Recommended rollout**: ship the first few weeks with `threshold` set high enough that almost everything lands in `needs_review` (effectively "the model suggests, a human always confirms") while logging every `classification_results` row. Once there's a real labeled sample of this office's documents and their actual outcomes, tune `threshold` down for the document types where the model is demonstrably reliable — per-`document_type` thresholds are a reasonable evolution of the single global value if accuracy varies a lot by document type (e.g. a printed CF extract is easier than a handwritten note).

### 4.5 Handling multiple documents matching one checklist item / one document matching nothing

- If `allow_multiple` is false and a second document is auto-classified to a type that already has a `received` match, still record it (useful — e.g. a better scan replacing a blurry photo) but leave the checklist item `received`; surface both documents in the UI so the assistant can pick which to keep, no auto-deletion.
- If the model's top guess doesn't map to any of this act type's required document types (i.e., the client uploaded something irrelevant, or a document belonging to a different act type), that's exactly the `unknown` / `needs_review` path — never a hard rejection with no trace.

### 4.6 Performance notes (the local equivalent of "prompt caching")

There's no hosted-API billing to optimize here, so the concern shifts from token cost to **latency and throughput on shared local hardware**:
- Keep the model warm (`keep_alive`, §4.3) so classification calls don't pay a multi-second model-load penalty each time.
- If concurrent uploads become common, note that Ollama serializes/queues requests against one loaded model by default — for this office's volume (a few dozen documents/day, one assistant at a time in practice) that's a non-issue; revisit only if a second workstation starts uploading concurrently and requests visibly queue.
- Keep the instruction/system prompt text stable and small — it's cheap to regenerate per call locally, so there's no cross-request caching mechanism to design for (unlike Anthropic's explicit `cache_control`); just don't make it needlessly large per call.

### 4.7 What this design explicitly does not handle (and why that's acceptable for MVP)

- No fine-tuning of the local model — the closed-list-in-prompt approach is simpler to maintain and good enough to evaluate first; only consider fine-tuning if a generic model demonstrably can't hit acceptable accuracy on this office's real documents after prompt and model-choice iteration.
- No automatic act-type detection from the document itself — the assistant chooses the act type up front (step 1 of the flow, by design), so classification only has to disambiguate within that act type's checklist, a much smaller problem than open-ended document classification.
- No dedicated OCR pipeline separate from the vision model's own reading of the image — revisit only if a specific document class (dense text, poor handwriting) proves unreliable and a text-extraction pre-pass turns out to help.
- No automatic model fallback to a hosted API on low confidence — deliberately excluded, since the entire reason for the local constraint is that these documents shouldn't leave the premises; low confidence is resolved by a human reviewer, not by escalating to the cloud.

---

## 5. Storage

MVP favors zero infrastructure:

- **Metadata**: SQLite, one file (`backend/data/notar-ai.db`), accessed via an ORM with migrations (Prisma — see §6). SQLite is sufficient at this concurrency (a handful of assistants, no high write concurrency) and needs no separate service to run or back up.
- **Files**: local filesystem under `backend/data/documents/{case_id}/{document_id}__{original_filename}`. The `core/storage` module is a small interface (`save(buffer, path)`, `read(path)`, `delete(path)`) — implemented today with plain `fs`, so a future move to S3/object storage is a new implementation of the same interface, not a rewrite of callers.
- **Backup**: for MVP, "back up `backend/data/` " (the DB file + documents directory together) is a sufficient, honest answer — e.g. a nightly copy to another disk/cloud drive. Don't build anything more elaborate until there's a real second office or real compliance requirement driving it.
- **Migration path (explicitly deferred, not designed now)**: if load or multi-office deployment ever requires it, move to Postgres + S3-compatible object storage; because `core` only talks to a repository interface and a storage interface, this is a swap-the-implementation change, not an architecture change.

---

## 6. Tech stack recommendation

| Layer | Choice | Why |
|---|---|---|
| Language | **Split, not one language everywhere.** `backend/core` and `backend/api` are Python. `backend/mcp` (paused, see §1.1/§7) and `frontend/` remain TypeScript. | `core`/`api` were rewritten from TypeScript to Python after this document's initial version (see `backend/README.md`'s "What was built" for the port). `mcp` was never touched by that rewrite — it still imports nothing from `core` directly, since a Python `core` and a TypeScript `mcp` can't share in-process function calls the way §1.1 originally assumed; re-enabling `mcp` now needs a real design decision (a process boundary of some kind), not just an `import`. `frontend` was always TypeScript and stays that way. |
| Backend web framework | **FastAPI** (`backend/api`) | Thin HTTP layer only, per §1.1; async-native (matches `core`'s SQLAlchemy async engine), built-in request validation and OpenAPI docs at no extra cost. |
| MCP server | `@modelcontextprotocol/sdk` (TypeScript), stdio transport — **paused, not ported to Python** | Matches the brief's ask directly; stdio is the standard way an MCP client (Claude Desktop/Code) launches a local server — no separate network service to run. Preserved as-is under `backend/mcp/` (own `package.json`/`tsconfig.json`) while focus is on the web interface; see the status note in §1.1. |
| ORM / DB | **SQLAlchemy 2.0 + Alembic + SQLite** (`backend/core`) | Typed schema (declarative models), versioned migrations, async engine (`sqlite+aiosqlite`) matching FastAPI's async handlers; trivial to point at Postgres later by changing the connection URL. Replaces the original TypeScript build's Prisma + SQLite choice — same SQLite file on disk, different tool generating/applying the schema. |
| LLM runtime | **Ollama**, self-hosted on office hardware, called over its local HTTP API via `httpx` (`backend/core/src/notar_ai_core/classification/ollama_client.py`) — model default `llama3.2-vision:11b` | Given constraint: classification must run locally, not against a hosted API (see §4). No official "SDK" dependency needed — Ollama's REST API is small enough that a thin typed wrapper in `core/classification` is simpler than adding a client library dependency. |
| Frontend framework | React + Vite + TypeScript | Fast dev loop, minimal ceremony for a small internal tool. |
| Frontend data layer | TanStack Query (react-query) against the REST API | Handles loading/error/retry state for upload + classification calls without hand-rolled state machines. |
| Styling | Tailwind CSS | Fast to build a clean, status-badge-heavy UI (received/missing/pending) without a design system investment this project doesn't need. |
| Backend packaging | `pip` + a project-local virtualenv (`backend/.venv`) + per-package `pyproject.toml` (`backend/core`, `backend/api` each a separate Python distribution, installed editable; `api` depends on `core` as a local path dependency) | Replaces the original npm/pnpm-workspaces plan for the backend now that `core`/`api` are Python — there's no single monorepo tool spanning Python and the still-TypeScript `mcp`/`frontend`; each side uses its own ecosystem's native tooling instead of forcing one shared workspace tool across languages. `uv`/`poetry` were considered but neither was available in the build environment and stdlib `pip`+`venv` needs no extra install; switching later is a drop-in change. |

This is optimized for "small, simple MVP, two developers working in parallel," not enterprise scale — no Kubernetes, no message queue, no microservices split beyond the modular boundaries in §1.

---

## 7. MCP integration design

> **Status: paused, not removed as a decision** — see the status note in
> §1.1. This design is preserved as the contract for `backend/mcp/`, which
> is implemented and working but currently excluded from the active
> `backend/` workspaces while focus is on the web interface.

The MCP server (`backend/mcp`) registers tools that call the exact same `core` use-case functions the REST API calls (§1). This lets the notary's assistant — or the notary directly — drive case creation and checklist review from an MCP client (e.g. asking Claude Desktop "create a new succession case for Maria Ionescu and tell me what's missing") without touching the web UI, and lets the web UI and MCP surface evolve without ever risking divergent business rules.

| MCP tool | Input | Output | Maps to `core` function / REST equivalent |
|---|---|---|---|
| `list_act_types` | `{}` | `{ act_types: [{id, code, name}] }` | `listActTypes()` / `GET /act-types` |
| `get_checklist` | `{ act_type_id }` | `{ items: [{id, code, name, is_mandatory}] }` | `getChecklist()` / `GET /act-types/{id}/checklist` |
| `create_case` | `{ act_type_id, client_name, notes? }` | `{ case: {...} }` | `createCase()` / `POST /cases` |
| `upload_document` | `{ case_id, file_path, original_filename? }` — `file_path` is a path readable by the MCP server process (local filesystem, since MCP clients like Claude Desktop typically run alongside local files); a `file_base64` variant is accepted as an alternative input for remote/non-local clients | `{ document: {...}, classification_result: {...} }` | `uploadDocument()` + `classifyDocument()` / `POST /cases/{id}/documents` |
| `classify_document` | `{ document_id }` | `{ document, classification_result }` | `classifyDocument()` / `POST .../classify` |
| `review_document` | `{ document_id, decision: "confirm"|"reassign"|"reject", required_document_type_id?, note?, reviewed_by? }` | `{ document: {...} }` | `reviewClassification()` / `POST .../review` |
| `override_checklist_item` | `{ case_id, required_document_type_id, override_status, note? }` | `{ override: {...} }` | `setChecklistOverride()` / `POST .../override` |
| `get_case_status` | `{ case_id }` | same shape as §3.7 | `getCaseStatus()` / `GET /cases/{id}/status` |
| `validate_case` | `{ case_id }` | same shape as §3.7 | `recomputeCaseStatus()` / `POST /cases/{id}/validate` |

Notes for implementation:
- Tool descriptions (the text the MCP client's model sees) should state the confidence policy in plain language (e.g. "documents classified with low confidence are marked pending_review and require review_document to confirm") so an LLM driving these tools doesn't assume `upload_document` alone finishes the job.
- The MCP server process needs the same `OLLAMA_BASE_URL`/model config and the same SQLite/file paths as the REST API process — document this in `backend/mcp/README.md` at implementation time (deployment detail, not an architecture decision).
- No new business logic is ever added in `backend/mcp` — if a tool needs behavior the REST API doesn't have, add it to `core` first, then expose it from both adapters.

---

## 8. Phased build plan

**Phase 0 (both, do first, before writing feature code):** Freeze the contract in this document — the exact endpoint shapes in §3, the exact entity fields in §2, and the seed data for at least two act types (`sale_purchase`, `succession` — draft required-document lists below, to be confirmed with the notary but good enough to build against). Backend owns turning §2 into a committed Prisma schema + migration + seed script; frontend can start building against the JSON shapes in §3 immediately using a mock server (e.g. `msw` or a tiny json-server) without waiting for the real backend.

Draft seed data (confirm with the notary; not a legal authority — a reasonable placeholder so both sides have real fixtures):

- `sale_purchase` (Sale-purchase): `land_registry_extract` (Up-to-date land registry extract), `title_deed` (Seller's title deed), `tax_certificate` (Tax certificate — City Hall), `energy_certificate` (Energy performance certificate), `seller_id_card` (Seller ID card, `allow_multiple: true`), `buyer_id_card` (Buyer ID card, `allow_multiple: true`), `marriage_certificate` (Marriage certificate, `is_mandatory: false`), `homeowners_association_certificate` (Homeowners' association certificate, `is_mandatory: false`).
- `succession` (Succession): `death_certificate` (Death certificate), `civil_status_certificates` (Heirs' birth/marriage certificates proving kinship, `allow_multiple: true`), `heirs_id_cards` (Heirs' ID cards, `allow_multiple: true`), `will` (Will, `is_mandatory: false`), `estate_land_registry_extract` (Land registry extract for estate properties), `deceased_title_deeds` (Deceased's title deeds), `tax_certificate` (Tax certificate).

Placeholder act types (added after Phase 0 so the Act Type Picker isn't limited to two options; checklists ported from the frontend mock data, **not yet reviewed by the notary** — treat as even less authoritative than the two above):

- `donation` (Donation): `title_deed` (Donor's title deed), `land_registry_extract` (Up-to-date land registry extract), `donor_id_card` (Donor ID card, `allow_multiple: true`), `donee_id_card` (Donee ID card, `allow_multiple: true`).
- `mortgage` (Mortgage / Loan): `loan_agreement` (Loan agreement), `land_registry_extract` (Up-to-date land registry extract), `borrower_id_card` (Borrower ID card, `allow_multiple: true`).
- `power_of_attorney` (Power of attorney): `principal_id_card` (Principal ID card), `agent_id_card` (Agent ID card, `is_mandatory: false`).
- `other` (Other act type): `id_card` (ID card, `allow_multiple: true`).

All six are seeded by `backend/core/seed.py` (idempotent, upserts by `code`) with `status: draft` (§2.1). Codes, names, descriptions and `classification_hints` are all English (the app is English-only). The codes were renamed from their original Romanian forms (e.g. `extras_cf` → `land_registry_extract`) by migration `b3f5d2a9c7e1`.

**Phase 1 — V1 foundation (parallel):**

*Backend:*
1. Prisma schema for all §2 tables + migration + seed script for the act types above.
2. `core/act-types`, `core/cases`, `core/documents` (storage adapter + upload handling, no classification yet), `core/cases/computeStatus.ts` implementing the §2.7 derivation.
3. REST adapter (`backend/api`): all endpoints in §3 except §3.4's classify trigger (stub `documents.status` at `pending_classification` after upload, no auto-classification yet) and §4's confidence-driven fields.
4. Manual `checklist_overrides` endpoint (§3.5) — this alone makes V1 usable end-to-end (assistant manually marks items received/missing) before any AI exists.

*Frontend:*
1. Act-type selection screen (step 1) → `GET /act-types`.
2. Case creation form → `POST /cases`.
3. Document upload UI: multi-file drag-and-drop + mobile camera capture (assistants will often be photographing physical documents on the spot) → `POST /cases/{id}/documents`.
4. Checklist view: one row per required document type, status badge (received/missing/not_applicable — pending_review comes in Phase 2), manual override controls → §3.5/§3.7.
5. Case status banner: "Ready to sign" vs. "Missing: X, Y" → `GET /cases/{id}/status`.

**Phase 2 — V2 classification (parallel, after Phase 1 contract is stable):**

*Backend:*
1. `core/classification`: Ollama HTTP client integration (chat + structured-output `format`, image/PDF-page encoding, `keep_alive`), prompt construction from a case's act-type checklist (§4.3), the confidence policy in `applyPolicy.ts` (§4.4) starting with a deliberately high/conservative threshold per §4.4's rollout note.
2. `applyPolicy.ts` implementing the §4.4 confidence table; wire into the upload flow (§3.3) and the manual `/classify` trigger (§3.4).
3. `/review` endpoint (§3.4) for human confirm/reassign/reject.
4. `backend/mcp`: register the tools in §7, all calling the same `core` functions already built in Phases 1–2 — this phase should be small precisely because no new logic is written here.

*Frontend:*
1. Upload flow feedback: show classification result inline right after upload (predicted type + confidence) instead of a bare "uploaded" state.
2. Review UI for `needs_review` documents: image preview + predicted type + confidence + reasoning text + confirm/reassign/reject controls (§3.4).
3. Checklist view gains the `pending_review` status badge and the `pending_review_count` / `missing_mandatory` summary from §3.7.
4. Polish the "ready to sign" vs. "missing/pending" status banner to clearly list both missing mandatory items and items awaiting human review, per the product flow's step 5.

**Coupling rule for both phases:** any change to an endpoint shape or an entity field after Phase 0 is a contract change — update this document first, then implement on both sides. Do not let frontend infer backend behavior from reading backend source, or vice versa; the contract in §2/§3/§7 is what each side codes against.
