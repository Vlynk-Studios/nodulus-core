# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-04-05

### Added
- **Core structural layer**: Automatic module discovery and controller registration for Express apps.
- **Bootstrapping**: Robust `createApp()` pipeline with performance metrics and validation.
- **Logging System**: Color-coded, structured logging with `picocolors` and injectable handlers.
- **Isolation**: Per-execution registry isolation using `AsyncLocalStorage` to prevent state contamination.
- **ESM Aliases**: Seamless `@modules/*` and custom folder aliases via Node.js Hooks API.
- **Strict Mode**: Validation for circular dependencies and undeclared cross-module imports.
- **Dual-Package**: Ships both ESM and CJS bundles with bundled TypeScript declarations.

### Changed
- Rebranded project from "Modular" to "Nodulus".
- Updated minimum Node.js requirement to `v20.6.0+` for native ESM hook support.
- Refined `NodulusError` structure with clearer cause/solution messages.

### Fixed
- Fixed race conditions and duplicate registration errors in hot-reloading scenarios.
- Fixed ESM module caching issues in high-frequency integration tests.
