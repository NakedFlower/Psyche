export async function createOpenAIRealtimeAudioPump({
  apiKey,
  model,
  voice,
  instructions,
  prompt,
  audioSource,
  AudioFrame,
  log
}) {
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
  const ws = new WebSocketImpl(url, protocols);

  let closed = false;
  let responseRequested = false;
  let outputChunks = 0;
  let audioWriteChain = Promise.resolve();
  let inputChunks = 0;
  let inputCommitted = false;
  const inputBuffers = [];

  addSocketListener(ws, "open", () => {
    log("openai.realtime.connected", { model, voice });
    send({
      type: "session.update",
      session: {
        type: "realtime",
        instructions,
        output_modalities: ["audio"],
        audio: {
          input: {
            format: {
              type: "audio/pcm",
              rate: 24000
            }
          },
          output: {
            format: {
              type: "audio/pcm",
              rate: 24000
            },
            voice
          }
        }
      }
    });
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

    if (event.type === "session.updated" && !responseRequested) {
      responseRequested = true;
      send({
        type: "response.create",
        response: {
          output_modalities: ["audio"],
          audio: {
            output: {
              format: {
                type: "audio/pcm",
                rate: 24000
              },
              voice
            }
          },
          instructions: prompt
        }
      });
      return;
    }

    if (event.type === "response.output_audio.delta" || event.type === "response.audio.delta") {
      outputChunks += 1;
      audioWriteChain = audioWriteChain
        .then(() => capturePcm16Delta(event.delta))
        .catch((error) => {
          log("openai.realtime.audio.error", { message: error.message });
        });
      return;
    }

    if (event.type === "response.output_text.delta") {
      log("openai.realtime.text_delta", { delta: event.delta });
      return;
    }

    if (event.type === "response.output_audio_transcript.delta") {
      log("openai.realtime.audio_transcript_delta", { delta: event.delta });
      return;
    }

    if (
      event.type === "session.created" ||
      event.type === "response.created" ||
      event.type === "response.done" ||
      event.type === "response.output_audio.done" ||
      event.type === "response.audio.done"
    ) {
      log("openai.realtime.event", { type: event.type });
    }
  }

  async function capturePcm16Delta(base64Audio) {
    if (closed) return;
    if (!base64Audio) return;

    const bytes = Buffer.from(base64Audio, "base64");
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const pcm = new Int16Array(Math.floor(bytes.byteLength / 2));
    for (let i = 0; i < pcm.length; i += 1) {
      pcm[i] = view.getInt16(i * 2, true);
    }

    const frameSamples = 240;
    for (let start = 0; start < pcm.length; start += frameSamples) {
      if (closed) return;
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
    appendInputAudioFrame(frame) {
      if (closed) return;
      const bytes = encodeAudioFrameBytes(frame);
      if (!bytes) return;
      inputBuffers.push(bytes);
      inputChunks += 1;
    },
    commitInputAudio() {
      if (closed || inputCommitted || inputChunks === 0) return;
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
    },
    requestResponse(reason = "manual") {
      if (closed) return;
      sendResponseCreate(reason);
    },
    close() {
      closed = true;
      ws.close();
    }
  };

  function sendResponseCreate(reason) {
    send({
      type: "response.create",
      response: {
        output_modalities: ["audio"],
        audio: {
          output: {
            format: {
              type: "audio/pcm",
              rate: 24000
            },
            voice
          }
        },
        instructions: reason === "greeting" ? prompt : undefined
      }
    });
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

function optionalProtocol(prefix, value) {
  return value ? `${prefix}.${value}` : null;
}
