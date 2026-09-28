# notar-ai

notar-ai is a document-checklist and verification tool for a Romanian notary office: it lets an assistant pick the type of legal act being prepared (sale-purchase, succession, etc.), upload the client's documents as they arrive (photos, scans, PDFs), and see at a glance which required documents are received, missing, or not applicable — with a V2 capability that uses a local multimodal LLM (served by Ollama, nothing leaves the machine) to automatically classify an uploaded photo/scan against the act type's checklist instead of requiring manual tagging, flagging anything low-confidence for human review rather than auto-accepting it, so the office always has a clear, auditable answer to "are we ready to sign?" The same checklist/verification logic is exposed both through a web UI and as an MCP server, so it can also be driven from an MCP client such as Claude Desktop or Claude Code.

See `specs/ARCHITECTURE.md` for the full technical specification (service boundaries, data model, API contract, LLM classification design, storage, tech stack, MCP tool design, and the phased backend/frontend build plan). Backend implementation lives under `backend/`, frontend under `frontend/`.

## Running with Docker

`docker-compose.yml` at the repo root runs the whole stack in containers:

| Service | Container | URL |
|---|---|---|
| `frontend` (nginx serving the Vite build, proxies `/api` to the backend) | `notarai-frontend` | http://localhost:8080 |
| `backend` (FastAPI) | `notarai-backend` | http://localhost:3001/api/v1 (health: `/health`) |
| `postgres` | `notarai-postgres` | `localhost:5432` |
| `ollama` (local LLM server for classification) | `notarai-ollama` | internal only (`http://ollama:11434`) |
| `ollama-pull` (one-shot: downloads `OLLAMA_MODEL`, then exits) | `notarai-ollama-pull` | — |

```sh
cp .env.example .env            # first time only; adjust ports/credentials if needed
docker compose up -d --build    # build and start everything
docker compose ps               # check health status
docker compose logs -f backend  # follow backend logs
docker compose down             # stop (data persists in named volumes)
docker compose down -v          # stop and wipe the database, documents and models
```

On startup the backend container runs `alembic upgrade head` and `seed.py`
(both idempotent) before starting the API. Set `SKIP_MIGRATIONS=true` on the
`backend` service to skip them.

Uploaded documents are stored in the `notarai_documents` volume, the database
in `notarai_postgres_data` and Ollama models in `notarai_ollama_models`.

**Ollama runs in the `ollama` container.** On first start `ollama-pull`
downloads `OLLAMA_MODEL` (set in the root `.env`, default
`llama3.2-vision:11b`) into the `notarai_ollama_models` volume. That's several
GB. The backend doesn't wait for it: until the model is there, uploads succeed
but classification fails and documents stay `pending_classification` (retry
from the UI). Check progress with `docker compose logs -f ollama-pull`.

- **Memory:** the model must fit in Docker's memory. Give Docker Desktop at
  least 12 GB (Settings → Resources) for a ~6–8 GB vision model.
- **Speed:** the container is CPU-only by default. On a Linux host with an
  NVIDIA GPU, run `docker compose -f docker-compose.yml -f docker-compose.gpu.yml up -d`.
  Docker on macOS can't use the Apple GPU. For speed on a Mac, run Ollama
  natively instead and set `OLLAMA_BASE_URL=http://host.docker.internal:11434`
  in `.env` (the `ollama` container then sits idle).
- **Changing the model:** set `OLLAMA_MODEL` in `.env`, then
  `docker compose up -d` (the pull job fetches the new model).
- **Slow or failing download:** if you already have the model in a native
  Ollama install, you can copy it into the volume instead of downloading it.

The frontend image is built with `VITE_ENABLE_MOCKS=false` and
`VITE_API_BASE_URL=/api/v1`, so it always talks to the real backend.
