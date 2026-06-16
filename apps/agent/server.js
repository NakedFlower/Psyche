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
        realtimeProvider: process.env.OPENAI_REALTIME_PROVIDER || "openai",
        azureOpenaiEndpoint: Boolean(process.env.AZURE_OPENAI_ENDPOINT),
        azureOpenaiApiKey: Boolean(process.env.AZURE_OPENAI_API_KEY),
        azureOpenaiDeployment: process.env.AZURE_OPENAI_DEPLOYMENT_NAME || null,
        bedrockCredentials: Boolean(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY),
        bedrockModelId: process.env.BEDROCK_MODEL_ID || null,
        mode: "token-server-only"
      });
    }

    if (req.method === "POST" && url.pathname === "/api/livekit/token") {
      return await createLiveKitToken(req, res);
    }

    if (req.method === "POST" && url.pathname === "/api/persona/generate") {
      return await createPersona(req, res);
    }

    if (req.method === "POST" && url.pathname === "/api/voice/clone") {
      return await cloneVoice(req, res);
    }

    if (req.method === "POST" && url.pathname === "/api/avatar/future-image") {
      return await createFutureImage(req, res);
    }

    if (req.method === "POST" && url.pathname === "/api/avatar/reply") {
      return await createAvatarReply(req, res);
    }

    if (req.method === "GET" && url.pathname.startsWith("/runs/")) {
      return serveRunArtifact(url.pathname, res, req.method === "HEAD");
    }

    if (req.method === "GET" || req.method === "HEAD") {
      return serveStatic(url.pathname, res, req.method === "HEAD");
    }

    return sendJson(res, 404, { error: "Not found" });
  } catch (error) {
    console.error(
      JSON.stringify(
        {
          at: new Date().toISOString(),
          event: "request.error",
          message: error.message,
          stack: error.stack
        },
        null,
        2
      )
    );
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
  const provider = body.personaProvider || process.env.PERSONA_PROVIDER || "rule";
  const { buildFutureSelfPersona } = await import("./persona-pipeline.mjs");
  let persona = null;
  let warning = null;

  if (provider === "azure") {
    try {
      const { buildFutureSelfPersonaWithAzure } = await import("./azure-persona.mjs");
      persona = await buildFutureSelfPersonaWithAzure(body);
    } catch (error) {
      warning = `Azure persona generation failed; used rule fallback. ${error.message}`;
      persona = buildFutureSelfPersona(body);
      persona.provider = { name: "rule", fallbackFrom: "azure", warning };
    }
  } else if (provider === "bedrock") {
    try {
      const { buildFutureSelfPersonaWithBedrock } = await import("./bedrock-persona.mjs");
      persona = await buildFutureSelfPersonaWithBedrock(body);
    } catch (error) {
      warning = `Bedrock persona generation failed; used rule fallback. ${error.message}`;
      persona = buildFutureSelfPersona(body);
      persona.provider = { name: "rule", fallbackFrom: "bedrock", warning };
    }
  } else {
    persona = buildFutureSelfPersona(body);
    persona.provider = { name: "rule" };
  }

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
    provider: persona.provider || { name: provider },
    warning,
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

async function createAvatarReply(req, res) {
  const body = await readJson(req);
  const { buildAvatarReplyJob } = await import("./avatar-reply.mjs");
  const result = await buildAvatarReplyJob({
    body,
    rootDir,
    readFetchResponse
  });
  return sendJson(res, result.status, result.payload);
}

async function createFutureImage(req, res) {
  const imageConfig = getFutureImageConfig();
  if (imageConfig.missing.length) {
    return sendJson(res, 400, {
      error: "Missing image generation configuration",
      missing: imageConfig.missing
    });
  }

  const form = await readMultipartForm(req, { maxBytes: 25 * 1024 * 1024 });
  const photo = form.files.photo;
  if (!photo?.data?.length) {
    return sendJson(res, 400, { error: "Missing image file field: photo" });
  }

  const targetYears = String(form.fields.targetYears || "10").slice(0, 12);
  const style = String(form.fields.style || "natural").slice(0, 80);
  const originalName = path.basename(photo.filename || "portrait.png");
  const safeName = originalName.replace(/[^\w.-]/g, "-").slice(0, 120) || "portrait.png";
  const inputPath = path.resolve(rootDir, "runs/future-images/uploads", `${Date.now()}-${safeName}`);
  fs.mkdirSync(path.dirname(inputPath), { recursive: true });
  fs.writeFileSync(inputPath, photo.data);

  const prompt = [
    `Transform this user-provided portrait into a plausible ${targetYears}-years-in-the-future version of the same person.`,
    "Preserve identity, face structure, ethnicity, and recognizable features.",
    "Make it a natural photorealistic portrait suitable for a video-call avatar.",
    "Do not change the person into a celebrity or a different person.",
    "Keep the expression calm and approachable, looking toward the camera.",
    `Style preference: ${style}.`
  ].join(" ");

  const imageForm = new FormData();
  imageForm.append("model", imageConfig.model);
  imageForm.append("prompt", prompt);
  imageForm.append("size", imageConfig.size);
  imageForm.append("image", new Blob([photo.data], { type: photo.contentType || "image/png" }), safeName);

  const response = await fetch(imageConfig.url, {
    method: "POST",
    headers: imageConfig.headers,
    body: imageForm
  });
  const result = await readFetchResponse(response);
  if (!response.ok) {
    return sendJson(res, response.status, {
      error: "Future image generation failed",
      details: result
    });
  }

  const b64 = result.data?.[0]?.b64_json;
  if (!b64) {
    return sendJson(res, 502, {
      error: "Future image generation returned no image",
      details: result
    });
  }

  const outputPath = path.resolve(rootDir, "runs/future-images", `future-${Date.now()}.png`);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, Buffer.from(b64, "base64"));

  return sendJson(res, 200, {
    ok: true,
    inputFile: path.relative(rootDir, inputPath),
    outputFile: path.relative(rootDir, outputPath),
    imageUrl: `/${path.relative(rootDir, outputPath).replaceAll(path.sep, "/")}`,
    provider: imageConfig.provider,
    model: imageConfig.model,
    targetYears,
    style
  });
}

function getFutureImageConfig() {
  const provider = String(process.env.IMAGE_PROVIDER || process.env.OPENAI_IMAGE_PROVIDER || "").toLowerCase();
  const useAzure =
    provider === "azure" ||
    Boolean(process.env.AZURE_OPENAI_IMAGE_DEPLOYMENT || process.env.AZURE_OPENAI_IMAGE_ENDPOINT);

  if (useAzure) {
    const endpoint = normalizeAzureOpenAIEndpoint(
      process.env.AZURE_OPENAI_IMAGE_ENDPOINT ||
        process.env.AZURE_OPENAI_ENDPOINT ||
        process.env.AZURE_OPENAI_RESPONSES_URL ||
        ""
    );
    const deployment =
      process.env.AZURE_OPENAI_IMAGE_DEPLOYMENT ||
      process.env.AZURE_OPENAI_IMAGE_MODEL ||
      "gpt-image-2";
    const apiVersion =
      process.env.AZURE_OPENAI_IMAGE_API_VERSION ||
      process.env.AZURE_OPENAI_API_VERSION ||
      "preview";
    const url = endpoint.includes("/images/edits")
      ? endpoint
      : endpoint.includes("/images/generations")
        ? endpoint.replace("/images/generations", "/images/edits")
        : endpoint.includes("/openai/v1")
      ? `${endpoint.replace(/\/+$/, "")}/images/edits`
      : `${endpoint.replace(/\/+$/, "")}/openai/deployments/${encodeURIComponent(
          deployment
        )}/images/edits?api-version=${encodeURIComponent(apiVersion)}`;
    const apiKey = process.env.AZURE_OPENAI_IMAGE_API_KEY || process.env.AZURE_OPENAI_API_KEY;
    const bearerToken = process.env.AZURE_OPENAI_IMAGE_BEARER_TOKEN;

    return {
      provider: "azure",
      url,
      apiKey,
      bearerToken,
      missing: [
        !endpoint && "AZURE_OPENAI_IMAGE_ENDPOINT or AZURE_OPENAI_ENDPOINT",
        !deployment && "AZURE_OPENAI_IMAGE_DEPLOYMENT",
        !apiKey && !bearerToken && "AZURE_OPENAI_IMAGE_API_KEY or AZURE_OPENAI_API_KEY"
      ].filter(Boolean),
      model: deployment,
      size: process.env.AZURE_OPENAI_IMAGE_SIZE || process.env.OPENAI_IMAGE_SIZE || "1024x1024",
      headers: bearerToken ? { Authorization: `Bearer ${bearerToken}` } : { "api-key": apiKey }
    };
  }

  const apiKey = process.env.OPENAI_IMAGE_API_KEY || process.env.OPENAI_API_KEY;
  return {
    provider: "openai",
    url: "https://api.openai.com/v1/images/edits",
    apiKey,
    bearerToken: "",
    missing: [!apiKey && "OPENAI_IMAGE_API_KEY or OPENAI_API_KEY"].filter(Boolean),
    model: process.env.OPENAI_IMAGE_MODEL || "gpt-image-1",
    size: process.env.OPENAI_IMAGE_SIZE || "1024x1024",
    headers: { Authorization: `Bearer ${apiKey}` }
  };
}

function normalizeAzureOpenAIEndpoint(value) {
  const endpoint = String(value || "").trim();
  if (!endpoint) return "";
  if (endpoint.endsWith("/responses")) {
    return endpoint.slice(0, -"/responses".length);
  }
  if (endpoint.includes("/images/edits") || endpoint.includes("/images/generations")) {
    return endpoint;
  }
  return endpoint;
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

function serveRunArtifact(urlPath, res, headOnly = false) {
  const relative = decodeURIComponent(urlPath).replace(/^\/+/, "");
  const candidate = path.resolve(rootDir, relative);
  const runsDir = path.resolve(rootDir, "runs");
  if (!candidate.startsWith(runsDir)) {
    return sendJson(res, 403, { error: "Forbidden" });
  }
  if (!fs.existsSync(candidate) || !fs.statSync(candidate).isFile()) {
    return sendJson(res, 404, { error: "Not found" });
  }

  const contentType = getContentType(candidate);
  res.writeHead(200, {
    "Content-Type": contentType,
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*"
  });
  if (headOnly) return res.end();
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
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
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
