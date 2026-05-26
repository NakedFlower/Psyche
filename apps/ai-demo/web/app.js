const generateReplicaButton = document.getElementById("generateReplicaButton");
const useDefaultReplicaButton = document.getElementById("useDefaultReplicaButton");
const checkReplicaButton = document.getElementById("checkReplicaButton");
const generateButton = document.getElementById("generateButton");
const startButton = document.getElementById("startButton");
const endButton = document.getElementById("endButton");
const statusBox = document.getElementById("status");
const frame = document.getElementById("frame");
let activeAvatarSessionId = null;
let activeTavusPersonaId = null;
let activeTavusReplicaId = null;

bindRangePair("idealFuture", "idealFutureValue");
bindRangePair("careerFocus", "careerFocusValue");
bindRangePair("directness", "directnessValue");

generateReplicaButton.addEventListener("click", async () => {
  generateReplicaButton.disabled = true;
  statusBox.textContent = "Creating Tavus replica from image...";

  try {
    const response = await fetch("/api/v1/replicas/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        trainImageUrl: document.getElementById("trainImageUrl").value.trim(),
        voiceName: document.getElementById("voiceName").value.trim() || "anna",
        replicaName: "Psyche Future Self Replica",
        autoFixTrainingImage: true
      })
    });

    const payload = await response.json();

    if (!response.ok) {
      throw new Error(JSON.stringify(payload, null, 2));
    }

    activeTavusReplicaId = payload.replicaId;
    checkReplicaButton.disabled = Boolean(payload.fallback);
    statusBox.textContent = JSON.stringify(
      {
        replicaId: payload.replicaId,
        status: payload.status,
        voiceName: payload.voiceName,
        fallback: payload.fallback || false,
        warning: payload.warning,
        reason: payload.fallbackReason
      },
      null,
      2
    );
  } catch (error) {
    statusBox.textContent = error.message;
  } finally {
    generateReplicaButton.disabled = false;
  }
});

useDefaultReplicaButton.addEventListener("click", () => {
  activeTavusReplicaId = null;
  checkReplicaButton.disabled = true;
  statusBox.textContent = JSON.stringify(
    {
      replica: "default",
      message: "기본 Tavus 아바타를 사용합니다. 페르소나 생성과 화상통화는 계속 진행할 수 있습니다."
    },
    null,
    2
  );
});

checkReplicaButton.addEventListener("click", async () => {
  if (!activeTavusReplicaId) return;

  checkReplicaButton.disabled = true;
  statusBox.textContent = "Checking Tavus replica status...";

  try {
    const response = await fetch(`/api/v1/replicas/${activeTavusReplicaId}`);
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(JSON.stringify(payload, null, 2));
    }

    statusBox.textContent = JSON.stringify(payload, null, 2);
  } catch (error) {
    statusBox.textContent = error.message;
  } finally {
    checkReplicaButton.disabled = false;
  }
});

generateButton.addEventListener("click", async () => {
  generateButton.disabled = true;
  statusBox.textContent = "Creating Tavus persona from survey...";

  try {
    const response = await fetch("/api/v1/personas/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        personaId: document.getElementById("personaId").value || "test",
        tavusReplicaId: activeTavusReplicaId,
        targetYear: Number(document.getElementById("targetYear").value || 10),
        language: document.getElementById("language").value || "korean",
        weights: {
          idealFuture: getNumberValue("idealFutureValue", 60),
          careerFocus: getNumberValue("careerFocusValue", 60),
          directness: getNumberValue("directnessValue", 45)
        },
        voice: {
          provider: "default"
        },
        survey: {
          mbti: document.getElementById("mbti").value,
          values: splitInput(document.getElementById("values").value),
          habits: splitInput(document.getElementById("habits").value),
          goals: splitInput(document.getElementById("goals").value),
          concerns: splitInput(document.getElementById("concerns").value)
        }
      })
    });

    const payload = await response.json();

    if (!response.ok) {
      throw new Error(JSON.stringify(payload, null, 2));
    }

    activeTavusPersonaId = payload.tavusPersonaId;
    statusBox.textContent = JSON.stringify(
      {
        personaId: payload.personaId,
        tavusPersonaId: payload.tavusPersonaId,
        tavusReplicaId: payload.tavusReplicaId,
        displayName: payload.displayName,
        weights: payload.weights,
        archetype: payload.archetype?.title,
        styleSummary: payload.conversation.styleSummary
      },
      null,
      2
    );
  } catch (error) {
    statusBox.textContent = error.message;
  } finally {
    generateButton.disabled = false;
  }
});

startButton.addEventListener("click", async () => {
  startButton.disabled = true;
  statusBox.textContent = "Creating Tavus conversation...";
  frame.innerHTML = '<div class="empty">Tavus 세션을 만드는 중입니다. 보통 몇 초 정도 걸립니다.</div>';

  const controller = new AbortController();
  const timeout = window.setTimeout(() => {
    controller.abort();
  }, 30000);

  try {
    const response = await fetch("/api/v1/chats/session", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        personaId: document.getElementById("personaId").value || "test",
        tavusPersonaId: activeTavusPersonaId,
        tavusReplicaId: activeTavusReplicaId,
        mode: document.getElementById("mode").value || "video",
        language: document.getElementById("language").value || "korean",
        conversationName:
          document.getElementById("conversationName").value ||
          "Psyche AI MVP Test"
      })
    });

    const payload = await response.json();

    if (!response.ok) {
      throw new Error(JSON.stringify(payload, null, 2));
    }

    if (!payload.avatar?.joinUrl) {
      throw new Error("Tavus joinUrl이 응답에 없습니다.");
    }

    activeAvatarSessionId = payload.avatar.avatarSessionId;
    endButton.disabled = false;

    statusBox.textContent = JSON.stringify(
      {
        chatId: payload.chatId,
        tavusReplicaId: payload.tavusReplicaId,
        avatarSessionId: payload.avatar.avatarSessionId,
        joinUrl: payload.avatar.joinUrl,
        language: payload.avatar.language,
        status: payload.avatar.status
      },
      null,
      2
    );

    frame.innerHTML = "";
    const panel = document.createElement("div");
    panel.className = "join-panel";
    panel.innerHTML = `
      <p>Tavus 통화방이 생성됐습니다.</p>
      <a href="${payload.avatar.joinUrl}" target="_blank" rel="noreferrer">새 탭에서 열기</a>
    `;
    frame.appendChild(panel);

    const iframe = document.createElement("iframe");
    iframe.allow = "camera; microphone; fullscreen; display-capture; autoplay";
    iframe.src = payload.avatar.joinUrl;
    frame.appendChild(iframe);
  } catch (error) {
    const message =
      error.name === "AbortError"
        ? "Tavus 세션 생성 요청이 30초 안에 끝나지 않았습니다. 잠시 후 다시 시도해주세요."
        : error.message;

    statusBox.textContent = message;
    frame.innerHTML = `<div class="empty">${message}</div>`;
  } finally {
    window.clearTimeout(timeout);
    startButton.disabled = false;
  }
});

function splitInput(value) {
  return value
    .split(/,|\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function bindRangePair(rangeId, inputId) {
  const range = document.getElementById(rangeId);
  const input = document.getElementById(inputId);

  range.addEventListener("input", () => {
    input.value = range.value;
  });

  input.addEventListener("input", () => {
    const value = Math.max(0, Math.min(100, Number(input.value || 0)));
    input.value = value;
    range.value = value;
  });
}

function getNumberValue(id, fallback) {
  const value = Number(document.getElementById(id).value);
  return Number.isFinite(value) ? value : fallback;
}

endButton.addEventListener("click", async () => {
  endButton.disabled = true;
  statusBox.textContent = "Ending Tavus conversation...";

  try {
    const response = await fetch("/api/v1/chats/test/end", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        avatarSessionId: activeAvatarSessionId
      })
    });

    const payload = await response.json();

    if (!response.ok) {
      throw new Error(JSON.stringify(payload, null, 2));
    }

    activeAvatarSessionId = null;
    statusBox.textContent = JSON.stringify(payload, null, 2);
    frame.innerHTML = '<div class="empty">화상통화 세션이 종료되었습니다.</div>';
  } catch (error) {
    statusBox.textContent = error.message;
    endButton.disabled = false;
  }
});
