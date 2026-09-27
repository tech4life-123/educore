// Test-only module resolution: "@/x" → <repo>/x, and extensionless relative
// imports → .ts / .tsx / index.ts (as the Next.js bundler resolves them).
import { existsSync } from "node:fs";
import { dirname, resolve as resolvePath } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolvePath(dirname(fileURLToPath(import.meta.url)), "..");

function candidates(base) {
  return [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`];
}

export async function resolve(specifier, context, next) {
  let base = null;
  if (specifier.startsWith("@/")) base = resolvePath(root, specifier.slice(2));
  else if ((specifier.startsWith("./") || specifier.startsWith("../")) && context.parentURL?.startsWith("file:")) {
    base = resolvePath(dirname(fileURLToPath(context.parentURL)), specifier);
  }
  if (base) {
    const hit = candidates(base).find((p) => existsSync(p) && !p.endsWith("/"));
    if (hit && !existsSync(`${hit}/`)) return next(pathToFileURL(hit).href, context);
  }
  return next(specifier, context);
}
