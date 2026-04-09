# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - Unreleased

### Changed
- Centralized stack trace capture logic for identifiers (`getCallerInfo`) into a single internal helper `src/core/caller.ts` resolving DRY violations.
- Restringed public API surface on `src/index.ts`. Internal utilities `loadConfig` and `DEFAULTS` are no longer exported.
- Simplified schema generation scaffolding avoiding hard dependency assumptions (`import { z } from 'zod'`).
- JSDoc explicitly addresses the inverse filtering logic behind the `includeFolders` flag inside `getAliases`.
- Rigorous isolation properties assigned strictly atop Vitest configuration (`pool: forks`, `testTimeout`).
- Renamed testing suite strings internally stripping hardcoded framework versions (`V1.0.0`) enhancing legibility.

### Deprecated
- `ERROR_MESSAGES` en `errors.ts` ha sido marcado como deprecado y será eliminado en v2.0.0. Los mensajes reales se definen en el lugar donde se lanza la excepción.

### Fixed
- Fixed bug causing misleading error mappings (`REGISTRY_MISSING_CONTEXT`) across non-express Identifiers when caller bounds fail. They correctly throw `INVALID_MODULE_DECLARATION`.
- Reorganized `activateAliasResolver` destructuring spread prioritizing user configuration aliases over auto-generated module ones.
- Removed unreachable condition branch inside `createApp.ts` unlocking proper stdout logs for explicitly disabled controllers.
- `sync-tsconfig` sweeps properly stale config aliases that follow the heuristic trailing completion logic.
- Resolved hardcoded versions in CLI metadata: `nodulus --version` properly pulls the underlying release version dynamically from `package.json`.

## [1.0.0] - 2026-04-05

### Added
- **Core structural layer**: Automatic module discovery and controller registration for Express apps.
- **Nodulus CLI**: Shipped the `nodulus` binary with `create-module` (scaffolding) and `sync-tsconfig` (IDE sync) commands.
- **Identifiers**: Added `Service()`, `Repository()`, and `Schema()` structural markers for registering domain concepts alongside `Controller()`.
- **Bootstrapping**: Robust `createApp()` pipeline with performance metrics and validation.
- **Logging System**: Color-coded, structured logging with `picocolors` and injectable handlers.
- **Isolation**: Per-execution registry isolation using `AsyncLocalStorage` to prevent state contamination.
- **ESM Aliases**: Seamless `@modules/*` and custom folder aliases via Node.js Hooks API.
- **Strict Mode**: Validation for circular dependencies and undeclared cross-module imports.

### Changed
- Rebranded project from "Modular" to "Nodulus".
- **ESM-Only Architecture**: Dropped CommonJS support; Nodulus now requires `"type": "module"` in `package.json`.
- Updated minimum Node.js requirement to `v20.6.0+` for native ESM hook support.
- Refined `NodulusError` structure with clearer cause/solution messages.

### Fixed
- Fixed race conditions and duplicate registration errors in hot-reloading scenarios.
- Fixed ESM module caching issues in high-frequency integration tests.
