#!/usr/bin/env node
/**
 * Run a Capacitor CLI command against a specific variant config.
 *
 * The Capacitor 7 CLI always reads capacitor.config.ts from the current
 * working directory, so this wrapper points capacitor.config.ts (a symlink)
 * at capacitor.<variant>.config.ts for the duration of the run.
 *
 * Usage:  node scripts/cap-run.mjs <variant> <cap-command> [args...]
 * Example: node scripts/cap-run.mjs coach add android
 */
import { spawn } from 'node:child_process';
import { existsSync, lstatSync, renameSync, symlinkSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';

const [variant, ...capArgs] = process.argv.slice(2);
if (!['coach', 'student'].includes(variant) || capArgs.length === 0) {
  console.error('Usage: node scripts/cap-run.mjs <coach|student> <cap-command> [args...]');
  process.exit(2);
}

const link = resolve(process.cwd(), 'capacitor.config.ts');
const targetName = `capacitor.${variant}.config.ts`;
const targetPath = resolve(process.cwd(), targetName);
if (!existsSync(targetPath)) {
  console.error(`Config file not found: ${targetPath}`);
  process.exit(2);
}

let backup = null;
if (existsSync(link) || lstatSyncSafe(link)) {
  backup = `${link}.bak-${process.pid}`;
  renameSync(link, backup);
}

symlinkSync(targetName, link);

const cleanup = () => {
  try { if (lstatSyncSafe(link)) unlinkSync(link); } catch {}
  if (backup && existsSync(backup)) {
    try { renameSync(backup, link); } catch {}
  }
};

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => { cleanup(); process.exit(1); });
}

const child = spawn('npx', ['cap', ...capArgs], {
  stdio: 'inherit',
  env: { ...process.env, VITE_APP_VARIANT: variant },
});
child.on('exit', (code) => { cleanup(); process.exit(code ?? 1); });

function lstatSyncSafe(p) {
  try { return lstatSync(p); } catch { return null; }
}
