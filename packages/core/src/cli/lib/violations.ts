import type { ModuleGraph } from './graph-builder.js';
import { findCircularDependencies } from '../../core/utils/cycle-detector.js';

export const ViolationType = {
  PRIVATE_IMPORT: 'private-import',
  UNDECLARED_IMPORT: 'undeclared-import',
  CIRCULAR_DEPENDENCY: 'circular-dependency',
} as const;

export type ViolationType = typeof ViolationType[keyof typeof ViolationType];

export interface Violation {
  type: ViolationType;
  module: string;
  message: string;
  suggestion: string;
  location?: { file: string; line: number };
  cycle?: string[];
}

/**
 * Heuristic to detect private imports and extract target module names.
 * Covers: @modules/name, @domain/module, @domain patterns.
 */
function analyzeImport(specifier: string): { isPrivate: boolean; suggestion: string; target: string } {
  const parts = specifier.split('/');
  const isModules = specifier.startsWith('@modules/');
  const isAtAlias = specifier.startsWith('@');

  // Rule: @modules/name is depth 2. More is private.
  if (isModules) {
    if (parts.length > 2) {
      return { isPrivate: true, suggestion: `${parts[0]}/${parts[1]}`, target: parts[1] };
    }
    return { isPrivate: false, suggestion: '', target: parts[1] };
  }

  // Rule: @domain (depth 1) or @domain/module (depth 2) are public. More is private.
  if (isAtAlias) {
    if (parts.length > 2) {
      return { isPrivate: true, suggestion: `${parts[0]}/${parts[1]}`, target: parts[1] };
    }
    // Target is the most specific unit: module if depth 2, or domain itself if depth 1.
    const target = (parts[1] || parts[0]).replace(/^@/, '');
    return { isPrivate: false, suggestion: '', target };
  }

  return { isPrivate: false, suggestion: '', target: '' };
}

export function detectViolations(graph: ModuleGraph): Violation[] {
  const violations: Violation[] = [];
  const nodes = graph.modules;
  const moduleNames = new Set(nodes.map(n => n.name));
  
  // Also include domain names in the set of valid targets if they exist in the graph
  if (graph.domains) {
    for (const d of graph.domains) {
      moduleNames.add(d.name);
    }
  }

  for (const node of nodes) {
    for (const imp of node.actualImports) {
      const { isPrivate, suggestion, target } = analyzeImport(imp.specifier);
      
      if (isPrivate) {
        violations.push({
          type: ViolationType.PRIVATE_IMPORT,
          module: node.name,
          message: `Private import detected: module "${node.name}" directly imports internal path from "${imp.specifier}".`,
          suggestion: `Import only the public index: "${suggestion}".`,
          location: { file: imp.file, line: imp.line }
        });
      } else if (target && target !== node.name && moduleNames.has(target)) {
        // Only check for undeclared imports if it's NOT a private import violation
        if (!node.declaredImports.includes(target)) {
          violations.push({
            type: ViolationType.UNDECLARED_IMPORT,
            module: node.name,
            message: `Undeclared import: module "${node.name}" imports from "${target}" but it is not declared.`,
            suggestion: `Add "${target}" to the imports array in the Module() declaration of "${node.name}".`,
            location: { file: imp.file, line: imp.line }
          });
        }
      }
    }
  }

  // Circular dependency detection
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
      cycle
    });
  }

  return violations;
}
