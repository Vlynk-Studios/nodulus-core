# @vlynk-studios/eslint-plugin-nodulus

The official ESLint plugin for the **Nodulus** framework. It provides static analysis rules to enforce architectural boundaries and strict dependency graphs synchronously within your IDE, ensuring that your modules remain clean, encapsulated, and fully decoupled during development.

## 📦 Installation

Ensure you have ESLint installed, then add the plugin:

```sh
npm install --save-dev eslint @vlynk-studios/eslint-plugin-nodulus
```

## 🚀 Usage (Flat Config)

Nodulus fully supports ESLint's modern `Flat Config` (`eslint.config.js`). Simply import the plugin and use the pre-configured `recommended` set:

```javascript
import nodulusPlugin from '@vlynk-studios/eslint-plugin-nodulus';

export default [
  // Your other configurations...
  
  // Apply Nodulus architectural boundaries:
  nodulusPlugin.configs.recommended,
];
```

Alternatively, you can manually cherry-pick and configure specific rules:

```javascript
import nodulusPlugin from '@vlynk-studios/eslint-plugin-nodulus';

export default [
  {
    plugins: {
      nodulus: nodulusPlugin
    },
    rules: {
      'nodulus/no-private-imports': 'error',
      'nodulus/no-undeclared-imports': 'warn'
    }
  }
];
```

## 🛠️ Rules

This plugin provides two foundational architectural guards:

| Rule | Description | Recommended |
|------|-------------|-------------|
| **`nodulus/no-private-imports`** | Forbids importing private internals of other modules (e.g., `@modules/auth/auth.service`). Forces consumers to only import from the cross-module public entrypoint (`@modules/auth`). | ❌ `error` |
| **`nodulus/no-undeclared-imports`** | Guarantees transparent dependency tracing. Ensures a module explicitly declares another module in its `Module({ imports: [...] })` before importing from it. | ⚠️ `warn` |

## 📄 License

MIT License © 2026 Vlynk Studios & Keiver-dev.
