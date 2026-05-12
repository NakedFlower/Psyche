import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  BadgeCheck,
  Camera,
  CreditCard,
  LogIn,
  Mic,
  Phone,
  RefreshCw,
  Send,
  SlidersHorizontal,
  Sparkles,
  Upload,
  Video,
} from 'lucide-react';
import { api } from './api/mockApi';
import type { ChatMessage, CreditBalance, Persona, SurveyForm, WeightSettings } from './types';

const initialSurvey: SurveyForm = {
  mbti: 'INFJ',
  values: '성장, 안정, 관계',
  habits: '늦게 자고 몰아서 일하지만 기록은 꾸준히 남긴다.',
  goals: '3년 안에 제품을 끝까지 책임지는 프론트엔드 개발자가 된다.',
  concerns: '진로 선택이 늦은 것 같고 번아웃이 반복될까 봐 걱정된다.',
  voiceTranscript: '',
};

const initialWeights: WeightSettings = {
  idealism: 0.62,
  career: 0.58,
  directness: 0.36,
};

const endpoints = [
  ['POST', '/api/v1/auth/login'],
  ['POST', '/api/v1/surveys'],
  ['POST', '/api/v1/surveys/image'],
  ['POST', '/api/v1/surveys/stt'],
  ['POST', '/api/v1/personas/generate'],
  ['PATCH', '/api/v1/personas/{id}/weights'],
  ['POST', '/api/v1/chats/session'],
  ['GET', '/api/v1/credits/balance'],
];

const formatPercent = (value: number) => `${Math.round(value * 100)}%`;

export function App() {
  const [user, setUser] = useState<{ name: string; email: string } | null>(null);
  const [survey, setSurvey] = useState<SurveyForm>(initialSurvey);
  const [weights, setWeights] = useState<WeightSettings>(initialWeights);
  const [targetYear, setTargetYear] = useState(10);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [selectedPersonaId, setSelectedPersonaId] = useState<string>('');
  const [credit, setCredit] = useState<CreditBalance | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('요즘 진로가 불안해. 지금 무엇부터 바꿔야 할까?');
  const [activeSession, setActiveSession] = useState<string>('');
  const [isBusy, setIsBusy] = useState(false);

  const selectedPersona = useMemo(
    () => personas.find((persona) => persona.id === selectedPersonaId) ?? personas[0],
    [personas, selectedPersonaId],
  );

  useEffect(() => {
    Promise.all([api.listPersonas(), api.getCreditBalance()]).then(([personaList, balance]) => {
      setPersonas(personaList);
      setSelectedPersonaId(personaList[0]?.id ?? '');
      setCredit(balance);
    });
  }, []);

  const login = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setIsBusy(true);
    const response = await api.login(String(form.get('email')), String(form.get('password')));
    setUser(response.user);
    setIsBusy(false);
  };

  const updateSurvey = (field: keyof SurveyForm, value: string) => {
    setSurvey((current) => ({ ...current, [field]: value }));
  };

  const updateWeight = (field: keyof WeightSettings, value: number) => {
    setWeights((current) => ({ ...current, [field]: value }));
  };

  const handleVoice = async () => {
    setIsBusy(true);
    const { transcript } = await api.convertVoiceToSurvey();
    setSurvey((current) => ({ ...current, voiceTranscript: transcript }));
    setIsBusy(false);
  };

  const handleImage = async (fileName: string) => {
    if (!fileName) return;
    setIsBusy(true);
    await api.uploadImage(fileName);
    setSurvey((current) => ({ ...current, imageFileName: fileName }));
    setIsBusy(false);
  };

  const saveSurveyAndGenerate = async () => {
    setIsBusy(true);
    await api.saveSurvey(survey);
    const persona = await api.generatePersona(targetYear, weights);
    const [personaList, balance] = await Promise.all([api.listPersonas(), api.getCreditBalance()]);
    setPersonas(personaList);
    setSelectedPersonaId(persona.id);
    setCredit(balance);
    setIsBusy(false);
  };

  const syncWeights = async () => {
    if (!selectedPersona) return;
    setIsBusy(true);
    await api.updateWeights(selectedPersona.id, weights);
    setPersonas(await api.listPersonas());
    setIsBusy(false);
  };

  const startSession = async (mode: 'video' | 'voice') => {
    if (!selectedPersona) return;
    setIsBusy(true);
    const session = await api.startChatSession(selectedPersona.id, mode);
    setActiveSession(session.id);
    setIsBusy(false);
  };

  const sendMessage = async () => {
    if (!selectedPersona || !chatInput.trim()) return;
    const sessionId = activeSession || `chat-${selectedPersona.id}-video`;
    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      speaker: 'user',
      message: chatInput,
      timestamp: new Date().toISOString(),
    };
    setMessages((current) => [...current, userMessage]);
    setChatInput('');
    const response = await api.saveChatLog(sessionId, chatInput);
    setMessages((current) => [...current, response]);
  };

  const unlock = async (packageType: 'VOICE_SURVEY' | 'WEIGHT_CONTROL') => {
    setIsBusy(true);
    setCredit(await api.unlockFeature(packageType));
    setIsBusy(false);
  };

  return (
    <main className="appShell">
      <aside className="sidebar">
        <div className="brandBlock">
          <div className="brandMark">P</div>
          <div>
            <strong>Psyche</strong>
            <span>future self studio</span>
          </div>
        </div>

        <nav className="navList" aria-label="Psyche sections">
          <a href="#survey">설문</a>
          <a href="#persona">페르소나</a>
          <a href="#chat">대화</a>
          <a href="#credits">크레딧</a>
        </nav>

        <section className="apiPanel" aria-label="API mock map">
          <div className="panelTitle">
            <BadgeCheck size={16} />
            Mock API
          </div>
          {endpoints.map(([method, path]) => (
            <div className="endpoint" key={path}>
              <span>{method}</span>
              <code>{path}</code>
            </div>
          ))}
        </section>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">MVP prototype</p>
            <h1>미래 자아 생성 워크스페이스</h1>
          </div>
          {user ? (
            <div className="userBadge">
              <span>{user.name}</span>
              <small>{user.email}</small>
            </div>
          ) : (
            <form className="loginForm" onSubmit={login}>
              <input name="email" type="email" defaultValue="psyche@rookie.ai" aria-label="email" />
              <input name="password" type="password" defaultValue="psyche-demo" aria-label="password" />
              <button className="iconButton" type="submit" aria-label="login" disabled={isBusy}>
                <LogIn size={18} />
              </button>
            </form>
          )}
        </header>

        <section className="statusStrip">
          <Metric label="생성 가능" value={`${credit?.remaining ?? 0}회`} />
          <Metric label="선택 연도" value={`${targetYear}년 후`} />
          <Metric label="페르소나" value={`${personas.length}개`} />
          <Metric label="세션" value={activeSession ? '연결됨' : '대기'} />
        </section>

        <div className="mainGrid">
          <section className="surface wide" id="survey">
            <div className="sectionHeader">
              <div>
                <p className="eyebrow">Survey data</p>
                <h2>사용자 프로파일</h2>
              </div>
              <button className="softButton" type="button" onClick={handleVoice} disabled={isBusy}>
                <Mic size={17} />
                음성 변환
              </button>
            </div>

            <div className="formGrid">
              <label>
                MBTI
                <input value={survey.mbti} onChange={(event) => updateSurvey('mbti', event.target.value)} />
              </label>
              <label>
                가치관
                <input value={survey.values} onChange={(event) => updateSurvey('values', event.target.value)} />
              </label>
              <label>
                생활 습관
                <textarea value={survey.habits} onChange={(event) => updateSurvey('habits', event.target.value)} />
              </label>
              <label>
                목표
                <textarea value={survey.goals} onChange={(event) => updateSurvey('goals', event.target.value)} />
              </label>
              <label>
                현재 고민
                <textarea value={survey.concerns} onChange={(event) => updateSurvey('concerns', event.target.value)} />
              </label>
              <label>
                STT 결과
                <textarea
                  value={survey.voiceTranscript}
                  onChange={(event) => updateSurvey('voiceTranscript', event.target.value)}
                  placeholder="음성 설문 변환 결과"
                />
              </label>
            </div>

            <div className="uploadRow">
              <label className="uploadBox">
                <Upload size={18} />
                <span>{survey.imageFileName || '현재 사진 3장 업로드'}</span>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(event) => handleImage(event.target.files?.[0]?.name ?? '')}
                />
              </label>
              <div className="yearPicker" role="group" aria-label="target year">
                {[10, 20, 30].map((year) => (
                  <button
                    className={targetYear === year ? 'active' : ''}
                    key={year}
                    type="button"
                    onClick={() => setTargetYear(year)}
                  >
                    {year}년
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section className="surface" id="persona">
            <div className="sectionHeader">
              <div>
                <p className="eyebrow">Scenario weights</p>
                <h2>가중치</h2>
              </div>
              <SlidersHorizontal size={20} />
            </div>
            <Slider label="이상적 미래" value={weights.idealism} onChange={(value) => updateWeight('idealism', value)} />
            <Slider label="커리어 비중" value={weights.career} onChange={(value) => updateWeight('career', value)} />
            <Slider label="직언 성향" value={weights.directness} onChange={(value) => updateWeight('directness', value)} />
            <div className="buttonRow">
              <button className="primaryButton" type="button" onClick={saveSurveyAndGenerate} disabled={isBusy}>
                <Sparkles size={18} />
                생성
              </button>
              <button className="softButton" type="button" onClick={syncWeights} disabled={isBusy || !selectedPersona}>
                <RefreshCw size={17} />
                반영
              </button>
            </div>
          </section>

          <section className="surface portraitSurface">
            <div className="portraitFrame">
              <img src={selectedPersona?.imageUrl ?? '/future-portrait.svg'} alt="future self" />
              <div className="callControls">
                <button className="iconButton" type="button" aria-label="voice call" onClick={() => startSession('voice')}>
                  <Phone size={19} />
                </button>
                <button className="iconButton primaryIcon" type="button" aria-label="video call" onClick={() => startSession('video')}>
                  <Video size={20} />
                </button>
                <button className="iconButton" type="button" aria-label="camera">
                  <Camera size={19} />
                </button>
              </div>
            </div>
            <h2>{selectedPersona?.title ?? '미래 자아'}</h2>
            <p>{selectedPersona?.summary ?? '설문과 가중치를 기반으로 생성됩니다.'}</p>
          </section>

          <section className="surface wide personaList">
            <div className="sectionHeader">
              <div>
                <p className="eyebrow">Persona list</p>
                <h2>생성 기록</h2>
              </div>
            </div>
            <div className="cards">
              {personas.map((persona) => (
                <button
                  className={persona.id === selectedPersona?.id ? 'personaCard selected' : 'personaCard'}
                  key={persona.id}
                  type="button"
                  onClick={() => {
                    setSelectedPersonaId(persona.id);
                    setWeights(persona.weights);
                  }}
                >
                  <span>{persona.targetYear}년 후</span>
                  <strong>{persona.title}</strong>
                  <small>
                    이상 {formatPercent(persona.weights.idealism)} · 커리어 {formatPercent(persona.weights.career)} · 직언{' '}
                    {formatPercent(persona.weights.directness)}
                  </small>
                </button>
              ))}
            </div>
          </section>

          <section className="surface wide" id="chat">
            <div className="sectionHeader">
              <div>
                <p className="eyebrow">Future conversation</p>
                <h2>대화 로그</h2>
              </div>
              <span className="sessionPill">{activeSession ? 'streaming mock' : 'ready'}</span>
            </div>
            <div className="chatLog">
              {messages.length === 0 && (
                <div className="emptyChat">아직 저장된 대화가 없습니다.</div>
              )}
              {messages.map((message) => (
                <div className={`message ${message.speaker}`} key={message.id}>
                  {message.message}
                </div>
              ))}
            </div>
            <div className="composer">
              <input value={chatInput} onChange={(event) => setChatInput(event.target.value)} />
              <button className="iconButton primaryIcon" type="button" aria-label="send" onClick={sendMessage}>
                <Send size={18} />
              </button>
            </div>
          </section>

          <section className="surface" id="credits">
            <div className="sectionHeader">
              <div>
                <p className="eyebrow">Payment</p>
                <h2>권한</h2>
              </div>
              <CreditCard size={20} />
            </div>
            <div className="creditNumber">{credit?.remaining ?? 0}</div>
            <p className="mutedText">잔여 생성 횟수</p>
            <div className="buttonColumn">
              <button className="softButton" type="button" onClick={() => unlock('VOICE_SURVEY')} disabled={isBusy}>
                음성 설문 해제
              </button>
              <button className="softButton" type="button" onClick={() => unlock('WEIGHT_CONTROL')} disabled={isBusy}>
                가중치 조정 해제
              </button>
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Slider({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="sliderControl">
      <span>
        {label}
        <strong>{formatPercent(value)}</strong>
      </span>
      <input
        type="range"
        min="0"
        max="1"
        step="0.01"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}
