const generateButton = document.getElementById("generateButton");
const startButton = document.getElementById("startButton");
const endButton = document.getElementById("endButton");
const statusBox = document.getElementById("status");
const frame = document.getElementById("frame");
let activeAvatarSessionId = null;
let activeTavusPersonaId = null;

bindRangePair("idealFuture", "idealFutureValue");
bindRangePair("careerFocus", "careerFocusValue");
bindRangePair("directness", "directnessValue");

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
