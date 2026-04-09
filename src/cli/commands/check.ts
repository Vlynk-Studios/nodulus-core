import { Command } from 'commander';
import pc from 'picocolors';
import { loadConfig } from '../../core/config.js';
import { buildModuleGraph } from '../lib/graph-builder.js';
import { detectViolations, ViolationType } from '../lib/violations.js';

export function checkCommand(): Command {
  const check = new Command('check');

  check
    .description('Analyzes the project structural integrity to detect architectural violations')
    .option('--strict', 'Exit with code 1 if any violation is found', false)
    .option('--module <moduleName>', 'Filter analysis by a specific module')
    .option('--format <format>', 'Output format: text or json', 'text')
    .option('--no-circular', 'Skip circular dependency detection')
    .action(async (options) => {
      try {
        const cwd = process.cwd();
        const config = await loadConfig();
        
        const graph = await buildModuleGraph(config, cwd);
        let nodes = graph.modules;

        if (options.module) {
          graph.modules = graph.modules.filter(n => n.name === options.module);
          nodes = graph.modules;
          if (nodes.length === 0) {
            console.error(pc.red(`✗ Error: Module "${options.module}" does not exist.`));
            process.exit(1);
          }
        }

        let violations = detectViolations(graph);

        if (options.circular === false) { 
          violations = violations.filter(v => v.type !== ViolationType.CIRCULAR_DEPENDENCY);
        }

        if (options.format === 'json') {
          console.log(JSON.stringify({ domains: graph.domains, modules: nodes, violations }, null, 2));
          if (options.strict && violations.length > 0) {
            process.exit(1);
          }
          return;
        }

        console.log(pc.bold(pc.cyan('\nNodulus Architecture Analysis\n')));

        for (const node of nodes) {
          const moduleViolations = violations.filter(v => v.module === node.name);
          if (moduleViolations.length === 0) {
            console.log(pc.green(`✔ ${node.name} — OK`));
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
          process.exit(1);
        }

      } catch (error: any) {
        console.error(pc.red(`\nAn error occurred during check: ${error.message}`));
        process.exit(1);
      }
    });

  return check;
}
