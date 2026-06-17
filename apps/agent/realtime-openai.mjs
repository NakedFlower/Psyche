export async function createOpenAIRealtimeAudioPump({
  provider = "openai",
  apiKey,
  model,
  azureEndpoint,
  azureApiKey,
  azureDeployment,
  voice,
  instructions,
  prompt,
  outputMode = "audio",
  audioSource,
  clearAudioOutput,
  suppressAudioOutput = false,
  onOutputAudioLevel,
  onOutputAudioDelta,
  onOutputText,
  onOutputTranscriptDelta,
  onResponseDone,
  AudioFrame,
  log
}) {
  const { ws, WebSocketImpl, modelLabel } = await createRealtimeSocket({
    provider,
    apiKey,
    model,
    azureEndpoint,
    azureApiKey,
    azureDeployment
  });
  const voiceLabel = getVoiceLabel(voice);

  let closed = false;
  let responseRequested = false;
  let responseInFlight = false;
  let responseDoneWaiters = [];
  let outputChunks = 0;
  let outputGeneration = 0;
  let audioWriteChain = Promise.resolve();
  let inputChunks = 0;
  let inputCommitted = false;
  const inputBuffers = [];
  let outputText = "";
  let outputTranscript = "";
  let currentInstructions = instructions;
  let currentPrompt = prompt;
  let currentVoice = voice;

  addSocketListener(ws, "open", () => {
    log("openai.realtime.connected", { provider, model: modelLabel, voice: voiceLabel });
    send(buildSessionUpdateEvent());
  });

  addSocketListener(ws, "message", (event) => {
    const data = event?.data ?? event;
    const raw = typeof data === "string" ? data : data.toString();
    handleServerEvent(raw).catch((error) => {
      log("openai.realtime.audio.error", { message: error.message });
    });
  });

  addSocketListener(ws, "close", (eventOrCode, maybeReason) => {
    closed = true;
    const code = typeof eventOrCode === "object" ? eventOrCode.code : eventOrCode;
    const reason = typeof eventOrCode === "object" ? eventOrCode.reason : maybeReason;
    log("openai.realtime.closed", {
      code,
      reason: reason?.toString?.() || "",
      outputChunks
    });
  });

  addSocketListener(ws, "error", (error) => {
    log("openai.realtime.error", { message: error.message || String(error) });
  });

  async function handleServerEvent(raw) {
    const event = JSON.parse(raw);

    if (event.type === "error") {
      log("openai.realtime.server_error", {
        message: event.error?.message,
        code: event.error?.code
      });
      return;
    }

    if (event.type === "session.updated" && !responseRequested && prompt) {
      responseRequested = true;
      sendResponseCreate("greeting");
      return;
    }

    if (event.type === "response.output_audio.delta" || event.type === "response.audio.delta") {
      outputChunks += 1;
      const generation = outputGeneration;
      audioWriteChain = audioWriteChain
        .then(() => capturePcm16Delta(event.delta, generation))
        .catch((error) => {
          log("openai.realtime.audio.error", { message: error.message });
        });
      return;
    }

    if (event.type === "response.output_text.delta" || event.type === "response.text.delta") {
      outputText += event.delta || "";
      log("openai.realtime.text_delta", { delta: event.delta });
      return;
    }

    if (
      event.type === "response.output_audio_transcript.delta" ||
      event.type === "response.audio_transcript.delta"
    ) {
      outputTranscript += event.delta || "";
      onOutputTranscriptDelta?.(event.delta || "");
      log("openai.realtime.audio_transcript_delta", { delta: event.delta });
      return;
    }

    if (event.type === "response.done") {
      const usage = event.response?.usage || null;
      log("openai.realtime.usage", {
        usage,
        estimatedCostUsd: estimateRealtimeCostUsd(usage)
      });
      log("openai.realtime.event", { type: event.type });
      if (outputMode === "text" && outputText.trim()) {
        await onOutputText?.(outputText, {
          reason: "response.done",
          usage,
          responseId: event.response?.id
        });
      }
      await audioWriteChain;
      await onResponseDone?.({
        reason: "response.done",
        usage,
        responseId: event.response?.id,
        text: outputText,
        transcript: outputTranscript
      });
      responseInFlight = false;
      resolveResponseDoneWaiters(event);
      outputText = "";
      outputTranscript = "";
      return;
    }

    if (
      event.type === "session.created" ||
      event.type === "response.created" ||
      event.type === "response.output_audio.done" ||
      event.type === "response.audio.done"
    ) {
      log("openai.realtime.event", { type: event.type });
    }
  }

  async function capturePcm16Delta(base64Audio, generation) {
    if (closed) return;
    if (!base64Audio) return;
    if (generation !== outputGeneration) return;

    const bytes = Buffer.from(base64Audio, "base64");
    onOutputAudioDelta?.(bytes, { generation });
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const pcm = new Int16Array(Math.floor(bytes.byteLength / 2));
    let sumSquares = 0;
    for (let i = 0; i < pcm.length; i += 1) {
      pcm[i] = view.getInt16(i * 2, true);
      sumSquares += pcm[i] * pcm[i];
    }

    if (pcm.length > 0) {
      onOutputAudioLevel?.(Math.sqrt(sumSquares / pcm.length) / 32768);
    }

    if (suppressAudioOutput) return;

    const frameSamples = 240;
    for (let start = 0; start < pcm.length; start += frameSamples) {
      if (closed) return;
      if (generation !== outputGeneration) return;
      const slice = pcm.subarray(start, start + frameSamples);
      const frame = new Int16Array(slice.length);
      frame.set(slice);
      await audioSource.captureFrame(new AudioFrame(frame, 24000, 1, frame.length));
    }
  }

  function send(event) {
    if (closed || ws.readyState !== WebSocketImpl.OPEN) return;
    ws.send(JSON.stringify(event));
  }

  return {
    beginInputTurn() {
      inputBuffers.length = 0;
      inputChunks = 0;
      inputCommitted = false;
    },
    appendInputAudioFrame(frame) {
      if (closed) return;
      const bytes = encodeAudioFrameBytes(frame);
      if (!bytes) return;
      inputBuffers.push(bytes);
      inputChunks += 1;
    },
    commitInputAudio() {
      if (closed || inputCommitted || inputChunks === 0) return false;
      inputCommitted = true;
      const audio = concatBase64(inputBuffers);
      send({
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "user",
          content: [
            {
              type: "input_audio",
              audio
            }
          ]
        }
      });
      log("openai.realtime.input_committed", {
        inputChunks,
        bytes: inputBuffers.reduce((sum, chunk) => sum + chunk.byteLength, 0)
      });
      return true;
    },
    requestResponse(reason = "manual") {
      if (closed) return;
      sendResponseCreate(reason);
    },
    isResponseInFlight() {
      return responseInFlight;
    },
    cancelResponse(reason = "barge-in") {
      if (closed || !responseInFlight) return false;
      outputGeneration += 1;
      responseInFlight = false;
      clearAudioOutput?.();
      send({ type: "response.cancel" });
      resolveResponseDoneWaiters({ type: "response.cancelled", reason });
      log("openai.realtime.response_cancelled", { reason });
      return true;
    },
    waitForResponseDone(timeoutMs = 30000) {
      if (!responseInFlight) return Promise.resolve(null);

      return new Promise((resolve) => {
        const timeout = setTimeout(() => {
          responseDoneWaiters = responseDoneWaiters.filter((waiter) => waiter !== done);
          resolve(null);
        }, timeoutMs);
        const done = (event) => {
          clearTimeout(timeout);
          resolve(event);
        };
        responseDoneWaiters.push(done);
      });
    },
    close() {
      closed = true;
      resolveResponseDoneWaiters(null);
      ws.close();
    },
    updateSession({ instructions: nextInstructions, prompt: nextPrompt, voice: nextVoice } = {}) {
      if (typeof nextInstructions === "string") currentInstructions = nextInstructions;
      if (typeof nextPrompt === "string") currentPrompt = nextPrompt;
      if (nextVoice !== undefined) currentVoice = nextVoice;
      send(buildSessionUpdateEvent());
    }
  };

  function sendResponseCreate(reason) {
    outputGeneration += 1;
    outputText = "";
    outputTranscript = "";
    responseInFlight = true;
    const response = {
      output_modalities: [outputMode],
      instructions: reason === "greeting" ? currentPrompt : undefined
    };

    if (outputMode === "audio") {
      response.audio = {
        output: {
          format: {
            type: "audio/pcm",
            rate: 24000
          },
          voice: currentVoice
        }
      };
    }

    send({
      type: "response.create",
      response
    });
  }

  function resolveResponseDoneWaiters(event) {
    const waiters = responseDoneWaiters;
    responseDoneWaiters = [];
    for (const waiter of waiters) {
      waiter(event);
    }
  }

  function buildSessionUpdateEvent() {
    return {
      type: "session.update",
      session: {
        type: "realtime",
        instructions: currentInstructions,
        output_modalities: [outputMode],
        audio: {
          input: {
            format: {
              type: "audio/pcm",
              rate: 24000
            }
          },
          ...(outputMode === "audio"
            ? {
                output: {
                  format: {
                    type: "audio/pcm",
                    rate: 24000
                  },
                  voice: currentVoice
                }
              }
            : {})
        }
      }
    };
  }
}

function encodeAudioFrameBytes(frame) {
  if (!frame?.data?.length) return null;

  const bytes = new Uint8Array(frame.data.length * 2);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < frame.data.length; i += 1) {
    view.setInt16(i * 2, frame.data[i], true);
  }
  return bytes;
}

function concatBase64(chunks) {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const merged = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return Buffer.from(merged).toString("base64");
}

function addSocketListener(socket, eventName, handler) {
  if (typeof socket.addEventListener === "function") {
    socket.addEventListener(eventName, handler);
    return;
  }

  socket.on(eventName, handler);
}

async function createRealtimeSocket({
  provider,
  apiKey,
  model,
  azureEndpoint,
  azureApiKey,
  azureDeployment
}) {
  if (provider === "azure") {
    if (!azureEndpoint) throw new Error("Missing AZURE_OPENAI_ENDPOINT");
    if (!azureApiKey) throw new Error("Missing AZURE_OPENAI_API_KEY");
    if (!azureDeployment) throw new Error("Missing AZURE_OPENAI_DEPLOYMENT_NAME");

    const { default: WsWebSocket } = await import("ws");
    const base = azureEndpoint.replace(/\/$/, "").replace(/\/openai\/v1$/, "");
    const url =
      `${base.replace(/^http:/, "ws:").replace(/^https:/, "wss:")}` +
      `/openai/v1/realtime?model=${encodeURIComponent(azureDeployment)}`;
    return {
      ws: new WsWebSocket(url, {
        headers: {
          "api-key": azureApiKey
        }
      }),
      WebSocketImpl: WsWebSocket,
      modelLabel: azureDeployment
    };
  }

  const WebSocketImpl = globalThis.WebSocket;
  if (!WebSocketImpl) {
    throw new Error("This Node runtime does not provide WebSocket. Use Node 22+.");
  }

  const url = `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(model)}`;
  const protocols = [
    "realtime",
    `openai-insecure-api-key.${apiKey}`,
    optionalProtocol("openai-organization", process.env.OPENAI_ORG_ID),
    optionalProtocol("openai-project", process.env.OPENAI_PROJECT_ID)
  ].filter(Boolean);

  return {
    ws: new WebSocketImpl(url, protocols),
    WebSocketImpl,
    modelLabel: model
  };
}

function optionalProtocol(prefix, value) {
  return value ? `${prefix}.${value}` : null;
}

function getVoiceLabel(voice) {
  if (typeof voice === "string") return voice;
  if (voice?.id) return voice.id;
  return "unknown";
}

function estimateRealtimeCostUsd(usage) {
  if (!usage) return null;

  const inputDetails = usage.input_token_details || {};
  const outputDetails = usage.output_token_details || {};
  const cachedDetails = inputDetails.cached_tokens_details || {};

  const cachedTextTokens = Number(cachedDetails.text_tokens || 0);
  const cachedAudioTokens = Number(cachedDetails.audio_tokens || 0);
  const textInputTokens = Math.max(Number(inputDetails.text_tokens || 0) - cachedTextTokens, 0);
  const audioInputTokens = Math.max(Number(inputDetails.audio_tokens || 0) - cachedAudioTokens, 0);
  const textOutputTokens = Number(outputDetails.text_tokens || 0);
  const audioOutputTokens = Number(outputDetails.audio_tokens || 0);

  const price = {
    textInput: Number(process.env.OPENAI_REALTIME_TEXT_INPUT_PER_1M || 4),
    textOutput: Number(process.env.OPENAI_REALTIME_TEXT_OUTPUT_PER_1M || 16),
    audioInput: Number(process.env.OPENAI_REALTIME_AUDIO_INPUT_PER_1M || 32),
    audioOutput: Number(process.env.OPENAI_REALTIME_AUDIO_OUTPUT_PER_1M || 64),
    cachedInput: Number(process.env.OPENAI_REALTIME_CACHED_INPUT_PER_1M || 0.4)
  };

  const total =
    (textInputTokens / 1_000_000) * price.textInput +
    (audioInputTokens / 1_000_000) * price.audioInput +
    (textOutputTokens / 1_000_000) * price.textOutput +
    (audioOutputTokens / 1_000_000) * price.audioOutput +
    ((cachedTextTokens + cachedAudioTokens) / 1_000_000) * price.cachedInput;

  return {
    total: roundUsd(total),
    tokenBreakdown: {
      textInputTokens,
      audioInputTokens,
      textOutputTokens,
      audioOutputTokens,
      cachedInputTokens: cachedTextTokens + cachedAudioTokens
    },
    pricePerMillion: price
  };
}

function roundUsd(value) {
  return Math.round(value * 1_000_000) / 1_000_000;
}
