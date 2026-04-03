import { SchemaDefinition } from '../types/index.js';

export const Schema = (name: string, definition: any): SchemaDefinition => {
  return {
    type: 'schema',
    name,
    definition,
  };
};
