# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Dashboard search.** Ingest a document, then search it from the same page. Same per-user `rag_search` pipeline Claude uses — no MCP client required to see if ingest worked.
- This changelog, so weekend drips have a source of truth.

### Fixed

- **`npm ci` on GitHub Actions.** The lockfile now includes optional `@esbuild/*` platform packages (including `@esbuild/linux-x64`). Dependabot PRs were red for the missing optional, not for the bumps themselves.

### Security

- hono 4.12.29 → 4.13.1
- @hono/node-server 1.19.14 → 1.19.17
- nanoid 3.3.15 → 3.3.18
- js-yaml 4.3.0 → 4.3.1
- fast-uri 3.1.3 → 3.1.5
- ip-address 10.2.0 → 10.4.0
- postcss 8.5.16 → 8.5.26
- next / eslint-config-next 16.2.10 → 16.3.2 (reviewed; lint, typecheck, and tests stayed green)
