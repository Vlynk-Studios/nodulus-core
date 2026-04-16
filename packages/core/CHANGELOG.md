# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.4.0] - 2026-04-16

### Added
- **Identity-First Architecture** [N-28]: Fully transitioned NITS to an identity-first system where `nitsId` is the primary key. Enables stable tracking across renames, moves, and content changes.
- **Content Clone Detection** [N-29]: Implementated hashing-based duplicate detection. Mode configurable via `clonePolicy` ('error' in CI/strict, 'new' in dev).
- **Immutable timestamps** [N-30]: `NitsModuleRecord` now preserves `createdAt` strictly across all reconciliations to track actual module age.
- **Enhanced Bootstrap Resilience**: The `createApp` lifecycle now robustly handles NITS registry I/O failures, falling back to temporary identities with warning logs.

### Fixed
- **checkCommand ID Mapping** [N-34]: Resolved a critical bug where `nodulus check` failed to map IDs because it looked them up by name instead of the new `nitsId` primary key.

## [1.3.1] - 2026-04-12

### Fixed
- **NPM Provenance Synchronization**: Bumped version to sync with `eslint-plugin-nodulus` after a sigstore publishing failure forced a tag re-spin.
- **NITS Scheme Versioning** [A-08]: `NitsRegistry.version` dynamically tracks expected format.
- **Strict Express v5 Typing**: Ensured forwards-compatibility by defending `layer.route` access points in the core app builder.
- **Alias File Emission**: Addressed empty path mapping in `tsconfig.json` generation.

## [1.3.0] - 2026-04-12

### Added
- **ESLint Plugin src/index.ts Entrypoint** [N-14]: Created the canonical entrypoint for @vlynk-studios/eslint-plugin-nodulus, registering all rules without depending on @typescript-eslint/parser. Added modern "exports" field to the plugin's package.json.
- **ESLint Plugin Build Pipeline** [N-15]: Added 	sup.config.ts and a "build": "tsup" script to eslint-plugin-nodulus, enabling its first-ever compiled distribution.
- **Cache Invalidation API** [N-23]: Exported clearDomainCache(), clearSharedAllowedCache(), and clearModuleImportsCache() from module-resolver.ts to prevent state-leakage between tests in the ESLint plugin.
- **Cross-Domain @scope/* Import Support** [N-04]: Updated extractModuleImports to capture any @-scoped import, filtering known NPM scopes to avoid false positives. Enables full compatibility with cross-domain @domain/* aliases.
- **NITS Registry Corruption Warning** [N-25]: loadNitsRegistry now emits a console.warn() with the underlying JSON.parse error message before performing a soft reset on a corrupted registry file.
- **NITS Reconciler Test Coverage** [N-27]: Added tests for identity-conflict healing (Step 2) and dynamic similarity-threshold matching when internalIdentifiers is empty, bringing branch coverage of src/nits to a satisfactory level.

### Changed
- **extractIdentifierCall Robustness** [N-26]: The ESLint plugin's AST parser now handles spread elements and non-literal variables in import option arrays without crashing, emitting a graceful warning instead.
- **getDomainSharedAllowed AST Migration** [N-16]: Replaced the regex-based TypeScript parser in the ESLint plugin with a proper corn AST walk for rigorous extractIdentifierCall analysis, eliminating false positive/negative classification errors.

## [1.2.6] - 2026-04-11

### Added
- **Publish CI Validation**: The NPM publish pipeline now validates that the workflow tag versions exactly match the `package.json` descriptor before dispatching the build to the public registry.
- **Coverage Metrics Baseline**: Bootstrapped robust baseline instrumentation via `@vitest/coverage-v8`, setting dynamic thresholds inside Vite and enforcing total validation in CI environments to prevent regressions.

### Changed
- **Alias Resolution Predictability**: Centralized runtime assertions within the internal module loading bootstrap path to fail-fast (`ALIAS_NOT_FOUND`) if a manually specified path mapping in `nodulus.config` points to a nonexistent directory.

### Fixed
- **Undeclared Import Guard**: Bootstrapping now correctly intercepts undeclared cross-module dependencies at runtime; when combined with `strict: true` the app fails explicitly with an `UNDECLARED_IMPORT` validation error, harmonizing runtime guarantees with the CLI's static analysis.
- **Variable Shadowing Collisions**: Resolved an internal variable scope shadowing defect residing within `sync-tsconfig` logic blocks related to iterator aliases.
- **Wildcard Alias Generation Anomalies**: Synchronizing configurations containing targeted single-file aliases no longer incorrectly emits wildcard boundaries (`/*`) for properties matching discrete resources instead of expansive directory hierarchies.

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
