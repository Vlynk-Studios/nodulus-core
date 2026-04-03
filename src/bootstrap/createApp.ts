import { App, AppOptions } from '../types/index.js';

export const createApp = (options: AppOptions = {}): App => {
  return {
    run: () => console.log('App running'),
    ...options,
  };
};
