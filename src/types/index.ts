export interface ModuleDefinition {
  type: 'module';
  name: string;
  definition: any;
}

export interface ServiceDefinition {
  type: 'service';
  name: string;
  definition: any;
}

export interface RepositoryDefinition {
  type: 'repository';
  name: string;
  definition: any;
}

export interface ControllerDefinition {
  type: 'controller';
  name: string;
  definition: any;
}

export interface SchemaDefinition {
  type: 'schema';
  name: string;
  definition: any;
}

export interface AppOptions {
  [key: string]: any;
}

export interface App {
  run: () => void;
  [key: string]: any;
}
