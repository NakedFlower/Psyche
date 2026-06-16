import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "../..");

loadEnv(path.join(rootDir, ".env"));

const personaConfig = await loadPersonaConfig(process.env.AVATAR_PERSONA_FILE);
const { resolveVoiceProfile } = await import("./voice-profile.mjs");
const voiceProfile = resolveVoiceProfile({ env: process.env, personaConfig });

const config = {
  livekitUrl: process.env.LIVEKIT_URL,
  apiKey: process.env.LIVEKIT_API_KEY,
  apiSecret: process.env.LIVEKIT_API_SECRET,
  roomName: getCliValue("--room") || process.env.AVATAR_LAB_DEFAULT_ROOM || "psyche-avatar-lab",
  identity: getCliValue("--identity") || process.env.AVATAR_AGENT_IDENTITY || "psyche-node-agent",
  name: process.env.AVATAR_AGENT_NAME || "Psyche Node Agent",
  mode: getCliValue("--mode") || process.env.AVATAR_AGENT_MODE || "placeholder",
  listenSeconds: Number(process.env.AVATAR_AGENT_LISTEN_SECONDS || 4),
  maxTurns: Number(process.env.AVATAR_AGENT_MAX_TURNS || 3),
  maxWaitSeconds: Number(process.env.AVATAR_AGENT_MAX_WAIT_SECONDS || 20),
  vadThreshold: Number(process.env.AVATAR_AGENT_VAD_THRESHOLD || 250),
  vadMinSpeechMs: Number(process.env.AVATAR_AGENT_VAD_MIN_SPEECH_MS || 300),
  vadSilenceMs: Number(process.env.AVATAR_AGENT_VAD_SILENCE_MS || 900),
  interruptMinSpeechMs: Number(process.env.AVATAR_AGENT_INTERRUPT_MIN_SPEECH_MS || 100),
  interruptEnabled: process.env.AVATAR_AGENT_INTERRUPT_ENABLED !== "false",
  outputQueueMs: Number(process.env.AVATAR_AGENT_OUTPUT_QUEUE_MS || 120),
  sampleRate: Number(process.env.AVATAR_AGENT_SAMPLE_RATE || 48000),
  realtimeSampleRate: 24000,
  realtimeProvider: process.env.OPENAI_REALTIME_PROVIDER || "openai",
  openaiApiKey: process.env.OPENAI_API_KEY,
  openaiModel: process.env.OPENAI_REALTIME_MODEL || "gpt-realtime",
  azureOpenaiEndpoint: process.env.AZURE_OPENAI_ENDPOINT,
  azureOpenaiApiKey: process.env.AZURE_OPENAI_API_KEY,
  azureOpenaiDeployment: process.env.AZURE_OPENAI_DEPLOYMENT_NAME || "gpt-realtime",
  openaiVoice: voiceProfile.voice,
  openaiVoiceLabel: voiceProfile.voiceLabel,
  ttsProvider: process.env.AVATAR_AGENT_TTS_PROVIDER || "openai",
  elevenLabsApiKey: process.env.ELEVENLABS_API_KEY,
  elevenLabsVoiceId: process.env.ELEVENLABS_VOICE_ID,
  elevenLabsModelId: process.env.ELEVENLABS_MODEL_ID || "eleven_multilingual_v2",
  elevenLabsOutputFormat: process.env.ELEVENLABS_LIVEKIT_OUTPUT_FORMAT || "pcm_24000",
  videoReplyEnabled: process.env.AVATAR_AGENT_VIDEO_REPLY_ENABLED === "true",
  videoReplyWorkerUrl: (process.env.AVATAR_WORKER_URL || "http://127.0.0.1:8080").replace(/\/+$/, ""),
  videoReplyEngine: process.env.AVATAR_LIPSYNC_ENGINE || "wav2lip",
  videoReplyFacePath: process.env.AVATAR_FACE_PATH || "models/assets/face-still.jpg",
  videoReplySuppressRealtimeAudio: process.env.AVATAR_AGENT_VIDEO_REPLY_SUPPRESS_REALTIME_AUDIO !== "false",
  videoReplyPlayElevenLabsOnReady: process.env.AVATAR_AGENT_VIDEO_REPLY_PLAY_ELEVENLABS !== "false",
  videoReplyMaxAudioSeconds: Number(process.env.AVATAR_AGENT_VIDEO_REPLY_MAX_AUDIO_SECONDS || 4),
  voiceProfile,
  openaiInstructions:
    personaConfig?.realtimeInstructions ||
    process.env.OPENAI_REALTIME_INSTRUCTIONS ||
    "You are Psyche's future-self voice agent. Speak warmly and concisely in Korean unless the user asks otherwise.",
  openaiGreeting:
    process.env.AVATAR_AGENT_GREETING_ENABLED === "true"
      ? process.env.OPENAI_REALTIME_GREETING ||
        personaConfig?.firstGreeting ||
        "짧게 한국어로 인사하고, 지금은 Psyche 실시간 아바타 에이전트 연결 테스트 중이라고 말해줘."
      : "",
  fps: Number(process.env.AVATAR_AGENT_FPS || 10),
  width: Number(process.env.AVATAR_AGENT_VIDEO_WIDTH || 640),
  height: Number(process.env.AVATAR_AGENT_VIDEO_HEIGHT || 360),
  publishPlaceholderVideo: process.env.AVATAR_AGENT_PUBLISH_PLACEHOLDER_VIDEO === "true",
  mockAvatarEnabled: process.env.AVATAR_AGENT_MOCK_AVATAR_ENABLED !== "false",
  mockAvatarGain: Number(process.env.AVATAR_AGENT_MOCK_AVATAR_GAIN || 18),
  mockAvatarDecay: Number(process.env.AVATAR_AGENT_MOCK_AVATAR_DECAY || 0.72)
};

if (config.videoReplyEnabled) {
  config.openaiInstructions = [
    config.openaiInstructions,
    "",
    "Avatar video mode is enabled.",
    "Answer in Korean with exactly one short sentence.",
    "The answer must be speakable within 2 to 4 seconds.",
    "Do not explain, list, greet at length, or add follow-up questions."
  ].join("\n");
}

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
let elevenLabsOutput = null;
let listeningToUserAudio = false;
let agentState = "idle";
let avatarMouthLevel = 0;
let avatarLastAudioAt = 0;
let realtimeOutputAudioChunks = [];

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
if (config.publishPlaceholderVideo) {
  await publishPlaceholderVideo(room);
}
startHeartbeat(room);

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

log("ready", {
  room: config.roomName,
  identity: config.identity,
  mode: config.mode,
  note:
    config.mode === "realtime"
      ? "OpenAI Realtime audio is connected. User turns are gated by simple RMS VAD with barge-in support."
      : "OpenAI Realtime is not connected yet. This process is the Node agent transport skeleton."
});

await publishAgentState(room, "idle", {
  mode: config.mode,
  realtimeProvider: config.realtimeProvider,
  maxTurns: config.maxTurns,
  listenSeconds: config.listenSeconds,
  vadThreshold: config.vadThreshold,
  interruptEnabled: config.interruptEnabled,
  persona: personaConfig?.displayName || null,
  voice: config.openaiVoiceLabel,
  voiceMode: config.voiceProfile.mode,
  voiceGender: config.voiceProfile.gender,
  customVoice: config.voiceProfile.custom
});

async function publishRealtimeAudio(activeRoom) {
  const source = new AudioSource(config.realtimeSampleRate, 1, config.outputQueueMs);
  const track = LocalAudioTrack.createAudioTrack("agent-realtime-audio", source);
  const options = new TrackPublishOptions();
  options.source = TrackSource.SOURCE_MICROPHONE;

  await activeRoom.localParticipant.publishTrack(track, options);

  const { createOpenAIRealtimeAudioPump } = await import("./realtime-openai.mjs");
  if (config.ttsProvider === "elevenlabs") {
    const { createElevenLabsLiveKitOutput } = await import("./elevenlabs-livekit.mjs");
    elevenLabsOutput = createElevenLabsLiveKitOutput({
      apiKey: config.elevenLabsApiKey,
      voiceId: config.elevenLabsVoiceId,
      modelId: config.elevenLabsModelId,
      outputFormat: config.elevenLabsOutputFormat,
      audioSource: source,
      AudioFrame,
      log,
      onOutputAudioLevel: updateAvatarMouthLevel
    });
  }

  realtimePump = await createOpenAIRealtimeAudioPump({
    provider: config.realtimeProvider,
    apiKey: config.openaiApiKey,
    model: config.openaiModel,
    azureEndpoint: config.azureOpenaiEndpoint,
    azureApiKey: config.azureOpenaiApiKey,
    azureDeployment: config.azureOpenaiDeployment,
    voice: config.openaiVoice,
    instructions: config.openaiInstructions,
    prompt: config.openaiGreeting,
    outputMode: config.videoReplyEnabled ? "audio" : config.ttsProvider === "elevenlabs" ? "text" : "audio",
    audioSource: source,
    suppressAudioOutput:
      config.videoReplyEnabled &&
      config.ttsProvider === "elevenlabs" &&
      config.videoReplySuppressRealtimeAudio,
    clearAudioOutput: () => {
      elevenLabsOutput?.cancel("clear-output");
      source.clearQueue();
      realtimeOutputAudioChunks = [];
      resetAvatarMouthLevel();
    },
    onOutputAudioLevel: updateAvatarMouthLevel,
    onOutputAudioDelta: (bytes) => {
      if (!config.videoReplyEnabled) return;
      realtimeOutputAudioChunks.push(Buffer.from(bytes));
    },
    onOutputText: async (text, metadata = {}) => {
      if (!text.trim()) return;
      await elevenLabsOutput?.speak(text, metadata);
    },
    onResponseDone: async ({ transcript, text, responseId, usage }) => {
      if (!config.videoReplyEnabled) return;
      const replyText = (transcript || text || "").trim();
      const audioChunks = realtimeOutputAudioChunks;
      realtimeOutputAudioChunks = [];
      if (!audioChunks.length) {
        log("avatar.video.skipped", { reason: "no-realtime-audio", responseId });
        return;
      }
      await createAndPublishAvatarVideo({
        audioChunks,
        replyText,
        responseId,
        usage,
        source
      });
    },
    AudioFrame,
    log
  });

  shutdownTasks.push(async () => {
    realtimePump?.close();
    realtimePump = null;
    elevenLabsOutput?.cancel("shutdown");
    elevenLabsOutput = null;
    await track.close();
  });

  log("audio.realtime.published", {
    sampleRate: config.realtimeSampleRate,
    provider: config.realtimeProvider,
    model: config.openaiModel,
    azureDeployment:
      config.realtimeProvider === "azure" ? config.azureOpenaiDeployment : null,
    ttsProvider: config.ttsProvider,
    voice: config.openaiVoiceLabel,
    elevenLabsVoiceId: config.ttsProvider === "elevenlabs" ? config.elevenLabsVoiceId : null,
    elevenLabsModelId: config.ttsProvider === "elevenlabs" ? config.elevenLabsModelId : null,
    elevenLabsOutputFormat:
      config.ttsProvider === "elevenlabs" ? config.elevenLabsOutputFormat : null,
    voiceMode: config.voiceProfile.mode,
    voiceGender: config.voiceProfile.gender,
    customVoice: config.voiceProfile.custom,
    voiceFallbackReason: config.voiceProfile.fallbackReason,
    outputQueueMs: config.outputQueueMs
  });
}

async function createAndPublishAvatarVideo({ audioChunks, replyText, responseId, usage }) {
  const started = Date.now();
  const runDir = path.resolve(rootDir, "runs/realtime-avatar");
  fs.mkdirSync(runDir, { recursive: true });
  const baseName = `${Date.now()}-${responseId || "response"}`.replace(/[^a-zA-Z0-9_-]/g, "-");
  const audioFile = path.join(runDir, `${baseName}.wav`);
  const rawAudio = Buffer.concat(audioChunks);
  const maxAudioBytes = Math.max(1, Math.floor(config.videoReplyMaxAudioSeconds * config.realtimeSampleRate * 2));
  const clippedAudio = rawAudio.subarray(0, Math.min(rawAudio.byteLength, maxAudioBytes));
  writePcm16Wav(audioFile, clippedAudio, config.realtimeSampleRate, 1);

  await publishAgentState(room, "rendering-avatar", {
    responseId,
    replyText,
    engine: config.videoReplyEngine,
    facePath: config.videoReplyFacePath,
    capturedAudioSeconds: Number((rawAudio.byteLength / 2 / config.realtimeSampleRate).toFixed(2)),
    clippedAudioSeconds: Number((clippedAudio.byteLength / 2 / config.realtimeSampleRate).toFixed(2)),
    maxAudioSeconds: config.videoReplyMaxAudioSeconds
  });

  try {
    const form = new FormData();
    form.append("engine", config.videoReplyEngine);
    form.append("facePath", config.videoReplyFacePath);
    form.append("audio", new Blob([fs.readFileSync(audioFile)], { type: "audio/wav" }), path.basename(audioFile));

    const createResponse = await fetch(`${config.videoReplyWorkerUrl}/v1/lipsync/jobs`, {
      method: "POST",
      body: form
    });
    const created = await readFetchResponse(createResponse);
    if (!createResponse.ok) {
      throw new Error(`worker job failed (${createResponse.status}): ${JSON.stringify(created)}`);
    }

    const completed = await pollAvatarWorkerJob(created.jobId);
    const videoUrl = `${config.videoReplyWorkerUrl}${completed.videoUrl}?t=${Date.now()}`;

    await publishAvatarVideoReady({
      responseId,
      replyText,
      videoUrl,
      audioFile: path.relative(rootDir, audioFile),
      capturedAudioSeconds: Number((rawAudio.byteLength / 2 / config.realtimeSampleRate).toFixed(2)),
      clippedAudioSeconds: Number((clippedAudio.byteLength / 2 / config.realtimeSampleRate).toFixed(2)),
      maxAudioSeconds: config.videoReplyMaxAudioSeconds,
      workerJob: completed,
      muted: config.ttsProvider === "elevenlabs" && config.videoReplyPlayElevenLabsOnReady,
      usage,
      latencyMs: Date.now() - started
    });

    if (config.ttsProvider === "elevenlabs" && config.videoReplyPlayElevenLabsOnReady && replyText) {
      await publishAgentState(room, "speaking", {
        responseId,
        reason: "avatar.video.ready",
        ttsProvider: "elevenlabs"
      });
      await elevenLabsOutput?.speak(replyText, {
        reason: "avatar.video.ready",
        responseId
      });
      await publishAgentState(room, "idle", {
        responseId,
        reason: "avatar-video-speech-finished"
      });
    }
  } catch (error) {
    log("avatar.video.error", {
      message: error.message,
      responseId,
      engine: config.videoReplyEngine
    });
    await publishAgentState(room, "avatar-error", {
      responseId,
      message: error.message
    });
  }
}

async function pollAvatarWorkerJob(jobId) {
  const started = Date.now();
  while (Date.now() - started < 10 * 60 * 1000) {
    const response = await fetch(`${config.videoReplyWorkerUrl}/v1/lipsync/jobs/${encodeURIComponent(jobId)}`);
    const job = await readFetchResponse(response);
    if (!response.ok) {
      throw new Error(job.error || JSON.stringify(job));
    }
    if (job.status === "completed") return job;
    if (job.status === "failed") {
      throw new Error(job.stderrTail || job.error || JSON.stringify(job));
    }
    await publishAgentState(room, "rendering-avatar", {
      jobId,
      status: job.status,
      elapsedMs: Date.now() - started
    });
    await sleep(1200);
  }
  throw new Error(`Timed out waiting for avatar job ${jobId}`);
}

async function publishAvatarVideoReady(payload) {
  const event = {
    type: "avatar.video.ready",
    sessionId: config.roomName,
    at: Date.now(),
    ...payload
  };
  log("avatar.video.ready", event);
  await room.localParticipant.publishData(new TextEncoder().encode(JSON.stringify(event)), {
    reliable: true,
    topic: "psyche.avatar"
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
  let turn = 0;

  log("openai.realtime.input_started", {
    participant: participant.identity,
    listenSeconds: config.listenSeconds,
    maxTurns: config.maxTurns,
    vadThreshold: config.vadThreshold
  });

  const task = (async () => {
    try {
      while (!shuttingDown && turn < config.maxTurns) {
        const nextTurn = turn + 1;
        const turnStartedAt = Date.now();

        realtimePump?.beginInputTurn();
        await publishAgentState(room, "listening", {
          participant: participant.identity,
          turn: nextTurn,
          listenSeconds: config.listenSeconds,
          maxWaitSeconds: config.maxWaitSeconds,
          vadThreshold: config.vadThreshold,
          interruptEnabled: config.interruptEnabled,
          interruptMinSpeechMs: config.interruptMinSpeechMs,
          bargeInAvailable: Boolean(realtimePump?.isResponseInFlight())
        });

        const input = await captureSpeechTurn(reader, realtimePump, turnStartedAt);

        await publishAgentState(room, "thinking", {
          participant: participant.identity,
          turn: nextTurn,
          ...input
        });
        const committed = realtimePump?.commitInputAudio();
        log("openai.realtime.input_finished", {
          participant: participant.identity,
          turn: nextTurn,
          ...input
        });

        if (!committed) {
          log("openai.realtime.input_skipped", {
            participant: participant.identity,
            turn: nextTurn,
            reason: input.reason || "no-speech-detected"
          });
          await publishAgentState(room, "listening", {
            participant: participant.identity,
            turn: nextTurn,
            skipped: true,
            ...input
          });
          continue;
        }

        turn = nextTurn;
        realtimePump?.requestResponse("user-audio");
        await publishAgentState(room, "speaking", { turn });
      }

      if (realtimePump?.isResponseInFlight()) {
        await realtimePump.waitForResponseDone();
      }

      await publishAgentState(room, "idle", {
        participant: participant.identity,
        completedTurns: turn
      });
    } catch (error) {
      log("openai.realtime.input_error", {
        participant: participant.identity,
        message: error.message
      });
    } finally {
      listeningToUserAudio = false;
      reader.releaseLock();
    }
  })();

  shutdownTasks.push(async () => {
    await reader.cancel().catch(() => {});
    await task.catch(() => {});
  });
}

async function captureSpeechTurn(reader, pump, turnStartedAt) {
  const preRoll = [];
  const maxPreRollFrames = Math.ceil(config.vadMinSpeechMs / 20);
  const maxListenMs = config.listenSeconds * 1000;
  const maxWaitMs = config.maxWaitSeconds * 1000;
  let frames = 0;
  let committedFrames = 0;
  let speechMs = 0;
  let silenceMs = 0;
  let capturedMs = 0;
  let peakRms = 0;
  let speechStarted = false;
  let interrupted = false;
  let reason = "max-listen-reached";

  while (!shuttingDown && Date.now() - turnStartedAt < maxWaitMs) {
    const { done, value } = await reader.read();
    if (done) {
      reason = "track-ended";
      break;
    }

    frames += 1;
    const frameMs = getAudioFrameDurationMs(value);
    const rms = getAudioFrameRms(value);
    peakRms = Math.max(peakRms, rms);
    const isSpeechFrame = rms >= config.vadThreshold;

    if (!speechStarted) {
      preRoll.push(value);
      if (preRoll.length > maxPreRollFrames) preRoll.shift();

      if (isSpeechFrame) {
        speechMs += frameMs;
      } else {
        speechMs = 0;
      }

      const requiredSpeechMs =
        config.interruptEnabled && pump?.isResponseInFlight()
          ? config.interruptMinSpeechMs
          : config.vadMinSpeechMs;

      if (speechMs >= requiredSpeechMs) {
        speechStarted = true;
        if (config.interruptEnabled && pump?.isResponseInFlight()) {
          interrupted = pump.cancelResponse("user-barge-in");
          if (interrupted) {
            await publishAgentState(room, "interrupted", {
              peakRms: Math.round(peakRms),
              threshold: config.vadThreshold
            });
          }
        }
        for (const frame of preRoll) {
          pump?.appendInputAudioFrame(frame);
          committedFrames += 1;
        }
        preRoll.length = 0;
      }
      continue;
    }

    pump?.appendInputAudioFrame(value);
    committedFrames += 1;
    capturedMs += frameMs;

    if (isSpeechFrame) {
      silenceMs = 0;
    } else {
      silenceMs += frameMs;
    }

    if (capturedMs >= maxListenMs) {
      reason = "max-listen-reached";
      break;
    }

    if (silenceMs >= config.vadSilenceMs) {
      reason = "speech-ended";
      break;
    }
  }

  if (!speechStarted) {
    reason = "no-speech-detected";
  }

  return {
    frames,
    committedFrames,
    capturedMs: Math.round(capturedMs),
    speechMs: Math.round(speechMs),
    peakRms: Math.round(peakRms),
    interrupted,
    reason
  };
}

function getAudioFrameDurationMs(frame) {
  const sampleCount = Number(frame?.data?.length || 0);
  if (!sampleCount) return 20;
  return (sampleCount / config.realtimeSampleRate) * 1000;
}

function getAudioFrameRms(frame) {
  if (!frame?.data?.length) return 0;

  let sumSquares = 0;
  for (const sample of frame.data) {
    sumSquares += sample * sample;
  }
  return Math.sqrt(sumSquares / frame.data.length);
}

async function publishAgentState(activeRoom, state, details = {}) {
  agentState = state;
  const event = {
    type: "agent.state",
    sessionId: config.roomName,
    state,
    at: Date.now(),
    details
  };

  log("agent.state", event);

  if (!activeRoom.localParticipant) return;

  await activeRoom.localParticipant.publishData(new TextEncoder().encode(JSON.stringify(event)), {
    reliable: true,
    topic: "psyche.agent"
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
    const mouthLevel = getAvatarMouthLevel(frame);
    const rgba = drawPlaceholderFrame(config.width, config.height, frame, mouthLevel);
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
    fps: config.fps,
    mockAvatarEnabled: config.mockAvatarEnabled
  });
}

function updateAvatarMouthLevel(rms) {
  if (!config.mockAvatarEnabled) return;
  const nextLevel = Math.min(1, Math.max(0, rms * config.mockAvatarGain));
  avatarMouthLevel = Math.max(avatarMouthLevel, nextLevel);
  avatarLastAudioAt = Date.now();
}

function resetAvatarMouthLevel() {
  avatarMouthLevel = 0;
  avatarLastAudioAt = 0;
}

function getAvatarMouthLevel(frame) {
  if (!config.mockAvatarEnabled || config.mode !== "realtime") {
    return Math.abs(Math.sin(frame / 2));
  }

  if (Date.now() - avatarLastAudioAt > 280) {
    avatarMouthLevel *= config.mockAvatarDecay;
  }

  const level = Math.min(1, Math.max(0, avatarMouthLevel));
  avatarMouthLevel *= config.mockAvatarDecay;
  return level;
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

function drawPlaceholderFrame(width, height, frame, mouthLevel) {
  const bytes = new Uint8Array(width * height * 4);
  const pulse = (Math.sin(frame / 4) + 1) / 2;
  const mouth = Math.min(1, Math.max(0, mouthLevel));
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
  if (values.mode === "realtime" && values.realtimeProvider === "openai" && !values.openaiApiKey) {
    missing.push("OPENAI_API_KEY");
  }
  if (values.mode === "realtime" && values.realtimeProvider === "azure") {
    if (!values.azureOpenaiEndpoint) missing.push("AZURE_OPENAI_ENDPOINT");
    if (!values.azureOpenaiApiKey) missing.push("AZURE_OPENAI_API_KEY");
    if (!values.azureOpenaiDeployment) missing.push("AZURE_OPENAI_DEPLOYMENT_NAME");
  }
  if (values.mode === "realtime" && values.ttsProvider === "elevenlabs") {
    if (!values.elevenLabsApiKey) missing.push("ELEVENLABS_API_KEY");
    if (!values.elevenLabsVoiceId) missing.push("ELEVENLABS_VOICE_ID");
  }

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }

  if (!["placeholder", "realtime"].includes(values.mode)) {
    throw new Error(`Invalid AVATAR_AGENT_MODE: ${values.mode}`);
  }

  if (!["openai", "azure"].includes(values.realtimeProvider)) {
    throw new Error(`Invalid OPENAI_REALTIME_PROVIDER: ${values.realtimeProvider}`);
  }

  if (!["openai", "elevenlabs"].includes(values.ttsProvider)) {
    throw new Error(`Invalid AVATAR_AGENT_TTS_PROVIDER: ${values.ttsProvider}`);
  }
}

async function loadPersonaConfig(filePath) {
  if (!filePath) return null;

  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`AVATAR_PERSONA_FILE does not exist: ${resolved}`);
  }

  const raw = JSON.parse(fs.readFileSync(resolved, "utf8"));
  if (raw.realtimeInstructions) {
    return {
      displayName: raw.displayName || raw.predictedSelf?.displayName || "미래의 나",
      firstGreeting: raw.predictedSelf?.firstGreeting,
      realtimeInstructions: raw.realtimeInstructions,
      voice: raw.voiceProfile || raw.voice || null
    };
  }

  const { buildFutureSelfPersona } = await import("./persona-pipeline.mjs");
  const persona = buildFutureSelfPersona(raw);
  return {
    displayName: persona.displayName,
    firstGreeting: persona.predictedSelf.firstGreeting,
    realtimeInstructions: persona.realtimeInstructions,
    voice: persona.voiceProfile || null
  };
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

function writePcm16Wav(filePath, pcmBytes, sampleRate, channels) {
  const dataSize = pcmBytes.byteLength;
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * channels * 2, 28);
  header.writeUInt16LE(channels * 2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(dataSize, 40);
  fs.writeFileSync(filePath, Buffer.concat([header, pcmBytes]));
}

async function readFetchResponse(response) {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) return response.json();
  return response.text();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
