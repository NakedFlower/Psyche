import {
  Room,
  RoomEvent,
  Track
} from "https://esm.sh/livekit-client@2?bundle";

const state = {
  room: null,
  remoteElements: new Map(),
  localElements: [],
  embeddedAgent: null
};

const elements = {
  form: document.getElementById("joinForm"),
  tokenEndpoint: document.getElementById("tokenEndpoint"),
  roomName: document.getElementById("roomName"),
  identity: document.getElementById("identity"),
  cameraEnabled: document.getElementById("cameraEnabled"),
  microphoneEnabled: document.getElementById("microphoneEnabled"),
  joinButton: document.getElementById("joinButton"),
  leaveButton: document.getElementById("leaveButton"),
  startEmbeddedAgentButton: document.getElementById("startEmbeddedAgentButton"),
  refreshButton: document.getElementById("refreshButton"),
  sendLatencyButton: document.getElementById("sendLatencyButton"),
  connectionState: document.getElementById("connectionState"),
  activeRoom: document.getElementById("activeRoom"),
  localTrackState: document.getElementById("localTrackState"),
  remoteTrackCount: document.getElementById("remoteTrackCount"),
  localParticipantName: document.getElementById("localParticipantName"),
  localMedia: document.getElementById("localMedia"),
  remoteMedia: document.getElementById("remoteMedia"),
  participants: document.getElementById("participants"),
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

elements.startEmbeddedAgentButton.addEventListener("click", async () => {
  await startEmbeddedAgentSimulator();
});

elements.refreshButton.addEventListener("click", () => {
  renderParticipants();
  renderTrackCounts();
});

elements.sendLatencyButton.addEventListener("click", async () => {
  if (!state.room) return;

  const event = {
    type: "latency.metric",
    sessionId: state.room.name || "local",
    name: "webrtc_publish",
    valueMs: Math.round(performance.now() % 1000),
    at: Date.now()
  };

  await state.room.localParticipant.publishData(new TextEncoder().encode(JSON.stringify(event)), {
    reliable: true,
    topic: "psyche.latency"
  });
  appendEvent("local", event);
});

async function joinRoom() {
  if (state.room) {
    await leaveRoom();
  }

  setBusy(true);
  appendEvent("system", "Requesting LiveKit token");

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

    if (elements.microphoneEnabled.checked) {
      await room.localParticipant.setMicrophoneEnabled(true);
    }

    if (elements.cameraEnabled.checked) {
      await room.localParticipant.setCameraEnabled(true);
    }

    renderLocalTracks();
    renderParticipants();
    renderTrackCounts();

    elements.activeRoom.textContent = session.roomName;
    elements.localParticipantName.textContent = session.identity;
    elements.leaveButton.disabled = false;
    elements.startEmbeddedAgentButton.disabled = false;
    elements.refreshButton.disabled = false;
    elements.sendLatencyButton.disabled = false;
    appendEvent("system", `Joined ${session.roomName} as ${session.identity}`);
  } catch (error) {
    appendEvent("error", error.message);
    await leaveRoom();
  } finally {
    setBusy(false);
  }
}

async function leaveRoom() {
  await stopEmbeddedAgentSimulator();

  if (state.room) {
    state.room.disconnect();
    state.room = null;
  }

  clearMedia(elements.localMedia, "No local media");
  clearMedia(elements.remoteMedia, "No remote tracks");
  state.remoteElements.clear();
  state.localElements = [];

  elements.leaveButton.disabled = true;
  elements.startEmbeddedAgentButton.disabled = true;
  elements.startEmbeddedAgentButton.textContent = "Start embedded agent sim";
  elements.refreshButton.disabled = true;
  elements.sendLatencyButton.disabled = true;
  elements.activeRoom.textContent = "-";
  elements.localParticipantName.textContent = "not joined";
  elements.localTrackState.textContent = "none";
  elements.remoteTrackCount.textContent = "0";
  updateConnectionState("disconnected");
  renderParticipants();
}

async function startEmbeddedAgentSimulator() {
  if (!state.room || state.embeddedAgent) return;

  elements.startEmbeddedAgentButton.disabled = true;
  elements.startEmbeddedAgentButton.textContent = "Starting agent...";
  appendEvent("system", "Starting embedded agent simulator");

  try {
    const tokenResponse = await fetch(elements.tokenEndpoint.value.trim(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        roomName: state.room.name || elements.roomName.value.trim(),
        identity: `psyche-agent-sim-${Math.random().toString(16).slice(2, 6)}`,
        name: "Psyche Embedded Agent Simulator"
      })
    });
    const session = await tokenResponse.json();

    if (!tokenResponse.ok) {
      throw new Error(session.error || JSON.stringify(session));
    }

    const agentRoom = new Room({
      adaptiveStream: true,
      dynacast: true
    });

    await agentRoom.connect(session.url, session.token);
    const audio = await publishSyntheticAgentAudio(agentRoom);

    const eventTimer = window.setInterval(() => {
      publishAgentLatencyEvent(agentRoom, "interval").catch((error) => {
        appendEvent("agent-error", error.message);
      });
    }, 5000);

    state.embeddedAgent = {
      room: agentRoom,
      ...audio,
      eventTimer
    };

    await publishAgentLatencyEvent(agentRoom, "join");
    appendEvent("system", `Embedded agent joined as ${session.identity}`);
    elements.startEmbeddedAgentButton.textContent = "Agent sim running";
  } catch (error) {
    appendEvent("error", error.message);
    await stopEmbeddedAgentSimulator();
    elements.startEmbeddedAgentButton.disabled = false;
    elements.startEmbeddedAgentButton.textContent = "Start embedded agent sim";
  }
}

async function stopEmbeddedAgentSimulator() {
  if (!state.embeddedAgent) return;

  const agent = state.embeddedAgent;
  state.embeddedAgent = null;

  if (agent.eventTimer) {
    window.clearInterval(agent.eventTimer);
  }

  if (agent.oscillator) {
    agent.oscillator.stop();
    agent.oscillator.disconnect();
  }

  if (agent.gain) {
    agent.gain.disconnect();
  }

  if (agent.animationFrame) {
    window.cancelAnimationFrame(agent.animationFrame);
  }

  if (agent.videoStream) {
    for (const track of agent.videoStream.getTracks()) {
      track.stop();
    }
  }

  if (agent.audioStream) {
    for (const track of agent.audioStream.getTracks()) {
      track.stop();
    }
  }

  if (agent.audioContext) {
    await agent.audioContext.close();
  }

  if (agent.room) {
    agent.room.disconnect();
  }
}

async function publishSyntheticAgentAudio(room) {
  const audioContext = new AudioContext();
  const audioDestination = audioContext.createMediaStreamDestination();
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();

  oscillator.type = "sine";
  oscillator.frequency.value = 220;
  gain.gain.value = 0.015;
  oscillator.connect(gain);
  gain.connect(audioDestination);
  oscillator.start();

  const [audioTrack] = audioDestination.stream.getAudioTracks();
  await room.localParticipant.publishTrack(audioTrack, {
    name: "agent-placeholder-audio",
    source: Track.Source.Microphone
  });

  const video = createSyntheticAgentVideo();
  const [videoTrack] = video.stream.getVideoTracks();
  await room.localParticipant.publishTrack(videoTrack, {
    name: "agent-placeholder-video",
    source: Track.Source.Camera
  });

  return {
    audioContext,
    oscillator,
    gain,
    audioStream: audioDestination.stream,
    videoStream: video.stream,
    animationFrame: video.animationFrame
  };
}

function createSyntheticAgentVideo() {
  const canvas = document.createElement("canvas");
  canvas.width = 960;
  canvas.height = 540;
  const context = canvas.getContext("2d");
  const stream = canvas.captureStream(24);
  let animationFrame = null;

  const draw = () => {
    const now = performance.now();
    const pulse = (Math.sin(now / 220) + 1) / 2;
    const talk = Math.abs(Math.sin(now / 95));

    context.fillStyle = "#101513";
    context.fillRect(0, 0, canvas.width, canvas.height);

    const gradient = context.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, "#223e3b");
    gradient.addColorStop(0.58, "#17201d");
    gradient.addColorStop(1, "#533127");
    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);

    context.fillStyle = "rgba(244, 242, 236, 0.08)";
    for (let i = 0; i < 8; i += 1) {
      context.beginPath();
      context.arc(120 + i * 120, 80 + Math.sin(now / 600 + i) * 18, 2 + i * 0.5, 0, Math.PI * 2);
      context.fill();
    }

    context.save();
    context.translate(canvas.width / 2, canvas.height / 2 - 10);

    context.fillStyle = "#e7e0d1";
    context.beginPath();
    context.arc(0, -20, 122 + pulse * 3, 0, Math.PI * 2);
    context.fill();

    context.fillStyle = "#24302d";
    context.beginPath();
    context.arc(-42, -42, 10, 0, Math.PI * 2);
    context.arc(42, -42, 10, 0, Math.PI * 2);
    context.fill();

    context.strokeStyle = "#24302d";
    context.lineWidth = 10;
    context.lineCap = "round";
    context.beginPath();
    context.moveTo(-34, 38);
    context.quadraticCurveTo(0, 58 + talk * 28, 34, 38);
    context.stroke();

    context.strokeStyle = "#c9e86a";
    context.lineWidth = 5;
    context.beginPath();
    context.arc(0, -20, 150 + pulse * 14, 0, Math.PI * 2);
    context.stroke();

    context.restore();

    context.fillStyle = "#f4f2ec";
    context.font = "700 30px Inter, system-ui, sans-serif";
    context.textAlign = "center";
    context.fillText("Psyche Agent Simulator", canvas.width / 2, canvas.height - 76);

    context.fillStyle = "#aeb8b1";
    context.font = "22px Inter, system-ui, sans-serif";
    context.fillText("placeholder video track for GPT Realtime avatar", canvas.width / 2, canvas.height - 42);

    animationFrame = window.requestAnimationFrame(draw);
  };

  draw();

  return {
    stream,
    animationFrame
  };
}

async function publishAgentLatencyEvent(room, reason) {
  const event = {
    type: "latency.metric",
    sessionId: room.name || "psyche-avatar-lab",
    name: "webrtc_publish",
    valueMs: Math.round(performance.now() % 1000),
    at: Date.now(),
    reason
  };

  await room.localParticipant.publishData(new TextEncoder().encode(JSON.stringify(event)), {
    reliable: true,
    topic: "psyche.latency"
  });
}

function bindRoomEvents(room) {
  room
    .on(RoomEvent.ConnectionStateChanged, updateConnectionState)
    .on(RoomEvent.ParticipantConnected, (participant) => {
      appendEvent("participant", `${participant.identity} connected`);
      renderParticipants();
    })
    .on(RoomEvent.ParticipantDisconnected, (participant) => {
      appendEvent("participant", `${participant.identity} disconnected`);
      renderParticipants();
      renderTrackCounts();
    })
    .on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
      attachRemoteTrack(track, publication, participant);
      renderParticipants();
      renderTrackCounts();
    })
    .on(RoomEvent.TrackUnsubscribed, (track, publication, participant) => {
      detachRemoteTrack(publication.trackSid);
      appendEvent("track", `${participant.identity} unpublished ${track.kind}`);
      renderTrackCounts();
    })
    .on(RoomEvent.LocalTrackPublished, () => {
      renderLocalTracks();
      renderTrackCounts();
    })
    .on(RoomEvent.LocalTrackUnpublished, () => {
      renderLocalTracks();
      renderTrackCounts();
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
  elements.remoteMedia.classList.remove("empty");
  if (elements.remoteMedia.textContent === "No remote tracks") {
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
  state.remoteElements.delete(trackSid);

  if (state.remoteElements.size === 0) {
    clearMedia(elements.remoteMedia, "No remote tracks");
  }
}

function renderLocalTracks() {
  clearMedia(elements.localMedia, "No local media");
  state.localElements = [];

  if (!state.room) return;

  const publications = Array.from(state.room.localParticipant.trackPublications.values()).filter(
    (publication) => publication.track
  );

  if (publications.length === 0) {
    elements.localTrackState.textContent = "none";
    return;
  }

  elements.localMedia.textContent = "";
  elements.localMedia.classList.remove("empty");

  for (const publication of publications) {
    const track = publication.track;
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

  elements.localTrackState.textContent = publications
    .map((publication) => publication.source || publication.kind)
    .join(", ");
}

function renderParticipants() {
  if (!state.room) {
    elements.participants.innerHTML = "<li>No participants</li>";
    return;
  }

  const rows = [
    participantRow(state.room.localParticipant, true),
    ...Array.from(state.room.remoteParticipants.values()).map((participant) =>
      participantRow(participant, false)
    )
  ];

  elements.participants.replaceChildren(...rows);
}

function participantRow(participant, isLocal) {
  const item = document.createElement("li");
  const publicationCount = participant.trackPublications?.size || 0;
  item.innerHTML = `
    <strong>${participant.identity}${isLocal ? " (local)" : ""}</strong>
    <span>${participant.connectionQuality || "unknown"} / ${publicationCount} tracks</span>
  `;
  return item;
}

function renderTrackCounts() {
  if (!state.room) {
    elements.remoteTrackCount.textContent = "0";
    return;
  }

  let remoteTracks = 0;
  for (const participant of state.room.remoteParticipants.values()) {
    remoteTracks += Array.from(participant.trackPublications.values()).filter(
      (publication) => publication.isSubscribed
    ).length;
  }
  elements.remoteTrackCount.textContent = String(remoteTracks);
}

function updateConnectionState(connectionState) {
  elements.connectionState.textContent = connectionState;
  elements.connectionState.dataset.state = connectionState;
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

  while (elements.eventLog.children.length > 30) {
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
