/**
 * Utility to detect circular dependencies in a directed graph.
 */
export function findCircularDependencies(dependencyMap: Map<string, string[]>): string[][] {
  const cycles: string[][] = [];
  const visited = new Set<string>();
  const recStack = new Set<string>();
  const path: string[] = [];

  const dfs = (node: string) => {
    visited.add(node);
    recStack.add(node);
    path.push(node);

    const deps = dependencyMap.get(node) || [];
    for (const neighbor of deps) {
      if (!visited.has(neighbor)) {
        dfs(neighbor);
      } else if (recStack.has(neighbor)) {
        // We hit a node currently in the stack (cycle detected)
        const cycleStart = path.indexOf(neighbor);
        cycles.push([...path.slice(cycleStart), neighbor]);
      }
    }

    recStack.delete(node);
    path.pop();
  };

  for (const node of dependencyMap.keys()) {
    if (!visited.has(node)) {
      dfs(node);
    }
  }

  return cycles;
}
