# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.5] - 2026-04-11

### Added
- **Configurable NITS Registry**: The NITS registry path is now configurable via `nits.registryPath` in `nodulus.config.ts` (defaults to `.nodulus/registry.json`).
- **Internal Compatibility Layer**: Prepared core structures for upcoming v1.3.0 and v2.0.0 features (Domains, Shared Layouts, and Submodules).
- **Public Registration Types**: Exported `ModuleRegistration` and `FeatureRegistration` types for enhanced framework integrations and tooling.
- **NITS Identity Tracking**: Nodulus 1.2.5+ includes the **NITS (Nodulus Integrated Tracking System)**, which assigns a stable, unique ID to every module.

### Changed
- **Encapsulated Public API**: Refactored `src/index.ts` to use explicit named exports, hiding internal registry logic and internal types from the public surface.
- **Express v5 Alignment**: Updated `peerDependencies` to require `express >= 5.0.0`, enforcing compatibility with the project's native Express 5 types.
- **ESM Hook Cleanup**: Removed legacy `__filename` checks in the alias resolver, optimizing for a pure ESM environment.
- **CI/CD Stability**: Updated root `package.json` scripts (`build`, `test`, `typecheck`) with `--if-present` to prevent build failures when some workspaces lack these scripts.
- **CLI Robustness**: Centralized CLI error handling in `cli/index.ts`, removing direct `process.exit()` calls to improve testability and reliability.
- **Type Safety**: Eliminated `any` types in `ast-parser.ts` and `resolver.ts`, transitioning to strict `estree` and `node` types.
- **Async I/O Migration**: Refactored `sync-tsconfig` and identifier parsers to use asynchronous file operations for non-blocking execution.
- **ESM Hook Stability**: Implemented a singleton promise pattern in the ESM alias resolver to prevent race conditions during concurrent activations.

### Fixed
- **Phantom Types Elimination**: Removed the legacy `types/` directory and corrected `tsconfig.json` to prevent re-generation of invalid type definitions.
- **Alias Resolution Consistency**: Resolved a major discrepancy where `@modules/*` aliases resolved differently in runtime vs `tsconfig.json`. Now both use consistent dual-mapping (index file + directory wildcard).
- **Custom Alias Precision**: Fixed a bug where wildcard suffixes (`/*`) were incorrectly forced on aliases pointing to single files instead of directories.
- **Unimplemented Feature Warnings**: Added helpful warnings when detected configuration keys (`domains`, `shared`) that are not yet natively supported in the v1.x branch.
- **CLI Precision**: Fixed a bug in the global error handler where exit code `0` was shadowed by `1`.
- **Parsing Resilience**: Resolved a syntax error in the `check` command that caused failures during bulk analysis.
- **Isolated Alias Logic**: Extracted tsconfig path generation into a pure utility function.

## [1.2.0] - 2026-04-09

### Added
- **CLI Command `check`**: Added static code analysis to enforce boundaries via fast AST parsing (`acorn`). Uncovers architectural violations before loading.
- **Rule Detection Mechanisms**: Captures circular dependencies, deep private imports, and undeclared external imports between modules.
- **CI/CD Integration Tools**: `--strict` mode forcing process exits on rule breakage and `--format json` payload schema reports.

## [1.1.0] - 2026-04-08

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
