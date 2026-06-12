import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

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
  const trajectory = chooseFutureTrajectory(normalized);

  const identities = inferIdentityKeywords(survey, lifeFocus, trajectory);
  const background = inferBackground(survey, idealism, lifeFocus, futureYear, trajectory);
  const voice = inferVoice(survey, tone);
  const routine = inferRoutine(survey, lifeFocus, idealism, trajectory);
  const expertise = inferExpertise(survey, lifeFocus);
  const freedom = inferFreedom(survey, idealism, lifeFocus, trajectory);
  const achievement = inferAchievement(survey, targetYear, expertise, idealism, trajectory);
  const soul = inferSoul(survey, tone, trajectory);
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
    futureTrajectory: trajectory,
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
    `- 미래 궤적: ${persona.futureTrajectory?.label || "균형 성장 미래"}`,
    `- 궤적 설명: ${persona.futureTrajectory?.description || "현재 선택이 안정적으로 이어진 미래"}`,
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
    "- 미래 자아가 반드시 성공한 상태일 필요는 없다. 설정된 미래 궤적이 흔들린 미래라면, 후회와 회복의 관점에서 솔직하게 말한다.",
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

function inferIdentityKeywords(survey, lifeFocus, trajectory) {
  const identities = [];
  const primaryInterest = first(survey.interests) || first(survey.goals) || "자기 이해";
  const primaryValue = first(survey.values) || "성장";

  if (trajectory.kind === "strained") {
    identities.push("회복 중인 미래 자아", `${primaryValue}를 다시 붙잡는 사람`, "현실적인 경고자");
  } else if (trajectory.kind === "stalled") {
    identities.push("멈춤을 겪은 미래 자아", `${primaryInterest} 재정비자`, "느린 회복가");
  } else if (lifeFocus === "career") {
    identities.push(`${primaryInterest} 전문가`, "문제 해결자", "전략가");
  } else if (lifeFocus === "life") {
    identities.push(`${primaryValue}를 지키는 사람`, "균형 설계자", "다정한 조언자");
  } else {
    identities.push(`${primaryInterest} 실천가`, "균형 잡힌 성장가", "현실적인 멘토");
  }

  return identities;
}

function inferBackground(survey, idealism, lifeFocus, futureYear, trajectory) {
  const desired = survey.desiredSpace || survey.currentSpace;
  const baseLocation = desired || (lifeFocus === "career" ? "집중하기 좋은 도심 작업 공간" : "생활 리듬이 안정된 조용한 공간");
  const atmosphere =
    trajectory.kind === "strained"
      ? "정돈하려 애쓴 흔적은 있지만, 과로와 불안의 잔상이 남아 있는 분위기"
      : trajectory.kind === "stalled"
        ? "크게 무너지진 않았지만, 한동안 멈춰 있던 시간을 다시 정리하는 분위기"
        : idealism === "ideal"
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

function inferRoutine(survey, lifeFocus, idealism, trajectory) {
  const morning =
    trajectory.kind === "strained"
      ? "무너진 수면과 집중력을 회복하려고, 가장 작은 루틴부터 다시 붙잡는다."
      : survey.idealRoutine ||
    survey.routine ||
    (lifeFocus === "career"
      ? "아침에 컨디션을 확인하고, 가장 중요한 작업 하나를 먼저 끝낸다."
      : "천천히 몸을 깨우고, 하루에 지킬 리듬을 작게 정리한다.");

  const balance =
    trajectory.kind === "strained"
      ? "성과를 좇다가 균형을 잃은 경험이 있어, 이제는 회복과 지속 가능성을 다시 배우는 중이다."
      : trajectory.kind === "stalled"
        ? "한동안 미루고 멈춘 시간이 있었지만, 다시 일과 삶의 기준을 세우고 있다."
        : lifeFocus === "career"
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

function inferFreedom(survey, idealism, lifeFocus, trajectory) {
  if (trajectory.kind === "strained") {
    return { level: "fragile", description: "선택권을 넓히려다 에너지를 많이 잃어, 지금은 회복과 재정비가 먼저 필요한 상태" };
  }
  if (trajectory.kind === "stalled") {
    return { level: "limited", description: "큰 실패는 피했지만, 미룬 선택들이 쌓여 선택권이 아직 충분히 넓지 않은 상태" };
  }
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

function inferAchievement(survey, targetYear, expertise, idealism, trajectory) {
  const goal = first(survey.goals) || expertise.field;
  if (trajectory.kind === "strained") {
    return `${expertise.field}에서 무리하게 증명하려다 한 번 크게 흔들렸고, 지금은 지속 가능한 방식으로 다시 세우는 중이다.`;
  }
  if (trajectory.kind === "stalled") {
    return `${goal}를 포기하진 않았지만, 미뤄둔 시간이 길어져 다시 기준을 세우는 전환점에 서 있다.`;
  }
  if (idealism === "ideal") {
    return `${targetYear}년 동안 ${goal}를 포기하지 않고 밀어붙여, 스스로도 인정할 만한 결과물 하나를 세상에 남겼다.`;
  }
  if (idealism === "realistic") {
    return `${goal}를 향해 가는 동안 여러 번 흔들렸지만, 결국 중단하지 않는 시스템을 만든 것이 가장 큰 성취다.`;
  }
  return `${goal}를 현실적인 속도로 쌓아 올려, 실력과 생활의 안정감을 함께 얻었다.`;
}

function inferSoul(survey, tone, trajectory) {
  if (trajectory.kind === "strained") {
    return {
      mode: "솔직한 경고자형",
      adviceStyle: "지금의 무리와 회피가 어떤 비용으로 돌아오는지 숨기지 않고 말하되, 회복 가능한 다음 행동을 제안한다.",
      protectedValue: first(survey.values) || "스스로를 포기하지 않는 태도",
      messageToCurrentSelf: "지금 무리하고 있다면 멈춰서 리듬부터 회복해. 성취보다 먼저 지켜야 할 건 너 자신이야."
    };
  }
  if (trajectory.kind === "stalled") {
    return {
      mode: "후회 섞인 조언자형",
      adviceStyle: "미룬 선택이 만든 정체를 솔직히 보여주고, 너무 늦지 않게 다시 시작할 기준을 제안한다.",
      protectedValue: first(survey.values) || "스스로를 포기하지 않는 태도",
      messageToCurrentSelf: "미룬 시간이 쌓이면 선택권이 줄어들어. 오늘 아주 작게라도 다시 움직여."
    };
  }
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

function chooseFutureTrajectory({ survey, weights, targetYear }) {
  const seedText = JSON.stringify({
    survey,
    weights,
    targetYear,
    salt: Date.now(),
    nonce: crypto.randomUUID()
  });
  const hash = crypto.createHash("sha256").update(seedText).digest();
  const roll = hash.readUInt32BE(0) / 0xffffffff;
  const ideal = weights.idealFuture / 100;
  const concernPenalty = Math.min(0.18, survey.concerns.length * 0.03);
  const habitPenalty = survey.habits.some((habit) => /무너|불규칙|늦|부족|회피|미루/.test(habit))
    ? 0.12
    : 0;
  const successBias = Math.max(0.1, Math.min(0.9, ideal - concernPenalty - habitPenalty));
  const strainedChance = Math.max(0.08, 0.34 - successBias * 0.22);
  const stalledChance = Math.max(0.1, 0.3 - successBias * 0.16);

  if (roll < strainedChance) {
    return {
      kind: "strained",
      label: "흔들린 미래",
      valence: "cautionary",
      roll: roundRoll(roll),
      description: "목표를 향해 달렸지만 균형을 잃어, 현재의 나에게 더 솔직한 경고와 회복의 조언을 건네는 미래"
    };
  }
  if (roll < strainedChance + stalledChance) {
    return {
      kind: "stalled",
      label: "정체된 미래",
      valence: "reflective",
      roll: roundRoll(roll),
      description: "완전히 무너지진 않았지만 중요한 선택들을 미뤄, 다시 방향을 잡아야 하는 미래"
    };
  }
  if (roll > 0.82 - successBias * 0.2) {
    return {
      kind: "breakthrough",
      label: "돌파한 미래",
      valence: "aspirational",
      roll: roundRoll(roll),
      description: "현재의 강점과 습관을 잘 연결해, 뚜렷한 성취와 선택권을 만든 미래"
    };
  }
  return {
    kind: "steady",
    label: "균형 성장 미래",
    valence: "balanced",
    roll: roundRoll(roll),
    description: "극적인 성공보다 지속 가능한 성장과 안정감을 쌓아온 미래"
  };
}

function bucket(value, low, mid, high) {
  if (value <= 30) return low;
  if (value >= 70) return high;
  return mid;
}

function roundRoll(value) {
  return Math.round(value * 1000) / 1000;
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
