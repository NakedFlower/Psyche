const API_BASE = "https://api.elevenlabs.io/v1";

export function createElevenLabsLiveKitOutput({
  apiKey,
  voiceId,
  modelId,
  outputFormat = "pcm_24000",
  audioSource,
  AudioFrame,
  log,
  onOutputAudioLevel
}) {
  const sampleRate = parsePcmSampleRate(outputFormat);
  let generation = 0;
  let activeController = null;

  return {
    async speak(text, metadata = {}) {
      const currentGeneration = generation;
      const controller = new AbortController();
      activeController = controller;
      const started = performance.now();

      log("elevenlabs.tts.requested", {
        voiceId,
        modelId,
        outputFormat,
        chars: text.length,
        reason: metadata.reason || null
      });

      const pcm = await synthesizePcm({
        apiKey,
        voiceId,
        modelId,
        outputFormat,
        text,
        signal: controller.signal
      });

      if (currentGeneration !== generation) return;

      log("elevenlabs.tts.received", {
        voiceId,
        bytes: pcm.byteLength,
        latencyMs: Math.round(performance.now() - started)
      });

      await writePcmToLiveKit({
        pcm,
        sampleRate,
        audioSource,
        AudioFrame,
        isCurrent: () => currentGeneration === generation,
        onOutputAudioLevel
      });

      if (currentGeneration === generation) {
        log("elevenlabs.tts.played", {
          voiceId,
          durationMs: Math.round((pcm.byteLength / 2 / sampleRate) * 1000)
        });
      }
    },
    cancel(reason = "cancel") {
      generation += 1;
      activeController?.abort();
      activeController = null;
      log("elevenlabs.tts.cancelled", { reason });
    }
  };
}

async function synthesizePcm({ apiKey, voiceId, modelId, outputFormat, text, signal }) {
  const url = new URL(`${API_BASE}/text-to-speech/${voiceId}`);
  url.searchParams.set("output_format", outputFormat);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json"
    },
    signal,
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

  return Buffer.from(await response.arrayBuffer());
}

async function writePcmToLiveKit({
  pcm,
  sampleRate,
  audioSource,
  AudioFrame,
  isCurrent,
  onOutputAudioLevel
}) {
  const view = new DataView(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  const frameSamples = Math.max(1, Math.floor(sampleRate / 100));
  const totalSamples = Math.floor(pcm.byteLength / 2);

  for (let start = 0; start < totalSamples; start += frameSamples) {
    if (!isCurrent()) return;
    const samples = Math.min(frameSamples, totalSamples - start);
    const frame = new Int16Array(samples);
    let sumSquares = 0;

    for (let i = 0; i < samples; i += 1) {
      const value = view.getInt16((start + i) * 2, true);
      frame[i] = value;
      sumSquares += value * value;
    }

    if (samples > 0) {
      onOutputAudioLevel?.(Math.sqrt(sumSquares / samples) / 32768);
    }

    await audioSource.captureFrame(new AudioFrame(frame, sampleRate, 1, frame.length));
  }
}

function parsePcmSampleRate(outputFormat) {
  const match = /^pcm_(\d+)$/.exec(outputFormat);
  if (!match) {
    throw new Error(`ElevenLabs LiveKit output must be raw PCM, got: ${outputFormat}`);
  }
  return Number(match[1]);
}

async function readResponse(response) {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return response.json();
  }
  return response.text();
}

function stringifyBody(body) {
  return typeof body === "string" ? body : JSON.stringify(body);
}
