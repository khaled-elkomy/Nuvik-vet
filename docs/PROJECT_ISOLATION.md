# Nuvik Vet — Project Isolation

## Applied local allocation

Immediately before configuration changes, Windows listener checks showed no listeners on 5178, 4108, 8090, or 8449. Docker showed the Graduation Project frontend publishing 8088, and its configuration identifies the project as HTI Learning Hub. Nuvik intentionally avoids that port.

| Service | Host port | Internal container port | Exposure |
|---|---:|---:|---|
| Frontend (Vite) | 5178 | 5178 | Loopback only |
| Backend/API | 4108 | 4108 | Loopback only |
| PostgreSQL | Not published | 5432 | Private `nuvik-vet-net` only |
| Nginx HTTP | 8090 | 80 | Loopback only |
| Nginx HTTPS | 8449 | 443 | Loopback only; local certificate required |

Windows listener state is only a snapshot; recheck before first startup. Docker config validation does not reserve ports or start services.

## Docker and database boundaries

- Compose declares project `nuvik-vet`; all documented Compose commands explicitly pass `-p nuvik-vet`.
- Unique containers: `nuvik-vet-postgres`, `nuvik-vet-api`, `nuvik-vet-web`, and `nuvik-vet-nginx`.
- Unique network: `nuvik-vet-net`. Unique named volumes: `nuvik_vet_pgdata` and `nuvik_vet_uploads`.
- PostgreSQL uses database `nuvik_vet` and dedicated credentials from ignored `.env.nuvik`. It has no host `ports` mapping; API access uses `nuvik-vet-db:5432` on the private network.
- `.env.nuvik.example` contains placeholders only. `.env.nuvik` contains independently generated local DB/JWT secrets and is ignored by Git. Compose must be given `--env-file .env.nuvik`. The Nuvik copy's ignored root and server `.env` files now contain Nuvik-specific settings; the server DB hostname is only resolvable on the private Compose network.
- Root and server Docker build contexts exclude local environment files, build output, dependencies, uploads, and local TLS private key/certificate files.
- Nginx publishes only loopback host bindings. HTTP config is loaded independently. A container entrypoint helper adds the HTTPS server block only when both local certificate files `nginx/certs/localhost.crt` and `nginx/certs/localhost.key` are nonempty; absent files leave HTTP available. Certificates and keys must not be committed.
- Nginx and the upload route request guard cap multipart request bodies at 50 MiB; Multer caps individual file payloads at 50,000,000 bytes. Express JSON remains separately capped at 2 MiB.
- The inherited `server/migrations` directory is neither mounted into PostgreSQL's init directory nor copied into the API image. Until a clean Nuvik migration plan exists, the database remains schema-empty and the app is not ready for first startup.
- Do not use broad Docker cleanup. The documented stop command targets the project and does not remove volumes.

## Browser and authentication isolation

The current app uses bearer JWTs and does not issue or consume authentication cookies; therefore no auth cookie name is active or shared. The browser token key is `nuvik_vet_auth_token`, distinct from the inherited `clinic_token`, and the Nuvik frontend uses a separate origin/port. If cookie authentication is added later, use a unique name such as `nuvik_vet_session`, `HttpOnly`, `Secure` under HTTPS, appropriate `SameSite`, and CSRF protection.

Nuvik uses a dedicated generated local JWT secret, issuer `nuvik-vet`, and audience `nuvik-vet-api`. The API validates issuer and audience for both HTTP and Socket.IO token verification. API origins are limited to the Nuvik direct-dev and local proxy origins. Vite and Nginx proxy `/api`, `/socket.io`, and public logo paths to the Nuvik API services.

## Latest inspected conflicts

- **8088:** occupied by active container `gradupro-frontend-1` and reserved in the Graduation Project / HTI Learning Hub Vite and Compose configuration. Never assign it to Nuvik.
- **5178, 4108, 8090, 8449:** no Windows listeners or Docker host mappings observed immediately before applying this configuration; accessible sibling project configs did not reserve these candidates.
- **PostgreSQL 5432:** used internally by several stacks. Nuvik does not publish it to Windows and uses its own Compose network and volume.
- Human Clinic configuration was found under `Nuvic clinic`; it uses its own config and was not modified. No relevant config was found under `dsp`.
- Legacy API test/verify helpers have been redirected from `localhost:4001` to `127.0.0.1:4108`; the CORS helper now uses the Nuvik frontend origin, and root `test-server.js` binds an OS-assigned loopback port. They still contain Human Clinic fixtures and may mutate the Nuvik API/database at 4108, so they must not be run until converted to disposable Nuvik test fixtures and a dedicated test database.

## Environment and operational checks

Use only `.env.nuvik` with Compose and keep it out of source control. The example file is not a credential source for production. Production should use managed secrets, TLS, restricted database networking, separate deployment settings, and secret rotation. Never mutate global environment variables or shared shell profiles.

Before a future startup:

1. Recheck Windows listeners and Docker port publications, especially the approved candidate ports.
2. Run `docker compose -p nuvik-vet --env-file .env.nuvik -f docker-compose.yml config --quiet`.
3. Confirm PostgreSQL has no host port mapping and all names/volumes/networks carry the Nuvik identity.
4. Add and verify local certificates only if optional HTTPS on 8449 is needed; missing certificates must leave HTTP on 8090 available.
5. Do not start the API until the Nuvik-only schema and explicit migration runner are reviewed and ready; the inherited migrations will not auto-run.
6. Review the exact `-p nuvik-vet` command before starting or stopping; never remove volumes as part of normal shutdown.
