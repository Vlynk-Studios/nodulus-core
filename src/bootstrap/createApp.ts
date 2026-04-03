import type { Application } from 'express';
import type { CreateAppOptions, NodulusApp } from '../types/index.js';

// Implementation will be filled in a later block (bootstrap block).
export async function createApp(
  app: Application,
  options: CreateAppOptions = {}
): Promise<NodulusApp> {
  throw new Error('createApp() — not implemented yet');
}
