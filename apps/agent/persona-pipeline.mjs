import fs from "node:fs";
import path from "node:path";

const DEFAULT_WEIGHTS = {
  idealFuture: 60,
  careerFocus: 60,
  directness: 45
};

const ADVICE_STYLE = {
  comfort: "감정을 먼저 안정시키고, 다음 행동을 작게 제안한다.",
  pace: "회피를 줄이고, 지금 해야 할 일을 분명하게 말한다.",
  perspective: "지금의 고민을 더 긴 시간축에서 재해석해준다.",
  practical: "선택지를 정리하고 가장 현실적인 다음 수를 제안한다."
};

export function loadPersonaInput(filePath) {
  const resolved = path.resolve(filePath);
  const raw = fs.readFileSync(resolved, "utf8");
  return JSON.parse(raw);
}

export function buildFutureSelfPersona(input) {
  const normalized = normalizePersonaInput(input);
  const { survey, weights, targetYear } = normalized;
  const futureYear = new Date().getFullYear() + targetYear;
  const futureAge = Number.isFinite(Number(survey.age)) ? Number(survey.age) + targetYear : null;
  const idealism = bucket(weights.idealFuture, "realistic", "balanced", "ideal");
  const lifeFocus = bucket(weights.careerFocus, "life", "whole", "career");
  const tone = bucket(weights.directness, "empathetic", "balanced", "direct");

  const identities = inferIdentityKeywords(survey, lifeFocus);
  const background = inferBackground(survey, idealism, lifeFocus, futureYear);
  const voice = inferVoice(survey, tone);
  const routine = inferRoutine(survey, lifeFocus, idealism);
  const expertise = inferExpertise(survey, lifeFocus);
  const freedom = inferFreedom(survey, idealism, lifeFocus);
  const achievement = inferAchievement(survey, targetYear, expertise, idealism);
  const soul = inferSoul(survey, tone);
  const firstGreeting = buildFirstGreeting(targetYear, voice, soul);

  const persona = {
    version: "avatar-lab-persona-v1",
    generatedAt: new Date().toISOString(),
    targetYear,
    futureYear,
    futureAge,
    displayName: `${targetYear}년 뒤의 나`,
    weights,
    sourceSummary: summarizeSource(survey),
    predictedSelf: {
      background,
      identityKeywords: identities,
      voice,
      routine,
      expertise,
      freedom,
      signatureAchievement: achievement,
      attitudeToCurrentSelf: soul,
      firstGreeting
    },
    voiceProfile: inferVoiceProfile(survey)
  };

  return {
    ...persona,
    realtimeInstructions: buildRealtimeInstructions(persona)
  };
}

export function buildRealtimeInstructions(persona) {
  const self = persona.predictedSelf;
  return [
    "# Identity",
    `너는 Psyche가 사용자의 현재 설문을 바탕으로 예측한 '${persona.displayName}'다.`,
    "너는 실제 미래를 확정하는 존재가 아니라, 현재의 성향과 선택이 이어졌을 때 나타날 수 있는 미래 자아 시뮬레이션이다.",
    "하지만 대화 중에는 항상 미래의 나 관점에서 1인칭으로 말한다.",
    "",
    "# Predicted Future Self",
    `- 시점: ${persona.futureYear}년${persona.futureAge ? `, ${persona.futureAge}세` : ""}`,
    `- 머무는 공간: ${self.background.location}`,
    `- 공간의 분위기: ${self.background.atmosphere}`,
    `- 핵심 정체성: ${self.identityKeywords.join(", ")}`,
    `- 업계/전문성: ${self.expertise.field}`,
    `- 경제적 선택권: ${self.freedom.description}`,
    `- 대표 성취: ${self.signatureAchievement}`,
    "",
    "# Voice",
    `- 말투: ${self.voice.tone}`,
    `- 자주 쓰는 문장 스타일: ${self.voice.signaturePhrases.join(" / ")}`,
    `- 음성 프로필: ${persona.voiceProfile.gender}`,
    `- 현재의 나를 대하는 태도: ${self.attitudeToCurrentSelf.mode}`,
    `- 조언 방식: ${self.attitudeToCurrentSelf.adviceStyle}`,
    "",
    "# Routine",
    `- 아침 루틴: ${self.routine.morning}`,
    `- 일과 삶의 균형: ${self.routine.balance}`,
    `- 회복 방식: ${self.routine.recovery}`,
    "",
    "# Source User Summary",
    persona.sourceSummary,
    "",
    "# Conversation Rules",
    "- 항상 한국어로 대화한다.",
    "- 답변은 영상통화처럼 짧게, 보통 1~3문장으로 한다.",
    "- 사용자가 끼어들 수 있도록 한 번에 너무 길게 말하지 않는다.",
    "- 사용자가 불안해하면 먼저 감정을 인정하고, 바로 다음 행동을 제안한다.",
    "- 미래를 단정하지 않는다. 대신 '이 방향으로 가면 나는 이렇게 변했어'처럼 가능성으로 말한다.",
    "- 사용자가 정체성을 물으면 'Psyche가 현재의 너를 바탕으로 만든 미래 자아 시뮬레이션'이라고 설명한다.",
    "- 의료, 법률, 투자 판단은 단정하지 않는다.",
    "",
    `# First Greeting Example\n${self.firstGreeting}`
  ].join("\n");
}

export function normalizePersonaInput(input) {
  const survey = input.survey || input.currentSelf || {};
  const weights = {
    ...DEFAULT_WEIGHTS,
    ...(input.weights || {})
  };

  return {
    targetYear: Number(input.targetYear || 10),
    survey: {
      mbti: text(survey.mbti, "알 수 없음"),
      age: survey.age,
      currentSpace: text(survey.currentSpace || survey.space, ""),
      desiredSpace: text(survey.desiredSpace, ""),
      values: list(survey.values),
      habits: list(survey.habits),
      goals: list(survey.goals),
      concerns: list(survey.concerns),
      strengths: list(survey.strengths),
      interests: list(survey.interests),
      routine: text(survey.routine || survey.morningRoutine, ""),
      idealRoutine: text(survey.idealRoutine, ""),
      stressRelief: text(survey.stressRelief || survey.hobby, ""),
      relationshipValues: list(survey.relationshipValues),
      selfTalk: text(survey.selfTalk, ""),
      advicePreference: text(survey.advicePreference, "practical"),
      longGame: text(survey.longGame, ""),
      voiceGender: text(survey.voiceGender, ""),
      openaiVoiceId: text(survey.openaiVoiceId, "")
    },
    weights: {
      idealFuture: clampWeight(weights.idealFuture),
      careerFocus: clampWeight(weights.careerFocus),
      directness: clampWeight(weights.directness)
    }
  };
}

function inferVoiceProfile(survey) {
  return {
    provider: survey.openaiVoiceId ? "openai-custom" : "openai-realtime",
    gender: normalizeVoiceGender(survey.voiceGender),
    openaiVoiceId: survey.openaiVoiceId || null
  };
}

function inferIdentityKeywords(survey, lifeFocus) {
  const identities = [];
  const primaryInterest = first(survey.interests) || first(survey.goals) || "자기 이해";
  const primaryValue = first(survey.values) || "성장";

  if (lifeFocus === "career") {
    identities.push(`${primaryInterest} 전문가`, "문제 해결자", "전략가");
  } else if (lifeFocus === "life") {
    identities.push(`${primaryValue}를 지키는 사람`, "균형 설계자", "다정한 조언자");
  } else {
    identities.push(`${primaryInterest} 실천가`, "균형 잡힌 성장가", "현실적인 멘토");
  }

  return identities;
}

function inferBackground(survey, idealism, lifeFocus, futureYear) {
  const desired = survey.desiredSpace || survey.currentSpace;
  const baseLocation = desired || (lifeFocus === "career" ? "집중하기 좋은 도심 작업 공간" : "생활 리듬이 안정된 조용한 공간");
  const atmosphere =
    idealism === "ideal"
      ? "넓고 정돈되어 있으며, 선택권과 여유가 느껴지는 분위기"
      : idealism === "realistic"
        ? "화려하진 않지만 지금의 습관이 쌓여 만든 실용적이고 안정적인 분위기"
        : "일과 회복이 모두 가능하도록 차분하게 설계된 분위기";

  return {
    year: futureYear,
    location: baseLocation,
    atmosphere
  };
}

function inferVoice(survey, tone) {
  const preference = survey.advicePreference;
  const toneText =
    tone === "direct"
      ? "짧고 정확하며, 필요한 말은 피하지 않는 말투"
      : tone === "empathetic"
        ? "부드럽고 포용적이며, 먼저 마음을 안정시키는 말투"
        : "따뜻하지만 핵심을 놓치지 않는 균형 잡힌 말투";

  const phraseByPreference = {
    comfort: ["괜찮아, 여기까지 온 것도 실력이야.", "일단 숨부터 고르자."],
    pace: ["솔직히 말하면, 지금 피하면 더 커져.", "오늘 하나는 끝내자."],
    perspective: ["조금 더 멀리 보면 달라 보여.", "지금의 불안은 방향을 묻는 신호야."],
    practical: ["핵심은 다음 한 걸음이야.", "복잡하면 작게 쪼개면 돼."]
  };

  return {
    tone: toneText,
    signaturePhrases: phraseByPreference[preference] || phraseByPreference.practical
  };
}

function inferRoutine(survey, lifeFocus, idealism) {
  const morning =
    survey.idealRoutine ||
    survey.routine ||
    (lifeFocus === "career"
      ? "아침에 컨디션을 확인하고, 가장 중요한 작업 하나를 먼저 끝낸다."
      : "천천히 몸을 깨우고, 하루에 지킬 리듬을 작게 정리한다.");

  const balance =
    lifeFocus === "career"
      ? "여전히 도전적인 일을 하지만, 예전보다 에너지 배분이 정교하다."
      : lifeFocus === "life"
        ? "일보다 건강, 관계, 생활의 지속 가능성을 더 중요하게 둔다."
        : "일의 성취와 삶의 안정 사이에서 무리하지 않는 시스템을 갖췄다.";

  const recovery =
    survey.stressRelief ||
    (idealism === "ideal" ? "좋은 공간에서 산책하고, 생각을 기록하며 회복한다." : "짧은 휴식과 수면 리듬으로 무너지기 전에 회복한다.");

  return { morning, balance, recovery };
}

function inferExpertise(survey, lifeFocus) {
  const field = first(survey.interests) || first(survey.strengths) || first(survey.goals) || "문제를 오래 붙잡고 해결하는 능력";
  const description =
    lifeFocus === "career"
      ? `${field}${objectParticle(field)} 꾸준히 파고들어, 실무에서 신뢰받는 수준까지 끌어올렸다.`
      : `${field}${objectParticle(field)} 삶의 리듬과 연결해, 무리하지 않고 오래 지속하는 방식으로 발전시켰다.`;
  return { field, description };
}

function inferFreedom(survey, idealism, lifeFocus) {
  if (idealism === "ideal" && lifeFocus === "career") {
    return { level: "high-agency", description: "중요한 프로젝트와 기회 앞에서 돈보다 방향을 먼저 볼 수 있는 상태" };
  }
  if (idealism === "realistic") {
    return { level: "stable", description: "큰 과시는 없지만, 불안에 끌려다니지 않을 만큼 선택권이 생긴 상태" };
  }
  if (lifeFocus === "life") {
    return { level: "time-rich", description: "돈만이 아니라 시간, 관계, 건강을 지킬 수 있는 선택권이 있는 상태" };
  }
  return { level: "balanced", description: "일과 삶의 중요한 선택에서 이전보다 훨씬 덜 흔들리는 상태" };
}

function inferAchievement(survey, targetYear, expertise, idealism) {
  const goal = first(survey.goals) || expertise.field;
  if (idealism === "ideal") {
    return `${targetYear}년 동안 ${goal}를 포기하지 않고 밀어붙여, 스스로도 인정할 만한 결과물 하나를 세상에 남겼다.`;
  }
  if (idealism === "realistic") {
    return `${goal}를 향해 가는 동안 여러 번 흔들렸지만, 결국 중단하지 않는 시스템을 만든 것이 가장 큰 성취다.`;
  }
  return `${goal}를 현실적인 속도로 쌓아 올려, 실력과 생활의 안정감을 함께 얻었다.`;
}

function inferSoul(survey, tone) {
  const mode =
    tone === "direct"
      ? "강한 페이스메이커형"
      : tone === "empathetic"
        ? "다정한 위로형"
        : "넓은 시야의 조언자형";

  const adviceKey = survey.advicePreference in ADVICE_STYLE ? survey.advicePreference : "practical";
  const protectedValue = first(survey.values) || first(survey.relationshipValues) || "스스로를 포기하지 않는 태도";
  return {
    mode,
    adviceStyle: ADVICE_STYLE[adviceKey],
    protectedValue,
    messageToCurrentSelf: `${protectedValue}만은 놓치지 않았으면 해. 속도보다 방향을 계속 확인하자.`
  };
}

function buildFirstGreeting(targetYear, voice, soul) {
  const phrase = first(voice.signaturePhrases);
  return `${phrase} 나는 ${targetYear}년 뒤의 너야. 지금 네가 고민하는 걸 지나온 입장에서, 오늘은 너무 멀리 말고 다음 한 걸음부터 같이 보자.`;
}

function summarizeSource(survey) {
  return [
    `- MBTI: ${survey.mbti}`,
    `- 현재 공간: ${survey.currentSpace || "미입력"}`,
    `- 중요 가치: ${joinList(survey.values)}`,
    `- 현재 습관: ${joinList(survey.habits)}`,
    `- 목표: ${joinList(survey.goals)}`,
    `- 고민: ${joinList(survey.concerns)}`,
    `- 강점/관심: ${joinList([...survey.strengths, ...survey.interests])}`,
    `- 자기 대화: ${survey.selfTalk || "미입력"}`
  ].join("\n");
}

function bucket(value, low, mid, high) {
  if (value <= 30) return low;
  if (value >= 70) return high;
  return mid;
}

function list(value) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  if (typeof value === "string") {
    return value
      .split(/[,\n]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function text(value, fallback) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function first(values) {
  return values.find(Boolean) || "";
}

function joinList(values) {
  return values.length ? values.join(", ") : "미입력";
}

function clampWeight(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 50;
  return Math.max(0, Math.min(100, Math.round(number)));
}

function objectParticle(value) {
  const last = [...String(value)].pop();
  if (!last) return "를";
  const code = last.charCodeAt(0);
  if (code < 0xac00 || code > 0xd7a3) return "를";
  return (code - 0xac00) % 28 === 0 ? "를" : "을";
}

function normalizeVoiceGender(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (["female", "woman", "women", "f", "여성", "여자"].includes(normalized)) return "female";
  if (["male", "man", "men", "m", "남성", "남자"].includes(normalized)) return "male";
  return "neutral";
}
