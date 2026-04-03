import type { Application } from 'express';
import type { CreateAppOptions, NodularApp } from '../types/index.js';

// Implementation will be filled in a later block (bootstrap block).
export const createApp = async (
  _app: Application,
  _options: CreateAppOptions = {},
): Promise<NodularApp> => {
  throw new Error('createApp() — not implemented yet');
};
