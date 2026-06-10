const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const rootDir = path.resolve(__dirname, "../..");
const webDir = path.resolve(rootDir, "apps/web");

loadEnv(path.join(rootDir, ".env"));

const host = process.env.AVATAR_LAB_HOST || process.env.HOST || "127.0.0.1";
const port = Number(process.env.AVATAR_LAB_PORT || process.env.PORT || 5174);
const defaultRoom = process.env.AVATAR_LAB_DEFAULT_ROOM || "psyche-avatar-lab";
const tokenTtlSeconds = Number(process.env.AVATAR_LAB_TOKEN_TTL_SECONDS || 3600);

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (req.method === "OPTIONS") {
      return sendEmpty(res, 204);
    }

    if (req.method === "GET" && url.pathname === "/health") {
      return sendJson(res, 200, {
        ok: true,
        service: "avatar-lab-agent",
        livekitUrl: Boolean(process.env.LIVEKIT_URL),
        livekitApiKey: Boolean(process.env.LIVEKIT_API_KEY),
        livekitApiSecret: Boolean(process.env.LIVEKIT_API_SECRET),
        openaiApiKey: Boolean(process.env.OPENAI_API_KEY),
        mode: "token-server-only"
      });
    }

    if (req.method === "POST" && url.pathname === "/api/livekit/token") {
      return createLiveKitToken(req, res);
    }

    if (req.method === "POST" && url.pathname === "/api/persona/generate") {
      return createPersona(req, res);
    }

    if (req.method === "POST" && url.pathname === "/api/voice/clone") {
      return cloneVoice(req, res);
    }

    if (req.method === "GET" || req.method === "HEAD") {
      return serveStatic(url.pathname, res, req.method === "HEAD");
    }

    return sendJson(res, 404, { error: "Not found" });
  } catch (error) {
    return sendJson(res, 500, {
      error: "Internal server error",
      message: error.message
    });
  }
});

server.listen(port, host, () => {
  console.log(`Psyche Avatar Lab running at http://${host}:${port}`);
  console.log("Mode: LiveKit token server + static browser test UI");
});

async function createLiveKitToken(req, res) {
  const missing = ["LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET"].filter(
    (key) => !process.env[key]
  );

  if (missing.length > 0) {
    return sendJson(res, 400, {
      error: "Missing LiveKit environment variables",
      missing
    });
  }

  const body = await readJson(req);
  const roomName = cleanRoomName(body.roomName || defaultRoom);
  const identity = cleanIdentity(body.identity || `browser-${crypto.randomUUID().slice(0, 8)}`);
  const name = String(body.name || identity).slice(0, 80);
  const canPublish = body.canPublish !== false;
  const canSubscribe = body.canSubscribe !== false;

  const token = signLiveKitJwt({
    apiKey: process.env.LIVEKIT_API_KEY,
    apiSecret: process.env.LIVEKIT_API_SECRET,
    identity,
    name,
    ttlSeconds: tokenTtlSeconds,
    grants: {
      roomJoin: true,
      room: roomName,
      canPublish,
      canSubscribe,
      canPublishData: true
    }
  });

  return sendJson(res, 200, {
    token,
    url: process.env.LIVEKIT_URL,
    roomName,
    identity,
    expiresInSeconds: tokenTtlSeconds
  });
}

async function createPersona(req, res) {
  const body = await readJson(req);
  const { buildFutureSelfPersona } = await import("./persona-pipeline.mjs");
  const persona = buildFutureSelfPersona(body);
  const fileName = `persona-${Date.now()}.json`;
  const output = path.resolve(rootDir, "runs/personas", fileName);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(persona, null, 2) + "\n", "utf8");

  return sendJson(res, 200, {
    ok: true,
    output,
    personaFile: path.relative(rootDir, output),
    displayName: persona.displayName,
    futureYear: persona.futureYear,
    futureAge: persona.futureAge,
    identityKeywords: persona.predictedSelf.identityKeywords,
    firstGreeting: persona.predictedSelf.firstGreeting,
    realtimeInstructions: persona.realtimeInstructions
  });
}

async function cloneVoice(req, res) {
  if (!process.env.ELEVENLABS_API_KEY) {
    return sendJson(res, 400, {
      error: "Missing ElevenLabs environment variable",
      missing: ["ELEVENLABS_API_KEY"]
    });
  }

  const form = await readMultipartForm(req, { maxBytes: 35 * 1024 * 1024 });
  const sample = form.files.sample;
  if (!sample?.data?.length) {
    return sendJson(res, 400, { error: "Missing voice sample file field: sample" });
  }

  const originalName = path.basename(sample.filename || "voice-sample.wav");
  const safeName = originalName.replace(/[^\w.-]/g, "-").slice(0, 120) || "voice-sample.wav";
  const samplePath = path.resolve(rootDir, "runs/voice-samples", `${Date.now()}-${safeName}`);
  fs.mkdirSync(path.dirname(samplePath), { recursive: true });
  fs.writeFileSync(samplePath, sample.data);

  const voiceName = String(form.fields.name || "Psyche Future Self Voice").slice(0, 80);
  const gender = String(form.fields.gender || "neutral").slice(0, 30);
  const description = String(
    form.fields.description || "Psyche user-owned voice clone for future-self avatar R&D."
  ).slice(0, 500);

  const elevenForm = new FormData();
  elevenForm.append("name", voiceName);
  elevenForm.append("description", description);
  elevenForm.append("remove_background_noise", String(form.fields.removeBackgroundNoise === "true"));
  elevenForm.append("labels", JSON.stringify({ app: "psyche", consent: "user-owned", gender }));
  elevenForm.append("files", new Blob([sample.data]), safeName);

  const response = await fetch("https://api.elevenlabs.io/v1/voices/add", {
    method: "POST",
    headers: {
      "xi-api-key": process.env.ELEVENLABS_API_KEY
    },
    body: elevenForm
  });
  const result = await readFetchResponse(response);

  if (!response.ok) {
    return sendJson(res, response.status, {
      error: "ElevenLabs voice clone failed",
      details: result
    });
  }

  const record = {
    provider: "elevenlabs",
    createdAt: new Date().toISOString(),
    name: voiceName,
    description,
    gender,
    voiceId: result.voice_id,
    requiresVerification: Boolean(result.requires_verification),
    sampleFile: samplePath
  };
  const output = path.resolve(rootDir, "runs/voices", `elevenlabs-${Date.now()}.json`);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(record, null, 2) + "\n", "utf8");

  return sendJson(res, 200, {
    ok: true,
    output,
    voiceFile: path.relative(rootDir, output),
    sampleFile: path.relative(rootDir, samplePath),
    ...record
  });
}

function signLiveKitJwt({ apiKey, apiSecret, identity, name, grants, ttlSeconds }) {
  const now = Math.floor(Date.now() / 1000);
  const header = {
    alg: "HS256",
    typ: "JWT"
  };
  const payload = {
    iss: apiKey,
    sub: identity,
    name,
    nbf: now - 5,
    exp: now + ttlSeconds,
    video: grants
  };

  const encodedHeader = base64url(JSON.stringify(header));
  const encodedPayload = base64url(JSON.stringify(payload));
  const signature = crypto
    .createHmac("sha256", apiSecret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest("base64url");

  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

function serveStatic(urlPath, res, headOnly = false) {
  const normalizedPath = urlPath === "/" ? "/index.html" : urlPath;
  const candidate = path.resolve(webDir, `.${decodeURIComponent(normalizedPath)}`);

  if (!candidate.startsWith(webDir)) {
    return sendJson(res, 403, { error: "Forbidden" });
  }

  if (!fs.existsSync(candidate) || !fs.statSync(candidate).isFile()) {
    return sendJson(res, 404, { error: "Not found" });
  }

  const contentType = getContentType(candidate);
  res.writeHead(200, {
    "Content-Type": contentType,
    "Cache-Control": "no-store"
  });
  if (headOnly) {
    return res.end();
  }
  fs.createReadStream(candidate).pipe(res);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) {
        req.destroy(new Error("Request body too large"));
      }
    });
    req.on("end", () => {
      if (!raw.trim()) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(new Error(`Invalid JSON body: ${error.message}`));
      }
    });
    req.on("error", reject);
  });
}

function readMultipartForm(req, { maxBytes }) {
  return new Promise((resolve, reject) => {
    const contentType = req.headers["content-type"] || "";
    const match = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType);
    if (!match) {
      reject(new Error("Expected multipart/form-data"));
      return;
    }

    const boundary = Buffer.from(`--${match[1] || match[2]}`);
    const chunks = [];
    let total = 0;

    req.on("data", (chunk) => {
      total += chunk.length;
      if (total > maxBytes) {
        req.destroy(new Error("Request body too large"));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        resolve(parseMultipart(Buffer.concat(chunks), boundary));
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function parseMultipart(body, boundary) {
  const fields = {};
  const files = {};
  let cursor = 0;

  while (cursor < body.length) {
    const boundaryIndex = body.indexOf(boundary, cursor);
    if (boundaryIndex === -1) break;
    const next = boundaryIndex + boundary.length;
    if (body.slice(next, next + 2).toString() === "--") break;

    const headerStart = next + 2;
    const headerEnd = body.indexOf(Buffer.from("\r\n\r\n"), headerStart);
    if (headerEnd === -1) break;

    const headers = body.slice(headerStart, headerEnd).toString("utf8");
    const dataStart = headerEnd + 4;
    const nextBoundary = body.indexOf(boundary, dataStart);
    if (nextBoundary === -1) break;

    const dataEnd = Math.max(dataStart, nextBoundary - 2);
    const data = body.slice(dataStart, dataEnd);
    const disposition = /content-disposition:\s*form-data;([^\r\n]+)/i.exec(headers)?.[1] || "";
    const name = /name="([^"]+)"/i.exec(disposition)?.[1];
    const filename = /filename="([^"]*)"/i.exec(disposition)?.[1];
    const contentType = /content-type:\s*([^\r\n]+)/i.exec(headers)?.[1]?.trim() || "";

    if (name && filename !== undefined) {
      files[name] = { filename, contentType, data };
    } else if (name) {
      fields[name] = data.toString("utf8");
    }

    cursor = nextBoundary;
  }

  return { fields, files };
}

async function readFetchResponse(response) {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return response.json();
  }
  return response.text();
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  });
  res.end(JSON.stringify(payload, null, 2));
}

function sendEmpty(res, status) {
  res.writeHead(status, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  });
  res.end();
}

function getContentType(filePath) {
  const ext = path.extname(filePath);
  if (ext === ".html") return "text/html; charset=utf-8";
  if (ext === ".js") return "text/javascript; charset=utf-8";
  if (ext === ".css") return "text/css; charset=utf-8";
  if (ext === ".json") return "application/json; charset=utf-8";
  if (ext === ".svg") return "image/svg+xml";
  return "application/octet-stream";
}

function cleanRoomName(value) {
  return String(value).trim().replace(/[^\w.-]/g, "-").slice(0, 96) || defaultRoom;
}

function cleanIdentity(value) {
  return String(value).trim().replace(/[^\w.@-]/g, "-").slice(0, 96) || "browser";
}

function base64url(input) {
  return Buffer.from(input).toString("base64url");
}

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;

  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;

    const key = trimmed.slice(0, eq).trim();
    const rawValue = trimmed.slice(eq + 1).trim();
    const value = rawValue.replace(/^['"]|['"]$/g, "");

    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}
