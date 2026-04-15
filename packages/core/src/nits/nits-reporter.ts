import pc from 'picocolors';
import type { ReconciliationResult } from '../types/nits.js';
import type { Logger } from '../core/logger.js';
import { calculateAlias } from './utils.js';

export function reportReconciliation(result: ReconciliationResult, log: Logger): void {
  // 1. Nuevos Módulos (Siempre en debug)
  if (result.newModules.length > 0) {
    log.debug(`[NITS] ${result.newModules.length} nuevos módulos descubiertos.`);
  }

  const hasAlerts = 
    result.moved.length > 0 || 
    result.candidates.length > 0 || 
    result.stale.length > 0;

  if (!hasAlerts) {
    log.debug('[NITS] Sin cambios detectados en la integridad estructural.');
    return;
  }

  // 2. Módulos Movidos (Alta Probabilidad)
  if (result.moved.length > 0) {
    for (const m of result.moved) {
      const newAlias = calculateAlias(m.newPath);
      let msg = `Movimiento detectado: '${pc.bold(m.record.name)}'\n`;
      msg += `           ${pc.gray('Antes:')} ${pc.gray(m.oldPath)}\n`;
      msg += `           ${pc.gray('Ahora:')} ${pc.cyan(m.newPath)}`;
      
      if (m.brokenImports.length > 0) {
        msg += `\n           ${pc.yellow(`Imports rotos (${m.brokenImports.length} archivo(s)):`)}`;
        for (const imp of m.brokenImports) {
          msg += `\n             ${pc.gray(imp.file)}:${pc.gray(String(imp.line))}  →  ${pc.red(imp.specifier)}`;
        }
        msg += `\n           Actualizá los imports a: ${pc.green(newAlias)}`;
      }
      
      log.warn(msg);
    }
  }

  // 3. Módulos Stale (No encontrados en disco)
  if (result.stale.length > 0) {
    for (const m of result.stale) {
      let msg = `Módulo '${pc.bold(m.name)}' no encontrado en disco (marcado como stale)\n`;
      msg += `           ${pc.gray('Última ubicación:')} ${pc.gray(m.path)}\n`;
      msg += `           Si fue eliminado intencionalmente, podés ignorar esto.\n`;
      msg += `           Si fue un movimiento, asegurate de que el nuevo directorio tenga Module().`;
      
      log.warn(msg);
    }
  }

  // 4. Candidatos (Posibles reubicaciones por nombre)
  if (result.candidates.length > 0) {
    for (const m of result.candidates) {
      let msg = `Posible reubicación: '${pc.bold(m.record.name)}'\n`;
      msg += `           Se encontró un módulo con el mismo nombre en una nueva ubicación.\n`;
      msg += `           Verificá manualmente si es el mismo módulo movido.\n`;
      msg += `           ${pc.gray('Nuevo path:')} ${pc.cyan(m.newPath)}`;
      
      log.warn(msg);
    }
  }

  // Summary (Debug)
  log.debug(pc.cyan('[NITS] Identity Reconciliation Summary'));
  log.debug(pc.gray('----------------------------------------'));
  
  if (result.confirmed.length > 0) {
    log.debug(`${pc.green('✔')} Confirmed:      ${pc.bold(result.confirmed.length)}`);
  }
  
  if (result.newModules.length > 0) {
    log.debug(`${pc.blue('✳')} New modules:    ${pc.bold(result.newModules.length)}`);
  }
  
  if (result.moved.length > 0) {
    log.debug(`${pc.magenta('⇄')} Moved:          ${pc.bold(result.moved.length)}`);
  }
  
  if (result.candidates.length > 0) {
    log.debug(`${pc.yellow('❓')} Candidates:     ${pc.bold(result.candidates.length)}`);
  }
  
  if (result.stale.length > 0) {
    log.debug(`${pc.gray('✖')} Stale (disk):  ${pc.bold(result.stale.length)}`);
  }
  
  log.debug(pc.gray('----------------------------------------\n'));
}
