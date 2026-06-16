import { Room, RoomEvent, Track } from "https://esm.sh/livekit-client@2?bundle";

const state = {
  room: null,
  remoteElements: new Map(),
  localElements: [],
  hiddenAudioElements: [],
  defaultAvatarUrl: localStorage.getItem("psyche.futureAvatarUrl") || "",
  idleLoopUrl: localStorage.getItem("psyche.idleLoopUrl") || "",
  speakingLoopUrl: localStorage.getItem("psyche.speakingLoopUrl") || "",
  uploadedAvatarPreviewUrl: "",
  avatarSpeaking: false,
  avatarSpeakingTimer: null
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
  futureImageForm: document.getElementById("futureImageForm"),
  futureImagePhoto: document.getElementById("futureImagePhoto"),
  futureImageYears: document.getElementById("futureImageYears"),
  futureImageStyle: document.getElementById("futureImageStyle"),
  generateFutureImageButton: document.getElementById("generateFutureImageButton"),
  futureImageStatus: document.getElementById("futureImageStatus"),
  avatarDemoForm: document.getElementById("avatarDemoForm"),
  avatarWorkerUrl: document.getElementById("avatarWorkerUrl"),
  avatarEngine: document.getElementById("avatarEngine"),
  avatarFacePath: document.getElementById("avatarFacePath"),
  avatarAudioPath: document.getElementById("avatarAudioPath"),
  avatarAudioFile: document.getElementById("avatarAudioFile"),
  generateAvatarButton: document.getElementById("generateAvatarButton"),
  generateLoopButton: document.getElementById("generateLoopButton"),
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
  eventLog: document.getElementById("eventLog"),
  prepStatus: document.getElementById("prepStatus"),
  prepPersonaStatus: document.getElementById("prepPersonaStatus"),
  prepImageStatus: document.getElementById("prepImageStatus"),
  prepIdleStatus: document.getElementById("prepIdleStatus"),
  prepLoopStatus: document.getElementById("prepLoopStatus"),
  prepJoinStatus: document.getElementById("prepJoinStatus")
};

elements.identity.value = `browser-${Math.random().toString(16).slice(2, 8)}`;
renderDefaultAvatar();

elements.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  await prepareAndJoinRoom();
});

elements.leaveButton.addEventListener("click", async () => {
  await leaveRoom();
});

elements.personaForm.addEventListener("submit", async (event) => {
  event.preventDefault();
});

elements.voiceCloneForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await cloneVoiceFromUpload();
});

elements.futureImageForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await generateFutureImage();
});

elements.futureImagePhoto.addEventListener("change", previewUploadedFutureImage);

elements.avatarDemoForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await generateAvatarDemo();
});
elements.generateLoopButton.addEventListener("click", async () => {
  await generateSpeakingLoop();
});

elements.avatarWorkerUrl.addEventListener("change", renderDefaultAvatar);
elements.avatarFacePath.addEventListener("change", renderDefaultAvatar);

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

async function prepareAndJoinRoom() {
  if (state.room) {
    return;
  }

  setBusy(true, "Preparing...");
  resetPrepChecklist();
  setPrepStatus("Preparing your future self...");
  let currentStep = elements.prepPersonaStatus;

  try {
    currentStep = elements.prepPersonaStatus;
    markPrepStep(currentStep, "working", "1. Generating persona...");
    await generatePersona({ silent: true });
    markPrepStep(currentStep, "done", "1. Persona ready");

    currentStep = elements.prepImageStatus;
    markPrepStep(currentStep, "working", "2. Creating future face...");
    await generateFutureImage({ silent: true });
    markPrepStep(currentStep, "done", "2. Future face ready");

    currentStep = elements.prepIdleStatus;
    markPrepStep(currentStep, "working", "3. Building LivePortrait idle loop...");
    await generateIdleLoop({ silent: true });
    markPrepStep(currentStep, "done", "3. LivePortrait idle loop ready");

    currentStep = elements.prepLoopStatus;
    markPrepStep(currentStep, "working", "4. Building MuseTalk speaking loop...");
    await generateSpeakingLoop({ silent: true, engineOverride: "musetalk" });
    markPrepStep(currentStep, "done", "4. MuseTalk loop ready");

    currentStep = elements.prepJoinStatus;
    markPrepStep(currentStep, "working", "5. Joining call...");
    await joinRoom();
    markPrepStep(currentStep, "done", "5. Call connected");
    setPrepStatus("Ready. Your future self is in the room.");
  } catch (error) {
    markPrepStep(currentStep, "error", currentStep?.textContent?.replace("...", " failed") || "Step failed");
    setPrepStatus(`Preparation failed: ${error.message}`);
    appendEvent("error", error.message);
  } finally {
    if (!state.room) {
      setBusy(false);
    }
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
  renderDefaultAvatar();
  clearHiddenAudio();
  state.remoteElements.clear();
  state.localElements = [];

  elements.leaveButton.disabled = true;
  elements.remoteTrackCount.textContent = "waiting";
  updateConnectionState("disconnected");
}

async function generatePersona(options = {}) {
  setButtonState(elements.generatePersonaButton, true, "Generating...");
  if (!options.silent) {
    setSetupOutput("Generating persona with Azure...");
  }

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
    if (!options.silent) appendEvent("persona", `Generated ${result.personaFile}`);
    return result;
  } catch (error) {
    if (!options.silent) {
      setSetupOutput({ type: "persona.error", message: error.message });
      appendEvent("error", error.message);
    }
    throw error;
  } finally {
    setButtonState(elements.generatePersonaButton, false, "Generate persona");
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

async function generateFutureImage(options = {}) {
  const [photo] = elements.futureImagePhoto.files || [];
  if (!photo) {
    elements.futureImageStatus.textContent = "Choose a current photo first";
    throw new Error("Current photo is required");
  }

  setButtonState(elements.generateFutureImageButton, true, "Generating...");
  elements.futureImageStatus.textContent = "Creating future face...";

  try {
    const form = new FormData();
    form.append("photo", photo);
    form.append("targetYears", elements.futureImageYears.value);
    form.append("style", elements.futureImageStyle.value);

    const response = await fetch("/api/avatar/future-image", {
      method: "POST",
      body: form
    });
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error ? JSON.stringify(result, null, 2) : JSON.stringify(result));
    }

    state.defaultAvatarUrl = `${result.imageUrl}?t=${Date.now()}`;
    localStorage.setItem("psyche.futureAvatarUrl", state.defaultAvatarUrl);
    clearIdleLoop();
    clearSpeakingLoop();
    renderDefaultAvatar();
    elements.futureImageStatus.textContent = "Future face ready";
    if (!options.silent) {
      setSetupOutput({
        type: "future-image.generated",
        imageUrl: result.imageUrl,
        outputFile: result.outputFile,
        model: result.model,
        targetYears: result.targetYears,
        style: result.style
      });
      appendEvent("avatar", `Future face generated ${result.outputFile}`);
    }
    return result;
  } catch (error) {
    elements.futureImageStatus.textContent = "Future face generation failed";
    if (!options.silent) {
      setSetupOutput({ type: "future-image.error", message: error.message });
      appendEvent("error", error.message);
    }
    throw error;
  } finally {
    setButtonState(elements.generateFutureImageButton, false, "Generate future face");
  }
}

function previewUploadedFutureImage() {
  const [photo] = elements.futureImagePhoto.files || [];
  if (!photo) return;

  if (state.uploadedAvatarPreviewUrl) {
    URL.revokeObjectURL(state.uploadedAvatarPreviewUrl);
  }

  state.uploadedAvatarPreviewUrl = URL.createObjectURL(photo);
  state.defaultAvatarUrl = state.uploadedAvatarPreviewUrl;
  clearIdleLoop();
  clearSpeakingLoop();
  elements.futureImageStatus.textContent = "Photo preview ready";
  renderDefaultAvatar();
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

async function generateSpeakingLoop(options = {}) {
  const workerUrl = normalizeBaseUrl(elements.avatarWorkerUrl.value);
  setButtonState(elements.generateLoopButton, true, "Generating...");
  elements.avatarDemoStatus.textContent = "Creating speaking loop...";
  if (!options.silent) appendEvent("avatar", `Generating speaking loop via ${workerUrl}`);

  try {
    const response = await createAvatarJob(workerUrl, { engineOverride: options.engineOverride || "musetalk" });
    const job = await response.json();
    if (!response.ok) {
      throw new Error(job.error || JSON.stringify(job));
    }

    const result = await pollAvatarJob(workerUrl, job.jobId, {
      onStatus: (statusText) => {
        elements.avatarDemoStatus.textContent = `Loop ${statusText}`;
      }
    });

    state.speakingLoopUrl = `${workerUrl}${result.videoUrl}?t=${Date.now()}`;
    localStorage.setItem("psyche.speakingLoopUrl", state.speakingLoopUrl);
    renderDefaultAvatar();
    elements.avatarDemoStatus.textContent = "Speaking loop ready";
    if (!options.silent) {
      setSetupOutput({
        type: "avatar.loop.generated",
        jobId: result.jobId,
        loopVideoUrl: state.speakingLoopUrl,
        reportUrl: `${workerUrl}${result.reportUrl}`,
        metrics: result.report?.metrics
      });
      appendEvent("avatar", `Speaking loop ready ${result.videoUrl}`);
    }
    return result;
  } catch (error) {
    elements.avatarDemoStatus.textContent = "Speaking loop failed";
    if (!options.silent) {
      setSetupOutput({ type: "avatar.loop.error", message: error.message });
      appendEvent("error", error.message);
    }
    throw error;
  } finally {
    setButtonState(elements.generateLoopButton, false, "Generate speaking loop");
  }
}

async function generateIdleLoop(options = {}) {
  const workerUrl = normalizeBaseUrl(elements.avatarWorkerUrl.value);
  elements.avatarDemoStatus.textContent = "Creating idle loop...";
  if (!options.silent) appendEvent("avatar", `Generating idle loop via ${workerUrl}`);

  try {
    const response = await createAvatarJob(workerUrl, {
      engineOverride: "liveportrait-idle",
      useAudio: false
    });
    const job = await response.json();
    if (!response.ok) {
      throw new Error(job.error || JSON.stringify(job));
    }

    const result = await pollAvatarJob(workerUrl, job.jobId, {
      onStatus: (statusText) => {
        elements.avatarDemoStatus.textContent = `Idle ${statusText}`;
      }
    });

    state.idleLoopUrl = `${workerUrl}${result.videoUrl}?t=${Date.now()}`;
    localStorage.setItem("psyche.idleLoopUrl", state.idleLoopUrl);
    renderDefaultAvatar();
    elements.avatarDemoStatus.textContent = "Idle loop ready";
    if (!options.silent) {
      setSetupOutput({
        type: "avatar.idle.generated",
        jobId: result.jobId,
        idleLoopUrl: state.idleLoopUrl,
        reportUrl: `${workerUrl}${result.reportUrl}`,
        metrics: result.report?.metrics
      });
      appendEvent("avatar", `Idle loop ready ${result.videoUrl}`);
    }
    return result;
  } catch (error) {
    elements.avatarDemoStatus.textContent = "Idle loop failed";
    if (!options.silent) {
      setSetupOutput({ type: "avatar.idle.error", message: error.message });
      appendEvent("error", error.message);
    }
    throw error;
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
    const facePayload = await buildFacePayloadForReply();
    const response = await fetch("/api/avatar/reply", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        question,
        workerUrl,
        engine: elements.avatarEngine.value,
        facePath: elements.avatarFacePath.value.trim(),
        ...facePayload
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

async function createAvatarJob(workerUrl, options = {}) {
  const [audioFile] = elements.avatarAudioFile.files || [];
  const uploadedFace = await resolveSelectedFaceUpload();
  if (audioFile || uploadedFace || options.useAudio === false) {
    const form = new FormData();
    form.append("engine", options.engineOverride || elements.avatarEngine.value);
    if (uploadedFace) {
      form.append("face", uploadedFace.blob, uploadedFace.filename);
    } else {
      form.append("facePath", elements.avatarFacePath.value.trim());
    }
    if (options.useAudio === false) {
      // idle-loop only needs the current/generated face image
    } else if (audioFile) {
      form.append("audio", audioFile);
    } else {
      form.append("audioPath", elements.avatarAudioPath.value.trim());
    }
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
      engine: options.engineOverride || elements.avatarEngine.value,
      facePath: elements.avatarFacePath.value.trim(),
      ...(options.useAudio === false ? {} : { audioPath: elements.avatarAudioPath.value.trim() }),
      useFloat16: true
    })
  });
}

async function resolveSelectedFaceUpload() {
  if (!state.defaultAvatarUrl) return null;

  try {
    const response = await fetch(state.defaultAvatarUrl);
    if (!response.ok) return null;
    const blob = await response.blob();
    const extension = inferExtension(blob.type || "", state.defaultAvatarUrl);
    return {
      blob,
      filename: `future-face.${extension}`
    };
  } catch {
    return null;
  }
}

async function buildFacePayloadForReply() {
  const uploadedFace = await resolveSelectedFaceUpload();
  if (!uploadedFace) {
    return {};
  }

  return {
    faceUploadName: uploadedFace.filename,
    faceDataUrl: await blobToDataUrl(uploadedFace.blob)
  };
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
      if (decoded?.type === "avatar.video.ready") {
        renderGeneratedAvatar(decoded.videoUrl, {
          muted: Boolean(decoded.muted),
          label: decoded.muted ? "wav2lip / realtime audio to ElevenLabs" : "wav2lip / realtime audio"
        });
        elements.askAvatarStatus.textContent =
          `Avatar video ready in ${(decoded.latencyMs / 1000).toFixed(1)}s` +
          (decoded.clippedAudioSeconds ? ` (${decoded.clippedAudioSeconds}s audio)` : "");
        setAvatarSpeaking(true, Math.max(1200, Number(decoded.clippedAudioSeconds || 3) * 1000));
      }
      if (decoded?.type === "agent.state") {
        const isSpeaking = decoded.state === "speaking";
        const isIdle = ["idle", "listening", "thinking", "avatar-error"].includes(decoded.state);
        if (isSpeaking) setAvatarSpeaking(true);
        if (isIdle) setAvatarSpeaking(false);
      }
      appendEvent(participant?.identity || "data", {
        topic,
        packetKind: kind,
        payload: decoded
      });
    });
}

function attachRemoteTrack(track, publication, participant) {
  if (track.kind === Track.Kind.Video && publication.trackName === "agent-placeholder-video") {
    appendEvent("track", `${participant.identity} placeholder video ignored`);
    renderDefaultAvatar();
    return;
  }

  if (track.kind === Track.Kind.Audio) {
    const audio = track.attach();
    audio.autoplay = true;
    audio.controls = false;
    audio.dataset.hiddenAudio = publication.trackSid;
    audio.style.display = "none";
    audio.addEventListener("playing", () => {
      appendEvent("audio", `${participant.identity} audio playing`);
      setAvatarSpeaking(true);
    });
    audio.addEventListener("pause", () => {
      appendEvent("audio", `${participant.identity} audio paused`);
      setAvatarSpeaking(false);
    });
    audio.addEventListener("ended", () => {
      appendEvent("audio", `${participant.identity} audio ended`);
      setAvatarSpeaking(false);
    });
    audio.addEventListener("emptied", () => {
      setAvatarSpeaking(false);
    });
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
  setAvatarSpeaking(false);

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

function renderGeneratedAvatar(videoUrl, options = {}) {
  elements.remoteMedia.classList.remove("empty");
  elements.remoteMedia.textContent = "";

  const wrapper = document.createElement("article");
  wrapper.className = "media-card video generated-avatar";

  const video = document.createElement("video");
  video.src = videoUrl;
  video.autoplay = true;
  video.controls = true;
  video.muted = Boolean(options.muted);
  video.playsInline = true;

  const label = document.createElement("div");
  label.className = "media-label";
  label.textContent = options.label || `${elements.avatarEngine.value} / generated reply`;

  wrapper.append(video, label);
  elements.remoteMedia.append(wrapper);
}

function renderDefaultAvatar() {
  const workerUrl = normalizeBaseUrl(elements.avatarWorkerUrl?.value || "http://127.0.0.1:8080");
  const facePath = String(elements.avatarFacePath?.value || "models/assets/face-still.jpg").replace(/^\/+/, "");
  const imageUrl = state.defaultAvatarUrl || `${workerUrl}/${facePath}?t=${Date.now()}`;

  elements.remoteMedia.classList.remove("empty");
  elements.remoteMedia.textContent = "";

  const wrapper = document.createElement("article");
  wrapper.className = "media-card video idle-avatar";
  wrapper.classList.toggle("speaking", state.avatarSpeaking);
  const showSpeakingLoop = state.avatarSpeaking && state.speakingLoopUrl;
  const showIdleLoop = !state.avatarSpeaking && state.idleLoopUrl;
  const showLoopVideo = showSpeakingLoop || showIdleLoop;
  const media = showLoopVideo ? document.createElement("video") : document.createElement("img");
  if (showLoopVideo) {
    media.src = showSpeakingLoop ? state.speakingLoopUrl : state.idleLoopUrl;
    media.autoplay = true;
    media.loop = true;
    media.muted = true;
    media.playsInline = true;
  } else {
    media.src = imageUrl;
    media.alt = "AI Future Self";
    media.loading = "eager";
  }

  const label = document.createElement("div");
  label.className = "media-label";
  label.textContent = showSpeakingLoop
    ? "AI Future Self / speaking loop"
    : showIdleLoop
      ? "AI Future Self / idle loop"
      : "AI Future Self / waiting";

  const mouth = document.createElement("div");
  mouth.className = "avatar-mouth";

  media.addEventListener("error", () => {
    elements.remoteMedia.classList.add("empty");
    elements.remoteMedia.textContent = "AI Future Self waiting";
  });

  if (showLoopVideo) {
    wrapper.append(media, label);
  } else {
    wrapper.append(media, mouth, label);
  }
  elements.remoteMedia.append(wrapper);
}

function setAvatarSpeaking(isSpeaking, autoStopMs = 0) {
  const changed = state.avatarSpeaking !== Boolean(isSpeaking);
  state.avatarSpeaking = Boolean(isSpeaking);
  clearTimeout(state.avatarSpeakingTimer);
  state.avatarSpeakingTimer = null;

  if (changed) {
    renderDefaultAvatar();
  } else {
    const idleAvatar = elements.remoteMedia.querySelector(".idle-avatar");
    idleAvatar?.classList.toggle("speaking", state.avatarSpeaking);
  }

  if (state.avatarSpeaking && autoStopMs > 0) {
    state.avatarSpeakingTimer = setTimeout(() => setAvatarSpeaking(false), autoStopMs);
  }
}

function setButtonState(button, disabled, text) {
  if (!button) return;
  button.disabled = disabled;
  button.textContent = text;
}

function clearSpeakingLoop() {
  state.speakingLoopUrl = "";
  localStorage.removeItem("psyche.speakingLoopUrl");
}

function clearIdleLoop() {
  state.idleLoopUrl = "";
  localStorage.removeItem("psyche.idleLoopUrl");
}

function setPrepStatus(message) {
  if (elements.prepStatus) {
    elements.prepStatus.textContent = message;
  }
}

function markPrepStep(element, status, message) {
  if (!element) return;
  element.dataset.status = status;
  element.textContent = message;
}

function resetPrepChecklist() {
  markPrepStep(elements.prepPersonaStatus, "waiting", "1. Persona waiting");
  markPrepStep(elements.prepImageStatus, "waiting", "2. Future face waiting");
  markPrepStep(elements.prepIdleStatus, "waiting", "3. LivePortrait idle loop waiting");
  markPrepStep(elements.prepLoopStatus, "waiting", "4. MuseTalk loop waiting");
  markPrepStep(elements.prepJoinStatus, "waiting", "5. Room join waiting");
}

function normalizeBaseUrl(value) {
  return String(value || "http://localhost:8080").trim().replace(/\/+$/, "");
}

function inferExtension(contentType, sourceUrl) {
  if (contentType.includes("png")) return "png";
  if (contentType.includes("jpeg") || contentType.includes("jpg")) return "jpg";
  if (contentType.includes("webp")) return "webp";
  const clean = String(sourceUrl || "").split("?")[0];
  const ext = clean.split(".").pop()?.toLowerCase();
  if (ext && ["png", "jpg", "jpeg", "webp", "bmp"].includes(ext)) return ext === "jpeg" ? "jpg" : ext;
  return "png";
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
  setAvatarSpeaking(false);
}

function decodePayload(payload) {
  const text = new TextDecoder().decode(payload);
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function setBusy(isBusy, label = null) {
  elements.joinButton.disabled = isBusy;
  elements.joinButton.textContent = isBusy ? label || "Joining..." : "Prepare & Join";
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Failed to read face image"));
    reader.readAsDataURL(blob);
  });
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
