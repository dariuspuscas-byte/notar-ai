# notar-ai

notar-ai is a document-checklist and verification tool for a Romanian notary office: it lets an assistant pick the type of legal act being prepared (sale-purchase, succession, etc.), upload the client's documents as they arrive (photos, scans, PDFs), and see at a glance which required documents are received, missing, or not applicable — with a V2 capability that uses a multimodal LLM (Claude vision) to automatically classify an uploaded photo/scan against the act type's checklist instead of requiring manual tagging, flagging anything low-confidence for human review rather than auto-accepting it, so the office always has a clear, auditable answer to "are we ready to sign?" The same checklist/verification logic is exposed both through a web UI and as an MCP server, so it can also be driven from an MCP client such as Claude Desktop or Claude Code.

See `specs/ARCHITECTURE.md` for the full technical specification (service boundaries, data model, API contract, LLM classification design, storage, tech stack, MCP tool design, and the phased backend/frontend build plan). Backend implementation lives under `backend/`, frontend under `frontend/`.

## Local Postgres container (optional)

A `docker-compose.yml` at the repo root stands up a local Postgres instance in Docker. It is **not** wired into the backend — notar-ai still runs on SQLite (`backend/data/notar-ai.db`) per the architecture spec's storage decision. This container exists purely for local experimentation.

```sh
cp .env.example .env        # first time only; adjust credentials/port if needed
docker compose up -d        # start
docker compose ps           # check health status
docker compose down         # stop (data persists in the named volume)
docker compose down -v      # stop and wipe the data volume
```

Connect once it's up (default credentials, adjust if you changed `.env`):

```sh
psql "postgresql://notarai:changeme@localhost:5432/notarai"
```
