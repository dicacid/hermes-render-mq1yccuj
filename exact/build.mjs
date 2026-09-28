import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const src = path.join(root, "exact-src");
fs.rmSync(src, { recursive: true, force: true });

execSync("git clone --depth 1 https://github.com/fathah/hermes-desktop.git exact-src", { stdio: "inherit" });

const shim = `
const backendUrl = "https://hermes-one-browser.onrender.com";
const bridgeWsUrl = (location.protocol === "https:" ? "wss:" : "ws:") + "//" + location.host + "/hermes-ws";
const dashboardStatus = () => ({
  supported:true,
  running:true,
  connection:{
    baseUrl:location.origin,
    wsUrl:bridgeWsUrl,
    token:"",
    authMode:"oauth",
    mode:"remote",
    profile:"default"
  }
});
const safeProfile = {
  id:"default", name:"nick", path:"/remote/default", isDefault:true, isActive:true,
  model:"", provider:"auto", hasEnv:true, hasSoul:true, skillCount:0,
  gatewayRunning:true, color:"#6b7280", avatar:null
};

const report = (type, payload={}) => {
  try {
    fetch("/client-log", {
      method:"POST",
      headers:{"content-type":"application/json"},
      body:JSON.stringify({type,payload,href:location.href,ua:navigator.userAgent,ts:Date.now()})
    }).catch(()=>{});
  } catch {}
};
window.addEventListener("error", e => report("error", {message:e.message, stack:e.error?.stack, source:e.filename, line:e.lineno, col:e.colno}));
window.addEventListener("unhandledrejection", e => report("unhandledrejection", {reason:String(e.reason), stack:e.reason?.stack}));
setTimeout(() => report("state", {title:document.title, text:(document.body?.innerText||"").slice(0,3000), html:(document.getElementById("root")?.innerHTML||"").slice(0,3000)}), 5000);

function defaultValue(name){
  if (name === "getConnectionConfig") return { mode:"remote", remoteUrl:location.origin, connectionId:"render-hermes-one", remoteAuthMode:"oauth", remoteChatTransport:"dashboard" };
  if (name === "testRemoteConnection") return true;
  if (name === "probeRemoteAuthMode") return { authMode:"oauth" };
  if (name === "checkInstall") return { installed:true, hasApiKey:true, activeProfile:"default" };
  if (name === "verifyInstall") return true;
  if (name === "getConfigHealth") return { healthy:true, issues:[] };
  if (name === "gatewayStatus") return true;
  if (name === "dashboardStatus" || name === "startDashboard") return dashboardStatus();
  if (name === "freshDashboardWsUrl") return bridgeWsUrl;
  if (name === "listProfiles") return [safeProfile];
  if (name === "getActiveProfile") return "default";
  if (name === "getProfile") return safeProfile;
  if (name === "getConnectionRevision") return 1;
  if (name === "getLocale") return "en";
  if (name === "setLocale") return "en";
  if (name === "getVersion" || name === "getHermesVersion") return "web";
  if (name === "getModelConfig") return { provider:"auto", model:"", baseUrl:"" };
  if (name === "discoverProviderModels") return { models:[], cached:false, status:"unsupported", freeModels:[] };
  if (name === "validateChatReadiness") return { ok:true };
  if (name === "getSpellCheckerInfo") return { available:[], system:[], selected:[] };
  if (name === "getModelContextWindow") return null;
  if (name === "getConfig") return null;
  if (name === "getSessionContextFolder" || name === "getSessionModelOverride") return null;
  if (name === "getHermesHome") return "/remote";
  if (name === "readSoul") return "";
  if (name === "readMemory") return { memory:{content:"",exists:false,lastModified:null}, user:{content:"",exists:false,lastModified:null}, stats:{totalSessions:0,totalMessages:0} };
  if (name === "getCredentialPool") return {};
  if (name === "getPlatformEnabled") return {};
  if (name === "getToolsets") return [];
  if (name.startsWith("list") || name.startsWith("search") || name.startsWith("discover")) return [];
  if (name.startsWith("get")) return {};
  if (name.startsWith("check") || name.startsWith("test") || name.startsWith("verify")) return true;
  if (name.startsWith("set") || name.startsWith("record") || name.startsWith("write") || name.startsWith("remove") || name.startsWith("restart") || name.startsWith("start") || name.startsWith("stop")) return true;
  return {};
}

const api = new Proxy({}, {
  get(_target, prop){
    const name = String(prop);
    if (name.startsWith("on")) return () => () => {};
    return async (..._args) => defaultValue(name);
  }
});

Object.defineProperty(window, "hermesAPI", { value: api, configurable: true });
Object.defineProperty(window, "electron", { value: { process:{ platform:"linux" } }, configurable: true });
fetch("/api/auth/me", {credentials:"same-origin"})
  .then(r => {
    if (r.status === 401 && location.pathname !== "/login") {
      location.replace("/login?next=/");
    }
  })
  .catch(() => {});
report("shim-ready");
`;
fs.writeFileSync(path.join(src, "src/renderer/src/web-shim.ts"), shim);

const mainPath = path.join(src, "src/renderer/src/main.tsx");
let main = fs.readFileSync(mainPath, "utf8");
if (!main.includes("./web-shim")) main = 'import "./web-shim";\n' + main;
fs.writeFileSync(mainPath, main);

const appPath = path.join(src, "src/renderer/src/App.tsx");
let app = fs.readFileSync(appPath, "utf8");
app = app.replace("const SPLASH_MIN_MS = 3000;", "const SPLASH_MIN_MS = 0;");
fs.writeFileSync(appPath, app);

execSync("npm install --ignore-scripts", { cwd: src, stdio: "inherit" });
execSync("npx electron-vite build", { cwd: src, stdio: "inherit" });

const renderer = path.join(src, "out/renderer");
if (!fs.existsSync(path.join(renderer, "index.html"))) {
  throw new Error("Hermes One renderer build did not produce out/renderer/index.html");
}
console.log("HERMES_ONE_EXACT_RENDERER_BUILT");
