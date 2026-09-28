# notar-ai

notar-ai is a document-checklist and verification tool for a Romanian notary office: it lets an assistant pick the type of legal act being prepared (sale-purchase, succession, etc.), upload the client's documents as they arrive (photos, scans, PDFs), and see at a glance which required documents are received, missing, or not applicable — with a V2 capability that uses a multimodal LLM (Claude vision) to automatically classify an uploaded photo/scan against the act type's checklist instead of requiring manual tagging, flagging anything low-confidence for human review rather than auto-accepting it, so the office always has a clear, auditable answer to "are we ready to sign?" The same checklist/verification logic is exposed both through a web UI and as an MCP server, so it can also be driven from an MCP client such as Claude Desktop or Claude Code.

See `specs/ARCHITECTURE.md` for the full technical specification (service boundaries, data model, API contract, LLM classification design, storage, tech stack, MCP tool design, and the phased backend/frontend build plan). Backend implementation lives under `backend/`, frontend under `frontend/`.

## Running with Docker

`docker-compose.yml` at the repo root runs the whole stack in containers:

| Service | Container | URL |
|---|---|---|
| `frontend` (nginx serving the Vite build, proxies `/api` to the backend) | `notarai-frontend` | http://localhost:8080 |
| `backend` (FastAPI) | `notarai-backend` | http://localhost:3001/api/v1 (health: `/health`) |
| `postgres` | `notarai-postgres` | `localhost:5432` |

```sh
cp .env.example .env            # first time only; adjust ports/credentials if needed
docker compose up -d --build    # build and start everything
docker compose ps               # check health status
docker compose logs -f backend  # follow backend logs
docker compose down             # stop (data persists in named volumes)
docker compose down -v          # stop and wipe the database and uploaded documents
```

On startup the backend container runs `alembic upgrade head` and `seed.py`
(both idempotent) before starting the API. Set `SKIP_MIGRATIONS=true` on the
`backend` service to skip them.

Uploaded documents are stored in the `notarai_documents` volume and the
database in `notarai_postgres_data`.

**Ollama is not containerized.** Run it on the host as usual; the backend
reaches it at `http://host.docker.internal:11434`. Set `OLLAMA_MODEL` in the
root `.env` to a model you have pulled (default `llama3.2-vision:11b`).

The frontend image is built with `VITE_ENABLE_MOCKS=false` and
`VITE_API_BASE_URL=/api/v1`, so it always talks to the real backend.
