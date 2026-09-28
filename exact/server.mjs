import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const renderer = path.resolve(__dirname, "../exact-src/out/renderer");
const app = express();
app.use(express.json({limit:"64kb"}));
app.post("/client-log", (req,res) => {
  console.log("HERMES_ONE_CLIENT", JSON.stringify(req.body || {}));
  res.status(204).end();
});
app.get("/health", (_req,res)=>res.json({ok:true,ui:"Hermes One desktop renderer"}));
app.use(express.static(renderer));
app.use((_req,res)=>res.sendFile(path.join(renderer,"index.html")));
const port = process.env.PORT || 10000;
app.listen(port,"0.0.0.0",()=>console.log("HERMES_ONE_EXACT_WEB_READY port="+port));
