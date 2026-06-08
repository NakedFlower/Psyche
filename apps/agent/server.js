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
