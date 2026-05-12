export type WeightSettings = {
  idealism: number;
  career: number;
  directness: number;
};

export type SurveyForm = {
  mbti: string;
  values: string;
  habits: string;
  goals: string;
  concerns: string;
  voiceTranscript: string;
  imageFileName?: string;
};

export type Persona = {
  id: string;
  targetYear: number;
  title: string;
  summary: string;
  imageUrl: string;
  weights: WeightSettings;
  tone: string;
  createdAt: string;
};

export type ChatMessage = {
  id: string;
  speaker: 'user' | 'future';
  message: string;
  timestamp: string;
};

export type CreditBalance = {
  remaining: number;
  premiumUnlocked: boolean;
  lockedFeatures: string[];
};
