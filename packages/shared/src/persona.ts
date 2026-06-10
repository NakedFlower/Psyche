export interface FutureSelfSurvey {
  age?: number;
  mbti?: string;
  currentSpace?: string;
  desiredSpace?: string;
  values?: string[];
  habits?: string[];
  goals?: string[];
  concerns?: string[];
  strengths?: string[];
  interests?: string[];
  routine?: string;
  idealRoutine?: string;
  stressRelief?: string;
  relationshipValues?: string[];
  selfTalk?: string;
  advicePreference?: "comfort" | "pace" | "perspective" | "practical" | string;
  longGame?: string;
  voiceGender?: "female" | "male" | "neutral" | string;
  openaiVoiceId?: string;
}

export interface FutureSelfWeights {
  idealFuture: number;
  careerFocus: number;
  directness: number;
}

export interface FutureSelfPersonaInput {
  targetYear: 10 | 20 | 30 | number;
  weights: FutureSelfWeights;
  survey: FutureSelfSurvey;
}

export interface FutureSelfPersona {
  version: "avatar-lab-persona-v1";
  generatedAt: string;
  targetYear: number;
  futureYear: number;
  futureAge: number | null;
  displayName: string;
  weights: FutureSelfWeights;
  sourceSummary: string;
  voiceProfile: {
    provider: "openai-realtime" | "openai-custom" | string;
    gender: "female" | "male" | "neutral" | string;
    openaiVoiceId: string | null;
  };
  predictedSelf: {
    background: {
      year: number;
      location: string;
      atmosphere: string;
    };
    identityKeywords: string[];
    voice: {
      tone: string;
      signaturePhrases: string[];
    };
    routine: {
      morning: string;
      balance: string;
      recovery: string;
    };
    expertise: {
      field: string;
      description: string;
    };
    freedom: {
      level: string;
      description: string;
    };
    signatureAchievement: string;
    attitudeToCurrentSelf: {
      mode: string;
      adviceStyle: string;
      protectedValue: string;
      messageToCurrentSelf: string;
    };
    firstGreeting: string;
  };
  realtimeInstructions: string;
}
