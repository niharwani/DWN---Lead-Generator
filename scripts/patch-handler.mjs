import { readFileSync, writeFileSync } from "node:fs";

const path = ".open-next/server-functions/default/handler.mjs";
const src = readFileSync(path, "utf8");

const needle =
  'function(x){if(typeof require<"u")return require.apply(this,arguments);throw Error(\'Dynamic require of "\'+x+\'" is not supported\')}';

if (!src.includes(needle)) {
  console.error("patch-handler: throw-site not found; aborting");
  process.exit(1);
}

const replacement =
  'function(x){if(typeof require<"u")return require.apply(this,arguments);' +
  'var n=String(x).replace(/\\\\/g,"/");' +
  'if(n.endsWith("/middleware-manifest.json"))return{version:3,middleware:{},functions:{},sortedMiddleware:[]};' +
  'if(n.endsWith("/functions-config-manifest.json"))return{version:1,functions:{}};' +
  'if(n.endsWith("/next-font-manifest.json"))return{pages:{},app:{},appUsingSizeAdjust:false,pagesUsingSizeAdjust:false};' +
  'if(n.endsWith("/pages-manifest.json"))return{};' +
  'if(n.endsWith("/app-paths-manifest.json"))return{};' +
  'if(n.endsWith("/server-reference-manifest.json"))return{node:{},edge:{},encryptionKey:""};' +
  'if(n.endsWith("/prerender-manifest.json"))return{version:4,routes:{},dynamicRoutes:{},notFoundRoutes:[],preview:{previewModeId:"",previewModeSigningKey:"",previewModeEncryptionKey:""}};' +
  'if(n.endsWith("/routes-manifest.json"))return{version:4,pages404:true,caseSensitive:false,basePath:"",redirects:[],rewrites:[],headers:[],staticRoutes:[],dynamicRoutes:[],dataRoutes:[],i18n:null};' +
  'if(n.endsWith("/required-server-files.json"))return{version:1,config:{},appDir:"",files:[],ignore:[]};' +
  'if(n.endsWith("/build-manifest.json"))return{polyfillFiles:[],devFiles:[],ampDevFiles:[],lowPriorityFiles:[],rootMainFiles:[],pages:{},ampFirstPages:[]};' +
  'if(n.endsWith("/app-build-manifest.json"))return{pages:{}};' +
  'if(n.endsWith("/react-loadable-manifest.json"))return{};' +
  'if(n.endsWith("/BUILD_ID"))return"";' +
  'throw Error(\'PATCH-MARKER-ZZZ Dynamic require of "\'+x+\'" is not supported\')}';

const occurrences = src.split(needle).length - 1;
const out = src.split(needle).join(replacement);
writeFileSync(path, out);
console.log(`patch-handler: replaced ${occurrences} throw-site(s) in ${path}`);
