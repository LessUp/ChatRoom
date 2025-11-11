# Repository Guidelines

## Project Structure & Module Organization
`cmd/server/main.go` bootstraps config, HTTP routing, and the websocket hub. Business logic sits in `internal/*`: `auth` manages tokens, `db` handles persistence, `models` exposes shared structs, `mw` stores HTTP middleware, `ws` orchestrates hub/connection state, and `metrics` surfaces observability hooks. Configuration defaults live in `internal/config/config.go`. Static client files stay in `web/index.html` and `web/app.js`. Add `_test.go` files beside the packages they cover (e.g., `internal/ws/hub_test.go`) so `go test ./...` finds them.

## Build, Test, and Development Commands
- `docker compose up -d postgres` — start the Postgres 16 service defined in `docker-compose.yml`.
- `go run ./cmd/server` — run the API/websocket server against the local database.
- `go build ./cmd/server` — compile a binary; pass `-o bin/chatroom` when packaging.
- `go test ./...` — execute every Go package; add `-race -cover` before merging.

## Coding Style & Naming Conventions
Format code with `gofmt ./...` (tabs, grouped imports) and keep package names short, lowercase, and aligned with their directories. Exported identifiers use `CamelCase`, helpers stay `camelCase`, and JSON tags should remain snake_case to match API payloads. Place shared DTOs in `internal/models`, configuration structs in `internal/config`, and keep frontend filenames in `web/` kebab-case.

## Testing Guidelines
Prefer table-driven tests that mirror the package name, e.g., `package ws` inside `hub_test.go`. Fake dependencies (DB, JWT clock) via interfaces to avoid global state, and run `go test ./internal/db -count=1` whenever queries change. For websocket features, add integration-style tests that exercise `internal/ws/hub` message fan-out and assert metrics counters. Target consistent coverage by running `go test ./... -cover` in CI; note any intentional gaps in the PR description.

## Commit & Pull Request Guidelines
History currently uses short summaries (`init.`); keep subject lines imperative and under ~50 characters, followed by optional wrapped details. Reference issues (`Refs #123`) and call out API, schema, or env changes explicitly. Pull requests need: context, testing evidence (command output or UI screenshots), migration/env checklist, and manual QA steps for websocket flows.

## Security & Configuration Tips
All runtime settings load via `internal/config`: override with `APP_PORT`, `DATABASE_DSN`, `JWT_SECRET`, `APP_ENV`, `ACCESS_TOKEN_TTL_MINUTES`, and `REFRESH_TOKEN_TTL_DAYS`. Store real secrets in your shell or CI vaults rather than the repo, regenerate JWT secrets before promoting environments, and prefer `docker compose exec postgres psql` for ad hoc queries so creds stay inside the container. When logging, favor structured messages and scrub user-supplied payloads, especially in websocket event handlers.
