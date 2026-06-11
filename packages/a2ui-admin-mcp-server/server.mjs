import http from "node:http";

const port = Number(process.env.A2UI_MCP_PORT ?? "4100");
const nextAppUrl = (process.env.A2UI_NEXT_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");

function json(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(payload));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function forward(req, res, targetPath) {
  const body = req.method === "GET" || req.method === "HEAD" ? undefined : await readBody(req);
  const target = `${nextAppUrl}${targetPath}`;
  const response = await fetch(target, {
    method: req.method,
    headers: {
      "Content-Type": req.headers["content-type"] ?? "application/json",
      Accept: req.headers.accept ?? "application/json",
    },
    body,
  });

  const headers = Object.fromEntries(response.headers.entries());
  res.writeHead(response.status, headers);
  if (response.body) {
    const reader = response.body.getReader();
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      res.write(Buffer.from(value));
    }
  }
  res.end();
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

    if (url.pathname === "/health") {
      const response = await fetch(`${nextAppUrl}/api/mcp/health`);
      const payload = await response.json();
      json(res, response.ok ? 200 : response.status, {
        ...payload,
        proxy: "a2ui-admin-mcp-server",
        nextAppUrl,
      });
      return;
    }

    if (url.pathname === "/mcp") {
      await forward(req, res, "/api/mcp");
      return;
    }

    if (url.pathname.startsWith("/admin/templates")) {
      await forward(req, res, `/api${url.pathname}${url.search}`);
      return;
    }

    json(res, 404, { error: "Not found", routes: ["/health", "/mcp", "/admin/templates"] });
  } catch (error) {
    json(res, 500, { error: error instanceof Error ? error.message : String(error) });
  }
});

server.listen(port, () => {
  console.log(`A2UI Admin MCP proxy listening on http://localhost:${port}`);
  console.log(`Forwarding MCP/Admin requests to ${nextAppUrl}`);
});
