// Runs a command with the demo entry selected and the API key from the ignored config/local.json.
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const config = fileURLToPath(new URL("../config/local.json", import.meta.url));
const local = existsSync(config) ? JSON.parse(readFileSync(config)) : {};
const [command, ...args] = process.argv.slice(2);
if (!command) throw new Error("Usage: node scripts/demo-env.mjs <command> [arguments]");
const child = spawn(command, args, {
  stdio: "inherit",
  env: {
    ...process.env,
    EXPO_PUBLIC_GLMAP_DEMO: "1",
    EXPO_PUBLIC_GLMAP_API_KEY: local.GLMAP_API_KEY ?? process.env.GLMAP_API_KEY ?? "",
  },
});
child.on("exit", (code) => process.exit(code ?? 1));
