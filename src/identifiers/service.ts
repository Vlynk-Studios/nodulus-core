import { ServiceDefinition } from '../types/index.js';

export const Service = (name: string, definition: any): ServiceDefinition => {
  return {
    type: 'service',
    name,
    definition,
  };
};
