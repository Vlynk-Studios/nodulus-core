# Nodulus

[![npm version](https://img.shields.io/npm/v/@vlynk-studios/nodulus-core.svg)](https://www.npmjs.com/package/@vlynk-studios/nodulus-core)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D20.6-brightgreen)](https://nodejs.org/)

A lightweight structural layer for Express. Nodulus lets you organise your Node.js application into self-contained modules — handling discovery, route mounting, import aliases, and dependency validation at bootstrap time, with zero overhead at runtime.

> **Node.js ≥ 20.6** · **Express 4.x / 5.x** · **ESM Only** · **TypeScript included**

---

## Why Nodulus?

Express is minimal by design. Nodulus keeps it that way while adding just enough structure to scale:

- **Module discovery** — point it at a glob `src/modules/*` and it finds, validates, and loads every module automatically.
- **Route mounting** — controllers declare their prefix; `createApp()` wires them to Express via `app.use()`.
- **Import aliases** — `@modules/users`, `@config/database` — no more `../../..` paths.
- **Dependency validation** — declare what your module imports and exports; Nodulus catches mismatches before a single request is handled.
- **No magic at runtime** — after bootstrap, Nodulus is out of the way. Express handles requests exactly as normal.

---

## Installation

```bash
npm install @vlynk-studios/nodulus-core
```

Express is a peer dependency:

```bash
npm install express
```

---

## Quick start

```ts
// src/app.ts
import express from 'express'
import { createApp } from '@vlynk-studios/nodulus-core'

const app = express()
app.use(express.json())

const { routes } = await createApp(app, {
  modules: 'src/modules/*',
  prefix: '/api/v1',
  aliases: {
    '@config':     './src/config',
    '@middleware': './src/middleware',
    '@shared':     './src/shared',
  },
  strict: process.env.NODE_ENV !== 'production',
  logger: (level, msg) => console[level](`[nodulus] ${msg}`),
})

app.use(errorHandler) // error middleware always last

console.log(`Mounted routes: ${routes.length}`)
export default app
```

Then run your app with the `--import` flag so that aliases work at runtime:

```bash
node --import @vlynk-studios/nodulus-core/register src/app.ts
```

> This registers the ESM Hook that enables runtime alias resolution. Without this flag, `@modules/*` and folder aliases will not resolve at runtime.

---

## Project structure

Nodulus expects modules in a consistent layout:

```
src/
├── modules/
│   └── users/
│       ├── index.ts            ← required — calls Module('users', ...)
│       ├── users.routes.ts     ← controller (discovered automatically)
│       ├── users.service.ts    ← private business logic
│       └── users.types.ts      ← excluded from controller scan
└── app.ts
```

---

## API

### `createApp(app, options?)`

Bootstraps the entire application. Runs module discovery, alias resolution, controller mounting, and validation in a deterministic sequence. Throws a `NodulusError` before mounting any routes if anything is invalid — the app is never left in a partial state.

```ts
createApp(app: Application, options?: CreateAppOptions): Promise<NodulusApp>
```

| Option | Type | Default | Description |
|---|---|---|---|
| `modules` | `string` | `'src/modules/*'` | Glob pointing to module folders |
| `domains` | `string` | `undefined` | Glob pointing to domain folders (v2.0.0+) |
| `shared` | `string` | `undefined` | Glob pointing to shared global folders (v2.0.0+) |
| `prefix` | `string` | `''` | Global route prefix (e.g. `'/api/v1'`) |
| `aliases` | `Record<string, string>` | `{}` | Folder aliases beyond the auto-generated `@modules/*` |
| `strict` | `boolean` | `true` in dev | Enables circular-dependency detection and undeclared-import errors |
| `resolveAliases` | `boolean` | `true` | Disable if you resolve aliases with a bundler |
| `logger` | `LogHandler` | `defaultLogHandler` | Custom log handler (supports Pino, Winston, etc.) |
| `logLevel` | `LogLevel` | `'info'` | Minimum severity for log events |

Returns `NodulusApp`:

```ts
interface NodulusApp {
  modules:  RegisteredModule[]
  routes:   MountedRoute[]
  registry: NodulusRegistry
}
```

---

### `Module(name, options?)`

Declares a module and registers its metadata in the registry. **Must** be called from the module's `index.ts` (or `index.js`), and the `name` **must match the containing folder name exactly** — Nodulus enforces this as a structural rule.

```ts
// src/modules/orders/index.ts
import { Module } from '@vlynk-studios/nodulus-core'

Module('orders', {
  description: 'Purchase order management',
  imports: ['users', 'payments'],
  exports: ['OrderService', 'createOrderSchema'],
})

export { OrderService }       from './orders.service.js'
export { createOrderSchema }  from './orders.schema.js'
```

| Option | Type | Description |
|---|---|---|
| `imports` | `string[]` | Modules this module depends on |
| `exports` | `string[]` | Public API names — validated against real exports at bootstrap |
| `description` | `string` | Documentation / future tooling |

> **Rule**: The name passed to `Module()` must equal the directory name. `Module('orders')` inside `src/modules/billing/` will throw `INVALID_MODULE_DECLARATION`.

---

### `Controller(prefix, options?)`

Declares a file as an Express controller. The controller name is derived automatically from the filename. The file **must** have a `default export` of an Express `Router`.

```ts
// src/modules/users/users.routes.ts
import { Controller } from '@vlynk-studios/nodulus-core'
import { Router } from 'express'
import { requireAuth } from '@middleware/auth.js'
import { UserService } from './users.service.js'

Controller('/users', {
  middlewares: [requireAuth],
})

const router = Router()

router.get('/', async (req, res, next) => {
  try {
    res.json(await UserService.findAll())
  } catch (err) {
    next(err)
  }
})

router.post('/', async (req, res, next) => {
  try {
    res.status(201).json(await UserService.create(req.body))
  } catch (err) {
    next(err)
  }
})

export default router
```

| Parameter | Type | Description |
|---|---|---|
| `prefix` | `string` | Route prefix for this controller (e.g. `'/users'`) |
| `options.middlewares` | `RequestHandler[]` | Middlewares applied to all routes in this controller. Default: `[]` |
| `options.enabled` | `boolean` | If `false`, `createApp()` ignores this controller entirely. Default: `true` |

Nodulus mounts each controller as:

```ts
app.use(globalPrefix + controllerPrefix, ...middlewares, router)
```

---

### Domain Identifiers

To guarantee accurate error-tracing, structured logs, and framework-level validation, label your business logic with domain identifiers. They capture stack metadata to bind exports effectively to their parent module without any extra configuration.

```ts
import { Service, Repository, Schema } from '@vlynk-studios/nodulus-core'
import { z } from 'zod'

Service('UserService')
Repository('UserRepository', { source: 'database' })
Schema('UserSchema', { library: 'zod' })
```

Unlike `Controller` or `Module`, these identifiers do not alter runtime execution traces or wrap payloads—they simply announce presence and ownership into the `NodulusRegistry`.

> **Note:** Nodulus is validation-agnostic. While examples use Zod, you can use Joi, TypeBox, or any other library.

---

### Import aliases

Nodulus registers two kinds of aliases:

- **Module aliases** — auto-generated for every discovered module:
  ```
  @modules/<n> → src/modules/<n>/index.ts
  ```
- **Folder aliases** — configured in `createApp()` or `nodulus.config.ts`:
  ```
  @config     → src/config/
  @middleware → src/middleware/
  ```

Use them anywhere in your code:

```ts
import { UserService } from '@modules/users'
import { db }          from '@config/database.js'
```

> [!IMPORTANT]
> Nodulus is an **ESM-only** framework. It requires `"type": "module"` in your `package.json`. 
> Dynamic runtime alias resolution relies on the Node.js ESM Hooks API (`--import` or `register`).

For bundler-based projects (Vite, Esbuild, etc.), you can disable the runtime hook and inject `getAliases()` directly into your config:

```ts
// vite.config.ts
import { getAliases } from '@vlynk-studios/nodulus-core'

const aliases = await getAliases()

export default {
  resolve: { alias: aliases }
}
```

```ts
// esbuild.config.ts
import { getAliases } from '@vlynk-studios/nodulus-core'
import * as esbuild from 'esbuild'

const aliases = await getAliases()

await esbuild.build({
  entryPoints: ['src/index.ts'],
  alias: aliases,
  bundle: true,
  outfile: 'dist/app.js'
})
```

`getAliases()` accepts a `GetAliasesOptions` object:

| Option | Type | Default | Description |
|---|---|---|---|
| `includeFolders` | `boolean` | `true` | If `false`, config-defined folder aliases are excluded (returns only auto-generated `@modules/*` aliases) |
| `absolute` | `boolean` | `false` | If `true`, returned paths are absolute |

---

### `nodulus.config.ts`

Centralise configuration in the project root. Options passed directly to `createApp()` take priority over the file.

```ts
// nodulus.config.ts
import type { NodulusConfig } from '@vlynk-studios/nodulus-core'

const config: NodulusConfig = {
  modules: 'src/modules/*',
  prefix: '/api/v1',
  strict: process.env.NODE_ENV !== 'production',
  aliases: {
    '@config':     './src/config',
    '@middleware': './src/middleware',
    '@shared':     './src/shared',
  },
}

export default config
```

Config file loading order (first match wins):

1. `nodulus.config.ts` — development only
2. `nodulus.config.js` — always

---

## CLI Tools

Nodulus provides a built-in CLI to enforce conventions effortlessly and improve developer experience without memorizing boilerplate.

### `nodulus create-module <n>`

Scaffolds a perfectly structured module conforming to the framework constraints instantaneously.

```bash
npx nodulus create-module payments
```

```text
✔ Module 'payments' created successfully at src/modules/payments/
  index.ts
  payments.routes.ts
  payments.service.ts
  payments.repository.ts
  payments.schema.ts
```

| Option | Description |
|---|---|
| `--path <path>` | Sets a custom absolute or relative destination |
| `--no-repository` | Omits the repository file |
| `--no-schema` | Omits the schema file |

### `nodulus sync-tsconfig`

Because nodulus dynamically discovers modules and configures `@modules/*` ES Hooks aliases, Node.js can recognize your code immediately. However, IDEs and TypeScript demand static assertions. This command bridges the gap by injecting your dynamic nodulus module aliases safely onto `compilerOptions.paths`.

```bash
npx nodulus sync-tsconfig
```

```text
✔ tsconfig.json updated — 3 module(s), 2 folder alias(es)
Added paths:
  @modules/users      → ./src/modules/users/index.ts
  @modules/auth       → ./src/modules/auth/index.ts
  @config/*           → ./src/config/*
```

Run this command initially, and whenever you create, rename, or drop modules in the project. It behaves idempotently and automatically purges references to modules that were deleted.

### `nodulus check`

Performs static code architecture analysis by inspecting raw Abstract Syntax Trees (AST) across your module structures without mutating or evaluating your application code.

```bash
npx nodulus check
```

```text
Nodulus Architecture Analysis

✔ orders — OK
✗ payments — 2 problem(s)
  WARN  Private import detected: module "payments" directly imports internal path from "@modules/users/users.repository.js". (payments.service.ts:3)
       Suggestion: Import only the public index: "@modules/users".
✔ users — OK

2 problem(s) found.
```

| Option                 | Description                                                                              |
|------------------------|------------------------------------------------------------------------------------------|
| `--strict`             | Gracefully halts pipelines (`exit 1`) if architectural violations are mapped. Ideal for CI/CD gates. |
| `--module <name>` | Narrow the analysis exclusively to a specific module scope within your system.           |
| `--format <json,text>` | Exposes structural violations as digestible JSON payloads for external pipelines.        |
| `--no-circular`        | Disables heavy Depth-First Search cycle logic detections (`A → B → A`).             |

---

### NITS Identity Tracking

Nodulus 1.4.0+ includes the **NITS (Nodulus Integrated Tracking System)**, which assigns a stable, unique ID to every module. This allows the framework to track modules even when they are renamed or moved across the filesystem, preventing identity loss during refactors.

NITS maintains a state file at `.nodulus/registry.json` in your project root. **This file should be committed to version control.**

#### Resolving Merge Conflicts

Because `registry.json` tracks project-level state, parallel branches might occasionally result in Git merge conflicts. To resolve them:

1.  **Accept either side** (or both) of the conflict to make the JSON valid again.
2.  Run `npx nodulus check`.
3.  The NITS reconciler will automatically detect duplicate IDs or path shifts, "heal" the registry, and save the corrected state.
4.  Commit the updated `.nodulus/registry.json`.

---

## Logging

Nodulus emits structured, color-coded log events throughout the bootstrap pipeline using [picocolors](https://github.com/alexeyraspopov/picocolors).

### Default behavior

| Environment | Default level | Output |
|---|---|---|
| Development | `info` | Modules loading, routes mounting, startup duration |
| Any | `warn` / `error` | Written to `stderr`; everything else to `stdout` |
| Debug | `debug` | Set `NODE_DEBUG=nodulus` to see file scans and alias registrations |

### Using a custom logger (Pino)

The `LogHandler` signature is compatible with most modern loggers:

```ts
import pino from 'pino'
const log = pino()

await createApp(app, {
  logger: (level, message, meta) => {
    log[level]({ ...meta, framework: 'nodulus' }, message)
  }
})
```

### Total silence

```ts
await createApp(app, {
  logger: () => {} // Silences all output regardless of level
})
```

---

## Error handling

All Nodulus errors are instances of `NodulusError` and carry a machine-readable `code`:

```ts
import { NodulusError } from '@vlynk-studios/nodulus-core'

try {
  await createApp(app, { modules: 'src/modules/*' })
} catch (err) {
  if (err instanceof NodulusError) {
    console.error(err.code)    // 'EXPORT_MISMATCH'
    console.error(err.message) // human-readable description
    console.error(err.details) // additional context (path, module name, etc.)
  }
  process.exit(1)
}
```

| Code | When it's thrown |
|---|---|
| `MODULE_NOT_FOUND` | Discovered folder has no `index.ts` / `index.js`, or `index.ts` does not call `Module()` |
| `INVALID_MODULE_DECLARATION` | `Module()` name doesn't match folder name, or an Identifier (Service, Schema, etc) is declared incorrectly or fails to detect caller bounds |
| `DUPLICATE_MODULE` | Two modules share the same name |
| `MISSING_IMPORT` | Module listed in `imports` does not exist in the registry |
| `UNDECLARED_IMPORT` | Module imports from another not listed in `imports` (strict only) |
| `CIRCULAR_DEPENDENCY` | A dependency cycle was detected (strict only) |
| `EXPORT_MISMATCH` | Name declared in `exports` is not an actual export of `index.ts` |
| `INVALID_CONTROLLER` | Controller file has no `default export` of an Express `Router` |
| `ALIAS_NOT_FOUND` | Configured alias points to a directory that does not exist |
| `DUPLICATE_ALIAS` | Two aliases resolve to the same name but different paths |
| `DUPLICATE_BOOTSTRAP` | `createApp()` called more than once with the same Express instance |
| `REGISTRY_MISSING_CONTEXT` | A Nodulus API was called outside of a `createApp()` async context |
| `INVALID_ESM_ENV` | `createApp()` called in a non-ESM environment (missing `"type": "module"` in `package.json`) |

---

## Advanced usage

### `getRegistry()`

Returns the read-only registry bound to the current async execution context. Only callable within a `createApp()` scope.

> [!CAUTION]
> **@unstable API**: Intended for advanced framework integrations and debugging. Structure may change without a major version bump.

```ts
import { getRegistry } from '@vlynk-studios/nodulus-core'

const registry = getRegistry()
const allModules = registry.getAllModules()  // RegisteredModule[]
const alias      = registry.resolveAlias('@modules/users')
```

`NodulusRegistry` interface:

```ts
interface NodulusRegistry {
  hasModule(name: string): boolean
  getModule(name: string): RegisteredModule | undefined
  getAllModules(): RegisteredModule[]
  resolveAlias(alias: string): string | undefined
  getAllAliases(): Record<string, string>
}
```

---

## Use cases

### Microservices
Isolate each domain into a module and share types through `@modules/shared`. Each service stays lean with zero cross-cutting concerns.

### Monoliths
Enforce clean module boundaries at bootstrap, not code review. Nodulus catches circular dependencies and missing imports before your server starts.

### Fast prototyping
Scaffold a new feature by creating a folder and an `index.ts`. Nodulus handles all the boilerplate of wiring routes and middlewares.

---

## Requirements

| | Minimum |
|---|---|
| Node.js | 20.6.0 |
| Express | 4.x or 5.x |
| TypeScript | 5.0+ (optional) |

> **Why 20.6?** Nodulus uses the Node.js [ESM Hooks API](https://nodejs.org/api/module.html#customization-hooks) (`--import` / `register`) for runtime alias resolution. Native support without `--experimental-loader` requires Node 20.6+.

---

## ESM Only

Nodulus is built as a pure ESM package. It does not support CommonJS (`require()`).

```ts
import { createApp, Module, Controller } from '@vlynk-studios/nodulus-core'
```

> **Note:** Runtime alias resolution uses the ESM Hooks API. Ensure your `package.json` contains `"type": "module"`.

---

## TypeScript

Types are bundled — no `@types/nodulus` needed.

```ts
import type {
  CreateAppOptions,
  NodulusApp,
  NodulusRegistry,
  NodulusConfig,
  NodulusError,
  ModuleOptions,
  ControllerOptions,
  RegisteredModule,
  MountedRoute,
  GetAliasesOptions,
  ModuleRegistration,
  FeatureRegistration,
  LogLevel,
  LogHandler,
} from '@vlynk-studios/nodulus-core'
```

---

## License

MIT

---

Developed and maintained by **Vlynk Studios**.
