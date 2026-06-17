#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "../..");

loadEnv(path.join(rootDir, ".env"));

const API_BASE = "https://api.elevenlabs.io/v1";

const command = process.argv[2];

if (!command || !["clone", "synthesize", "list", "delete"].includes(command)) {
  printUsage();
  process.exit(1);
}

try {
  if (command === "clone") {
    await cloneVoice();
  } else if (command === "list") {
    await listVoices();
  } else if (command === "delete") {
    await deleteVoice();
  } else {
    await synthesizeSpeech();
  }
} catch (error) {
  console.error(JSON.stringify({ status: "error", error: error.message }, null, 2));
  process.exit(1);
}

async function cloneVoice() {
  const samplePath = requiredArg("--sample");
  const name = getArg("--name") || `Psyche Future Self ${new Date().toISOString()}`;
  const description =
    getArg("--description") ||
    "Psyche user-owned voice clone for future-self avatar R&D.";
  const gender = getArg("--gender") || "neutral";
  const output = getArg("--output") || "runs/voices/elevenlabs-voice.json";
  const removeBackgroundNoise = process.argv.includes("--remove-background-noise");

  if (!process.argv.includes("--confirm-consent")) {
    throw new Error(
      "Voice cloning requires explicit consent. Re-run with --confirm-consent only for the user's own voice."
    );
  }

  const apiKey = requiredEnv("ELEVENLABS_API_KEY");

  const sample = path.resolve(samplePath);
  if (!fs.existsSync(sample)) {
    throw new Error(`Sample file does not exist: ${sample}`);
  }

  const form = new FormData();
  form.append("name", name);
  form.append("description", description);
  form.append("remove_background_noise", String(removeBackgroundNoise));
  form.append("labels", JSON.stringify({ app: "psyche", consent: "user-owned", gender }));
  form.append("files", new Blob([fs.readFileSync(sample)]), path.basename(sample));

  const response = await fetch(`${API_BASE}/voices/add`, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey
    },
    body: form
  });
  const body = await readResponse(response);

  if (!response.ok) {
    throw new Error(`ElevenLabs voice clone failed (${response.status}): ${stringifyBody(body)}`);
  }

  const record = {
    provider: "elevenlabs",
    createdAt: new Date().toISOString(),
    name,
    description,
    gender,
    voiceId: body.voice_id,
    requiresVerification: Boolean(body.requires_verification),
    sampleFile: sample
  };

  writeJson(output, record);
  console.log(JSON.stringify({ status: "ok", output: path.resolve(output), ...record }, null, 2));
}

async function listVoices() {
  const apiKey = requiredEnv("ELEVENLABS_API_KEY");
  const response = await fetch(`${API_BASE}/voices`, {
    headers: {
      "xi-api-key": apiKey
    }
  });
  const body = await readResponse(response);

  if (!response.ok) {
    throw new Error(`ElevenLabs voices list failed (${response.status}): ${stringifyBody(body)}`);
  }

  const voices = (body.voices || []).map((voice) => ({
    voiceId: voice.voice_id,
    name: voice.name,
    category: voice.category,
    labels: voice.labels || {}
  }));

  console.log(JSON.stringify({ status: "ok", count: voices.length, voices }, null, 2));
}

async function synthesizeSpeech() {
  const apiKey = requiredEnv("ELEVENLABS_API_KEY");
  const voiceId = requiredArg("--voice-id");
  const text = requiredArg("--text");
  const output = getArg("--output") || "runs/voices/elevenlabs-sample.mp3";
  const modelId = getArg("--model") || process.env.ELEVENLABS_MODEL_ID || "eleven_multilingual_v2";
  const outputFormat = getArg("--output-format") || process.env.ELEVENLABS_OUTPUT_FORMAT || "mp3_44100_128";
  const latency = getArg("--optimize-streaming-latency") || process.env.ELEVENLABS_OPTIMIZE_STREAMING_LATENCY || "";

  const url = new URL(`${API_BASE}/text-to-speech/${voiceId}`);
  url.searchParams.set("output_format", outputFormat);
  if (latency) {
    url.searchParams.set("optimize_streaming_latency", latency);
  }

  const started = performance.now();
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      text,
      model_id: modelId,
      language_code: "ko",
      voice_settings: {
        stability: Number(process.env.ELEVENLABS_STABILITY || 0.65),
        similarity_boost: Number(process.env.ELEVENLABS_SIMILARITY_BOOST || 0.8)
      }
    })
  });

  if (!response.ok) {
    const body = await readResponse(response);
    throw new Error(`ElevenLabs TTS failed (${response.status}): ${stringifyBody(body)}`);
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true });
  fs.writeFileSync(path.resolve(output), bytes);

  console.log(
    JSON.stringify(
      {
        status: "ok",
        provider: "elevenlabs",
        voiceId,
        modelId,
        outputFormat,
        output: path.resolve(output),
        bytes: bytes.byteLength,
        latencyMs: Math.round(performance.now() - started)
      },
      null,
      2
    )
  );
}

async function deleteVoice() {
  const apiKey = requiredEnv("ELEVENLABS_API_KEY");
  const voiceId = requiredArg("--voice-id");
  const response = await fetch(`${API_BASE}/voices/${voiceId}`, {
    method: "DELETE",
    headers: {
      "xi-api-key": apiKey
    }
  });
  const body = await readResponse(response);
  if (!response.ok) {
    throw new Error(`ElevenLabs voice delete failed (${response.status}): ${stringifyBody(body)}`);
  }
  console.log(JSON.stringify({ status: "ok", deletedVoiceId: voiceId, result: body }, null, 2));
}

async function readResponse(response) {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return response.json();
  }
  return response.text();
}

function writeJson(filePath, value) {
  const resolved = path.resolve(filePath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, JSON.stringify(value, null, 2) + "\n", "utf8");
}

function stringifyBody(body) {
  return typeof body === "string" ? body : JSON.stringify(body);
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function requiredArg(name) {
  const value = getArg(name);
  if (!value) {
    throw new Error(`Missing required argument: ${name}`);
  }
  return value;
}

function getArg(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return null;
  return process.argv[index + 1] || null;
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

function printUsage() {
  console.error(
    [
      "Usage:",
      "  node apps/agent/elevenlabs-voice.mjs list",
      "  node apps/agent/elevenlabs-voice.mjs delete --voice-id <voice-id>",
      "  node apps/agent/elevenlabs-voice.mjs clone --sample <audio.wav> --name <voice-name> --confirm-consent [--output runs/voices/voice.json]",
      "  node apps/agent/elevenlabs-voice.mjs synthesize --voice-id <voice-id> --text <korean text> [--output runs/voices/sample.mp3]"
    ].join("\n")
  );
}
