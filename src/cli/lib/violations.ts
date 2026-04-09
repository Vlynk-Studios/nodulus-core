import { ModuleNode } from './graph-builder.js';
import { createRegistry } from '../../core/registry.js';

export type ViolationType = 'private-import' | 'undeclared-import' | 'circular-dependency';

export interface Violation {
  type: ViolationType;
  module: string;
  message: string;
  suggestion: string;
  location?: { file: string; line: number };
  cycle?: string[];
}

export function detectViolations(nodes: ModuleNode[]): Violation[] {
  const violations: Violation[] = [];
  const moduleNames = new Set(nodes.map(n => n.name));
  const registry = createRegistry();

  for (const node of nodes) {
    try {
      registry.registerModule(node.name, { imports: node.declaredImports }, node.dirPath, node.indexPath);
    } catch (err) {
      // Ignore duplicate registration errors silently for validation purposes
    }
  }

  for (const node of nodes) {
    for (const imp of node.actualImports) {
      const parts = imp.specifier.split('/');
      
      let isPrivate = false;
      if (parts.length > 2) {
        isPrivate = true;
        violations.push({
          type: 'private-import',
          module: node.name,
          message: `Private import detected: module "${node.name}" directly imports internal path from "${imp.specifier}".`,
          suggestion: `Import only the public index: "@modules/${parts[1]}".`,
          location: { file: imp.file, line: imp.line }
        });
      }

      if (!isPrivate) {
        const targetModule = parts[1];
        if (targetModule !== node.name && moduleNames.has(targetModule)) {
          if (!node.declaredImports.includes(targetModule)) {
            violations.push({
              type: 'undeclared-import',
              module: node.name,
              message: `Undeclared import: module "${node.name}" imports from "${targetModule}" but it is not declared.`,
              suggestion: `Add "${targetModule}" to the imports array in the Module() declaration of "${node.name}".`,
              location: { file: imp.file, line: imp.line }
            });
          }
        }
      }
    }
  }

  const cycles = registry.findCircularDependencies();
  for (const cycle of cycles) {
    const cycleStr = cycle.join(' -> ');
    violations.push({
      type: 'circular-dependency',
      module: cycle[0],
      message: `Circular dependency detected: ${cycleStr}`,
      suggestion: 'Extract shared logic into a separate module to break the cycle.',
      cycle
    });
  }

  return violations;
}
