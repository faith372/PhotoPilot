import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";

const preferredPort = Number(process.env.PORT || 5173);
const root = resolve(import.meta.dirname);
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

const providerDefaults = {
  openai: {
    label: "ChatGPT / OpenAI",
    baseUrl: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1/chat/completions",
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    type: "openai-compatible",
  },
  deepseek: {
    label: "DeepSeek",
    baseUrl: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com/chat/completions",
    model: process.env.DEEPSEEK_MODEL || "deepseek-chat",
    type: "openai-compatible",
  },
  kimi: {
    label: "Kimi",
    baseUrl: process.env.KIMI_BASE_URL || "https://api.moonshot.cn/v1/chat/completions",
    model: process.env.KIMI_MODEL || "moonshot-v1-8k-vision-preview",
    type: "openai-compatible",
  },
  claude: {
    label: "Claude",
    baseUrl: process.env.CLAUDE_BASE_URL || "https://api.anthropic.com/v1/messages",
    model: process.env.CLAUDE_MODEL || "claude-3-5-sonnet-latest",
    type: "anthropic",
  },
  "openai-compatible": {
    label: "OpenAI Compatible",
    baseUrl: process.env.COMPATIBLE_BASE_URL || "https://api.openai.com/v1/chat/completions",
    model: process.env.COMPATIBLE_MODEL || "gpt-4o-mini",
    type: "openai-compatible",
  },
};

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host}`);

  if (request.method === "POST" && url.pathname === "/api/score") {
    await handleScoreRequest(request, response);
    return;
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    sendJson(response, 405, { message: "Method not allowed" });
    return;
  }

  await serveStatic(url, response);
});

async function serveStatic(url, response) {
  const requestedPath = decodeURIComponent(url.pathname);
  const filePath = resolve(join(root, requestedPath === "/" ? "index.html" : requestedPath));

  if (!filePath.startsWith(root)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  try {
    const data = await readFile(filePath);
    response.writeHead(200, {
      "Content-Type": types[extname(filePath)] ?? "application/octet-stream",
    });
    response.end(data);
  } catch {
    response.writeHead(404);
    response.end("Not found");
  }
}

async function handleScoreRequest(request, response) {
  try {
    const body = await readJsonBody(request);
    const { settings, photos } = body;
    const provider = normalizeProvider(settings?.provider);
    const apiKey = settings?.apiKey;

    if (!apiKey) {
      sendJson(response, 400, { message: "Missing API key." });
      return;
    }

    if (!settings?.uploadConsent) {
      sendJson(response, 400, { message: "Upload consent is required before cloud scoring." });
      return;
    }

    if (!Array.isArray(photos) || !photos.length) {
      sendJson(response, 400, { message: "No photos to score." });
      return;
    }

    const config = providerDefaults[provider];
    const results = config.type === "anthropic" ? await scoreWithAnthropic(config, apiKey, photos) : await scoreWithOpenAICompatible(config, apiKey, photos);
    sendJson(response, 200, { provider, results });
  } catch (error) {
    sendJson(response, 500, { message: error.message || "Scoring failed." });
  }
}

function normalizeProvider(provider) {
  return Object.hasOwn(providerDefaults, provider) ? provider : "openai-compatible";
}

async function scoreWithOpenAICompatible(config, apiKey, photos) {
  const response = await fetch(config.baseUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: scoringSystemPrompt(),
        },
        {
          role: "user",
          content: buildOpenAIContent(photos),
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`${config.label} API error: ${response.status} ${await response.text()}`);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content ?? "";
  return parseScoringResult(text, photos);
}

async function scoreWithAnthropic(config, apiKey, photos) {
  const response = await fetch(config.baseUrl, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: 1600,
      temperature: 0.2,
      system: scoringSystemPrompt(),
      messages: [
        {
          role: "user",
          content: buildAnthropicContent(photos),
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`${config.label} API error: ${response.status} ${await response.text()}`);
  }

  const data = await response.json();
  const text = (data.content ?? []).filter((part) => part.type === "text").map((part) => part.text).join("\n");
  return parseScoringResult(text, photos);
}

function scoringSystemPrompt() {
  return [
    "You are PhotoPilot, a strict but practical photography culling assistant.",
    "Score photos from 0 to 100 for photography selection.",
    "Use the local metrics as evidence, then adjust only when image content or visual aesthetics justify it.",
    "Return JSON only, no markdown.",
    "Schema: {\"results\":[{\"id\":\"photo id\",\"finalScore\":0-100,\"metrics\":{\"sharpness\":0-100,\"exposure\":0-100,\"composition\":0-100,\"color\":0-100,\"dynamicRange\":0-100,\"expression\":0-100|null,\"duplicate\":0-100},\"confidence\":0-100,\"notes\":[\"short Chinese reason\"]}]}",
  ].join(" ");
}

function buildOpenAIContent(photos) {
  const content = [
    {
      type: "text",
      text: `请复核这些照片的选片价值。每张照片都包含本地像素评分指标，部分模型可以查看缩略图。输出必须是 JSON。照片摘要：${JSON.stringify(summarizePhotos(photos))}`,
    },
  ];

  photos.forEach((photo) => {
    if (photo.imageDataUrl) {
      content.push({
        type: "image_url",
        image_url: { url: photo.imageDataUrl },
      });
    }
  });

  return content;
}

function buildAnthropicContent(photos) {
  const content = [
    {
      type: "text",
      text: `请复核这些照片的选片价值。每张照片都包含本地像素评分指标，部分模型可以查看缩略图。输出必须是 JSON。照片摘要：${JSON.stringify(summarizePhotos(photos))}`,
    },
  ];

  photos.forEach((photo) => {
    const parsed = parseDataUrl(photo.imageDataUrl);
    if (!parsed) return;
    content.push({
      type: "image",
      source: {
        type: "base64",
        media_type: parsed.mediaType,
        data: parsed.base64,
      },
    });
  });

  return content;
}

function summarizePhotos(photos) {
  return photos.map((photo) => ({
    id: photo.id,
    name: photo.name,
    type: photo.type,
    localScore: photo.localScore,
  }));
}

function parseScoringResult(text, photos) {
  const json = extractJson(text);
  const parsed = JSON.parse(json);
  const results = Array.isArray(parsed.results) ? parsed.results : [];
  const ids = new Set(photos.map((photo) => photo.id));
  return results
    .filter((item) => ids.has(item.id))
    .map((item) => ({
      id: item.id,
      finalScore: clamp(Number(item.finalScore), 0, 100),
      metrics: item.metrics ?? {},
      confidence: clamp(Number(item.confidence ?? 80), 0, 100),
      notes: Array.isArray(item.notes) ? item.notes.slice(0, 5).map(String) : [],
    }));
}

function extractJson(text) {
  const trimmed = String(text).trim();
  if (trimmed.startsWith("{")) return trimmed;
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1);
  throw new Error("Model response did not contain JSON.");
}

function parseDataUrl(dataUrl) {
  if (!dataUrl) return null;
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
  if (!match) return null;
  return { mediaType: match[1], base64: match[2] };
}

function clamp(value, min, max) {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 8 * 1024 * 1024) {
        reject(new Error("Request body too large."));
        request.destroy();
      }
    });
    request.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch {
        reject(new Error("Invalid JSON body."));
      }
    });
    request.on("error", reject);
  });
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(payload));
}

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
    console.log(`PhotoPilot AI running at http://127.0.0.1:${actualPort}`);
  });
  server.listen(port, "127.0.0.1");
}
