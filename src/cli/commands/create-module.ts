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
      // Validate name: lowercase, no spaces or special chars
      if (!/^[a-z0-9-]+$/.test(name)) {
        console.error(pc.red(`\nError: Invalid module name "${name}". Module names must be lowercase and contain only letters, numbers, or hyphens.\n`));
        process.exit(1);
      }

      // Determine destination folder
      const modulePath = options.path ? path.resolve(process.cwd(), options.path) : path.resolve(process.cwd(), `src/modules/${name}`);

      if (fs.existsSync(modulePath)) {
        console.error(pc.red(`\nError: The directory "${modulePath}" already exists. Cannot scaffold module here.\n`));
        process.exit(1);
      }

      // Create directories
      fs.mkdirSync(modulePath, { recursive: true });

      // Generate files
      const files: Record<string, string> = {
        'index.ts': generateIndex(name, options.repository, options.schema),
        [`${name}.controller.ts`]: generateController(name),
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

      console.log(pc.green(`\n✔ Module "${name}" created successfully at ${path.relative(process.cwd(), modulePath)}/`));
      for (const filename of Object.keys(files)) {
        console.log(`  └─ ${pc.cyan(filename)}`);
      }
      console.log('');
    });
}

// Scaffold templates

function generateIndex(name: string, includesRepo: boolean, includesSchema: boolean): string {
  const capName = name.charAt(0).toUpperCase() + name.slice(1);
  const imports = [`import { Module } from 'nodulus';\n`];
  imports.push(`import router from './${name}.controller.js';`);
  imports.push(`import { ${capName}Service } from './${name}.service.js';`);
  
  if (includesRepo) {
    imports.push(`import { ${capName}Repository } from './${name}.repository.js';`);
  }
  
  if (includesSchema) {
    imports.push(`import { ${capName}Schema } from './${name}.schema.js';`);
  }

  const exports = [`${capName}Service`];
  if (includesRepo) exports.push(`${capName}Repository`);
  if (includesSchema) exports.push(`${capName}Schema`);

  return `
${imports.join('\n')}

Module('${name}', {
  imports: [],
  exports: [${exports.map(e => `'${e}'`).join(', ')}]
});

export {
  ${exports.join(',\n  ')}
};
`;
}

function generateController(name: string): string {
  const capName = name.charAt(0).toUpperCase() + name.slice(1);
  return `
import { Controller } from 'nodulus';
import { Router } from 'express';
import { ${capName}Service } from './${name}.service.js';

Controller('/${name}');
const router = Router();

router.get('/', (req, res) => {
  res.json({ message: 'Hello from ${name} module' });
});

export default router;
`;
}

function generateService(name: string): string {
  const capName = name.charAt(0).toUpperCase() + name.slice(1);
  return `
import { Service } from 'nodulus';

Service('${capName}Service');

export const ${capName}Service = {
  // Add your service methods here
};
`;
}

function generateRepository(name: string): string {
  const capName = name.charAt(0).toUpperCase() + name.slice(1);
  return `
import { Repository } from 'nodulus';

Repository('${capName}Repository', { source: 'database' });

export const ${capName}Repository = {
  // Add your data access methods here
};
`;
}

function generateSchema(name: string): string {
  const capName = name.charAt(0).toUpperCase() + name.slice(1);
  return `
import { Schema } from 'nodulus';

Schema('${capName}Schema', { library: 'zod' });

export const ${capName}Schema = {
  // Define your validation schema here
};
`;
}
