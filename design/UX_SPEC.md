# Notary Assistant Checklist — UX Spec

Author: UX design pass, 2026-09-14.
Companion static mockups (open directly in a browser): `design/canvas/ActTypePicker.dc.html`, `design/canvas/Main.dc.html` (core screen, missing-documents state), `design/canvas/ReadyToSign.dc.html` (core screen, complete state), `design/canvas/Tablet.dc.html` (responsive variant). These are plain HTML/CSS sketches, not wired to any backend.

## 0. Who this is for, and the one rule that shapes everything

The user is the notary's assistant — not the client, not the notary. They use this between other tasks, often mid-interruption, often with a client standing at the desk. **Adoption risk is the product risk**: if this tool is slower or fussier than snapping a WhatsApp photo, they will quietly go back to WhatsApp and a paper checklist. Every decision below optimizes for *fewest taps to a correct state*, not for completeness of features.

Design language: no existing design system exists yet (backend/repo is still empty). I committed to a plain, utilitarian internal-tool aesthetic — system-ui font stack, a neutral slate/white surface, one restrained accent (deep blue, for actions/links), and color-coded status pills that never rely on color alone (each pairs an icon + text label). No decoration, no marketing chrome. This is a workaday tool used dozens of times a day; it should feel like a well-made spreadsheet, not a product landing page.

**Key structural decision**: steps 2–5 from the brief (upload → verify → validate → status) are **not a wizard**. They live on one persistent screen, the Case View, because documents arrive over hours or days, in any order, from a client who is not present. The assistant opens the same case repeatedly as things trickle in — a multi-step wizard would force them to re-navigate every time. Only step 1 (choosing the act type) is a true one-time, one-screen decision, made once at case creation.

## 1. Screens

### 1.1 Case list (home / dashboard)
Not explicitly requested but implied as the entry point — the assistant needs to get back to an in-progress case. Kept minimal for this spec: a simple table/list of open cases (client name, act type, status pill, last activity), sorted by most recently active, with a search box and a single prominent "+ Dosar nou" (New case) button. Clicking a row opens that case's Case View directly. Clicking "+ Dosar nou" opens the Act Type Picker.

### 1.2 Act Type Picker (`ActTypePicker.dc.html`)
One-time step at case creation.
- A small fixed set of large, clickable cards (not a dropdown — dropdowns hide the options and cost a click to open; with ~5-6 act types, cards showing all options at once are faster to scan and tap).
- Each card: icon, act name in Romanian (Vânzare-cumpărare, Succesiune, Donație, Ipotecă/Credit, Procură, Alt tip de act), one-line descriptor.
- Selecting a card immediately creates the case and its checklist (derived from a fixed template per act type) and navigates straight into the Case View. No confirmation step, no client-details form gate — client name/details can be filled in from the Case View header afterwards, or the case can start as "Client nou" and be renamed later. Do not block the assistant from starting to upload documents just because a name field isn't filled in yet.

### 1.3 Case View — the core screen (`Main.dc.html` / `ReadyToSign.dc.html`)
One screen, four zones, top to bottom:

1. **Case header** — client name, act-type badge, case number/date. An "Editează tipul actului" affordance in case the wrong act type was picked (this regenerates the checklist — should warn if it would drop documents already matched).
2. **Case-level status banner** — see §2 and §3.
3. **Upload dropzone** — a single, always-visible drag-and-drop area (also click-to-browse, also usable for pasting a screenshot). This is the *only* upload action in the whole flow: the assistant never tags, names, or categorizes what they drop in. Multiple files at once, mixed types, fine. Each dropped file immediately appears in the matching checklist row (or a temporary "unmatched" holding row — see §4) in a "verifying" state.
4. **Checklist** — one row per required document for this act type. This is the product's core surface; see §2.

### 1.4 Generate-message view
Not a separate page — a modal/panel opened from the banner button (see §3). Contains: an editable text area pre-filled with a drafted message, a "Copiază" (copy) button, and (if feasible later) a direct "Trimite pe WhatsApp" link using `wa.me`. Closing it does nothing destructive; nothing is sent on the client's behalf without the assistant's own action.

## 2. Per-document status — the core of the product

Five states, each with a distinct icon + color + label (never color alone, for colorblind-safe and print/grayscale-safe communication), shown as a status pill on the right of each row plus a tinted icon chip on the left:

| State | Icon | Color | Label | Row treatment |
|---|---|---|---|---|
| **Missing** | outline upload arrow | neutral grey | "Lipsă" | White card, dashed border (signals "not yet acted on" / a slot waiting to be filled). Row action: "Încarcă" button — a shortcut that opens the same dropzone, scoped to this row, for when the assistant already knows which physical document they're about to add. |
| **Verifying** | spinning ring | blue | "Se verifică" | Solid border, no action available yet (nothing to confirm or click — prevents the assistant from acting on a result that doesn't exist yet). Timestamp of when the file arrived, so a stuck upload is visible. |
| **Needs review** | alert triangle | amber/orange | "De confirmat" | Warm-tinted card background (the one row style that's tinted, not just bordered — it's the one state demanding attention). Shows a small thumbnail, the system's guess and confidence (e.g. "72%"), and two inline actions: **Confirmă** (primary, accepts the guess) and **Alege alt document** (secondary, opens a short list of the case's other document types to reassign it to). This *is* the validate step from the brief — folded directly into the row, not a separate screen. |
| **Received / matched** | checkmark | green | "Primit" | White card, solid border. "Vizualizează" link to open the file. This is the resting/good state — deliberately the quietest visual treatment so a scanned list reads calm once things are done. |
| **N/A** | crossed-out circle | dim grey | "N/A" | Dimmed (reduced opacity), strikethrough label, so it visually recedes from the list without disappearing — the assistant needs to see *why* a required document isn't being asked for. A "Readu" (bring back) link undoes it. Marking N/A is a deliberate assistant action (e.g. a small toggle/kebab menu on any row), used for cases where a normally-required document genuinely doesn't apply (e.g. no co-owner, no mortgage). |

Design rationale: missing/verifying/received all use a neutral or cool palette and stay visually quiet — they're either "nothing to do yet" or "done." Needs-review is the *only* warm/amber-tinted row background in the list, so it's the one state the eye catches first when scanning — that's deliberate, since it's the only state requiring a human decision right now.

## 3. Case-level status banner

Sits directly under the case header, full width, always visible without scrolling — the assistant should be able to glance at a case and know its state in under a second.

- **Missing state** (any row not yet Received or N/A): amber/orange banner. Primary line is the count of genuinely missing documents ("2 documente lipsă"); a secondary line notes anything still verifying/needs-review separately ("+ 2 în verificare"), so the assistant isn't confused about why a case shows "2 missing" when 4 rows are incomplete — verifying/needs-review documents have already been submitted by the client, they're just not confirmed yet, so they should never be described to the assistant (or listed in the client-facing message) as "missing."
- **Ready state**: all rows Received or N/A. Green banner: "Dosar complet · pregătit de semnare." Its action button switches from "Generate message" to "Marchează dosar semnat" (mark signed) — the natural next action once nothing is missing.
- No intermediate "almost ready" banner state — two states (not-ready / ready) is the entire vocabulary the assistant needs; anything more granular belongs in the row list, not the banner.

## 4. The "generate client message" killer feature

Surfaced as a single button living *inside* the missing-state banner (not a separate menu, not buried in a case menu) — the button is only present/enabled when there's something missing to report, and it disappears once the case is ready (nothing left to ask the client for). This keeps it exactly one click from the moment the assistant realizes a client message is needed — the whole point of a killer feature is that reaching for it can't cost more than reaching for WhatsApp does today.

Behavior: clicking it drafts a message using only the current **Missing** rows (never Verifying or Needs-review — those are already in the client's hands, telling them "we still need X" when they already sent it would be confusing and erode trust in the tool). Draft copy example:

> Bună ziua, pentru dosarul dumneavoastră (vânzare-cumpărare) ne mai sunt necesare următoarele documente:
> — Certificat de performanță energetică
> — Adeverință de la asociația de proprietari
> Vă rugăm să le trimiteți la cabinet sau pe acest număr. Vă mulțumim!

The text is editable before copying/sending — the assistant should be able to add a personal note or fix tone, not be locked into robotic copy.

## 5. Validate step — low-confidence matches, without friction on the happy path

The brief's step 4 ("validate") is intentionally *not* a gate the assistant must pass through for every document. Design principle: **silence is the reward for confidence.** When the system is confident, a document simply flips straight from Verifying → Received with no assistant action at all — that's the entire "confirm" step for the common case, and it costs zero clicks.

Only low-confidence or ambiguous matches surface as work, and they surface *in place*, inline in their row (§2's Needs-review treatment) — never as a popup, a modal, or a separate "review queue" screen that would need its own navigation. Rationale: an interruption-driven user should never lose their place on the one screen they're using. If several documents need review at once, they simply appear as several amber rows in the same list — still scannable at a glance, still zero extra navigation.

Confirming takes one click ("Confirmă"). Correcting takes two (open "Alege alt document," pick the right one from the case's own checklist) — deliberately still cheap, since a wrong AI guess should never cost more than a couple of taps to fix. No confidence-score tuning, no "why did it guess this" explanation surfaced to the assistant by default — that's implementation detail the assistant doesn't need in order to do their job; keep it out of the UI unless it's specifically requested.

## 6. Responsive / practical considerations

- **Primary target: desktop**, front-desk workstation, mouse + keyboard, likely a wide-ish but not huge monitor. Case View comfortably fits ~1440px width without horizontal scrolling; single-column checklist (not a multi-column grid) even on wide screens, because the row content (name + status + thumbnail + actions) doesn't benefit from being split across columns, and a single scannable column is faster to read top-to-bottom.
- **Secondary target: tablet**, likely used to physically photograph documents at the desk or to hand to a client's side. At tablet width (`Tablet.dc.html`, ~834px):
  - Top bar condenses (hamburger instead of a full nav row).
  - The status banner stacks — text above, full-width button below — instead of the desktop's side-by-side layout, since a wide button and wide text no longer both fit on one line.
  - Needs-review's two actions (Confirmă / Alt document) become two full-width buttons stacked... actually placed side-by-side but each ≥44px tall, since they're the highest-frequency tap target on tablet.
  - All interactive elements (buttons, links, upload row-shortcuts) sized to at least a 44×44px touch target, per WCAG/mobile HIG guidance — the desktop mockup's smaller inline links (e.g. "Vizualizează") are acceptable at desktop because they're mouse-driven, but grow on tablet.
  - The dropzone doubles as the entry point to a device camera on tablet/mobile (native file input with `capture="environment"` semantics) — "apasă pentru a încărca sau fă o poză."
- **Not a target**: phone-width use. Not designed against here since the brief doesn't call for it, but the layout (single-column flex rows, no fixed-width side-by-side elements) would degrade reasonably rather than break if it were ever opened on one.
- **Color contrast**: all text/background pairs used (status pill text on tint, banner text on tint) were chosen to clear WCAG AA for normal text (~4.5:1) — the amber and green tints in particular use a darker text tone than the pastel background, not a saturated color-on-color pairing.
- **Never color-only**: every status is icon + label + color together, so the tool remains usable for colorblind assistants and holds up if printed or screen-shared in black and white.

## 7. States not covered above, worth flagging for implementation

- **Empty case** (act type just picked, nothing uploaded yet): checklist shows all rows as Missing; banner shows the full missing count immediately — no special "empty" screen needed, the normal Missing-state UI already communicates this correctly.
- **Upload error** (corrupt file, unsupported format, upload failure): row should show a distinct error treatment (not designed in the mockups — recommend a red-tinted variant of the Missing row with a retry action) rather than silently reverting to Missing, so the assistant knows *why* nothing happened.
- **Unmatched upload** (assistant drops a file that doesn't match any required document, e.g. a duplicate or an irrelevant scan): needs a holding area — recommend a collapsed "Fișiere nerecunoscute (1)" row at the bottom of the checklist rather than silently discarding it, so nothing a client sent is ever lost from view.
- **Reopening a signed case**: once marked signed, recommend the Case View becomes read-only/archived rather than disappearing, in case a document needs to be pulled up later.

## Handoff notes for implementation

- Fixed act-type → required-document-list mapping needs to live somewhere (likely backend-owned, per the parallel API spec) — the UI only needs to render whatever list comes back for the chosen act type.
- The "Alege alt document" correction control needs the list of *this case's* other required document types (not a global document taxonomy) as its options.
- The generate-message draft can start as a static template with blanks filled from the current Missing list; personalizing tone/phrasing further is a nice-to-have, not required for v1.
- Recommend building `frontend-developer` handoff directly against `design/canvas/Main.dc.html` and `ReadyToSign.dc.html` for exact spacing/color/type values — they're plain inline-styled HTML, easy to lift values from directly.
