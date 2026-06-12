import {
  buildFutureSelfPersona,
  buildRealtimeInstructions,
  normalizePersonaInput
} from "./persona-pipeline.mjs";
import { converseWithBedrock } from "./bedrock-runtime.mjs";

export async function buildFutureSelfPersonaWithBedrock(input, options = {}) {
  const base = buildFutureSelfPersona(input);
  const normalized = normalizePersonaInput(input);
  const response = await converseWithBedrock({
    modelId: options.modelId,
    region: options.region,
    system: [
      "너는 Psyche의 미래 자아 persona designer다.",
      "사용자의 현재 상태를 기반으로 10/20/30년 뒤의 가능성 있는 미래 자아를 만든다.",
      "미래를 확정적으로 예언하지 말고, 현재 선택과 성향이 이어졌을 때의 시뮬레이션으로 설계한다.",
      "반드시 한국어로 답하고, 요청한 JSON만 반환한다."
    ].join("\n"),
    prompt: buildPersonaPrompt({ input: normalized, base })
  });

  const patch = parseJsonObject(response.text);
  const persona = mergePersona(base, patch);

  return {
    ...persona,
    provider: {
      name: "bedrock",
      modelId: response.modelId,
      region: response.region,
      latencyMs: response.latencyMs
    },
    realtimeInstructions: buildRealtimeInstructions(persona)
  };
}

export function buildPersonaPrompt({ input, base }) {
  return [
    "아래 입력을 바탕으로 Psyche 미래 자아 persona를 보강해줘.",
    "기존 base persona의 구조를 유지하되, 사용자의 설문 내용이 더 잘 반영되도록 자연스럽고 구체적으로 고쳐줘.",
    "",
    "반환 형식은 아래 JSON object 하나만:",
    "{",
    '  "background": { "location": "...", "atmosphere": "..." },',
    '  "identityKeywords": ["...", "...", "..."],',
    '  "voice": { "tone": "...", "signaturePhrases": ["...", "..."] },',
    '  "routine": { "morning": "...", "balance": "...", "recovery": "..." },',
    '  "expertise": { "field": "...", "description": "..." },',
    '  "freedom": { "level": "...", "description": "..." },',
    '  "signatureAchievement": "...",',
    '  "attitudeToCurrentSelf": { "mode": "...", "adviceStyle": "..." },',
    '  "firstGreeting": "..."',
    "}",
    "",
    "제약:",
    "- identityKeywords는 정확히 3개.",
    "- firstGreeting은 영상통화 첫 인사처럼 1~2문장.",
    "- base persona의 futureTrajectory를 반드시 따른다. 흔들린/정체된 미래라면 성공 서사를 억지로 만들지 말고 후회, 경고, 회복의 관점을 반영한다.",
    "- 너무 과장된 부자/성공 서사는 피하고, 사용자의 현재 목표와 습관에서 이어지는 현실적인 미래로 만든다.",
    "- 의료/법률/투자 단정은 하지 않는다.",
    "",
    "# Normalized Input",
    JSON.stringify(input, null, 2),
    "",
    "# Base Persona",
    JSON.stringify(base, null, 2)
  ].join("\n");
}

export function mergePersona(base, patch) {
  const predictedSelf = {
    ...base.predictedSelf,
    background: {
      ...base.predictedSelf.background,
      ...objectOrEmpty(patch.background)
    },
    identityKeywords:
      Array.isArray(patch.identityKeywords) && patch.identityKeywords.length >= 3
        ? patch.identityKeywords.slice(0, 3).map(String)
        : base.predictedSelf.identityKeywords,
    voice: {
      ...base.predictedSelf.voice,
      ...objectOrEmpty(patch.voice),
      signaturePhrases:
        Array.isArray(patch.voice?.signaturePhrases) && patch.voice.signaturePhrases.length > 0
          ? patch.voice.signaturePhrases.slice(0, 3).map(String)
          : base.predictedSelf.voice.signaturePhrases
    },
    routine: {
      ...base.predictedSelf.routine,
      ...objectOrEmpty(patch.routine)
    },
    expertise: {
      ...base.predictedSelf.expertise,
      ...objectOrEmpty(patch.expertise)
    },
    freedom: {
      ...base.predictedSelf.freedom,
      ...objectOrEmpty(patch.freedom)
    },
    signatureAchievement:
      typeof patch.signatureAchievement === "string"
        ? patch.signatureAchievement
        : base.predictedSelf.signatureAchievement,
    attitudeToCurrentSelf: {
      ...base.predictedSelf.attitudeToCurrentSelf,
      ...objectOrEmpty(patch.attitudeToCurrentSelf)
    },
    firstGreeting:
      typeof patch.firstGreeting === "string"
        ? patch.firstGreeting
        : base.predictedSelf.firstGreeting
  };

  return {
    ...base,
    version: "avatar-lab-persona-bedrock-v1",
    generatedAt: new Date().toISOString(),
    predictedSelf
  };
}

export function parseJsonObject(text) {
  const trimmed = String(text || "").trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const match = /\{[\s\S]*\}/.exec(trimmed);
    if (!match) {
      throw new Error("Bedrock persona response did not contain a JSON object");
    }
    return JSON.parse(match[0]);
  }
}

function objectOrEmpty(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
