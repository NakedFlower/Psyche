import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "../..");

loadEnv(path.join(rootDir, ".env"));

const config = {
  livekitUrl: process.env.LIVEKIT_URL,
  apiKey: process.env.LIVEKIT_API_KEY,
  apiSecret: process.env.LIVEKIT_API_SECRET,
  roomName: getCliValue("--room") || process.env.AVATAR_LAB_DEFAULT_ROOM || "psyche-avatar-lab",
  identity: getCliValue("--identity") || process.env.AVATAR_AGENT_IDENTITY || "psyche-node-agent",
  name: process.env.AVATAR_AGENT_NAME || "Psyche Node Agent",
  mode: getCliValue("--mode") || process.env.AVATAR_AGENT_MODE || "placeholder",
  listenSeconds: Number(process.env.AVATAR_AGENT_LISTEN_SECONDS || 4),
  sampleRate: Number(process.env.AVATAR_AGENT_SAMPLE_RATE || 48000),
  realtimeSampleRate: 24000,
  openaiApiKey: process.env.OPENAI_API_KEY,
  openaiModel: process.env.OPENAI_REALTIME_MODEL || "gpt-realtime",
  openaiVoice: process.env.OPENAI_REALTIME_VOICE || "marin",
  openaiInstructions:
    process.env.OPENAI_REALTIME_INSTRUCTIONS ||
    "You are Psyche's future-self voice agent. Speak warmly and concisely in Korean unless the user asks otherwise.",
  openaiGreeting:
    process.env.OPENAI_REALTIME_GREETING ||
    "짧게 한국어로 인사하고, 지금은 Psyche 실시간 아바타 에이전트 연결 테스트 중이라고 말해줘.",
  fps: Number(process.env.AVATAR_AGENT_FPS || 10),
  width: Number(process.env.AVATAR_AGENT_VIDEO_WIDTH || 640),
  height: Number(process.env.AVATAR_AGENT_VIDEO_HEIGHT || 360)
};

try {
  validateConfig(config);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

const sdk = await importLiveKitRtcNode();
const {
  AudioFrame,
  AudioSource,
  AudioStream,
  LocalAudioTrack,
  LocalVideoTrack,
  Room,
  RoomEvent,
  TrackPublishOptions,
  TrackSource,
  VideoBufferType,
  VideoFrame,
  VideoSource,
  dispose
} = sdk;

const shutdownTasks = [];
let shuttingDown = false;
let realtimePump = null;
let listeningToUserAudio = false;

const token = signLiveKitJwt({
  apiKey: config.apiKey,
  apiSecret: config.apiSecret,
  identity: config.identity,
  name: config.name,
  ttlSeconds: 3600,
  grants: {
    roomJoin: true,
    room: config.roomName,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true
  }
});

const room = new Room();

room
  .on(RoomEvent.Connected, () => {
    log("connected", { room: config.roomName, identity: config.identity });
  })
  .on(RoomEvent.Disconnected, () => {
    log("disconnected", { room: config.roomName });
  })
  .on(RoomEvent.ParticipantConnected, (participant) => {
    log("participant.connected", { identity: participant.identity });
  })
  .on(RoomEvent.ParticipantDisconnected, (participant) => {
    log("participant.disconnected", { identity: participant.identity });
  })
  .on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
    log("track.subscribed", {
      participant: participant.identity,
      source: publication.source,
      kind: track.kind
    });
    if (config.mode === "realtime") {
      maybeForwardUserAudioToRealtime(track, publication, participant);
    }
  });

await room.connect(config.livekitUrl, token, {
  autoSubscribe: true,
  dynacast: true
});

if (config.mode === "realtime") {
  await publishRealtimeAudio(room);
} else {
  await publishPlaceholderAudio(room);
}
await publishPlaceholderVideo(room);
startHeartbeat(room);

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

log("ready", {
  room: config.roomName,
  identity: config.identity,
  mode: config.mode,
  note:
    config.mode === "realtime"
      ? "OpenAI Realtime greeting audio is connected. User audio forwarding is the next milestone."
      : "OpenAI Realtime is not connected yet. This process is the Node agent transport skeleton."
});

async function publishRealtimeAudio(activeRoom) {
  const source = new AudioSource(config.realtimeSampleRate, 1);
  const track = LocalAudioTrack.createAudioTrack("agent-realtime-audio", source);
  const options = new TrackPublishOptions();
  options.source = TrackSource.SOURCE_MICROPHONE;

  await activeRoom.localParticipant.publishTrack(track, options);

  const { createOpenAIRealtimeAudioPump } = await import("./realtime-openai.mjs");
  realtimePump = await createOpenAIRealtimeAudioPump({
    apiKey: config.openaiApiKey,
    model: config.openaiModel,
    voice: config.openaiVoice,
    instructions: config.openaiInstructions,
    prompt: config.openaiGreeting,
    audioSource: source,
    AudioFrame,
    log
  });

  shutdownTasks.push(async () => {
    realtimePump?.close();
    realtimePump = null;
    await track.close();
  });

  log("audio.realtime.published", {
    sampleRate: config.realtimeSampleRate,
    model: config.openaiModel,
    voice: config.openaiVoice
  });
}

function maybeForwardUserAudioToRealtime(track, publication, participant) {
  if (!realtimePump || listeningToUserAudio) return;

  const source = String(publication.source || "").toLowerCase();
  const kind = String(track.kind || "").toLowerCase();
  const isMicrophone =
    publication.source === TrackSource.SOURCE_MICROPHONE ||
    source.includes("microphone") ||
    source.includes("mic");
  const isAudio = track.kind === 1 || kind.includes("audio");

  if (!isAudio && !isMicrophone) return;

  listeningToUserAudio = true;
  const stream = new AudioStream(track, {
    sampleRate: config.realtimeSampleRate,
    numChannels: 1,
    frameSizeMs: 20
  });
  const reader = stream.getReader();
  const startedAt = Date.now();
  let frames = 0;

  log("openai.realtime.input_started", {
    participant: participant.identity,
    listenSeconds: config.listenSeconds
  });

  const task = (async () => {
    try {
      while (!shuttingDown && Date.now() - startedAt < config.listenSeconds * 1000) {
        const { done, value } = await reader.read();
        if (done) break;
        realtimePump?.appendInputAudioFrame(value);
        frames += 1;
      }

      realtimePump?.commitInputAudio();
      realtimePump?.requestResponse("user-audio");
      log("openai.realtime.input_finished", {
        participant: participant.identity,
        frames
      });
    } catch (error) {
      log("openai.realtime.input_error", {
        participant: participant.identity,
        message: error.message
      });
    } finally {
      reader.releaseLock();
    }
  })();

  shutdownTasks.push(async () => {
    await reader.cancel().catch(() => {});
    await task.catch(() => {});
  });
}

async function publishPlaceholderAudio(activeRoom) {
  const source = new AudioSource(config.sampleRate, 1);
  const track = LocalAudioTrack.createAudioTrack("agent-placeholder-audio", source);
  const options = new TrackPublishOptions();
  options.source = TrackSource.SOURCE_MICROPHONE;

  await activeRoom.localParticipant.publishTrack(track, options);

  const samplesPerChannel = Math.floor(config.sampleRate / 100);
  let totalSamples = 0;
  let stopped = false;

  const pump = async () => {
    while (!stopped && !shuttingDown) {
      const pcm = new Int16Array(samplesPerChannel);
      for (let i = 0; i < samplesPerChannel; i += 1) {
        const t = (totalSamples + i) / config.sampleRate;
        pcm[i] = Math.round(Math.sin(2 * Math.PI * 220 * t) * 320);
      }
      totalSamples += samplesPerChannel;
      await source.captureFrame(new AudioFrame(pcm, config.sampleRate, 1, samplesPerChannel));
    }
  };

  pump().catch((error) => log("audio.error", { message: error.message }));

  shutdownTasks.push(async () => {
    stopped = true;
    await track.close();
  });

  log("audio.published", { sampleRate: config.sampleRate });
}

async function publishPlaceholderVideo(activeRoom) {
  const source = new VideoSource(config.width, config.height);
  const track = LocalVideoTrack.createVideoTrack("agent-placeholder-video", source);
  const options = new TrackPublishOptions();
  options.source = TrackSource.SOURCE_CAMERA;

  await activeRoom.localParticipant.publishTrack(track, options);

  let frame = 0;
  const intervalMs = Math.max(33, Math.floor(1000 / config.fps));
  const timer = setInterval(() => {
    const rgba = drawPlaceholderFrame(config.width, config.height, frame);
    source.captureFrame(new VideoFrame(rgba, config.width, config.height, VideoBufferType.RGBA));
    frame += 1;
  }, intervalMs);

  shutdownTasks.push(async () => {
    clearInterval(timer);
    await track.close();
  });

  log("video.published", {
    width: config.width,
    height: config.height,
    fps: config.fps
  });
}

function startHeartbeat(activeRoom) {
  const send = async (reason) => {
    const event = {
      type: "latency.metric",
      sessionId: config.roomName,
      name: "webrtc_publish",
      valueMs: Math.round(performance.now() % 1000),
      at: Date.now(),
      reason,
      source: "node-agent"
    };

    await activeRoom.localParticipant.publishData(new TextEncoder().encode(JSON.stringify(event)), {
      reliable: true,
      topic: "psyche.latency"
    });
  };

  send("join").catch((error) => log("data.error", { message: error.message }));
  const timer = setInterval(() => {
    send("interval").catch((error) => log("data.error", { message: error.message }));
  }, 5000);

  shutdownTasks.push(async () => {
    clearInterval(timer);
  });
}

function drawPlaceholderFrame(width, height, frame) {
  const bytes = new Uint8Array(width * height * 4);
  const pulse = (Math.sin(frame / 4) + 1) / 2;
  const mouth = Math.abs(Math.sin(frame / 2));
  const cx = Math.floor(width / 2);
  const cy = Math.floor(height / 2) - 10;
  const radius = Math.floor(Math.min(width, height) * 0.22);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = (y * width + x) * 4;
      bytes[idx] = 18 + Math.floor((x / width) * 28);
      bytes[idx + 1] = 24 + Math.floor((y / height) * 42);
      bytes[idx + 2] = 24 + Math.floor(pulse * 30);
      bytes[idx + 3] = 255;
    }
  }

  fillCircle(bytes, width, height, cx, cy, radius, [231, 224, 209, 255]);
  fillCircle(bytes, width, height, cx - Math.floor(radius * 0.36), cy - Math.floor(radius * 0.22), 6, [
    36,
    48,
    45,
    255
  ]);
  fillCircle(bytes, width, height, cx + Math.floor(radius * 0.36), cy - Math.floor(radius * 0.22), 6, [
    36,
    48,
    45,
    255
  ]);

  const mouthWidth = Math.floor(radius * 0.62);
  const mouthHeight = Math.max(4, Math.floor(6 + mouth * 22));
  fillRect(
    bytes,
    width,
    height,
    cx - Math.floor(mouthWidth / 2),
    cy + Math.floor(radius * 0.32),
    mouthWidth,
    mouthHeight,
    [36, 48, 45, 255]
  );

  return bytes;
}

function fillCircle(bytes, width, height, cx, cy, radius, color) {
  const radiusSquared = radius * radius;
  for (let y = Math.max(0, cy - radius); y < Math.min(height, cy + radius); y += 1) {
    for (let x = Math.max(0, cx - radius); x < Math.min(width, cx + radius); x += 1) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy > radiusSquared) continue;
      const idx = (y * width + x) * 4;
      bytes[idx] = color[0];
      bytes[idx + 1] = color[1];
      bytes[idx + 2] = color[2];
      bytes[idx + 3] = color[3];
    }
  }
}

function fillRect(bytes, width, height, x, y, rectWidth, rectHeight, color) {
  for (let yy = Math.max(0, y); yy < Math.min(height, y + rectHeight); yy += 1) {
    for (let xx = Math.max(0, x); xx < Math.min(width, x + rectWidth); xx += 1) {
      const idx = (yy * width + xx) * 4;
      bytes[idx] = color[0];
      bytes[idx + 1] = color[1];
      bytes[idx + 2] = color[2];
      bytes[idx + 3] = color[3];
    }
  }
}

async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  log("shutdown", { tasks: shutdownTasks.length });

  for (const task of shutdownTasks.reverse()) {
    await task().catch((error) => log("shutdown.error", { message: error.message }));
  }

  await room.disconnect();
  await dispose();
  process.exit(0);
}

async function importLiveKitRtcNode() {
  try {
    return await import("@livekit/rtc-node");
  } catch (error) {
    console.error(
      [
        "Missing @livekit/rtc-node.",
        "Install dependencies before running the Node room agent:",
        "  npm install",
        "",
        `Original error: ${error.message}`
      ].join("\n")
    );
    process.exit(1);
  }
}

function validateConfig(values) {
  const missing = [];
  if (!values.livekitUrl) missing.push("LIVEKIT_URL");
  if (!values.apiKey) missing.push("LIVEKIT_API_KEY");
  if (!values.apiSecret) missing.push("LIVEKIT_API_SECRET");
  if (values.mode === "realtime" && !values.openaiApiKey) missing.push("OPENAI_API_KEY");

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }

  if (!["placeholder", "realtime"].includes(values.mode)) {
    throw new Error(`Invalid AVATAR_AGENT_MODE: ${values.mode}`);
  }
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

function getCliValue(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return null;
  return process.argv[index + 1] || null;
}

function base64url(input) {
  return Buffer.from(input).toString("base64url");
}

function log(event, payload = {}) {
  console.log(
    JSON.stringify({
      at: new Date().toISOString(),
      service: "psyche-room-agent",
      event,
      ...payload
    })
  );
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
