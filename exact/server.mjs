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
    for(const c of setCookies) res.append("Set-Cookie", c);
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
app.get("/login", (req,res)=>proxyFetch(req,res,"/login"+(req.url.includes("?")?req.url.slice(req.url.indexOf("?")):"")));
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
server.listen(port,"0.0.0.0",()=>{
  console.log("HERMES_ONE_EXACT_WEB_READY port="+port);
  bridgeRpcSelfTest()
    .then(result=>console.log("HERMES_ONE_BRIDGE_SELF_TEST_OK", JSON.stringify({catalogType:typeof result,keys:result&&typeof result==="object"?Object.keys(result).slice(0,12):[]})))
    .catch(error=>console.error("HERMES_ONE_BRIDGE_SELF_TEST_FAIL",String(error?.stack||error)));
});
