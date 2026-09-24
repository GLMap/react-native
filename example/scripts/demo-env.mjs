// Run the catalog with an optional client key from ignored configuration.
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const config = fileURLToPath(new URL('../config/local.json', import.meta.url));
const local = existsSync(config) ? JSON.parse(readFileSync(config)) : {};
const [command, ...args] = process.argv.slice(2);
if (!command) throw new Error('Usage: node scripts/demo-env.mjs <command> [arguments]');
const child = spawn(command, args, {
  stdio: 'inherit',
  env: {
    ...process.env,
    EXPO_PUBLIC_GLMAP_API_TESTS: '0',
    EXPO_PUBLIC_GLMAP_LIFECYCLE: '0',
    EXPO_PUBLIC_GLMAP_BENCH: '0',
    EXPO_PUBLIC_GLMAP_API_KEY: local.GLMAP_API_KEY ?? process.env.GLMAP_API_KEY ?? '',
  },
});
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
