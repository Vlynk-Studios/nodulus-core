import { Command } from 'commander';
import pc from 'picocolors';
import { loadConfig } from '../../core/config.js';
import { buildModuleGraph } from '../lib/graph-builder.js';
import { detectViolations, ViolationType } from '../lib/violations.js';
import { loadNitsRegistry, saveNitsRegistry, initNitsRegistry, inferProjectName } from '../../nits/nits-store.js';
import { createLogger, defaultLogHandler } from '../../core/logger.js';
import { reconcile, buildUpdatedNitsRegistry } from '../../nits/nits-reconciler.js';
import { reportReconciliation } from '../../nits/nits-reporter.js';
import { computeModuleHash } from '../../nits/nits-hash.js';
import type { DiscoveredModule } from '../../types/nits.js';

export function checkCommand(): Command {
  const check = new Command('check');

  check
    .description('Analyzes the project structural integrity to detect architectural violations')
    .option('--strict', 'Exit with code 1 if any violation is found', false)
    .option('--module <moduleName>', 'Filter analysis by a specific module')
    .option('--format <format>', 'Output format: text or json', 'text')
    .option('--no-circular', 'Skip circular dependency detection')
    .action(async (options) => {
        const cwd = process.cwd();
        const config = await loadConfig();
        
        const graph = await buildModuleGraph(config, cwd);
        
        // NITS Reconciliation (Identity Tracking)
        if (config.nits.enabled) {
          const discovered: DiscoveredModule[] = [];
          for (const node of graph.modules) {
            const { hash, identifiers } = await computeModuleHash(node.dirPath);
            discovered.push({
              name: node.name,
              dirPath: node.dirPath,
              domain: undefined,
              identifiers,
              hash
            });
          }

          const oldRegistry = await loadNitsRegistry(cwd) || initNitsRegistry(inferProjectName(cwd));
          const result = await reconcile(discovered, oldRegistry, cwd);
          const updatedRegistry = buildUpdatedNitsRegistry(result, oldRegistry.project);
          
          await saveNitsRegistry(updatedRegistry, cwd);

          // Map IDs back to the graph nodes for reporting
          for (const node of graph.modules) {
            node.id = updatedRegistry.modules[node.name]?.id;
          }

          const hasChanges = result.newModules.length > 0 || result.moved.length > 0 || result.stale.length > 0;
          if (hasChanges && options.format !== 'json') {
            const logger = createLogger(defaultLogHandler, 'info');
            reportReconciliation(result, logger);
          }
        }

        let nodes = graph.modules;

        if (options.module) {
          graph.modules = graph.modules.filter(n => n.name === options.module);
          nodes = graph.modules;
          if (nodes.length === 0) {
            throw new Error(pc.red(`✗ Error: Module "${options.module}" does not exist.`));
          }
        }

        let violations = detectViolations(graph);

        if (options.circular === false) { 
          violations = violations.filter(v => v.type !== ViolationType.CIRCULAR_DEPENDENCY);
        }

        if (options.format === 'json') {
          console.log(JSON.stringify({ domains: graph.domains, modules: nodes, violations }, null, 2));
          if (options.strict && violations.length > 0) {
            throw new Error('Structural integrity violations found (JSON format)');
          }
          return;
        }

        console.log(pc.bold(pc.cyan('\nNodulus Architecture Analysis\n')));

        for (const node of nodes) {
          const moduleViolations = violations.filter(v => v.module === node.name);
          const idStr = node.id ? pc.gray(` [${node.id}]`) : '';
          
          if (moduleViolations.length === 0) {
            console.log(pc.green(`✔ ${node.name}${idStr} — OK`));
          } else {
            console.log(pc.red(`✗ ${node.name} — ${moduleViolations.length} problem(s)`));
            for (const v of moduleViolations) {
              const prefix = pc.yellow('  WARN ');
              
              if (v.type === ViolationType.CIRCULAR_DEPENDENCY && v.cycle) {
                console.log(`${prefix} ${v.message}`);
                console.log(pc.gray(`       Suggestion: ${v.suggestion}`));
              } else {
                const loc = v.location ? `${v.location.file}:${v.location.line}` : 'Unknown location';
                console.log(`${prefix} ${v.message} ${pc.gray(`(${loc})`)}`);
                console.log(pc.gray(`       Suggestion: ${v.suggestion}`));
              }
            }
          }
        }

        console.log(`\n${violations.length} problem(s) found.`);

        if (options.strict && violations.length > 0) {
          throw new Error('Structural integrity violations found.');
        }
    });

  return check;
}
