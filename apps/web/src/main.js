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
      throw new Error(result.error || JSON.stringify(result));
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

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
