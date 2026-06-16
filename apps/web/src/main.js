import { Room, RoomEvent, Track } from "https://esm.sh/livekit-client@2?bundle";

const state = {
  room: null,
  remoteElements: new Map(),
  localElements: [],
  hiddenAudioElements: []
};

const elements = {
  form: document.getElementById("joinForm"),
  tokenEndpoint: document.getElementById("tokenEndpoint"),
  roomName: document.getElementById("roomName"),
  identity: document.getElementById("identity"),
  joinButton: document.getElementById("joinButton"),
  leaveButton: document.getElementById("leaveButton"),
  personaForm: document.getElementById("personaForm"),
  targetYear: document.getElementById("targetYear"),
  personaProvider: document.getElementById("personaProvider"),
  surveyAge: document.getElementById("surveyAge"),
  surveyMbti: document.getElementById("surveyMbti"),
  voiceGender: document.getElementById("voiceGender"),
  surveyValues: document.getElementById("surveyValues"),
  surveyGoals: document.getElementById("surveyGoals"),
  surveyConcerns: document.getElementById("surveyConcerns"),
  surveyRoutine: document.getElementById("surveyRoutine"),
  surveyLongGame: document.getElementById("surveyLongGame"),
  weightIdeal: document.getElementById("weightIdeal"),
  weightCareer: document.getElementById("weightCareer"),
  weightDirect: document.getElementById("weightDirect"),
  generatePersonaButton: document.getElementById("generatePersonaButton"),
  voiceCloneForm: document.getElementById("voiceCloneForm"),
  voiceSample: document.getElementById("voiceSample"),
  voiceCloneName: document.getElementById("voiceCloneName"),
  voiceCloneGender: document.getElementById("voiceCloneGender"),
  voiceConsent: document.getElementById("voiceConsent"),
  cloneVoiceButton: document.getElementById("cloneVoiceButton"),
  avatarDemoForm: document.getElementById("avatarDemoForm"),
  avatarWorkerUrl: document.getElementById("avatarWorkerUrl"),
  avatarEngine: document.getElementById("avatarEngine"),
  avatarFacePath: document.getElementById("avatarFacePath"),
  avatarAudioPath: document.getElementById("avatarAudioPath"),
  avatarAudioFile: document.getElementById("avatarAudioFile"),
  generateAvatarButton: document.getElementById("generateAvatarButton"),
  avatarDemoStatus: document.getElementById("avatarDemoStatus"),
  askAvatarForm: document.getElementById("askAvatarForm"),
  avatarQuestion: document.getElementById("avatarQuestion"),
  askAvatarButton: document.getElementById("askAvatarButton"),
  askAvatarStatus: document.getElementById("askAvatarStatus"),
  setupOutput: document.getElementById("setupOutput"),
  connectionState: document.getElementById("connectionState"),
  activeRoom: document.getElementById("activeRoom"),
  remoteTrackCount: document.getElementById("remoteTrackCount"),
  localMedia: document.getElementById("localMedia"),
  remoteMedia: document.getElementById("remoteMedia"),
  eventLog: document.getElementById("eventLog")
};

elements.identity.value = `browser-${Math.random().toString(16).slice(2, 8)}`;

elements.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  await joinRoom();
});

elements.leaveButton.addEventListener("click", async () => {
  await leaveRoom();
});

elements.personaForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await generatePersona();
});

elements.voiceCloneForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await cloneVoiceFromUpload();
});

elements.avatarDemoForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await generateAvatarDemo();
});

elements.askAvatarForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await askFutureSelfAvatar();
});

async function joinRoom() {
  if (state.room) {
    await leaveRoom();
  }

  setBusy(true);
  appendEvent("system", "Preparing call");

  try {
    const tokenResponse = await fetch(elements.tokenEndpoint.value.trim(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        roomName: elements.roomName.value.trim(),
        identity: elements.identity.value.trim(),
        name: elements.identity.value.trim()
      })
    });
    const session = await tokenResponse.json();

    if (!tokenResponse.ok) {
      throw new Error(session.error || JSON.stringify(session));
    }

    const room = new Room({
      adaptiveStream: true,
      dynacast: true
    });

    bindRoomEvents(room);
    updateConnectionState("connecting");

    await room.connect(session.url, session.token);
    state.room = room;

    await enableLocalMedia(room);

    renderLocalTracks();
    renderTrackCounts();

    elements.activeRoom.textContent = session.roomName;
    elements.leaveButton.disabled = false;
    appendEvent("system", "Joined call");
  } catch (error) {
    appendEvent("error", error.message);
    await leaveRoom();
  } finally {
    setBusy(false);
  }
}

async function enableLocalMedia(room) {
  try {
    await room.localParticipant.setMicrophoneEnabled(true, {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true
    });
    appendEvent("media", "Microphone enabled");
  } catch (error) {
    appendEvent("media-error", `Microphone permission failed: ${error.message}`);
  }

  try {
    await room.localParticipant.setCameraEnabled(true);
    appendEvent("media", "Camera enabled");
  } catch (error) {
    appendEvent("media-error", `Camera permission failed: ${error.message}`);
  }
}

async function leaveRoom() {
  if (state.room) {
    state.room.disconnect();
    state.room = null;
  }

  clearMedia(elements.localMedia, "Join to start camera and mic");
  clearMedia(elements.remoteMedia, "AI agent is not connected");
  clearHiddenAudio();
  state.remoteElements.clear();
  state.localElements = [];

  elements.leaveButton.disabled = true;
  elements.remoteTrackCount.textContent = "waiting";
  updateConnectionState("disconnected");
}

async function generatePersona() {
  elements.generatePersonaButton.disabled = true;
  elements.generatePersonaButton.textContent = "Generating...";
  setSetupOutput("Generating persona with Azure...");

  try {
    const payload = buildPersonaPayload();
    const response = await fetch("/api/persona/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error ? JSON.stringify(result, null, 2) : JSON.stringify(result));
    }

    setSetupOutput({
      type: "persona.generated",
      personaFile: result.personaFile,
      provider: result.provider,
      warning: result.warning,
      displayName: result.displayName,
      futureYear: result.futureYear,
      futureAge: result.futureAge,
      identityKeywords: result.identityKeywords,
      firstGreeting: result.firstGreeting,
      runWithPersona: `AVATAR_PERSONA_FILE=${result.personaFile} /opt/homebrew/bin/node apps/agent/room-agent.mjs`
    });
    appendEvent("persona", `Generated ${result.personaFile}`);
  } catch (error) {
    setSetupOutput({ type: "persona.error", message: error.message });
    appendEvent("error", error.message);
  } finally {
    elements.generatePersonaButton.disabled = false;
    elements.generatePersonaButton.textContent = "Generate persona";
  }
}

async function cloneVoiceFromUpload() {
  if (!elements.voiceConsent.checked) {
    setSetupOutput({ type: "voice.error", message: "Confirm that this is your own voice sample." });
    return;
  }

  const [file] = elements.voiceSample.files || [];
  if (!file) {
    setSetupOutput({ type: "voice.error", message: "Choose a wav or mp3 voice sample first." });
    return;
  }

  elements.cloneVoiceButton.disabled = true;
  elements.cloneVoiceButton.textContent = "Cloning...";
  setSetupOutput(`Uploading ${file.name} and cloning voice...`);

  try {
    const form = new FormData();
    form.append("sample", file);
    form.append("name", elements.voiceCloneName.value.trim() || "Psyche Future Self Voice");
    form.append("gender", elements.voiceCloneGender.value);
    form.append("description", "Psyche user-owned voice clone for future-self avatar R&D.");
    form.append("removeBackgroundNoise", "true");

    const response = await fetch("/api/voice/clone", {
      method: "POST",
      body: form
    });
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error ? JSON.stringify(result) : JSON.stringify(result));
    }

    setSetupOutput({
      type: "voice.cloned",
      voiceId: result.voiceId,
      voiceFile: result.voiceFile,
      sampleFile: result.sampleFile,
      requiresVerification: result.requiresVerification,
      env: [
        `ELEVENLABS_VOICE_ID=${result.voiceId}`,
        "AVATAR_AGENT_TTS_PROVIDER=elevenlabs",
        "ELEVENLABS_LIVEKIT_OUTPUT_FORMAT=pcm_24000"
      ],
      runWithClonedVoice:
        `ELEVENLABS_VOICE_ID=${result.voiceId} /opt/homebrew/bin/node apps/agent/room-agent.mjs`
    });
    appendEvent("voice", `Cloned voice ${result.voiceId}`);
  } catch (error) {
    setSetupOutput({ type: "voice.error", message: error.message });
    appendEvent("error", error.message);
  } finally {
    elements.cloneVoiceButton.disabled = false;
    elements.cloneVoiceButton.textContent = "Clone voice";
  }
}

async function generateAvatarDemo() {
  const workerUrl = normalizeBaseUrl(elements.avatarWorkerUrl.value);
  elements.generateAvatarButton.disabled = true;
  elements.generateAvatarButton.textContent = "Queued...";
  elements.avatarDemoStatus.textContent = "Creating GPU job...";
  appendEvent("avatar", `Requesting ${workerUrl}`);

  try {
    const response = await createAvatarJob(workerUrl);
    const job = await response.json();
    if (!response.ok) {
      throw new Error(job.error || JSON.stringify(job));
    }

    appendEvent("avatar", `Queued job ${job.jobId}`);
    const result = await pollAvatarJob(workerUrl, job.jobId);
    const videoUrl = `${workerUrl}${result.videoUrl}?t=${Date.now()}`;
    renderGeneratedAvatar(videoUrl);
    elements.avatarDemoStatus.textContent = `Generated in ${(result.durationMs / 1000).toFixed(1)}s`;
    setSetupOutput({
      type: "avatar.generated",
      jobId: result.jobId,
      workerUrl,
      videoUrl,
      reportUrl: `${workerUrl}${result.reportUrl}`,
      metrics: result.report?.metrics
    });
    appendEvent("avatar", `Generated ${result.videoUrl}`);
  } catch (error) {
    elements.avatarDemoStatus.textContent = "Avatar generation failed";
    setSetupOutput({ type: "avatar.error", message: error.message });
    appendEvent("error", error.message);
  } finally {
    elements.generateAvatarButton.disabled = false;
    elements.generateAvatarButton.textContent = "Generate avatar reply";
  }
}

async function askFutureSelfAvatar() {
  const workerUrl = normalizeBaseUrl(elements.avatarWorkerUrl.value);
  const question = elements.avatarQuestion.value.trim();
  if (!question) {
    elements.askAvatarStatus.textContent = "Type a question first";
    return;
  }

  elements.askAvatarButton.disabled = true;
  elements.askAvatarButton.textContent = "Thinking...";
  elements.askAvatarStatus.textContent = "Generating AI reply and voice...";
  appendEvent("avatar", "Asking future self");

  try {
    const response = await fetch("/api/avatar/reply", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        question,
        workerUrl,
        engine: elements.avatarEngine.value,
        facePath: elements.avatarFacePath.value.trim()
      })
    }).catch((error) => {
      throw new Error(`Local avatar server request failed: ${error.message}`);
    });
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error ? JSON.stringify(result, null, 2) : JSON.stringify(result));
    }

    const job = result.workerJob;
    appendEvent("avatar", `AI reply queued ${job.jobId}`);
    elements.askAvatarStatus.textContent = "Voice created. Waiting for GPU video...";
    const completed = await pollAvatarJob(workerUrl, job.jobId, {
      onStatus: (statusText) => {
        elements.askAvatarStatus.textContent = statusText;
      }
    });

    const videoUrl = `${workerUrl}${completed.videoUrl}?t=${Date.now()}`;
    renderGeneratedAvatar(videoUrl);
    elements.askAvatarStatus.textContent = `Generated in ${(completed.durationMs / 1000).toFixed(1)}s`;
    setSetupOutput({
      type: "avatar.reply.generated",
      question,
      replyText: result.replyText,
      audioFile: result.audioFile,
      jobId: completed.jobId,
      videoUrl,
      reportUrl: `${workerUrl}${completed.reportUrl}`,
      metrics: completed.report?.metrics
    });
  } catch (error) {
    elements.askAvatarStatus.textContent = "AI avatar reply failed";
    setSetupOutput({ type: "avatar.reply.error", message: error.message });
    appendEvent("error", error.message);
  } finally {
    elements.askAvatarButton.disabled = false;
    elements.askAvatarButton.textContent = "Ask and generate video";
  }
}

async function createAvatarJob(workerUrl) {
  const [audioFile] = elements.avatarAudioFile.files || [];
  if (audioFile) {
    const form = new FormData();
    form.append("engine", elements.avatarEngine.value);
    form.append("facePath", elements.avatarFacePath.value.trim());
    form.append("audio", audioFile);
    form.append("useFloat16", "true");
    return fetch(`${workerUrl}/v1/lipsync/jobs`, {
      method: "POST",
      body: form
    });
  }

  return fetch(`${workerUrl}/v1/lipsync/jobs`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      engine: elements.avatarEngine.value,
      facePath: elements.avatarFacePath.value.trim(),
      audioPath: elements.avatarAudioPath.value.trim(),
      useFloat16: true
    })
  });
}

async function pollAvatarJob(workerUrl, jobId, options = {}) {
  const started = Date.now();
  while (Date.now() - started < 10 * 60 * 1000) {
    const response = await fetch(`${workerUrl}/v1/lipsync/jobs/${encodeURIComponent(jobId)}`);
    const job = await response.json();
    if (!response.ok) {
      throw new Error(job.error || JSON.stringify(job));
    }

    if (job.status === "completed") {
      return job;
    }
    if (job.status === "failed") {
      throw new Error(job.stderrTail || job.error || JSON.stringify(job));
    }

    const seconds = Math.round((Date.now() - started) / 1000);
    elements.generateAvatarButton.textContent = job.status === "queued" ? "Queued..." : "Generating...";
    const statusText = `${job.status} ${job.jobId} (${seconds}s)`;
    elements.avatarDemoStatus.textContent = statusText;
    options.onStatus?.(statusText);
    await sleep(1500);
  }
  throw new Error(`Timed out waiting for avatar job ${jobId}`);
}

function buildPersonaPayload() {
  return {
    targetYear: Number(elements.targetYear.value || 10),
    personaProvider: elements.personaProvider.value || "azure",
    weights: {
      idealFuture: Number(elements.weightIdeal.value || 60),
      careerFocus: Number(elements.weightCareer.value || 60),
      directness: Number(elements.weightDirect.value || 45)
    },
    survey: {
      age: Number(elements.surveyAge.value || 0) || null,
      mbti: elements.surveyMbti.value.trim(),
      values: splitList(elements.surveyValues.value),
      goals: splitList(elements.surveyGoals.value),
      concerns: splitList(elements.surveyConcerns.value),
      habits: splitList(elements.surveyRoutine.value),
      routine: elements.surveyRoutine.value.trim(),
      idealRoutine: "",
      stressRelief: "",
      strengths: [],
      interests: splitList(elements.surveyGoals.value),
      relationshipValues: [],
      selfTalk: "",
      advicePreference: "practical",
      voiceGender: elements.voiceGender.value,
      longGame: elements.surveyLongGame.value.trim()
    }
  };
}

function bindRoomEvents(room) {
  room
    .on(RoomEvent.ConnectionStateChanged, updateConnectionState)
    .on(RoomEvent.ParticipantConnected, (participant) => {
      appendEvent("participant", `${participant.identity} connected`);
    })
    .on(RoomEvent.ParticipantDisconnected, (participant) => {
      appendEvent("participant", `${participant.identity} disconnected`);
      renderTrackCounts();
    })
    .on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
      attachRemoteTrack(track, publication, participant);
      renderTrackCounts();
    })
    .on(RoomEvent.TrackUnsubscribed, (track, publication, participant) => {
      detachRemoteTrack(publication.trackSid);
      appendEvent("track", `${participant.identity} unpublished ${track.kind}`);
      renderTrackCounts();
    })
    .on(RoomEvent.LocalTrackPublished, () => {
      renderLocalTracks();
    })
    .on(RoomEvent.LocalTrackUnpublished, () => {
      renderLocalTracks();
    })
    .on(RoomEvent.DataReceived, (payload, participant, kind, topic) => {
      const decoded = decodePayload(payload);
      appendEvent(participant?.identity || "data", {
        topic,
        packetKind: kind,
        payload: decoded
      });
    });
}

function attachRemoteTrack(track, publication, participant) {
  if (track.kind === Track.Kind.Audio) {
    const audio = track.attach();
    audio.autoplay = true;
    audio.controls = false;
    audio.dataset.hiddenAudio = publication.trackSid;
    audio.style.display = "none";
    document.body.append(audio);
    state.hiddenAudioElements.push(audio);
    state.remoteElements.set(publication.trackSid, audio);
    appendEvent("track", `${participant.identity} audio connected`);
    return;
  }

  elements.remoteMedia.classList.remove("empty");
  if (elements.remoteMedia.textContent === "AI agent is not connected") {
    elements.remoteMedia.textContent = "";
  }

  const wrapper = document.createElement("article");
  wrapper.className = `media-card ${track.kind}`;
  wrapper.dataset.trackSid = publication.trackSid;

  const media = track.attach();
  media.autoplay = true;
  media.playsInline = true;
  if (track.kind === Track.Kind.Audio) {
    media.controls = true;
  }

  const label = document.createElement("div");
  label.className = "media-label";
  label.textContent = `${participant.identity} / ${publication.source || track.kind}`;

  wrapper.append(media, label);
  elements.remoteMedia.append(wrapper);
  state.remoteElements.set(publication.trackSid, wrapper);
  appendEvent("track", `${participant.identity} subscribed ${track.kind}`);
}

function detachRemoteTrack(trackSid) {
  const wrapper = state.remoteElements.get(trackSid);
  if (!wrapper) return;

  wrapper.remove();
  if (wrapper.dataset?.hiddenAudio) {
    state.hiddenAudioElements = state.hiddenAudioElements.filter((element) => element !== wrapper);
  }
  state.remoteElements.delete(trackSid);

  if (state.remoteElements.size === 0) {
    clearMedia(elements.remoteMedia, "AI agent is not connected");
  }
}

function renderLocalTracks() {
  clearMedia(elements.localMedia, "Join to start camera and mic");
  state.localElements = [];

  if (!state.room) return;

  const publications = Array.from(state.room.localParticipant.trackPublications.values()).filter(
    (publication) => publication.track
  );

  if (publications.length === 0) return;

  elements.localMedia.textContent = "";
  elements.localMedia.classList.remove("empty");

  for (const publication of publications) {
    const track = publication.track;
    if (track.kind === Track.Kind.Audio) continue;

    const wrapper = document.createElement("article");
    wrapper.className = `media-card ${track.kind}`;
    const media = track.attach();
    media.muted = true;
    media.autoplay = true;
    media.playsInline = true;

    const label = document.createElement("div");
    label.className = "media-label";
    label.textContent = `local / ${publication.source || track.kind}`;
    wrapper.append(media, label);
    elements.localMedia.append(wrapper);
    state.localElements.push(wrapper);
  }
}

function renderTrackCounts() {
  if (!state.room) {
    elements.remoteTrackCount.textContent = "waiting";
    return;
  }

  let remoteTracks = 0;
  for (const participant of state.room.remoteParticipants.values()) {
    remoteTracks += Array.from(participant.trackPublications.values()).filter(
      (publication) => publication.isSubscribed
    ).length;
  }
  elements.remoteTrackCount.textContent = remoteTracks > 0 ? `${remoteTracks} tracks` : "waiting";
}

function renderGeneratedAvatar(videoUrl) {
  elements.remoteMedia.classList.remove("empty");
  elements.remoteMedia.textContent = "";

  const wrapper = document.createElement("article");
  wrapper.className = "media-card video generated-avatar";

  const video = document.createElement("video");
  video.src = videoUrl;
  video.autoplay = true;
  video.controls = true;
  video.playsInline = true;

  const label = document.createElement("div");
  label.className = "media-label";
  label.textContent = `${elements.avatarEngine.value} / generated reply`;

  wrapper.append(video, label);
  elements.remoteMedia.append(wrapper);
}

function normalizeBaseUrl(value) {
  return String(value || "http://localhost:8080").trim().replace(/\/+$/, "");
}

function updateConnectionState(connectionState) {
  elements.connectionState.textContent = connectionState;
  elements.connectionState.dataset.state = connectionState;
}

function splitList(value) {
  return String(value || "")
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function setSetupOutput(value) {
  elements.setupOutput.textContent =
    typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

function appendEvent(source, value) {
  if (elements.eventLog.children.length === 1 && elements.eventLog.textContent.includes("Waiting")) {
    elements.eventLog.textContent = "";
  }

  const item = document.createElement("li");
  const time = new Date().toLocaleTimeString();
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  item.innerHTML = `<span>${time} ${source}</span><pre>${escapeHtml(text)}</pre>`;
  elements.eventLog.prepend(item);

  while (elements.eventLog.children.length > 8) {
    elements.eventLog.lastElementChild.remove();
  }
}

function clearMedia(container, emptyText) {
  for (const element of container.querySelectorAll("audio, video")) {
    element.srcObject = null;
  }
  container.classList.add("empty");
  container.textContent = emptyText;
}

function clearHiddenAudio() {
  for (const element of state.hiddenAudioElements) {
    element.srcObject = null;
    element.remove();
  }
  state.hiddenAudioElements = [];
}

function decodePayload(payload) {
  const text = new TextDecoder().decode(payload);
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function setBusy(isBusy) {
  elements.joinButton.disabled = isBusy;
  elements.joinButton.textContent = isBusy ? "Joining..." : "Join";
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
