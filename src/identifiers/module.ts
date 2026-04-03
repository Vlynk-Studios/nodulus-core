import { ModuleDefinition } from '../types/index.js';

export const Module = (name: string, definition: any): ModuleDefinition => {
  return {
    type: 'module',
    name,
    definition,
  };
};
