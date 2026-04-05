import { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import pc from 'picocolors';

export function createModuleCommand() {
  return new Command('create-module')
    .description('Scaffolds a new Nodulus module')
    .argument('<name>', 'Module name (lowercase, no spaces/special chars)')
    .option('-p, --path <path>', 'Destination folder path (default: src/modules/<name>)')
    .option('--no-repository', 'Skip generating a repository file')
    .option('--no-schema', 'Skip generating a schema file')
    .action((name: string, options: { path?: string; repository: boolean; schema: boolean }) => {
      if (!/^[a-z0-9-]+$/.test(name)) {
        console.error(pc.red(`\nError: Invalid module name "${name}". Module names must be lowercase and contain only letters, numbers, or hyphens.\n`));
        process.exit(1);
      }

      const modulePath = options.path ? path.resolve(process.cwd(), options.path) : path.resolve(process.cwd(), `src/modules/${name}`);

      if (fs.existsSync(modulePath)) {
        console.error(pc.red(`\nError: The directory "${modulePath}" already exists. Cannot scaffold module here.\n`));
        process.exit(1);
      }

      fs.mkdirSync(modulePath, { recursive: true });

      const files: Record<string, string> = {
        'index.ts': generateIndex(name),
        [`${name}.routes.ts`]: generateRoutes(name),
        [`${name}.service.ts`]: generateService(name),
      };

      if (options.repository) {
        files[`${name}.repository.ts`] = generateRepository(name);
      }
      
      if (options.schema) {
        files[`${name}.schema.ts`] = generateSchema(name);
      }

      for (const [filename, content] of Object.entries(files)) {
        fs.writeFileSync(path.join(modulePath, filename), content.trim() + '\n', 'utf-8');
      }

      console.log(pc.green(`\n✔ Módulo '${name}' creado en ${path.relative(process.cwd(), modulePath)}/`));
      for (const filename of Object.keys(files)) {
        console.log(`  ${pc.cyan(filename)}`);
      }
      console.log(`\nPróximo paso: agregá '${name}' a los imports de los módulos que lo necesiten.\n`);
    });
}

function generateIndex(name: string): string {
  return `
import { Module } from 'nodulus'

Module('${name}', {
  imports: [],
  exports: [],
})
`;
}

function generateRoutes(name: string): string {
  return `
import { Controller } from 'nodulus'
import { Router } from 'express'

Controller('/${name}')

const router = Router()

// Agregá tus rutas acá
// router.get('/', (req, res) => { ... })

export default router
`;
}

function generateService(name: string): string {
  const capName = name.charAt(0).toUpperCase() + name.slice(1);
  return `
import { Service } from 'nodulus'

Service('${capName}Service', { module: '${name}' })

export class ${capName}Service {
  // Lógica de negocio acá
}
`;
}

function generateRepository(name: string): string {
  const capName = name.charAt(0).toUpperCase() + name.slice(1);
  return `
import { Repository } from 'nodulus'

Repository('${capName}Repository', { module: '${name}', source: 'database' })

export class ${capName}Repository {
  // Queries a la base de datos acá
}
`;
}

function generateSchema(name: string): string {
  const capName = name.charAt(0).toUpperCase() + name.slice(1);
  return `
import { Schema } from 'nodulus'
import { z } from 'zod'

Schema('${capName}Schema', { module: '${name}', library: 'zod' })

export const create${capName}Schema = z.object({
  // Definí tu schema acá
})
`;
}
