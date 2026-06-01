const { createServer } = require("node:http");
const { readFile } = require("node:fs/promises");
const { existsSync } = require("node:fs");
const { extname, join, resolve } = require("node:path");
const { exec } = require("node:child_process");

const preferredPort = Number(process.env.PORT || 5173);
const root = process.pkg ? resolve(process.execPath, "..") : __dirname;
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
};

const server = createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host}`);
  const requestedPath = decodeURIComponent(url.pathname);
  const filePath = resolve(join(root, requestedPath === "/" ? "index.html" : requestedPath));

  if (!filePath.startsWith(root)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  if (!existsSync(filePath)) {
    response.writeHead(404);
    response.end("Not found");
    return;
  }

  try {
    const data = await readFile(filePath);
    response.writeHead(200, {
      "Content-Type": types[extname(filePath)] || "application/octet-stream",
    });
    response.end(data);
  } catch {
    response.writeHead(500);
    response.end("Server error");
  }
});

listenWithFallback(preferredPort);

function listenWithFallback(port, attempts = 0) {
  server.removeAllListeners("error");
  server.removeAllListeners("listening");
  server.once("error", (error) => {
    if (error.code === "EADDRINUSE" && attempts < 20) {
      setTimeout(() => listenWithFallback(port + 1, attempts + 1), 0);
      return;
    }
    throw error;
  });

  server.once("listening", () => {
    const actualPort = server.address().port;
    const url = `http://127.0.0.1:${actualPort}`;
    console.log(`PhotoPilot AI running at ${url}`);
    exec(`start "" "${url}"`);
  });
  server.listen(port, "127.0.0.1");
}
