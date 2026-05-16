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

const BASE_URL = (import.meta as any).env?.VITE_API_URL || 'http://localhost:8000';

let currentSessionId = localStorage.getItem('sessionId') || crypto.randomUUID();
localStorage.setItem('sessionId', currentSessionId);
let token = localStorage.getItem('token') || '';

const getHeaders = () => ({
  'Content-Type': 'application/json',
  ...(token ? { Authorization: `Bearer ${token}` } : {})
});

let personas = [...seedPersonas];
let surveyStore: SurveyForm | null = null;
let creditBalance: CreditBalance = {
  remaining: 3,
  premiumUnlocked: false,
  lockedFeatures: ['WEIGHT_CONTROL'],
};

export const api = {
  async login(email: string, password: string) {
    let res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    if (!res.ok) {
      res = await fetch(`${BASE_URL}/api/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      if (!res.ok) throw new Error('Auth failed');
    }

    const data = await res.json();
    token = data.access_token;
    localStorage.setItem('token', token);
    
    return {
      accessToken: data.access_token,
      refreshToken: 'mock-refresh-token',
      user: data.user,
    };
  },

  async saveSurvey(form: SurveyForm) {
    surveyStore = form;
    const res = await fetch(`${BASE_URL}/api/survey`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        session_id: currentSessionId,
        mbti: form.mbti,
        values_text: form.values,
        habits_text: form.habits,
        interests_text: '설문 기반 자동 생성',
        goals_text: form.goals,
        worries_text: form.concerns,
        photo_key: form.imageFileName || ''
      })
    });
    
    const data = await res.json();
    return {
      id: String(data.survey_id),
      profile: {
        mbti: form.mbti,
        values: form.values.split(',').map((item) => item.trim()).filter(Boolean),
      },
    };
  },

  async uploadImage(file: File) {
    const res = await fetch(`${BASE_URL}/api/photo/presigned-url?session_id=${currentSessionId}&filename=${encodeURIComponent(file.name)}`, {
      method: 'GET',
      headers: getHeaders()
    });
    const data = await res.json();
    
    await fetch(data.upload_url, {
      method: 'PUT',
      headers: { 'Content-Type': 'image/jpeg' },
      body: file
    });

    return {
      fileName: data.object_key,
      imageUrl: URL.createObjectURL(file),
    };
  },

  async generatePersona(targetYear: number, weights: WeightSettings) {
    const res = await fetch(`${BASE_URL}/api/persona`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        session_id: currentSessionId,
        optimism_weight: weights.idealism,
        value_weight: weights.career,
        tone_weight: weights.directness
      })
    });
    const data = await res.json();

    const careerLabel = weights.career >= 0.5 ? '커리어 중심' : '일상 중심';
    const toneLabel = weights.directness >= 0.5 ? '직언형' : '격려형';
    const persona: Persona = {
      id: String(data.persona_id),
      targetYear,
      title: `${targetYear}년 후, ${careerLabel} ${toneLabel} 자아`,
      summary: data.persona_description,
      imageUrl: '/future-portrait.svg',
      weights,
      tone: toneLabel,
      createdAt: new Date().toISOString(),
    };
    
    creditBalance = {
      ...creditBalance,
      remaining: Math.max(creditBalance.remaining - 1, 0),
    };
    personas = [persona, ...personas];
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
    try {
      const res = await fetch(`${BASE_URL}/api/persona/${currentSessionId}`, {
        headers: getHeaders()
      });
      if (res.ok) {
        const data = await res.json();
        const loadedPersonas = data.map((p: any) => ({
          id: String(p.id),
          targetYear: 10,
          title: `미래 자아`,
          summary: p.persona_description,
          imageUrl: '/future-portrait.svg',
          weights: { idealism: p.optimism_weight, career: p.value_weight, directness: p.tone_weight },
          tone: p.tone_weight >= 0.5 ? '직언형' : '격려형',
          createdAt: p.created_at
        }));
        if (loadedPersonas.length > 0) {
          personas = loadedPersonas;
        }
      }
    } catch (e) {
      console.warn("Failed to load personas", e);
    }
    return personas;
  },

  async startChatSession(personaId: string, mode: 'video' | 'voice') {
    return {
      id: currentSessionId,
      streamUrl: 'mock://psyche/future-self',
    };
  },

  async saveChatLog(chatId: string, personaId: string, message: string): Promise<ChatMessage> {
    const res = await fetch(`${BASE_URL}/api/chat`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        session_id: currentSessionId,
        persona_id: parseInt(personaId) || 1,
        message: message
      })
    });
    const data = await res.json();

    return {
      id: String(data.message_id),
      speaker: 'future',
      message: data.reply,
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
