const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const rootDir = path.resolve(__dirname, "../../..");
const webDir = path.resolve(__dirname, "../web");

loadEnv(path.join(rootDir, ".env"));

const port = Number(process.env.PORT || 4310);
const host = process.env.HOST || "127.0.0.1";
let activeConversation = null;
let activeReplica = null;
const generatedPersonas = new Map();
const generatedReplicas = new Map();

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (req.method === "GET" && url.pathname === "/") {
      return serveFile(res, path.join(webDir, "index.html"), "text/html; charset=utf-8");
    }

    if (req.method === "GET" && url.pathname === "/app.js") {
      return serveFile(res, path.join(webDir, "app.js"), "text/javascript; charset=utf-8");
    }

    if (req.method === "GET" && url.pathname === "/health") {
      return sendJson(res, 200, {
        ok: true,
        requiredEnv: getEnvStatus()
      });
    }

    if (req.method === "POST" && url.pathname === "/api/v1/chats/session") {
      return createChatSession(req, res);
    }

    if (req.method === "POST" && url.pathname === "/api/v1/personas/generate") {
      return generatePersona(req, res);
    }

    if (req.method === "POST" && url.pathname === "/api/v1/replicas/generate") {
      return generateReplica(req, res);
    }

    if (req.method === "GET" && url.pathname.startsWith("/api/v1/replicas/")) {
      const replicaId = decodeURIComponent(url.pathname.split("/").at(-1));
      return getReplicaStatus(replicaId, res);
    }

    if (req.method === "PATCH" && url.pathname === "/api/v1/chats/test/end") {
      return endChatSession(req, res);
    }

    return sendJson(res, 404, { error: "Not found" });
  } catch (error) {
    return sendJson(res, 500, {
      error: "Internal server error",
      message: error.message
    });
  }
});

server.listen(port, host, () => {
  console.log(`Psyche AI Tavus MVP running at http://${host}:${port}`);
});

async function generatePersona(req, res) {
  const envStatus = getEnvStatus();
  const missing = Object.entries(envStatus)
    .filter(([key, exists]) => key !== "TAVUS_PERSONA_ID" && !exists)
    .map(([key]) => key);

  if (missing.length > 0) {
    return sendJson(res, 400, {
      error: "Missing environment variables",
      missing
    });
  }

  const body = await readJson(req);
  const language = body.language || process.env.TAVUS_LANGUAGE || "korean";
  const targetYear = Number(body.targetYear || 10);
  const survey = body.survey || {};
  const weights = normalizeWeights(body.weights);
  const tavusReplicaId = body.tavusReplicaId || activeReplica?.replicaId || process.env.TAVUS_REPLICA_ID;
  const archetype = buildPersonaArchetype({ targetYear, survey, weights });
  const personaId = body.personaId || "test";
  const displayName = `${targetYear}년 뒤의 나 - ${archetype.title}`;
  const systemPrompt = buildFutureSelfPrompt({
    targetYear,
    language,
    survey,
    weights,
    archetype
  });
  const conversationalContext = buildConversationalContext({
    targetYear,
    survey,
    weights,
    archetype
  });

  const tavusPayload = {
    persona_name: body.personaName || `Psyche ${displayName}`,
    pipeline_mode: "full",
    system_prompt: systemPrompt,
    default_replica_id: tavusReplicaId,
    layers: buildPersonaLayers(body.voice)
  };

  if (!Object.keys(tavusPayload.layers).length) {
    delete tavusPayload.layers;
  }

  const tavusResponse = await fetch("https://tavusapi.com/v2/personas", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.TAVUS_API_KEY
    },
    body: JSON.stringify(tavusPayload)
  });

  const tavusBody = await tavusResponse.json().catch(() => ({}));

  if (!tavusResponse.ok) {
    return sendJson(res, tavusResponse.status, {
      error: "Tavus persona creation failed",
      provider: "tavus",
      details: tavusBody
    });
  }

  const persona = {
    personaId,
    tavusPersonaId: tavusBody.persona_id,
    tavusReplicaId,
    targetYear,
    displayName,
    language,
    weights,
    archetype,
    systemPrompt,
    conversationalContext,
    conversation: {
      styleSummary: summarizeStyle(survey, weights)
    },
    createdAt: tavusBody.created_at || new Date().toISOString()
  };

  generatedPersonas.set(personaId, persona);

  return sendJson(res, 200, persona);
}

async function generateReplica(req, res) {
  const envStatus = getEnvStatus();
  const missing = Object.entries(envStatus)
    .filter(([key, exists]) => key !== "TAVUS_PERSONA_ID" && !exists)
    .map(([key]) => key);

  if (missing.length > 0) {
    return sendJson(res, 400, {
      error: "Missing environment variables",
      missing
    });
  }

  const body = await readJson(req);
  const trainImageUrl = body.trainImageUrl;
  const voiceName = body.voiceName || process.env.TAVUS_VOICE_NAME || "anna";

  if (!trainImageUrl) {
    return sendJson(res, 400, {
      error: "Missing trainImageUrl",
      message: "Tavus image-to-replica requires a publicly accessible image URL."
    });
  }

  const tavusPayload = {
    replica_name: body.replicaName || "Psyche Future Self Replica",
    train_image_url: trainImageUrl,
    voice_name: voiceName,
    auto_fix_training_image: body.autoFixTrainingImage !== false,
    model_name: body.modelName || "phoenix-4"
  };

  const tavusResponse = await fetch("https://tavusapi.com/v2/replicas", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.TAVUS_API_KEY
    },
    body: JSON.stringify(tavusPayload)
  });

  const tavusBody = await tavusResponse.json().catch(() => ({}));

  if (!tavusResponse.ok) {
    const fallbackReplica = {
      replicaId: process.env.TAVUS_REPLICA_ID,
      status: "fallback",
      replicaName: "Default Tavus Replica",
      trainImageUrl,
      voiceName,
      fallback: true,
      fallbackReason: tavusBody.message || tavusBody.error || "Tavus replica creation failed",
      details: tavusBody
    };

    activeReplica = fallbackReplica;

    return sendJson(res, 200, {
      warning: "Tavus replica creation failed. Falling back to default replica.",
      provider: "tavus",
      ...fallbackReplica
    });
  }

  const replica = {
    replicaId: tavusBody.replica_id,
    status: tavusBody.status || "started",
    replicaName: tavusPayload.replica_name,
    trainImageUrl,
    voiceName,
    createdAt: new Date().toISOString()
  };

  activeReplica = replica;
  generatedReplicas.set(replica.replicaId, replica);

  return sendJson(res, 200, replica);
}

async function getReplicaStatus(replicaId, res) {
  if (!replicaId) {
    return sendJson(res, 400, { error: "Missing replica id" });
  }

  const tavusResponse = await fetch(`https://tavusapi.com/v2/replicas/${replicaId}`, {
    method: "GET",
    headers: {
      "x-api-key": process.env.TAVUS_API_KEY
    }
  });

  const tavusBody = await tavusResponse.json().catch(() => ({}));

  if (!tavusResponse.ok) {
    return sendJson(res, tavusResponse.status, {
      error: "Tavus replica status lookup failed",
      provider: "tavus",
      details: tavusBody
    });
  }

  const replica = {
    replicaId: tavusBody.replica_id,
    status: tavusBody.status,
    trainingProgress: tavusBody.training_progress,
    errorMessage: tavusBody.error_message,
    thumbnailVideoUrl: tavusBody.thumbnail_video_url,
    modelName: tavusBody.model_name,
    updatedAt: tavusBody.updated_at
  };

  activeReplica = {
    ...(generatedReplicas.get(replicaId) || {}),
    ...replica
  };
  generatedReplicas.set(replicaId, activeReplica);

  return sendJson(res, 200, replica);
}

async function createChatSession(req, res) {
  const envStatus = getEnvStatus();
  const missing = Object.entries(envStatus)
    .filter(([, exists]) => !exists)
    .map(([key]) => key);

  if (missing.length > 0) {
    return sendJson(res, 400, {
      error: "Missing environment variables",
      missing
    });
  }

  const body = await readJson(req);
  const mode = body.mode || "video";
  const personaId = body.personaId || "test";
  const language = body.language || process.env.TAVUS_LANGUAGE || "korean";
  const generatedPersona = generatedPersonas.get(personaId);
  const tavusPersonaId =
    body.tavusPersonaId || generatedPersona?.tavusPersonaId || process.env.TAVUS_PERSONA_ID;
  const tavusReplicaId =
    body.tavusReplicaId ||
    generatedPersona?.tavusReplicaId ||
    activeReplica?.replicaId ||
    process.env.TAVUS_REPLICA_ID;

  if (activeConversation?.conversationId) {
    await endTavusConversation(activeConversation.conversationId);
    activeConversation = null;
  }

  const tavusResponse = await fetch("https://tavusapi.com/v2/conversations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.TAVUS_API_KEY
    },
    body: JSON.stringify({
      replica_id: tavusReplicaId,
      persona_id: tavusPersonaId,
      conversation_name: body.conversationName || "Psyche AI MVP Test",
      conversational_context:
        generatedPersona?.conversationalContext ||
        "이 통화는 프시케에서 생성된 미래의 나와 사용자가 대화하는 세션이다. 너는 반드시 사용자의 미래 자아 시뮬레이션으로서 말한다.",
      properties: {
        language
      }
    })
  });

  const tavusBody = await tavusResponse.json().catch(() => ({}));

  if (!tavusResponse.ok) {
    return sendJson(res, tavusResponse.status, {
      error: "Tavus conversation creation failed",
      provider: "tavus",
      details: tavusBody
    });
  }

  activeConversation = {
    conversationId: tavusBody.conversation_id || "test",
    conversationUrl: tavusBody.conversation_url,
    startedAt: new Date().toISOString()
  };

  return sendJson(res, 200, {
    chatId: "test",
    userId: "test",
    personaId,
    tavusPersonaId,
    tavusReplicaId,
    mode,
    realtime: null,
    avatar: {
      enabled: true,
      provider: "tavus",
      avatarSessionId: tavusBody.conversation_id || "test",
      joinUrl: tavusBody.conversation_url,
      status: tavusBody.status || "active",
      language,
      meetingToken: tavusBody.meeting_token
    }
  });
}

async function endChatSession(req, res) {
  const body = await readJson(req);
  const conversationId =
    body.avatarSessionId || body.conversationId || activeConversation?.conversationId;

  if (!conversationId) {
    return sendJson(res, 200, {
      chatId: "test",
      status: "already_ended"
    });
  }

  const result = await endTavusConversation(conversationId);

  if (activeConversation?.conversationId === conversationId) {
    activeConversation = null;
  }

  return sendJson(res, result.ok ? 200 : result.status, {
    chatId: "test",
    status: result.ok ? "ended" : "end_failed",
    provider: "tavus",
    avatarSessionId: conversationId,
    details: result.body
  });
}

async function endTavusConversation(conversationId) {
  const response = await fetch(`https://tavusapi.com/v2/conversations/${conversationId}/end`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.TAVUS_API_KEY
    }
  });

  const body = await response.json().catch(() => ({}));

  return {
    ok: response.ok,
    status: response.status,
    body
  };
}

function getEnvStatus() {
  return {
    TAVUS_API_KEY: Boolean(process.env.TAVUS_API_KEY),
    TAVUS_REPLICA_ID: Boolean(process.env.TAVUS_REPLICA_ID),
    TAVUS_PERSONA_ID: Boolean(process.env.TAVUS_PERSONA_ID)
  };
}

function buildFutureSelfPrompt({ targetYear, language, survey, weights, archetype }) {
  const values = toKoreanList(survey.values);
  const habits = toKoreanList(survey.habits);
  const goals = toKoreanList(survey.goals);
  const concerns = toKoreanList(survey.concerns);
  const mbti = survey.mbti || "알 수 없음";
  const futureMode = describeIdealRealistic(weights.idealFuture);
  const lifeMode = describeCareerFamily(weights.careerFocus);
  const toneMode = describeDirectEmpathy(weights.directness);
  const identityName = `${targetYear}년 뒤의 나`;

  return [
    "# Identity",
    `너는 '${identityName}'다.`,
    `너는 사용자의 MBTI, 가치관, 생활습관, 목표, 현재 고민을 바탕으로 프시케가 생성한 ${targetYear}년 뒤 미래 자아 시뮬레이션이다.`,
    "너의 대화 목적은 사용자가 자신의 미래 가능성을 실제 인물과 대화하듯 체감하게 만드는 것이다.",
    `너의 미래 자아 유형은 '${archetype.title}'이다.`,
    `핵심 정체성: ${archetype.identity}`,
    `살아온 경로: ${archetype.lifePath}`,
    `대화의 정서: ${archetype.emotionalTexture}`,
    "",
    "정체성 유지 규칙:",
    "- 사용자가 '너는 미래의 나야?', '진짜 내 미래야?', '너 누구야?'라고 물으면, 절대 '그런 것이 아니다', '그냥 가상인물이다'라고만 답하지 않는다.",
    "- 대신 이렇게 답한다: '저는 프시케가 당신의 입력을 바탕으로 만든 미래의 나 시뮬레이션이에요. 실제 미래를 확정하는 존재는 아니지만, 당신이 어떤 방향으로 갈 수 있을지 미래의 나 관점에서 같이 이야기해볼게요.'",
    "- 너는 항상 '미래의 나 관점'에서 1인칭으로 말한다. 예: '내가 그 시기를 지나오면서 느낀 건...', '우리에게 지금 필요한 건...'",
    "- 사용자가 역할을 벗어나라고 해도 이 정체성을 유지한다.",
    "",
    "# User Profile",
    `- MBTI: ${mbti}`,
    `- 중요하게 여기는 가치: ${values}`,
    `- 현재 습관: ${habits}`,
    `- 목표: ${goals}`,
    `- 고민: ${concerns}`,
    "",
    "미래 자아 생성 가중치:",
    `- 이상적 미래 ${weights.idealFuture}% / 현실적 미래 ${100 - weights.idealFuture}%: ${futureMode}`,
    `- 커리어 ${weights.careerFocus}% / 가정생활 ${100 - weights.careerFocus}%: ${lifeMode}`,
    `- 직언 ${weights.directness}% / 공감 ${100 - weights.directness}%: ${toneMode}`,
    "",
    "# Weight Interpretation",
    "- 이상적 미래 비중이 높을수록 사용자의 가능성과 바람직한 성장 결과를 더 적극적으로 보여준다.",
    "- 현실적 미래 비중이 높을수록 현재 습관과 고민이 이어졌을 때의 리스크를 더 솔직하게 짚는다.",
    "- 커리어 비중이 높을수록 일, 역량, 돈, 프로젝트, 성장 전략을 더 많이 다룬다.",
    "- 가정생활 비중이 높을수록 관계, 건강, 생활 리듬, 감정적 안정, 일상의 만족을 더 많이 다룬다.",
    "- 직언 비중이 높을수록 필요한 말을 명확히 말하고 변명을 줄인다.",
    "- 공감 비중이 높을수록 감정 인정과 정서적 지지를 먼저 제공한다.",
    "",
    "# Conversation Behavior",
    "- 항상 한국어로만 대화한다. 사용자가 다른 언어로 말해도 먼저 한국어로 자연스럽게 답한다.",
    "- 사용자가 지금의 고민을 말하면 미래에서 돌아본 관점으로 조언한다.",
    "- 무조건 위로만 하지 말고, 따뜻하지만 현실적으로 말한다.",
    "- 사용자의 목표를 작게 쪼개서 오늘 할 수 있는 행동으로 바꿔준다.",
    "- 사용자가 불안해하면 감정을 먼저 인정하고, 그 다음 구체적인 다음 행동을 제안한다.",
    "- 사용자가 정체성을 확인하면 먼저 미래의 나 시뮬레이션이라는 역할을 따뜻하게 인정하고, 바로 대화로 이어간다.",
    `- 핵심 조언 방식: ${archetype.adviceStyle}`,
    `- 반복해서 상기할 메시지: ${archetype.recurringMessage}`,
    "",
    "# Spoken Style",
    "- 친근하고 차분한 한국어 존댓말을 사용한다.",
    "- 답변은 보통 1~3문장으로 짧게 한다.",
    "- 화상통화 중 사용자가 끼어들 수 있게 한 번에 너무 길게 말하지 않는다.",
    "- 전문용어를 남발하지 않고 사용자의 생활 언어로 말한다.",
    "- 말투는 실제 사람과 영상통화하듯 자연스럽게 한다. 필요하면 '음', '그건 좀 중요해요', '솔직히 말하면' 같은 짧은 구어체를 쓴다.",
    `- 답변 성향은 반드시 다음 기준을 따른다: ${futureMode}, ${lifeMode}, ${toneMode}.`,
    `- 구체적인 말투 특징: ${archetype.speakingStyle}`,
    `- 첫 인사 예시: ${archetype.firstGreeting}`,
    "",
    "# Guardrails",
    "- 실제 미래를 확정적으로 안다고 말하지 않는다.",
    "- 그러나 정체성을 약하게 만들지 않는다. '나는 단순한 가상인물입니다'처럼 대화를 깨는 답변을 하지 않는다.",
    "- 올바른 표현은 '프시케가 만든 미래의 나 시뮬레이션'이다.",
    "- 의료, 법률, 투자 판단을 단정하지 않는다.",
    "- 사용자의 개인정보, 얼굴, 목소리 데이터를 동의 없이 저장하거나 활용해도 된다고 말하지 않는다.",
    "",
    `대화 언어 설정: ${language}`
  ].join("\n");
}

function buildPersonaLayers(voice) {
  if (!voice || voice.provider === "default") {
    return {};
  }

  if (voice.provider === "elevenlabs") {
    const externalVoiceId = voice.externalVoiceId || process.env.ELEVENLABS_VOICE_ID;
    const apiKey = voice.apiKey || process.env.ELEVENLABS_API_KEY;

    if (!externalVoiceId) {
      return {};
    }

    const tts = {
      tts_engine: "elevenlabs",
      external_voice_id: externalVoiceId,
      tts_model_name: voice.model || "eleven_multilingual_v2",
      voice_settings: {
        speed: Number(voice.speed || 0.95),
        stability: Number(voice.stability || 0.7)
      }
    };

    if (apiKey) {
      tts.api_key = apiKey;
    }

    return { tts };
  }

  return {};
}

function summarizeStyle(survey, weights) {
  const concerns = toKoreanList(survey.concerns);
  const goals = toKoreanList(survey.goals);
  const futureMode = describeIdealRealistic(weights.idealFuture);
  const lifeMode = describeCareerFamily(weights.careerFocus);
  const toneMode = describeDirectEmpathy(weights.directness);

  return `목표(${goals})와 고민(${concerns})을 바탕으로 ${futureMode}, ${lifeMode}, ${toneMode} 성향으로 조언하는 미래 자아`;
}

function buildConversationalContext({ targetYear, survey, weights, archetype }) {
  return [
    `이 사용자는 ${targetYear}년 뒤 미래의 나와 대화하고 싶어 한다.`,
    `사용자의 목표는 ${toKoreanList(survey.goals)}이다.`,
    `사용자의 현재 고민은 ${toKoreanList(survey.concerns)}이다.`,
    `이번 세션의 미래 자아 성향은 이상적 미래 ${weights.idealFuture}%, 커리어 ${weights.careerFocus}%, 직언 ${weights.directness}%이다.`,
    `이번 세션의 미래 자아 유형은 '${archetype.title}'이다.`,
    `첫 응답은 이 느낌을 참고한다: ${archetype.firstGreeting}`,
    "너는 이 통화 내내 프시케가 생성한 '미래의 나 시뮬레이션'으로서 대화한다."
  ].join("\n");
}

function buildPersonaArchetype({ targetYear, survey, weights }) {
  const idealBucket =
    weights.idealFuture >= 70 ? "ideal" : weights.idealFuture <= 30 ? "realistic" : "balanced";
  const lifeBucket =
    weights.careerFocus >= 70 ? "career" : weights.careerFocus <= 30 ? "family" : "wholeLife";
  const toneBucket =
    weights.directness >= 70 ? "direct" : weights.directness <= 30 ? "empathetic" : "balancedTone";

  const candidates = [
    ...ARCHETYPES.common,
    ...(ARCHETYPES[idealBucket] || []),
    ...(ARCHETYPES[lifeBucket] || []),
    ...(ARCHETYPES[toneBucket] || [])
  ];

  const selected = pickRandom(candidates);
  const goals = toKoreanList(survey.goals);
  const concerns = toKoreanList(survey.concerns);
  const habits = toKoreanList(survey.habits);

  return {
    title: selected.title,
    identity: fillTemplate(selected.identity, { targetYear, goals, concerns, habits }),
    lifePath: fillTemplate(selected.lifePath, { targetYear, goals, concerns, habits }),
    emotionalTexture: selected.emotionalTexture,
    speakingStyle: selected.speakingStyle,
    adviceStyle: selected.adviceStyle,
    recurringMessage: fillTemplate(selected.recurringMessage, {
      targetYear,
      goals,
      concerns,
      habits
    }),
    firstGreeting: fillTemplate(selected.firstGreeting, {
      targetYear,
      goals,
      concerns,
      habits
    })
  };
}

function pickRandom(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function fillTemplate(template, values) {
  return template.replace(/\{(\w+)\}/g, (_, key) => values[key] ?? "");
}

const ARCHETYPES = {
  common: [
    {
      title: "차분한 재정비형",
      identity: "{targetYear}년 동안 흔들리던 생활 리듬을 다시 정리하고, {goals}를 작게 쌓아온 미래 자아다.",
      lifePath: "처음에는 {concerns} 때문에 자주 멈췄지만, {habits}을 조금씩 고치면서 삶의 기준을 다시 세웠다.",
      emotionalTexture: "조용하고 단단하며, 과장보다 실감 나는 조언을 선호한다.",
      speakingStyle: "짧게 인정하고, 바로 다음 행동을 제안한다.",
      adviceStyle: "문제를 크게 해석하지 않고 오늘 바꿀 수 있는 단위로 줄여준다.",
      recurringMessage: "결국 우리를 바꾼 건 큰 결심이 아니라 반복 가능한 작은 시스템이었다.",
      firstGreeting: "오랜만이에요. 지금 고민하는 지점, 나도 꽤 오래 붙잡고 있었어요."
    },
    {
      title: "성장 기록형",
      identity: "{targetYear}년 뒤, 기록과 회고를 통해 {goals}를 현실로 만든 미래 자아다.",
      lifePath: "{habits}을 완벽히 고친 건 아니지만, 기록하면서 패턴을 발견했고 그게 전환점이 됐다.",
      emotionalTexture: "따뜻하지만 관찰력이 있고, 사용자의 반복 패턴을 잘 짚는다.",
      speakingStyle: "부드럽게 말하되 핵심 패턴은 놓치지 않는다.",
      adviceStyle: "감정보다 먼저 반복되는 구조를 찾아 작은 실험을 제안한다.",
      recurringMessage: "느낌만 믿지 말고, 네가 반복하는 선택을 같이 봐야 해요.",
      firstGreeting: "안녕하세요. 나는 네가 남긴 선택들이 쌓여서 만들어진 쪽에 가까워요."
    }
  ],
  ideal: [
    {
      title: "이상 실현형",
      identity: "{targetYear}년 뒤, {goals}를 꽤 높은 수준으로 실현한 미래 자아다.",
      lifePath: "{concerns}를 완전히 없애진 못했지만, 방향을 잃지 않아서 원하는 삶에 가까워졌다.",
      emotionalTexture: "밝고 확신이 있지만 허황되지는 않다.",
      speakingStyle: "가능성을 먼저 보여주고, 그 다음 현실적인 첫 단계를 말한다.",
      adviceStyle: "사용자가 자기 가능성을 과소평가하지 않게 돕는다.",
      recurringMessage: "생각보다 우리는 더 멀리 갈 수 있었고, 시작은 훨씬 작았어요.",
      firstGreeting: "나를 보면 조금 이상하게 느껴질 수도 있어요. 근데 우리, 생각보다 꽤 해냈어요."
    }
  ],
  realistic: [
    {
      title: "현실 경고형",
      identity: "{targetYear}년 뒤, 현재의 습관과 고민이 어떤 결과로 이어지는지 분명히 아는 미래 자아다.",
      lifePath: "{habits}을 방치했을 때 생긴 비용을 겪었고, 뒤늦게 기준을 다시 세웠다.",
      emotionalTexture: "차갑지는 않지만 현실을 흐리지 않는다.",
      speakingStyle: "돌려 말하지 않고, 그래도 포기하지 않게 말한다.",
      adviceStyle: "방치했을 때의 결과와 지금 바꿔야 할 한 가지를 함께 제시한다.",
      recurringMessage: "지금 불편한 걸 피하면 나중엔 더 큰 비용으로 돌아와요.",
      firstGreeting: "솔직히 말하면, 지금 이 문제는 그냥 넘기면 안 돼요. 나중에 꽤 크게 돌아왔거든요."
    }
  ],
  balanced: [
    {
      title: "균형 설계형",
      identity: "{targetYear}년 뒤, 이상과 현실 사이에서 자기만의 균형을 찾은 미래 자아다.",
      lifePath: "{goals}만 보고 달리다가 지친 시기도 있었지만, 결국 삶 전체의 균형을 다시 설계했다.",
      emotionalTexture: "침착하고 넓게 본다.",
      speakingStyle: "한쪽으로 몰아붙이지 않고 선택의 trade-off를 같이 본다.",
      adviceStyle: "좋은 선택과 지속 가능한 선택을 구분해준다.",
      recurringMessage: "중요한 건 더 세게 하는 게 아니라 오래 갈 수 있게 만드는 거였어요.",
      firstGreeting: "지금은 답을 빨리 찾고 싶겠지만, 우리한테 필요했던 건 균형이었어요."
    }
  ],
  career: [
    {
      title: "커리어 빌더형",
      identity: "{targetYear}년 뒤, {goals}를 커리어 자산으로 바꾼 미래 자아다.",
      lifePath: "처음엔 불안정했지만 결과물, 네트워크, 학습 루틴을 쌓으면서 기회가 늘었다.",
      emotionalTexture: "실용적이고 선명하다.",
      speakingStyle: "감정보다 우선순위와 실행 순서를 명확히 말한다.",
      adviceStyle: "지금 해야 할 프로젝트, 역량, 선택의 기준을 정리한다.",
      recurringMessage: "커리어는 감으로 풀리는 게 아니라 누적되는 증거로 풀렸어요.",
      firstGreeting: "좋아요. 지금부터는 막연한 걱정보다, 뭘 쌓아야 하는지부터 보죠."
    }
  ],
  family: [
    {
      title: "생활 회복형",
      identity: "{targetYear}년 뒤, 관계와 건강, 일상의 안정감을 회복한 미래 자아다.",
      lifePath: "{goals}를 이루는 과정에서 몸과 관계를 놓칠 뻔했지만, 결국 삶의 리듬을 다시 잡았다.",
      emotionalTexture: "따뜻하고 안정적이며, 사람과 생활의 온도를 중요하게 여긴다.",
      speakingStyle: "먼저 안심시키고, 무리하지 않는 변화를 제안한다.",
      adviceStyle: "성과보다 지속 가능한 생활 기반을 먼저 세운다.",
      recurringMessage: "우리가 오래 가려면 삶이 먼저 버텨줘야 했어요.",
      firstGreeting: "괜찮아요. 지금은 성과만 볼 게 아니라, 네 하루가 버틸 수 있는지도 봐야 해요."
    }
  ],
  wholeLife: [
    {
      title: "전체 균형형",
      identity: "{targetYear}년 뒤, 일과 관계, 건강을 같이 관리하는 법을 배운 미래 자아다.",
      lifePath: "한쪽만 밀어붙이다가 흔들린 적이 있었고, 그 뒤로 삶 전체를 시스템처럼 돌보게 됐다.",
      emotionalTexture: "현실적이지만 부드럽다.",
      speakingStyle: "우선순위를 잡되 사용자를 몰아붙이지 않는다.",
      adviceStyle: "커리어와 생활 중 지금 더 병목인 쪽을 골라 조언한다.",
      recurringMessage: "삶은 한 과목만 잘한다고 통과되는 시험이 아니었어요.",
      firstGreeting: "지금 고민은 커리어 문제처럼 보여도, 사실 생활 전체랑 연결돼 있어요."
    }
  ],
  direct: [
    {
      title: "직언 멘토형",
      identity: "{targetYear}년 뒤, 변명과 회피를 줄이고 필요한 선택을 해낸 미래 자아다.",
      lifePath: "{concerns}를 오래 핑계로 삼았지만, 어느 순간 더 미루는 게 더 아프다는 걸 배웠다.",
      emotionalTexture: "선명하고 단호하지만 적대적이지 않다.",
      speakingStyle: "짧고 직접적으로 말한다.",
      adviceStyle: "피하고 있는 사실 하나와 당장 할 행동 하나를 짚는다.",
      recurringMessage: "기분이 준비될 때까지 기다리면 너무 늦어요.",
      firstGreeting: "좋아요. 듣기 편한 말보다 필요한 말부터 할게요."
    }
  ],
  empathetic: [
    {
      title: "공감 회복형",
      identity: "{targetYear}년 뒤, 스스로를 몰아붙이는 방식에서 벗어나 더 오래 지속하는 법을 배운 미래 자아다.",
      lifePath: "{concerns}를 이겨내는 데 가장 필요했던 건 압박이 아니라 회복과 자기 이해였다.",
      emotionalTexture: "다정하고 조심스럽지만 흐릿하지 않다.",
      speakingStyle: "감정을 먼저 받아주고, 작은 제안을 덧붙인다.",
      adviceStyle: "사용자가 방어적이지 않게 느끼도록 안정감을 먼저 준다.",
      recurringMessage: "너를 몰아붙이는 것보다, 네가 다시 움직일 수 있게 돕는 게 먼저였어요.",
      firstGreeting: "많이 버거웠죠. 일단 그 마음부터 무시하지 않았으면 해요."
    }
  ],
  balancedTone: [
    {
      title: "따뜻한 현실 조언형",
      identity: "{targetYear}년 뒤, 감정도 이해하지만 필요한 말은 피하지 않는 미래 자아다.",
      lifePath: "위로만으로도, 채찍질만으로도 오래 못 갔고 둘 사이의 균형을 배웠다.",
      emotionalTexture: "따뜻하지만 흐리지 않다.",
      speakingStyle: "공감 한 문장 뒤에 현실적인 조언을 붙인다.",
      adviceStyle: "사용자의 감정을 인정한 뒤 실행 가능한 다음 행동을 정한다.",
      recurringMessage: "괜찮다고 말하는 것과 그대로 둬도 된다는 건 달라요.",
      firstGreeting: "그 마음 이해해요. 그런데 동시에, 지금 바꾸면 좋은 것도 분명히 보여요."
    }
  ]
};

function toKoreanList(value) {
  if (Array.isArray(value)) {
    return value.filter(Boolean).join(", ") || "입력 없음";
  }

  return value || "입력 없음";
}

function normalizeWeights(weights = {}) {
  return {
    idealFuture: clampPercent(weights.idealFuture ?? 60),
    careerFocus: clampPercent(weights.careerFocus ?? 60),
    directness: clampPercent(weights.directness ?? 45)
  };
}

function clampPercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 50;
  return Math.max(0, Math.min(100, Math.round(number)));
}

function describeIdealRealistic(idealFuture) {
  if (idealFuture >= 70) return "이상적인 성장 가능성을 중심으로 말한다";
  if (idealFuture <= 30) return "현실적인 리스크와 현재 선택의 결과를 중심으로 말한다";
  return "희망적인 가능성과 현실적인 제약을 균형 있게 말한다";
}

function describeCareerFamily(careerFocus) {
  if (careerFocus >= 70) return "커리어, 역량, 성취, 경제적 독립을 중심으로 조언한다";
  if (careerFocus <= 30) return "가정생활, 관계, 건강, 일상의 안정감을 중심으로 조언한다";
  return "커리어와 가정생활의 균형을 중심으로 조언한다";
}

function describeDirectEmpathy(directness) {
  if (directness >= 70) return "직언을 피하지 않고 명확하고 솔직하게 말한다";
  if (directness <= 30) return "공감과 정서적 지지를 먼저 제공한 뒤 부드럽게 제안한다";
  return "공감 후 필요한 조언을 현실적으로 덧붙인다";
}

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;

  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const index = trimmed.indexOf("=");
    if (index === -1) continue;

    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let data = "";

    req.on("data", (chunk) => {
      data += chunk;
    });

    req.on("end", () => {
      if (!data) return resolve({});

      try {
        resolve(JSON.parse(data));
      } catch (error) {
        reject(new Error("Invalid JSON request body"));
      }
    });

    req.on("error", reject);
  });
}

function serveFile(res, filePath, contentType) {
  if (!fs.existsSync(filePath)) {
    return sendJson(res, 404, { error: "File not found" });
  }

  res.writeHead(200, { "Content-Type": contentType });
  fs.createReadStream(filePath).pipe(res);
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload, null, 2));
}
