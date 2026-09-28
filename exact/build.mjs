import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const src = path.join(root, "exact-src");
fs.rmSync(src, { recursive: true, force: true });

execSync("git clone --depth 1 https://github.com/fathah/hermes-desktop.git exact-src", { stdio: "inherit" });

const shim = `
const backendUrl = "https://hermes-one-browser.onrender.com";
const safeProfile = { id:"default", name:"default", displayName:"nick", color:"#6b7280", avatar:null };

function defaultValue(name){
  if (name === "getConnectionConfig") return { mode:"remote", remoteUrl:backendUrl, connectionId:"render-hermes-one" };
  if (name === "testRemoteConnection") return true;
  if (name === "checkInstall") return { installed:true, hasApiKey:true, activeProfile:"default" };
  if (name === "verifyInstall") return true;
  if (name === "getConfigHealth") return { healthy:true, issues:[] };
  if (name === "gatewayStatus") return { running:true, enabled:true };
  if (name === "listProfiles") return [safeProfile];
  if (name === "getActiveProfile") return "default";
  if (name === "getProfile") return safeProfile;
  if (name === "getConnectionRevision") return 1;
  if (name === "getVersion") return "web";
  if (name.startsWith("list") || name.startsWith("search")) return [];
  if (name.startsWith("get")) return {};
  if (name.startsWith("check") || name.startsWith("test") || name.startsWith("verify")) return true;
  return true;
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
