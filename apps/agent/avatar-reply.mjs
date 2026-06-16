import fs from "node:fs";
import path from "node:path";
import { chatWithAzureOpenAI } from "./azure-openai-runtime.mjs";

export async function buildAvatarReplyJob({
  body,
  env = process.env,
  rootDir,
  readFetchResponse = defaultReadFetchResponse
}) {
  const missing = [];
  if (!env.AZURE_OPENAI_API_KEY) missing.push("AZURE_OPENAI_API_KEY");
  if (!env.ELEVENLABS_API_KEY) missing.push("ELEVENLABS_API_KEY");
  if (!env.ELEVENLABS_VOICE_ID) missing.push("ELEVENLABS_VOICE_ID");
  if (missing.length > 0) {
    return { status: 400, payload: { error: "Missing avatar reply environment variables", missing } };
  }

  const question = String(body.question || "").trim();
  if (!question) {
    return { status: 400, payload: { error: "Missing question" } };
  }

  const workerUrl = String(body.workerUrl || env.AVATAR_WORKER_URL || "http://127.0.0.1:8080").replace(/\/+$/, "");
  const engine = String(body.engine || env.AVATAR_LIPSYNC_ENGINE || "wav2lip").trim();
  const facePath = String(body.facePath || env.AVATAR_FACE_PATH || "models/assets/face-still.jpg").trim();
  const persona = loadPersonaForReply({ rootDir, env, personaFile: body.personaFile });

  const reply = await runStage("azure.reply", () => chatWithAzureOpenAI({
    system: [
      persona?.realtimeInstructions || "너는 Psyche의 미래 자아다. 한국어로 짧고 자연스럽게 답한다.",
      "",
      "지금 답변은 립싱크 영상으로 변환된다.",
      "반드시 1문장으로 답한다.",
      "TTS로 읽었을 때 2~4초 안에 끝날 정도로 짧게 답한다.",
      "문장 사이에 긴 목록이나 마크다운을 쓰지 않는다."
    ].join("\n"),
    prompt: [
      "사용자의 질문에 미래의 나 관점에서 답해줘.",
      `질문: ${question}`
    ].join("\n"),
    maxTokens: Number(env.AVATAR_REPLY_MAX_TOKENS || 120),
    temperature: Number(env.AVATAR_REPLY_TEMPERATURE || 0.75)
  }));

  const replyText = reply.text.trim();
  if (!replyText) {
    const rawFile = path.resolve(rootDir, "runs/avatar-replies", `azure-empty-${Date.now()}.json`);
    fs.mkdirSync(path.dirname(rawFile), { recursive: true });
    fs.writeFileSync(rawFile, JSON.stringify(reply.raw, null, 2) + "\n", "utf8");
    return {
      status: 502,
      payload: {
        error: "Azure returned an empty reply",
        azure: {
          deployment: reply.deployment,
          latencyMs: reply.latencyMs,
          rawKeys: reply.raw && typeof reply.raw === "object" ? Object.keys(reply.raw) : [],
          rawFile: path.relative(rootDir, rawFile),
          rawPreview: summarizeRawAzureResponse(reply.raw)
        }
      }
    };
  }

  const audio = await runStage("elevenlabs.tts", () => synthesizeElevenLabsMp3({ text: replyText, env, readFetchResponse }));
  const audioFile = path.resolve(rootDir, "runs/avatar-replies", `reply-${Date.now()}.mp3`);
  fs.mkdirSync(path.dirname(audioFile), { recursive: true });
  fs.writeFileSync(audioFile, audio);

  const form = new FormData();
  form.append("engine", engine);
  form.append("facePath", facePath);
  form.append("useFloat16", "true");
  form.append("audio", new Blob([audio], { type: "audio/mpeg" }), path.basename(audioFile));

  const workerResponse = await runStage("avatar-worker.job", () => fetch(`${workerUrl}/v1/lipsync/jobs`, {
    method: "POST",
    body: form
  }));
  const workerJob = await readFetchResponse(workerResponse);
  if (!workerResponse.ok) {
    return {
      status: workerResponse.status,
      payload: {
        error: "Avatar worker job creation failed",
        workerJob
      }
    };
  }

  return {
    status: 202,
    payload: {
      ok: true,
      replyText,
      audioFile: path.relative(rootDir, audioFile),
      engine,
      facePath,
      workerUrl,
      workerJob,
      azure: {
        deployment: reply.deployment,
        latencyMs: reply.latencyMs
      }
    }
  };
}

function loadPersonaForReply({ rootDir, env, personaFile }) {
  const requested = String(personaFile || env.AVATAR_PERSONA_FILE || "").trim();
  if (!requested) return null;
  const resolved = path.resolve(rootDir, requested);
  const relative = path.relative(rootDir, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative) || !fs.existsSync(resolved)) return null;
  return JSON.parse(fs.readFileSync(resolved, "utf8"));
}

async function synthesizeElevenLabsMp3({ text, env, readFetchResponse }) {
  const voiceId = env.ELEVENLABS_VOICE_ID;
  const modelId = env.ELEVENLABS_MODEL_ID || "eleven_multilingual_v2";
  const outputFormat = env.ELEVENLABS_OUTPUT_FORMAT || "mp3_44100_128";
  const url = new URL(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`);
  url.searchParams.set("output_format", outputFormat);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "xi-api-key": env.ELEVENLABS_API_KEY,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      text,
      model_id: modelId,
      language_code: "ko",
      voice_settings: {
        stability: Number(env.ELEVENLABS_STABILITY || 0.65),
        similarity_boost: Number(env.ELEVENLABS_SIMILARITY_BOOST || 0.8)
      }
    })
  });
  if (!response.ok) {
    const result = await readFetchResponse(response);
    throw new Error(`ElevenLabs TTS failed (${response.status}): ${typeof result === "string" ? result : JSON.stringify(result)}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

async function runStage(stage, task) {
  try {
    return await task();
  } catch (error) {
    const cause = error.cause
      ? {
          message: error.cause.message,
          code: error.cause.code,
          errno: error.cause.errno,
          address: error.cause.address,
          port: error.cause.port
        }
      : null;
    throw new Error(`${stage} failed: ${error.message}${cause ? ` cause=${JSON.stringify(cause)}` : ""}`);
  }
}

function summarizeRawAzureResponse(raw) {
  if (!raw || typeof raw !== "object") return raw;
  return {
    id: raw.id,
    status: raw.status,
    model: raw.model,
    outputText: raw.output_text,
    outputTypes: Array.isArray(raw.output)
      ? raw.output.map((item) => ({
          type: item.type,
          role: item.role,
          status: item.status,
          contentTypes: Array.isArray(item.content)
            ? item.content.map((content) => content.type || Object.keys(content))
            : []
        }))
      : [],
    usage: raw.usage,
    incompleteDetails: raw.incomplete_details,
    error: raw.error
  };
}

async function defaultReadFetchResponse(response) {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return response.json();
  }
  return response.text();
}
