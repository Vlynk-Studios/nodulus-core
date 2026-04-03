import { RepositoryDefinition } from '../types/index.js';

export const Repository = (name: string, definition: any): RepositoryDefinition => {
  return {
    type: 'repository',
    name,
    definition,
  };
};
