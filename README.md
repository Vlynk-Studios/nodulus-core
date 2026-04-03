# Nodulus

A lightweight structural layer for Express. Nodulus lets you organise your Node.js application into self-contained modules — handling discovery, route mounting, import aliases, and dependency validation at bootstrap time, with zero overhead at runtime.

> **Node.js ≥ 18** · **Express 4.x / 5.x** · **ESM & CJS** · **TypeScript included**

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
npm install nodulus
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
import { createApp } from 'nodulus'

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

---

## Project structure

Nodulus expects modules in a consistent layout:

```
src/
├── modules/
│   └── users/
│       ├── index.ts            ← required — declares the module
│       ├── users.routes.ts     ← controller (discovered automatically)
│       ├── users.service.ts    ← private
│       └── users.types.ts      ← excluded from controller scan
└── app.ts
```

---

## API

### `createApp(app, options?)`

Bootstraps the entire application. Runs module discovery, alias resolution, controller mounting, and validation in a deterministic sequence. Throws a `NodularError` before mounting any routes if anything is invalid — the app is never left in a partial state.

```ts
createApp(app: Application, options?: CreateAppOptions): Promise<NodularApp>
```

| Option | Type | Default | Description |
|---|---|---|---|
| `modules` | `string` | `'src/modules/*'` | Glob pointing to module folders |
| `prefix` | `string` | `''` | Global route prefix (e.g. `'/api/v1'`) |
| `aliases` | `Record<string, string>` | `{}` | Folder aliases beyond `@modules/*` |
| `strict` | `boolean` | `true` in dev | Enables circular dependency detection and undeclared import errors |
| `resolveAliases` | `boolean` | `true` | Disable if you resolve aliases with a bundler |
| `logger` | `function` | `console.warn` for warnings | Custom log handler |

Returns `NodularApp`:

```ts
interface NodularApp {
  modules:  RegisteredModule[]
  routes:   MountedRoute[]
  registry: NodularRegistry
}
```

---

### `Module(name, options?)`

Declares a module and registers its metadata in the registry. Call this once at the top of a module's `index.ts`.

```ts
// src/modules/orders/index.ts
import { Module } from 'nodulus'

Module('orders', {
  description: 'Purchase order management',
  imports: ['users', 'payments'],
  exports: ['OrderService', 'createOrderSchema'],
})

export { OrderService }    from './orders.service.js'
export { createOrderSchema } from './orders.schema.js'
```

| Option | Type | Description |
|---|---|---|
| `imports` | `string[]` | Modules this module depends on |
| `exports` | `string[]` | Public API names (validated against real exports at bootstrap) |
| `description` | `string` | Documentation / tooling |

---

### `Controller(name, options?)`

Declares a file as an Express controller. The file must have a `default export` of an Express `Router`.

```ts
// src/modules/users/users.routes.ts
import { Controller } from 'nodulus'
import { Router } from 'express'
import { requireAuth } from '@middleware/auth.js'
import { UserService } from './users.service.js'

Controller('UsersController', {
  prefix: '/users',
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

Nodulus mounts each controller as:

```ts
app.use(globalPrefix + controllerPrefix, ...middlewares, router)
```

---

### Import aliases

Nodulus registers two kinds of aliases:

- **Module aliases** — auto-generated for every `Module()`:
  ```
  @modules/<name> → src/modules/<name>/index.ts
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

Aliases are resolved at runtime via the Node.js ESM Hooks API (Node ≥ 18). For bundler-based projects, disable the runtime hook and use `getAliases()` instead:

```ts
// vite.config.ts
import { getAliases } from 'nodulus'

export default {
  resolve: { alias: await getAliases() },
}
```

---

### `nodulus.config.ts`

Centralise configuration in the project root. Options passed directly to `createApp()` take priority.

```ts
// nodulus.config.ts
import type { NodularConfig } from 'nodulus'

const config: NodularConfig = {
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

---

## Error handling

All Nodulus errors are instances of `NodularError`:

```ts
import { NodularError } from 'nodulus'

try {
  await createApp(app, { modules: 'src/modules/*' })
} catch (err) {
  if (err instanceof NodularError) {
    console.error(err.code)    // 'EXPORT_MISMATCH'
    console.error(err.message) // human-readable description
    console.error(err.details) // additional context
  }
  process.exit(1)
}
```

| Code | Cause |
|---|---|
| `MODULE_NOT_FOUND` | `index.ts` does not call `Module()` |
| `DUPLICATE_MODULE` | Two modules share the same name |
| `MISSING_IMPORT` | Module listed in `imports` does not exist in the registry |
| `UNDECLARED_IMPORT` | Module imports from another not listed in `imports` (strict only) |
| `CIRCULAR_DEPENDENCY` | Circular dependency detected (strict only) |
| `EXPORT_MISMATCH` | Name declared in `exports` is not a real export of `index.ts` |
| `INVALID_CONTROLLER` | Controller file has no `default export` of a Router |
| `ALIAS_NOT_FOUND` | Configured alias points to a directory that does not exist |
| `DUPLICATE_BOOTSTRAP` | `createApp()` called more than once with the same Express instance |

---

## Requirements

| | Minimum |
|---|---|
| Node.js | 18.0.0 |
| Express | 4.x or 5.x |
| TypeScript | 5.0+ (optional) |

---

## ESM & CJS

Nodulus ships both ESM and CJS bundles.

```ts
// ESM (recommended)
import { createApp, Module, Controller } from 'nodulus'
```

```js
// CommonJS
const { createApp, Module, Controller } = require('nodulus')
```

> **Note:** Runtime alias resolution uses the Node.js ESM Hooks API and is not available in CJS projects. Use `getAliases()` with your bundler instead.

---

## TypeScript

Types are bundled — no `@types/nodulus` needed.

```ts
import type {
  CreateAppOptions,
  NodularApp,
  NodularRegistry,
  NodularConfig,
  NodularError,
  ModuleOptions,
  ControllerOptions,
  RegisteredModule,
  MountedRoute,
  GetAliasesOptions,
} from 'nodulus'
```

---

## License

MIT
