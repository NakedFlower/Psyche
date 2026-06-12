import {
  buildFutureSelfPersona,
  buildRealtimeInstructions,
  normalizePersonaInput
} from "./persona-pipeline.mjs";
import { chatWithAzureOpenAI } from "./azure-openai-runtime.mjs";
import { buildPersonaPrompt, mergePersona, parseJsonObject } from "./bedrock-persona.mjs";

export async function buildFutureSelfPersonaWithAzure(input, options = {}) {
  const base = buildFutureSelfPersona(input);
  const normalized = normalizePersonaInput(input);
  const response = await chatWithAzureOpenAI({
    deployment: options.deployment,
    system: [
      "너는 Psyche의 미래 자아 persona designer다.",
      "사용자의 현재 상태를 기반으로 10/20/30년 뒤의 가능성 있는 미래 자아를 만든다.",
      "미래를 확정적으로 예언하지 말고, 현재 선택과 성향이 이어졌을 때의 시뮬레이션으로 설계한다.",
      "성공한 미래뿐 아니라, 정체되거나 흔들린 미래도 주어진 futureTrajectory에 맞춰 설계한다.",
      "반드시 한국어로 답하고, 요청한 JSON만 반환한다."
    ].join("\n"),
    prompt: buildPersonaPrompt({ input: normalized, base })
  });

  const patch = parseJsonObject(response.text);
  const persona = mergePersona(base, patch);

  return {
    ...persona,
    version: "avatar-lab-persona-azure-v1",
    provider: {
      name: "azure-openai",
      deployment: response.deployment,
      endpoint: response.endpoint,
      latencyMs: response.latencyMs
    },
    realtimeInstructions: buildRealtimeInstructions(persona)
  };
}
