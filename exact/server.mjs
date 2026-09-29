import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";
import { WebSocket, WebSocketServer } from "ws";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const renderer = path.resolve(__dirname, "../exact-src/out/renderer");
const BACKEND = (process.env.HERMES_BACKEND_URL || "https://hermes-one-browser.onrender.com").replace(/\/$/, "");

const app = express();
app.use(express.json({limit:"256kb"}));

app.post("/client-log", (req,res) => {
  console.log("HERMES_ONE_CLIENT", JSON.stringify(req.body || {}));
  res.status(204).end();
});
app.get("/health", (_req,res)=>res.json({ok:true,ui:"Hermes One desktop renderer"}));

function cookieHeaderFromResponse(response){
  const all = typeof response.headers.getSetCookie === "function"
    ? response.headers.getSetCookie()
    : (response.headers.get("set-cookie") ? [response.headers.get("set-cookie")] : []);
  return all.filter(Boolean);
}
function cookiePairs(setCookies){
  return setCookies.map(v => String(v).split(";",1)[0]).join("; ");
}
async function proxyFetch(req, res, backendPath){
  try{
    const headers = {};
    if(req.headers.cookie) headers.cookie = req.headers.cookie;
    if(req.headers["content-type"]) headers["content-type"] = req.headers["content-type"];
    const init = { method:req.method, headers, redirect:"manual" };
    if(!["GET","HEAD"].includes(req.method)){
      init.body = JSON.stringify(req.body ?? {});
    }
    const upstream = await fetch(BACKEND + backendPath, init);
    const body = Buffer.from(await upstream.arrayBuffer());
    const setCookies = cookieHeaderFromResponse(upstream);
    for(const c of setCookies) res.append("Set-Cookie", String(c).replace(/;\\s*Domain=[^;]+/ig,""));
    const ct=upstream.headers.get("content-type"); if(ct) res.set("Content-Type",ct);
    const location=upstream.headers.get("location"); if(location) res.set("Location", location);
    res.status(upstream.status).send(body);
  }catch(error){
    console.error("HERMES_ONE_PROXY_HTTP_ERROR", String(error?.stack||error));
    res.status(502).json({error:"backend_proxy_failed"});
  }
}

// Preserve the upstream Hermes auth flow on this origin. Backend cookies are
// re-issued by this server, so the browser never sees or stores backend secrets.
app.get("/login", (_req,res)=>res.type("html").send(`<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sign in — Hermes One</title>
<style>
:root{font-family:Manrope,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#ececec;background:#0d0f14}
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:
radial-gradient(900px 500px at 50% -10%,rgba(71,97,180,.18),transparent 65%),#0d0f14}
.card{width:min(420px,calc(100vw - 32px));background:#141720;border:1px solid rgba(255,255,255,.09);border-radius:16px;padding:32px;box-shadow:0 24px 80px rgba(0,0,0,.4)}
.brand{display:flex;align-items:center;gap:11px;margin-bottom:28px;font-weight:700;letter-spacing:-.03em}
.mark{width:34px;height:34px;border-radius:50%;display:grid;place-items:center;border:1px solid rgba(255,255,255,.14);background:#0a0b0f;font-size:12px}
.brand span{color:#f0f1f5}.brand b{color:#8c93a6;margin-left:4px}h1{font-size:24px;margin:0 0 7px}p{margin:0 0 24px;color:#8e95a8;font-size:13px;line-height:1.5}
label{display:block;font-size:12px;color:#aeb4c3;margin:0 0 7px}input{width:100%;height:43px;border-radius:8px;border:1px solid #303542;background:#0c0e13;color:#f0f1f5;padding:0 12px;outline:none;margin-bottom:16px}
input:focus{border-color:#526fbf;box-shadow:0 0 0 3px rgba(82,111,191,.12)}
button{width:100%;height:43px;border:0;border-radius:8px;background:#e9ebf2;color:#11151d;font-weight:700;cursor:pointer;margin-top:4px}
button:disabled{opacity:.55;cursor:default}.error{display:none;margin:14px 0 0;color:#ef8f96;font-size:12px}.foot{margin-top:20px;text-align:center;color:#626a7d;font-size:11px}
</style></head><body><main class="card">
<div class="brand"><div class="mark">H1</div><div><span>HERMES</span><b>ONE</b></div></div>
<h1>Sign in</h1><p>Connect to your Hermes One workspace.</p>
<form id="f"><label for="u">Username</label><input id="u" autocomplete="username" required>
<label for="p">Password</label><input id="p" type="password" autocomplete="current-password" required>
<button id="b" type="submit">Sign in</button><div class="error" id="e"></div></form>
<div class="foot">Secure remote gateway · authentication required</div>
</main><script>
const f=document.getElementById("f"),b=document.getElementById("b"),e=document.getElementById("e");
f.addEventListener("submit",async ev=>{ev.preventDefault();b.disabled=true;e.style.display="none";
try{const r=await fetch("/auth/password-login",{method:"POST",headers:{"content-type":"application/json"},credentials:"same-origin",body:JSON.stringify({provider:"basic",username:document.getElementById("u").value,password:document.getElementById("p").value,next:"/"})});
const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.detail||"Sign-in failed");location.replace(j.next||"/");}
catch(err){e.textContent=err.message||"Sign-in failed";e.style.display="block";b.disabled=false;}});
</script></body></html>`));
app.get("/api/auth/providers", (req,res)=>proxyFetch(req,res,"/api/auth/providers"));
app.get("/api/auth/me", (req,res)=>proxyFetch(req,res,"/api/auth/me"));
app.post("/auth/password-login", (req,res)=>proxyFetch(req,res,"/auth/password-login"));
app.post("/auth/logout", (req,res)=>proxyFetch(req,res,"/auth/logout"));

async function mintWsTicket(cookie){
  const response = await fetch(BACKEND + "/api/auth/ws-ticket", {
    method:"POST",
    headers:{ cookie: cookie || "" },
    redirect:"manual"
  });
  if(!response.ok){
    const text = await response.text();
    throw new Error("ws-ticket "+response.status+": "+text.slice(0,300));
  }
  const data = await response.json();
  if(!data?.ticket) throw new Error("ws-ticket response missing ticket");
  return data.ticket;
}

app.get("/bridge-health", async (req,res)=>{
  try{
    const ticket=await mintWsTicket(req.headers.cookie || "");
    res.json({ok:true,ticketMinted:!!ticket});
  }catch(error){
    res.status(401).json({ok:false,error:String(error?.message||error)});
  }
});


async function configuredAuthCookie(){
  const username=process.env.HERMES_BACKEND_USERNAME || "";
  const password=process.env.HERMES_BACKEND_PASSWORD || "";
  if(!username || !password) throw new Error("bridge self-test credentials are not configured");
  const response=await fetch(BACKEND+"/auth/password-login",{
    method:"POST",
    headers:{"content-type":"application/json"},
    body:JSON.stringify({provider:"basic",username,password,next:"/"})
  });
  if(!response.ok) throw new Error("password-login "+response.status+": "+(await response.text()).slice(0,200));
  const cookies=cookiePairs(cookieHeaderFromResponse(response));
  if(!cookies) throw new Error("password-login returned no session cookies");
  return cookies;
}
async function bridgeRpcSelfTest(){
  const cookie=await configuredAuthCookie();
  const ticket=await mintWsTicket(cookie);
  const url=new URL("/api/ws",BACKEND);
  url.protocol=url.protocol==="https:"?"wss:":"ws:";
  url.searchParams.set("ticket",ticket);
  return await new Promise((resolve,reject)=>{
    const ws=new WebSocket(url.toString());
    const timer=setTimeout(()=>{try{ws.close();}catch{};reject(new Error("RPC self-test timed out"));},10000);
    ws.on("open",()=>ws.send(JSON.stringify({jsonrpc:"2.0",id:"bridge-test",method:"commands.catalog",params:{}})));
    ws.on("message",(data)=>{
      try{
        const msg=JSON.parse(String(data));
        if(msg?.id!=="bridge-test") return;
        clearTimeout(timer);
        try{ws.close();}catch{}
        if(msg.error) reject(new Error("commands.catalog: "+JSON.stringify(msg.error)));
        else resolve(msg.result);
      }catch{}
    });
    ws.on("error",(e)=>{clearTimeout(timer);reject(e);});
  });
}

app.use(express.static(renderer));
app.use((_req,res)=>res.sendFile(path.join(renderer,"index.html")));

const server=createServer(app);
const browserWss=new WebSocketServer({noServer:true});

server.on("upgrade", async (req,socket,head)=>{
  if(!req.url?.startsWith("/hermes-ws")){
    socket.destroy(); return;
  }
  try{
    const ticket=await mintWsTicket(req.headers.cookie || "");
    const upstreamUrl=new URL("/api/ws", BACKEND);
    upstreamUrl.protocol=upstreamUrl.protocol==="https:"?"wss:":"ws:";
    upstreamUrl.searchParams.set("ticket",ticket);

    browserWss.handleUpgrade(req,socket,head,(browser)=>{
      const upstream=new WebSocket(upstreamUrl.toString());
      let opened=false;
      const queued=[];
      browser.on("message",(data,isBinary)=>{
        if(opened && upstream.readyState===WebSocket.OPEN) upstream.send(data,{binary:isBinary});
        else queued.push([data,isBinary]);
      });
      upstream.on("open",()=>{
        opened=true;
        for(const [data,isBinary] of queued) upstream.send(data,{binary:isBinary});
        queued.length=0;
      });
      upstream.on("message",(data,isBinary)=>{
        if(browser.readyState===WebSocket.OPEN) browser.send(data,{binary:isBinary});
      });
      const closeBoth=(code=1011,reason="bridge closed")=>{
        try{ if(browser.readyState===WebSocket.OPEN) browser.close(code,reason); }catch{}
        try{ if(upstream.readyState===WebSocket.OPEN||upstream.readyState===WebSocket.CONNECTING) upstream.close(); }catch{}
      };
      browser.on("close",()=>closeBoth(1000,"browser closed"));
      browser.on("error",(e)=>{console.error("HERMES_ONE_BROWSER_WS_ERROR",String(e?.message||e));closeBoth();});
      upstream.on("close",(code,reason)=>{
        console.log("HERMES_ONE_UPSTREAM_WS_CLOSE",code,String(reason||""));
        closeBoth(code||1011,"upstream closed");
      });
      upstream.on("error",(e)=>{
        console.error("HERMES_ONE_UPSTREAM_WS_ERROR",String(e?.message||e));
        closeBoth();
      });
    });
  }catch(error){
    console.error("HERMES_ONE_WS_BRIDGE_AUTH_ERROR", String(error?.stack||error));
    try{socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");}catch{}
    socket.destroy();
  }
});

const port=process.env.PORT||10000;
server.listen(port,"0.0.0.0",()=>console.log("HERMES_ONE_EXACT_WEB_READY port="+port));
