import fs from 'node:fs';
import path from 'node:path';
import fg from 'fast-glob';
import type { ModuleGraph } from './graph-builder.js';
import { extractRelativeCrossModuleImports } from './import-scanner.js';
import { findCircularDependencies } from '../../core/utils/cycle-detector.js';

export const ViolationType = {
  PRIVATE_IMPORT: 'private-import',
  UNDECLARED_IMPORT: 'undeclared-import',
  CIRCULAR_DEPENDENCY: 'circular-dependency',
  RELATIVE_BOUNDARY_VIOLATION: 'relative-boundary-violation',
} as const;

export type ViolationType = typeof ViolationType[keyof typeof ViolationType];

/** REGLA-45 / Fase 6 — always forces exit 1 in `nodulus check`. */
export interface RelativeBoundaryViolation {
  type: typeof ViolationType.RELATIVE_BOUNDARY_VIOLATION;
  module: string;
  file: string;
  line?: number;
  import: string;
  hint: string;
}

export interface StandardViolation {
  type: Exclude<
    ViolationType,
    typeof ViolationType.RELATIVE_BOUNDARY_VIOLATION
  >;
  module: string;
  message: string;
  suggestion: string;
  location?: { file: string; line: number };
  cycle?: string[];
}

export type Violation = RelativeBoundaryViolation | StandardViolation;

const BOUNDARY_HINT =
  'Use the alias @modules/<module> to import from another module.';

/** Lists source files under a module directory (excludes tests and declaration files). */
export function getModuleFiles(moduleDirPath: string): string[] {
  if (!fs.existsSync(moduleDirPath)) {
    return [];
  }
  try {
    return fg.sync('**/*.{ts,js,mts,mjs}', {
      cwd: moduleDirPath,
      absolute: true,
      onlyFiles: true,
      ignore: ['**/*.test.*', '**/*.spec.*', '**/*.d.ts'],
    });
  } catch {
    return [];
  }
}

export function isErrorViolation(violation: Violation): boolean {
  return (
    violation.type === ViolationType.CIRCULAR_DEPENDENCY ||
    violation.type === ViolationType.RELATIVE_BOUNDARY_VIOLATION
  );
}

/**
 * Scans every file in each module for relative imports that escape the module boundary.
 */
export function detectRelativeBoundaryViolations(
  graph: ModuleGraph,
  cwd: string = process.cwd(),
): RelativeBoundaryViolation[] {
  const violations: RelativeBoundaryViolation[] = [];

  for (const moduleNode of graph.modules) {
    const files = getModuleFiles(moduleNode.dirPath);

    for (const file of files) {
      const crossModuleImports = extractRelativeCrossModuleImports(
        file,
        moduleNode.dirPath,
      );

      for (const { specifier, line } of crossModuleImports) {
        violations.push({
          type: ViolationType.RELATIVE_BOUNDARY_VIOLATION,
          module: moduleNode.name,
          file: path.relative(cwd, file).replace(/\\/g, '/'),
          line,
          import: specifier,
          hint: BOUNDARY_HINT,
        });
      }
    }
  }

  return violations;
}

/**
 * Heuristic to detect private imports and extract target module names.
 * Covers: @modules/name, @domain/module, @domain patterns.
 */
function analyzeImport(specifier: string): { isPrivate: boolean; suggestion: string; target: string } {
  const parts = specifier.split('/');
  const isModules = specifier.startsWith('@modules/');
  const isAtAlias = specifier.startsWith('@');

  if (isModules) {
    if (parts.length > 2) {
      return { isPrivate: true, suggestion: `${parts[0]}/${parts[1]}`, target: parts[1] };
    }
    return { isPrivate: false, suggestion: '', target: parts[1] };
  }

  if (isAtAlias) {
    if (parts.length > 2) {
      return { isPrivate: true, suggestion: `${parts[0]}/${parts[1]}`, target: parts[1] };
    }
    const target = (parts[1] || parts[0]).replace(/^@/, '');
    return { isPrivate: false, suggestion: '', target };
  }

  return { isPrivate: false, suggestion: '', target: '' };
}

export function detectViolations(
  graph: ModuleGraph,
  cwd: string = process.cwd(),
): Violation[] {
  const violations: Violation[] = [
    ...detectRelativeBoundaryViolations(graph, cwd),
  ];
  const nodes = graph.modules;
  const moduleNames = new Set(nodes.map(n => n.name));

  if (graph.domains) {
    for (const d of graph.domains) {
      moduleNames.add(d.name);
    }
  }

  for (const node of nodes) {
    for (const imp of node.actualImports) {
      if (imp.specifier.startsWith('./') || imp.specifier.startsWith('../')) {
        continue;
      }

      const { isPrivate, suggestion, target } = analyzeImport(imp.specifier);

      if (isPrivate) {
        violations.push({
          type: ViolationType.PRIVATE_IMPORT,
          module: node.name,
          message: `Private import detected: module "${node.name}" directly imports internal path from "${imp.specifier}".`,
          suggestion: `Import only the public index: "${suggestion}".`,
          location: { file: imp.file, line: imp.line },
        });
      } else if (target && target !== node.name && moduleNames.has(target)) {
        if (!node.declaredImports.includes(target)) {
          violations.push({
            type: ViolationType.UNDECLARED_IMPORT,
            module: node.name,
            message: `Undeclared import: module "${node.name}" imports from "${target}" but it is not declared.`,
            suggestion: `Add "${target}" to the imports array in the Module() declaration of "${node.name}".`,
            location: { file: imp.file, line: imp.line },
          });
        }
      }
    }
  }

  const dependencyMap = new Map<string, string[]>();
  for (const node of nodes) {
    dependencyMap.set(node.name, node.declaredImports);
  }

  const cycles = findCircularDependencies(dependencyMap);
  for (const cycle of cycles) {
    const cycleStr = cycle.join(' -> ');
    violations.push({
      type: ViolationType.CIRCULAR_DEPENDENCY,
      module: cycle[0],
      message: `Circular dependency detected: ${cycleStr}`,
      suggestion: 'Extract shared logic into a separate module to break the cycle.',
      cycle,
    });
  }

  return violations;
}
