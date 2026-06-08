import {
  Room,
  RoomEvent,
  Track
} from "https://esm.sh/livekit-client@2?bundle";

const state = {
  room: null,
  remoteElements: new Map(),
  localElements: []
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
  if (state.room) {
    state.room.disconnect();
    state.room = null;
  }

  clearMedia(elements.localMedia, "No local media");
  clearMedia(elements.remoteMedia, "No remote tracks");
  state.remoteElements.clear();
  state.localElements = [];

  elements.leaveButton.disabled = true;
  elements.refreshButton.disabled = true;
  elements.sendLatencyButton.disabled = true;
  elements.activeRoom.textContent = "-";
  elements.localParticipantName.textContent = "not joined";
  elements.localTrackState.textContent = "none";
  elements.remoteTrackCount.textContent = "0";
  updateConnectionState("disconnected");
  renderParticipants();
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
