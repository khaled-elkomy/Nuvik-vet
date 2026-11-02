# Nuvik Vet — Architecture and Local Configuration

NUVIK VET is planned as a veterinary clinic, pet boarding and pet store management system. This repository began as a copied human clinic application; product features remain pending, but its local development configuration is now isolated under the `nuvik-vet` Docker Compose project.

## Architecture documents

- [System architecture](docs/SYSTEM_ARCHITECTURE.md)
- [Database design](docs/DATABASE_DESIGN.md)
- [User workflows](docs/USER_WORKFLOWS.md)
- [UI/UX guidelines](docs/UI_UX_GUIDELINES.md)
- [Implementation plan](docs/IMPLEMENTATION_PLAN.md)
- [Project isolation](docs/PROJECT_ISOLATION.md)
- [Migration audit](docs/MIGRATION_AUDIT.md)
- [Open questions](docs/OPEN_QUESTIONS.md)

## Local ports and isolation

| Service | Host port | Container port | Exposure |
|---|---:|---:|---|
| Frontend (Vite) | 5178 | 5178 | Loopback |
| Backend/API | 4108 | 4108 | Loopback |
| PostgreSQL | Not published | 5432 | Private Compose network |
| Nginx HTTP | 8090 | 80 | Loopback |
| Nginx HTTPS | 8449 | 443 | Loopback; local TLS certificate required |

Port 8088 is already used by the Graduation Project / HTI Learning Hub and is intentionally not assigned to Nuvik Vet. The approved candidate ports were rechecked against Windows listeners and Docker publications immediately before these changes. They were clear at that snapshot; recheck before any later startup.

Compose declares project `nuvik-vet`, unique containers, network `nuvik-vet-net`, and volumes `nuvik_vet_pgdata` and `nuvik_vet_uploads`. PostgreSQL has no Windows host port mapping. The API reaches it as `nuvik-vet-db:5432` on the private network.

The ignored `.env.nuvik` file contains independently generated local database and JWT secrets; Compose commands must pass `--env-file .env.nuvik`. The Nuvik copy's ignored root `.env` and `server/.env` now contain only Nuvik-specific development settings; the server's database hostname resolves only on the private Compose network. `.env.nuvik.example` has placeholders only. Docker build contexts exclude local environment files and credentials.

## Configuration validation

This validates Compose configuration and does not start containers:

```powershell
docker compose -p nuvik-vet --env-file .env.nuvik -f docker-compose.yml config --quiet
```

## Local stack commands

**Do not start the application stack yet.** The inherited Human Clinic migrations are not mounted or copied into the API image. The Nuvik schema and explicit migration runner still need to be designed, reviewed, and applied to a fresh Nuvik database before the API can function.

Use `http://localhost:5178` for the frontend directly, or `http://localhost:8090` through Nginx after the schema/startup blocker is cleared. HTTPS at `https://localhost:8449` is optional and loads only when both local-only `nginx/certs/localhost.crt` and `nginx/certs/localhost.key` exist. Missing certificates leave HTTP enabled. Do not commit certificates or private keys. Compose validation does not test Nginx syntax.

Multipart uploads are capped at 50 MB per file, with a 50 MiB request-body cap at the proxy and API upload middleware. JSON requests remain limited to 2 MB; that parser does not handle multipart uploads.

## Browser authentication isolation

The current client uses bearer JWTs, not authentication cookies. Tokens are stored under the Nuvik-only browser key `nuvik_vet_auth_token`; the frontend origin has its own port. The API signs and verifies tokens using a dedicated local secret, issuer `nuvik-vet`, and audience `nuvik-vet-api`. The Vite and Nginx proxies route `/api` and `/socket.io` consistently.

## Product status

The code still contains inherited human-clinic functionality and historical test helpers. Legacy API test targets were redirected to Nuvik's loopback API port; the root test server now uses an ephemeral loopback port. Those helpers still use human-clinic fixtures and may mutate whichever API/database is listening on 4108, so do not run them until they are replaced with isolated test fixtures and a disposable Nuvik test database. The product is not production-ready; veterinary data/workflows, tenant authorization, monitoring, and tested backup/restore work remain planned.
