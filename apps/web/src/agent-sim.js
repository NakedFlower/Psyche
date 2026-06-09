import {
  Room,
  RoomEvent,
  Track
} from "https://esm.sh/livekit-client@2?bundle";

const state = {
  room: null,
  audioContext: null,
  oscillator: null,
  gain: null,
  eventTimer: null,
  eventCount: 0
};

const elements = {
  form: document.getElementById("simForm"),
  tokenEndpoint: document.getElementById("tokenEndpoint"),
  roomName: document.getElementById("roomName"),
  identity: document.getElementById("identity"),
  joinButton: document.getElementById("joinButton"),
  leaveButton: document.getElementById("leaveButton"),
  sendEventButton: document.getElementById("sendEventButton"),
  connectionState: document.getElementById("connectionState"),
  activeRoom: document.getElementById("activeRoom"),
  audioTrackState: document.getElementById("audioTrackState"),
  eventCount: document.getElementById("eventCount"),
  eventLog: document.getElementById("eventLog")
};

elements.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  await joinAsAgent();
});

elements.leaveButton.addEventListener("click", async () => {
  await leaveRoom();
});

elements.sendEventButton.addEventListener("click", async () => {
  await sendLatencyEvent("manual");
});

async function joinAsAgent() {
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
        name: "Psyche Agent Simulator"
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
    elements.activeRoom.textContent = session.roomName;
    elements.leaveButton.disabled = false;
    elements.sendEventButton.disabled = false;

    await publishSyntheticAudio(room);
    await sendLatencyEvent("join");
    state.eventTimer = window.setInterval(() => {
      sendLatencyEvent("interval").catch((error) => appendEvent("error", error.message));
    }, 5000);

    appendEvent("system", `Joined ${session.roomName} as ${session.identity}`);
  } catch (error) {
    appendEvent("error", error.message);
    await leaveRoom();
  } finally {
    setBusy(false);
  }
}

async function leaveRoom() {
  if (state.eventTimer) {
    window.clearInterval(state.eventTimer);
    state.eventTimer = null;
  }

  if (state.oscillator) {
    state.oscillator.stop();
    state.oscillator.disconnect();
    state.oscillator = null;
  }

  if (state.gain) {
    state.gain.disconnect();
    state.gain = null;
  }

  if (state.animationFrame) {
    window.cancelAnimationFrame(state.animationFrame);
    state.animationFrame = null;
  }

  if (state.videoStream) {
    for (const track of state.videoStream.getTracks()) {
      track.stop();
    }
    state.videoStream = null;
  }

  if (state.audioStream) {
    for (const track of state.audioStream.getTracks()) {
      track.stop();
    }
    state.audioStream = null;
  }

  if (state.audioContext) {
    await state.audioContext.close();
    state.audioContext = null;
  }

  if (state.room) {
    state.room.disconnect();
    state.room = null;
  }

  elements.leaveButton.disabled = true;
  elements.sendEventButton.disabled = true;
  elements.activeRoom.textContent = "-";
  elements.audioTrackState.textContent = "not published";
  updateConnectionState("disconnected");
}

async function publishSyntheticAudio(room) {
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

  state.audioContext = audioContext;
  state.oscillator = oscillator;
  state.gain = gain;
  state.audioStream = audioDestination.stream;
  state.videoStream = video.stream;
  state.animationFrame = video.animationFrame;
  elements.audioTrackState.textContent = "audio + video published";
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

async function sendLatencyEvent(reason) {
  if (!state.room) return;

  const event = {
    type: "latency.metric",
    sessionId: state.room.name || "psyche-avatar-lab",
    name: "webrtc_publish",
    valueMs: Math.round(performance.now() % 1000),
    at: Date.now(),
    reason
  };

  await state.room.localParticipant.publishData(new TextEncoder().encode(JSON.stringify(event)), {
    reliable: true,
    topic: "psyche.latency"
  });

  state.eventCount += 1;
  elements.eventCount.textContent = String(state.eventCount);
  appendEvent("agent", event);
}

function bindRoomEvents(room) {
  room
    .on(RoomEvent.ConnectionStateChanged, updateConnectionState)
    .on(RoomEvent.ParticipantConnected, (participant) => {
      appendEvent("participant", `${participant.identity} connected`);
    })
    .on(RoomEvent.ParticipantDisconnected, (participant) => {
      appendEvent("participant", `${participant.identity} disconnected`);
    });
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

function setBusy(isBusy) {
  elements.joinButton.disabled = isBusy;
  elements.joinButton.textContent = isBusy ? "Joining..." : "Join as Agent";
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
