/**
 * SÓ PARA TESTES NAS SESSÕES NA NUVEM: o Worker local (wrangler dev) não passa pelo proxy que injeta a
 * chave da OpenAI. Este repassador escuta em 127.0.0.1:8789 e reenvia para api.openai.com pelo proxy.
 *   NODE_USE_ENV_PROXY=1 node scripts/repassar-openai.mjs
 * e no motor/.dev.vars: OPENAI_BASE_URL=http://127.0.0.1:8789
 */
import { createServer } from "node:http";

createServer(async (req, res) => {
  const partes = [];
  for await (const p of req) partes.push(p);
  const corpo = partes.length ? Buffer.concat(partes) : undefined;
  try {
    const r = await fetch("https://api.openai.com" + req.url, {
      method: req.method,
      headers: { authorization: req.headers.authorization ?? "", "content-type": req.headers["content-type"] ?? "application/json" },
      body: corpo,
    });
    res.writeHead(r.status, { "content-type": r.headers.get("content-type") ?? "application/json" });
    res.end(Buffer.from(await r.arrayBuffer()));
  } catch (e) {
    res.writeHead(502).end(String(e));
  }
}).listen(8789, "127.0.0.1", () => console.log("repassando 127.0.0.1:8789 → api.openai.com"));
