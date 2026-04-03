# Modular

A modular framework for building scalable Node.js applications.

## Features

- **Modular Architecture**: Organise your code into self-contained modules.
- **Dependency Injection**: Automatic wiring of services, repositories, and controllers.
- **Event Driven**: Built-in event emitter for decoupled communication.
- **ESM & CJS Support**: Dual package support out of the box.

## Installation

```bash
npm install modular
```

## Usage

```javascript
import { createApp, Module } from 'modular';

const app = createApp();

app.module(Module('users', () => {
  // Module definition
}));

app.run();
```
