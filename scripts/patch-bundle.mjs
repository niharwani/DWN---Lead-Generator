import { readFileSync, writeFileSync } from "node:fs";

const path = process.argv[2];
if (!path) {
  console.error("usage: node patch-bundle.mjs <path-to-worker.js>");
  process.exit(1);
}

const src = readFileSync(path, "utf8");

const intercepts =
  'var n = String(x).replace(/\\\\/g, "/");' +
  'if (n.endsWith("/middleware-manifest.json")) return { version: 3, middleware: {}, functions: {}, sortedMiddleware: [] };' +
  'if (n.endsWith("/functions-config-manifest.json")) return { version: 1, functions: {} };' +
  'if (n.endsWith("/next-font-manifest.json")) return { pages: {}, app: {}, appUsingSizeAdjust: false, pagesUsingSizeAdjust: false };' +
  'if (n.endsWith("/pages-manifest.json")) return {};' +
  'if (n.endsWith("/app-paths-manifest.json")) return {};' +
  'if (n.endsWith("/server-reference-manifest.json")) return { node: {}, edge: {}, encryptionKey: "" };' +
  'if (n.endsWith("/prerender-manifest.json")) return { version: 4, routes: {}, dynamicRoutes: {}, notFoundRoutes: [], preview: { previewModeId: "", previewModeSigningKey: "", previewModeEncryptionKey: "" } };' +
  'if (n.endsWith("/routes-manifest.json")) return { version: 4, pages404: true, caseSensitive: false, basePath: "", redirects: [], rewrites: [], headers: [], staticRoutes: [], dynamicRoutes: [], dataRoutes: [], i18n: null };' +
  'if (n.endsWith("/required-server-files.json")) return { version: 1, config: {}, appDir: "", files: [], ignore: [] };' +
  'if (n.endsWith("/build-manifest.json")) return { polyfillFiles: [], devFiles: [], ampDevFiles: [], lowPriorityFiles: [], rootMainFiles: [], pages: {}, ampFirstPages: [] };' +
  'if (n.endsWith("/app-build-manifest.json")) return { pages: {} };' +
  'if (n.endsWith("/react-loadable-manifest.json")) return {};' +
  'if (n.endsWith("/BUILD_ID")) return "";';

// Pretty-printed throw site (wrangler's own esbuild)
const needle1 =
  'if (typeof require !== "undefined")\n' +
  '    return require.apply(this, arguments);\n' +
  '  throw new Error(\'Dynamic require of "\' + x + \'" is not supported\');';
const replace1 =
  'if (typeof require !== "undefined")\n' +
  '    return require.apply(this, arguments);\n' +
  '  ' + intercepts + '\n' +
  '  throw new Error(\'Dynamic require of "\' + x + \'" is not supported\');';

// Minified throw site (OpenNext's own esbuild)
const needle2 =
  'function(x){if(typeof require<"u")return require.apply(this,arguments);throw Error(\'Dynamic require of "\'+x+\'" is not supported\')}';
const replace2 =
  'function(x){if(typeof require<"u")return require.apply(this,arguments);' + intercepts + 'throw Error(\'Dynamic require of "\'+x+\'" is not supported\')}';

let out = src;
let n1 = 0, n2 = 0;
while (out.includes(needle1)) { out = out.replace(needle1, replace1); n1++; }
while (out.includes(needle2)) { out = out.replace(needle2, replace2); n2++; }

if (n1 + n2 === 0) {
  console.error("patch-bundle: no throw-sites matched; aborting");
  process.exit(1);
}

writeFileSync(path, out);
console.log(`patch-bundle: patched ${n1} pretty + ${n2} minified throw-site(s) in ${path}`);
