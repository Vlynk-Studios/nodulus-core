import { ControllerDefinition } from '../types/index.js';

export const Controller = (name: string, definition: any): ControllerDefinition => {
  return {
    type: 'controller',
    name,
    definition,
  };
};
