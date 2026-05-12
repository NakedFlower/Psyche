import type { ChatMessage, CreditBalance, Persona, SurveyForm, WeightSettings } from '../types';

const wait = (ms = 450) => new Promise((resolve) => window.setTimeout(resolve, ms));

const seedPersonas: Persona[] = [
  {
    id: 'persona-10-career',
    targetYear: 10,
    title: '10년 후, 또렷한 실행가',
    summary: '커리어의 밀도가 높고 매일의 루틴이 안정된 미래 자아입니다.',
    imageUrl: '/future-portrait.svg',
    weights: { idealism: 0.68, career: 0.78, directness: 0.42 },
    tone: '현실적인 격려',
    createdAt: '2026-05-12T09:00:00.000Z',
  },
  {
    id: 'persona-20-balance',
    targetYear: 20,
    title: '20년 후, 균형 잡힌 조언자',
    summary: '관계, 건강, 일의 균형을 중심에 둔 차분한 미래 자아입니다.',
    imageUrl: '/future-portrait.svg',
    weights: { idealism: 0.52, career: 0.38, directness: 0.28 },
    tone: '따뜻한 회고',
    createdAt: '2026-05-12T09:03:00.000Z',
  },
];

let personas = [...seedPersonas];
let surveyStore: SurveyForm | null = null;
let creditBalance: CreditBalance = {
  remaining: 3,
  premiumUnlocked: false,
  lockedFeatures: ['VOICE_SURVEY', 'WEIGHT_CONTROL'],
};

export const api = {
  async login(email: string, password: string) {
    await wait();
    return {
      accessToken: `mock-access-${email}-${password.length}`,
      refreshToken: 'mock-refresh-token',
      user: { name: '서우', email },
    };
  },

  async saveSurvey(form: SurveyForm) {
    await wait();
    surveyStore = form;
    return {
      id: 'survey-current-user',
      profile: {
        mbti: form.mbti,
        values: form.values.split(',').map((item) => item.trim()).filter(Boolean),
      },
    };
  },

  async uploadImage(fileName: string) {
    await wait(300);
    return {
      fileName,
      imageUrl: '/future-portrait.svg',
    };
  },

  async convertVoiceToSurvey() {
    await wait(500);
    return {
      transcript:
        '요즘 커리어 방향이 가장 큰 고민이고, 꾸준한 운동과 기록 습관을 만들고 싶어요.',
    };
  },

  async generatePersona(targetYear: number, weights: WeightSettings) {
    await wait(700);
    const careerLabel = weights.career >= 0.5 ? '커리어 중심' : '일상 중심';
    const toneLabel = weights.directness >= 0.5 ? '직언형' : '격려형';
    const persona: Persona = {
      id: `persona-${targetYear}-${Date.now()}`,
      targetYear,
      title: `${targetYear}년 후, ${careerLabel} ${toneLabel} 자아`,
      summary: `${surveyStore?.goals || '현재 목표'}를 기준으로 선택의 결과를 되짚어 주는 페르소나입니다.`,
      imageUrl: '/future-portrait.svg',
      weights,
      tone: toneLabel,
      createdAt: new Date().toISOString(),
    };
    personas = [persona, ...personas];
    creditBalance = {
      ...creditBalance,
      remaining: Math.max(creditBalance.remaining - 1, 0),
    };
    return persona;
  },

  async updateWeights(personaId: string, weights: WeightSettings) {
    await wait(350);
    personas = personas.map((persona) =>
      persona.id === personaId ? { ...persona, weights } : persona,
    );
    return personas.find((persona) => persona.id === personaId)!;
  },

  async listPersonas() {
    await wait(250);
    return personas;
  },

  async startChatSession(personaId: string, mode: 'video' | 'voice') {
    await wait(400);
    return {
      id: `chat-${personaId}-${mode}`,
      streamUrl: 'mock://psyche/future-self',
    };
  },

  async saveChatLog(chatId: string, message: string): Promise<ChatMessage> {
    await wait(200);
    return {
      id: `${chatId}-${Date.now()}`,
      speaker: 'future',
      message:
        message.includes('불안') || message.includes('고민')
          ? '불안은 신호야. 지금 바꿀 수 있는 작은 행동 하나를 정하고, 오늘 끝내자.'
          : '지금의 선택은 생각보다 오래 남아. 네가 반복하는 하루가 결국 나를 만들었어.',
      timestamp: new Date().toISOString(),
    };
  },

  async getCreditBalance() {
    await wait(250);
    return creditBalance;
  },

  async unlockFeature(packageType: 'VOICE_SURVEY' | 'WEIGHT_CONTROL') {
    await wait(450);
    creditBalance = {
      ...creditBalance,
      premiumUnlocked: true,
      lockedFeatures: creditBalance.lockedFeatures.filter((feature) => feature !== packageType),
    };
    return creditBalance;
  },
};
