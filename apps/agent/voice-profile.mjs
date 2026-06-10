const DEFAULT_BUILT_IN_VOICES = {
  female: "marin",
  male: "cedar",
  neutral: "marin"
};

export function resolveVoiceProfile({ env = process.env, personaConfig = null } = {}) {
  const mode = env.AVATAR_VOICE_MODE || "auto";
  const gender = normalizeGender(
    env.AVATAR_USER_VOICE_GENDER ||
      env.AVATAR_VOICE_GENDER ||
      personaConfig?.voice?.gender ||
      personaConfig?.voiceGender ||
      "neutral"
  );
  const customVoiceId =
    env.OPENAI_CUSTOM_VOICE_ID ||
    env.AVATAR_OPENAI_CUSTOM_VOICE_ID ||
    personaConfig?.voice?.openaiVoiceId ||
    personaConfig?.openaiVoiceId ||
    "";

  if (mode === "custom" && customVoiceId) {
    return {
      provider: "openai",
      mode,
      gender,
      voice: { id: customVoiceId },
      voiceLabel: customVoiceId,
      custom: true
    };
  }

  const femaleVoice = env.OPENAI_REALTIME_VOICE_FEMALE || DEFAULT_BUILT_IN_VOICES.female;
  const maleVoice = env.OPENAI_REALTIME_VOICE_MALE || DEFAULT_BUILT_IN_VOICES.male;
  const neutralVoice = env.OPENAI_REALTIME_VOICE_NEUTRAL || env.OPENAI_REALTIME_VOICE || DEFAULT_BUILT_IN_VOICES.neutral;
  const voice =
    mode === "manual"
      ? env.OPENAI_REALTIME_VOICE || neutralVoice
      : gender === "female"
        ? femaleVoice
        : gender === "male"
          ? maleVoice
          : neutralVoice;

  return {
    provider: "openai",
    mode,
    gender,
    voice,
    voiceLabel: voice,
    custom: false,
    fallbackReason: mode === "custom" && !customVoiceId ? "missing-custom-voice-id" : null
  };
}

export function normalizeGender(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (["female", "woman", "women", "f", "여성", "여자"].includes(normalized)) return "female";
  if (["male", "man", "men", "m", "남성", "남자"].includes(normalized)) return "male";
  return "neutral";
}
