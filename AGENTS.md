<!-- OPENSPEC:START -->
# OpenSpec Instructions

These instructions are for AI assistants working in this project.

Always open `@/openspec/AGENTS.md` when the request:
- Mentions planning or proposals (words like proposal, spec, change, plan)
- Introduces new capabilities, breaking changes, architecture shifts, or big performance/security work
- Sounds ambiguous and you need the authoritative spec before coding

Use `@/openspec/AGENTS.md` to learn:
- How to create and apply change proposals
- Spec format and conventions
- Project structure and guidelines

Keep this managed block so 'openspec update' can refresh the instructions.

<!-- OPENSPEC:END -->

# che-server (TypeScript) - AI Agent Instructions

**Purpose**: This repository contains a TypeScript/Fastify implementation of a *subset* of Eclipse Che Server REST APIs. The goal is to be an **image-only replacement** for the Java `che-server` for the supported endpoints (parity-focused, no extra dashboard-backend endpoints).

**Tech stack**:
- TypeScript + Node.js + Fastify
- Yarn (classic Yarn config via `.yarn/` and `.yarnrc.yml`)
- Jest (tests), ESLint/TS (lint), webpack (build)
- Kubernetes/OpenShift integration via `@kubernetes/client-node`

## Supported runtime endpoints (current)

- **Kubernetes namespace**:
  - `POST /api/kubernetes/namespace/provision`
  - `GET /api/kubernetes/namespace`
- **Factory**:
  - `POST /api/factory/resolver`
  - `POST /api/factory/token/refresh`
- **OAuth 2.0**:
  - `GET /api/oauth`
  - `GET /api/oauth/token`
  - `DELETE /api/oauth/token`
  - `GET /api/oauth/authenticate`
  - `GET /api/oauth/callback`
- **OAuth 1.0a** (Bitbucket Server parity):
  - `GET /api/oauth/1.0/authenticate`
  - `GET /api/oauth/1.0/callback`
  - `GET /api/oauth/1.0/signature`
- **SCM**:
  - `GET /api/scm/resolve`
- **System**:
  - `GET /api/system/state`
  - `POST /api/system/stop`
- **Compatibility**:
  - `GET /api/user/id` (dashboard compatibility; hidden from Swagger)
- **Swagger**:
  - `GET /swagger` (UI), `GET /swagger/json`, `GET /swagger/yaml`
- **Health**:
  - `GET /health`

## Authentication model (important)

- **Primary (production)**: Che Gateway identity headers (`gap-auth`, `x-forwarded-user`, etc.)
- **Local/dev**: test Bearer format `Authorization: Bearer <userid>:<username>`
- **Bearer-only**: Basic auth is not supported.
- **TokenReview disabled**: this implementation intentionally does **not** call Kubernetes TokenReview (avoids cluster-wide RBAC requirements).

## Kubernetes access model (important)

Many Kubernetes operations are executed using a **Che-service-account-style token**:
- **In-cluster**: mounted ServiceAccount token file (`/run/secrets/kubernetes.io/serviceaccount/token`)
- **Local development** (`LOCAL_RUN=true`): `USER_TOKEN="$(oc whoami -t)"` (preferred), or `SERVICE_ACCOUNT_TOKEN` (legacy alias)

Do not introduce new requirements for cluster-wide RBAC objects (ClusterRole/ClusterRoleBinding). Keep behavior compatible with a default Che install.

## Common dev commands

- **Start local dev**: `./run/start-local-dev.sh`
- **Run tests**: `yarn test`
- **Lint**: `yarn lint:check` (or `yarn lint:fix`)
- **License headers**: `yarn header:check` / `yarn header:fix`
- **Build container image**: `./build/build.sh` (uses `./scripts/container_tool.sh`)
- **Patch CheCluster image**: `./scripts/patch-che-server-image.sh`

## Project conventions

- **Prefer `./scripts/container_tool.sh`** in docs/scripts (not raw `docker`/`podman`).
- **Avoid noisy per-request logs**. Keep logs actionable.
- **No personal URLs/tokens** in docs/examples.

## Red Hat compliance and responsible AI rules

See `./redhat-compliance-and-responsible-ai.md` and the Cursor rules file under `./.cursor/rules/`.