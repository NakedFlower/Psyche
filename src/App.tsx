import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  Camera,
  CreditCard,
  LogIn,
  Maximize2,
  Send,
  Sparkles,
  Upload,
} from 'lucide-react';
import { api } from './api/mockApi';
import type { ChatMessage, CreditBalance, Persona, SurveyForm, WeightSettings } from './types';

type AppView = 'landing' | 'flow' | 'dashboard';
type FlowStep = 'login' | 'survey' | 'generating' | 'weights' | 'chat';

const initialSurvey: SurveyForm = {
  mbti: 'INFJ',
  values: '성장, 안정, 관계',
  habits: '늦게 자고 몰아서 일하지만 기록은 꾸준히 남긴다.',
  goals: '3년 안에 제품을 끝까지 책임지는 프론트엔드 개발자가 된다.',
  concerns: '진로 선택이 늦은 것 같고 번아웃이 반복될까 봐 걱정된다.',
};

const initialWeights: WeightSettings = {
  idealism: 0.62,
  career: 0.58,
  directness: 0.36,
};

const flowSteps: Array<{ id: FlowStep; label: string }> = [
  { id: 'login', label: '로그인' },
  { id: 'survey', label: '자아 파악용 설문' },
  { id: 'weights', label: '가중치 설정' },
  { id: 'generating', label: '생성 대기' },
  { id: 'chat', label: '미래 나와의 대화' },
];

const formatPercent = (value: number) => `${Math.round(value * 100)}%`;

export function App() {
  const [view, setView] = useState<AppView>('landing');
  const [step, setStep] = useState<FlowStep>('login');
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

  const login = async (event: FormEvent<HTMLFormElement>, isSignup: boolean) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setIsBusy(true);
    try {
      const email = String(form.get('email'));
      const password = String(form.get('password'));
      const response = isSignup ? await api.signup(email, password) : await api.login(email, password);
      setUser(response.user);
      setStep('survey');
    } catch (e) {
      alert(isSignup ? '회원가입에 실패했습니다.' : '로그인에 실패했습니다. 이메일과 비밀번호를 확인해주세요.');
    } finally {
      setIsBusy(false);
    }
  };

  const updateSurvey = (field: keyof SurveyForm, value: string) => {
    setSurvey((current) => ({ ...current, [field]: value }));
  };

  const updateWeight = (field: keyof WeightSettings, value: number) => {
    setWeights((current) => ({ ...current, [field]: value }));
  };

  const handleImage = async (file: File | null) => {
    if (!file) return;
    setIsBusy(true);
    await api.uploadImage(file);
    setSurvey((current) => ({
      ...current,
      imageFileName: file.name,
      imagePreviewUrl: URL.createObjectURL(file),
    }));
    setIsBusy(false);
  };

  const startPersonaGeneration = async () => {
    setStep('generating');
    setIsBusy(true);
    await api.saveSurvey(survey);
    const persona = await api.generatePersona(targetYear, weights);
    const [personaList, balance] = await Promise.all([api.listPersonas(), api.getCreditBalance()]);
    const session = await api.startChatSession(persona.id, 'video');
    setPersonas(personaList);
    setSelectedPersonaId(persona.id);
    setCredit(balance);
    setActiveSession(session.id);
    setIsBusy(false);
    setStep('chat');
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
    const response = await api.saveChatLog(sessionId, selectedPersona.id, chatInput);
    setMessages((current) => [...current, response]);
  };

  const openPersonaChat = async (persona: Persona) => {
    setSelectedPersonaId(persona.id);
    setWeights(persona.weights);
    setView('flow');
    setStep('chat');
    setIsBusy(true);
    const session = await api.startChatSession(persona.id, 'video');
    setActiveSession(session.id);
    setIsBusy(false);
  };

  const startNewPersonaFlow = () => {
    if ((credit?.remaining ?? 0) <= 0) return;
    setView('flow');
    setStep(user ? 'survey' : 'login');
    setActiveSession('');
    setMessages([]);
    setChatInput('요즘 진로가 불안해. 지금 무엇부터 바꿔야 할까?');
  };

  const enterApp = () => {
    setView('flow');
    setStep(user ? 'survey' : 'login');
  };

  if (view === 'landing') {
    return <LandingPage onEnter={enterApp} />;
  }

  return (
    <main className="appShell">
      <aside className="sidebar">
        <div className="brandBlock">
          <div className="brandMark">P</div>
          <div>
            <strong>Psyche</strong>
            <span>미래 자아 생성 스튜디오</span>
          </div>
        </div>

        <nav className="navList" aria-label="Psyche views">
          <button className={view === 'flow' ? 'activeNav' : ''} type="button" onClick={() => setView('flow')}>
            미래 자아 체험
          </button>
          <button className={view === 'dashboard' ? 'activeNav' : ''} type="button" onClick={() => setView('dashboard')}>
            대시보드
          </button>
        </nav>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">{view === 'flow' ? 'User journey' : 'MVP dashboard'}</p>
            <h1>{view === 'flow' ? '미래 자아 체험 플로우' : '미래 자아 생성 워크스페이스'}</h1>
          </div>
          {user ? (
            <div className="userBadge">
              <span>{user.name}</span>
              <small>{user.email}</small>
            </div>
          ) : (
            <span className="sessionPill">로그인 필요</span>
          )}
        </header>

        {view === 'flow' ? (
          <FlowView
            chatInput={chatInput}
            credit={credit}
            isBusy={isBusy}
            login={login}
            messages={messages}
            selectedPersona={selectedPersona}
            sendMessage={sendMessage}
            setChatInput={setChatInput}
            setStep={setStep}
            startPersonaGeneration={startPersonaGeneration}
            step={step}
            survey={survey}
            targetYear={targetYear}
            updateSurvey={updateSurvey}
            handleImage={handleImage}
            setTargetYear={setTargetYear}
            user={user}
            weights={weights}
            updateWeight={updateWeight}
          />
        ) : (
          <DashboardView
            credit={credit}
            isBusy={isBusy}
            openPersonaChat={openPersonaChat}
            personas={personas}
            selectedPersona={selectedPersona}
            startNewPersonaFlow={startNewPersonaFlow}
          />
        )}
      </section>
    </main>
  );
}

function LandingPage({ onEnter }: { onEnter: () => void }) {
  useEffect(() => {
    const revealItems = document.querySelectorAll<HTMLElement>('[data-reveal]');
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('isVisible');
          } else {
            entry.target.classList.remove('isVisible');
          }
        });
      },
      { threshold: 0.28 },
    );

    revealItems.forEach((item) => observer.observe(item));

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const landingPage = document.querySelector<HTMLElement>('.landingPage');
    const sections = Array.from(document.querySelectorAll<HTMLElement>('.landingSection'));
    let activeIndex = 0;
    let isLocked = false;

    const moveToSection = (direction: number) => {
      const nextIndex = Math.min(Math.max(activeIndex + direction, 0), sections.length - 1);
      if (nextIndex === activeIndex) return;
      activeIndex = nextIndex;
      sections[activeIndex].scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    const handleWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaY) < 12) return;
      event.preventDefault();
      if (isLocked) return;
      isLocked = true;
      moveToSection(event.deltaY > 0 ? 1 : -1);
      window.setTimeout(() => {
        isLocked = false;
      }, 820);
    };

    landingPage?.addEventListener('wheel', handleWheel, { passive: false });

    return () => landingPage?.removeEventListener('wheel', handleWheel);
  }, []);

  return (
    <main className="landingPage">
      <section className="landingHero landingSection">
        <div className="landingNav" data-reveal>
          <div className="brandBlock">
            <div className="brandMark">P</div>
            <div>
              <strong>Psyche</strong>
              <span>미래 자아 생성 스튜디오</span>
            </div>
          </div>
          <button className="softButton" type="button" onClick={onEnter}>
            시작하기
          </button>
        </div>

        <div className="heroCopy">
          <p className="eyebrow" data-reveal>Future self simulation</p>
          <h1 data-reveal>Psyche</h1>
          <p data-reveal>지금의 선택이 만든 미래의 나와 마주 보고 대화합니다.</p>
        </div>

        <div className="heroVisual" aria-hidden="true" data-reveal>
          <img src="/future-portrait.svg" alt="" />
        </div>

        <a className="scrollCue" href="#landing-story" aria-label="scroll to story" data-reveal>
          <ArrowDown size={20} />
        </a>
      </section>

      <section className="landingPanel landingSection" id="landing-story">
        <p className="eyebrow" data-reveal>01</p>
        <h2 data-reveal>막연한 미래를 얼굴이 있는 대화로 바꿉니다.</h2>
        <p data-reveal>
          가치관, 습관, 목표, 고민을 입력하면 Psyche는 미래 자아의 성격과 조언 방식을 구성합니다.
        </p>
      </section>

      <section className="landingPanel landingSection alignRight">
        <p className="eyebrow" data-reveal>02</p>
        <h2 data-reveal>10년, 20년, 30년 후의 나를 선택합니다.</h2>
        <p data-reveal>
          업로드한 얼굴과 현재의 데이터를 기반으로 각 시점의 미래 자아를 만들고, 서로 다른 가능성을 비교합니다.
        </p>
      </section>

      <section className="landingPanel landingSection">
        <p className="eyebrow" data-reveal>03</p>
        <h2 data-reveal>대화의 온도까지 직접 조정합니다.</h2>
        <p data-reveal>
          이상과 현실, 커리어와 일상, 격려와 직언 사이의 가중치를 조절해 지금 필요한 조언을 만듭니다.
        </p>
      </section>

      <section className="landingFinal landingSection">
        <p className="eyebrow" data-reveal>Begin</p>
        <h2 data-reveal>미래의 나를 만나볼 준비가 되었다면</h2>
        <button className="primaryButton landingCta" type="button" onClick={onEnter} data-reveal>
          <LogIn size={18} />
          로그인하여 참여하기
        </button>
      </section>
    </main>
  );
}

function FlowView({
  chatInput,
  credit,
  handleImage,
  isBusy,
  login,
  messages,
  selectedPersona,
  sendMessage,
  setChatInput,
  setStep,
  setTargetYear,
  startPersonaGeneration,
  step,
  survey,
  targetYear,
  updateSurvey,
  updateWeight,
  user,
  weights,
}: {
  chatInput: string;
  credit: CreditBalance | null;
  handleImage: (file: File | null) => Promise<void>;
  isBusy: boolean;
  login: (event: FormEvent<HTMLFormElement>, isSignup: boolean) => Promise<void>;
  messages: ChatMessage[];
  selectedPersona?: Persona;
  sendMessage: () => Promise<void>;
  setChatInput: (value: string) => void;
  setStep: (step: FlowStep) => void;
  setTargetYear: (year: number) => void;
  startPersonaGeneration: () => Promise<void>;
  step: FlowStep;
  survey: SurveyForm;
  targetYear: number;
  updateSurvey: (field: keyof SurveyForm, value: string) => void;
  updateWeight: (field: keyof WeightSettings, value: number) => void;
  user: { name: string; email: string } | null;
  weights: WeightSettings;
}) {
  return (
    <>
      <FlowStepper step={step} />
      {step === 'login' && <LoginScreen isBusy={isBusy} login={login} />}
      {step === 'survey' && (
        <section className="flowSurface">
          <div className="flowCopy">
            <p className="eyebrow">Step 2</p>
            <h2>현재의 나를 입력하세요</h2>
            <p>프로토타입에서는 사용자가 작성한 텍스트와 사진 파일명을 기반으로 미래 자아를 생성합니다.</p>
          </div>
          <SurveyFormView
            handleImage={handleImage}
            setTargetYear={setTargetYear}
            survey={survey}
            targetYear={targetYear}
            updateSurvey={updateSurvey}
          />
          <button className="primaryButton flowAction" type="button" onClick={() => setStep('weights')} disabled={isBusy || !user}>
            다음
          </button>
        </section>
      )}
      {step === 'weights' && (
        <section className="flowSurface splitFlow">
          <PersonaPreview selectedPersona={selectedPersona} />
          <div>
            <div className="flowCopy">
              <p className="eyebrow">Step 3</p>
              <h2>대화 성향을 조정하세요</h2>
              <p>이 값은 미래 자아 생성과 대화 말투에 함께 반영됩니다.</p>
            </div>
            <WeightControls
              canGenerate={(credit?.remaining ?? 0) > 0}
              isBusy={isBusy}
              onGenerate={startPersonaGeneration}
              updateWeight={updateWeight}
              weights={weights}
            />
          </div>
        </section>
      )}
      {step === 'generating' && (
        <section className="flowSurface waitingSurface">
          <div className="loadingRing" />
          <p className="eyebrow">Step 4</p>
          <h2>페르소나를 생성하고 있어요</h2>
          <p>설문, 사진, 가중치를 바탕으로 미래 자아와 영상 대화 세션을 준비하는 중입니다.</p>
        </section>
      )}
      {step === 'chat' && (
        <section className="flowSurface videoFlow" id="chat">
          <VideoChatPanel
            chatInput={chatInput}
            messages={messages}
            sendMessage={sendMessage}
            setChatInput={setChatInput}
            selectedPersona={selectedPersona}
            survey={survey}
          />
          <div className="flowFooter">
            <Metric label="잔여 생성" value={`${credit?.remaining ?? 0}회`} />
            <button className="softButton" type="button" onClick={() => setStep('survey')}>
              설문 다시 작성
            </button>
          </div>
        </section>
      )}
    </>
  );
}

function DashboardView({
  credit,
  isBusy,
  openPersonaChat,
  personas,
  selectedPersona,
  startNewPersonaFlow,
}: {
  credit: CreditBalance | null;
  isBusy: boolean;
  openPersonaChat: (persona: Persona) => Promise<void>;
  personas: Persona[];
  selectedPersona?: Persona;
  startNewPersonaFlow: () => void;
}) {
  const remainingCredits = credit?.remaining ?? 0;

  return (
    <div className="dashboardGrid">
      <section className="surface dashboardPersonaList">
        <div className="sectionHeader">
          <div>
            <p className="eyebrow">Persona list</p>
            <h2>생성된 자아</h2>
          </div>
          <span className="sessionPill">{personas.length}개</span>
        </div>

        <div className="cards dashboardCards">
          {personas.map((persona) => (
            <button
              className={persona.id === selectedPersona?.id ? 'personaCard selected' : 'personaCard'}
              disabled={isBusy}
              key={persona.id}
              type="button"
              onClick={() => openPersonaChat(persona)}
            >
              <span>{persona.targetYear}년 후</span>
              <strong>{persona.title}</strong>
              <small>{persona.summary}</small>
              <small>
                이상 {formatPercent(persona.weights.idealism)} · 커리어 {formatPercent(persona.weights.career)} · 직언{' '}
                {formatPercent(persona.weights.directness)}
              </small>
            </button>
          ))}
        </div>
      </section>

      <section className="surface dashboardCredit">
        <div className="sectionHeader">
          <div>
            <p className="eyebrow">Credits</p>
            <h2>잔여 생성 횟수</h2>
          </div>
          <CreditCard size={20} />
        </div>
        <div className="creditNumber">{remainingCredits}</div>
        <p className="mutedText">미래 자아를 새로 생성할 수 있는 횟수입니다.</p>
        <button
          className="primaryButton dashboardAction"
          disabled={isBusy || remainingCredits <= 0}
          type="button"
          onClick={startNewPersonaFlow}
        >
          <Sparkles size={18} />
          새 미래 자아 만들기
        </button>
        {remainingCredits <= 0 && <p className="mutedText">잔여 횟수가 없어 새 플로우를 시작할 수 없습니다.</p>}
      </section>
    </div>
  );
}

function LoginScreen({ isBusy, login }: { isBusy: boolean; login: (event: FormEvent<HTMLFormElement>, isSignup: boolean) => Promise<void> }) {
  const [isSignupMode, setIsSignupMode] = useState(false);

  return (
    <section className="flowSurface loginScreen">
      <div className="flowCopy">
        <p className="eyebrow">Step 1</p>
        <h2>Psyche에 입장하세요</h2>
      </div>
      <form className="loginCard" onSubmit={(e: FormEvent<HTMLFormElement>) => login(e, isSignupMode)}>
        <label>
          이메일
          <input name="email" type="email" placeholder="example@mail.com" required />
        </label>
        <label>
          비밀번호
          <input name="password" type="password" placeholder="비밀번호 입력" required />
        </label>
        <button className="primaryButton" type="submit" disabled={isBusy}>
          <LogIn size={18} />
          {isSignupMode ? '회원가입' : '로그인'}
        </button>
        <div style={{ marginTop: '1rem', textAlign: 'center' }}>
          <button
            type="button"
            className="softButton"
            style={{ fontSize: '0.85rem' }}
            onClick={() => setIsSignupMode(!isSignupMode)}
          >
            {isSignupMode ? '이미 계정이 있으신가요? 로그인' : '계정이 없으신가요? 회원가입'}
          </button>
        </div>
      </form>
    </section>
  );
}

function SurveyFormView({
  handleImage,
  setTargetYear,
  survey,
  targetYear,
  updateSurvey,
}: {
  handleImage: (file: File | null) => Promise<void>;
  setTargetYear: (year: number) => void;
  survey: SurveyForm;
  targetYear: number;
  updateSurvey: (field: keyof SurveyForm, value: string) => void;
}) {
  return (
    <>
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
        <label className="fullField">
          현재 고민
          <textarea value={survey.concerns} onChange={(event) => updateSurvey('concerns', event.target.value)} />
        </label>
      </div>

      <div className="uploadRow">
        <label className="uploadBox">
          <Upload size={18} />
          <span>{survey.imageFileName || '미래 얼굴 생성용 사진 업로드'}</span>
          <input
            type="file"
            accept="image/*"
            onChange={(event) => handleImage(event.target.files?.[0] ?? null)}
          />
          {survey.imagePreviewUrl && <img className="uploadPreview" src={survey.imagePreviewUrl} alt="업로드한 현재 얼굴" />}
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
    </>
  );
}

function PersonaPreview({
  selectedPersona,
}: {
  selectedPersona?: Persona;
}) {
  return (
    <section className="surface portraitSurface">
      <div className="portraitFrame">
        <img src={selectedPersona?.imageUrl ?? '/future-portrait.svg'} alt="future self" />
      </div>
      <h2>{selectedPersona?.title ?? '미래 자아'}</h2>
      <p>{selectedPersona?.summary ?? '설문과 가중치를 기반으로 생성됩니다.'}</p>
    </section>
  );
}

function WeightControls({
  canGenerate,
  isBusy,
  onGenerate,
  updateWeight,
  weights,
}: {
  canGenerate: boolean;
  isBusy: boolean;
  onGenerate: () => Promise<void>;
  updateWeight: (field: keyof WeightSettings, value: number) => void;
  weights: WeightSettings;
}) {
  return (
    <div className="weightPanel">
      <Slider label="이상적 미래" value={weights.idealism} onChange={(value) => updateWeight('idealism', value)} />
      <Slider label="커리어 비중" value={weights.career} onChange={(value) => updateWeight('career', value)} />
      <Slider label="직언 성향" value={weights.directness} onChange={(value) => updateWeight('directness', value)} />
      <button className="primaryButton flowAction" type="button" onClick={onGenerate} disabled={isBusy || !canGenerate}>
        <Sparkles size={18} />
        미래 자아 생성
      </button>
      {!canGenerate && <p className="mutedText">잔여 생성 횟수가 없습니다.</p>}
    </div>
  );
}

function VideoChatPanel({
  chatInput,
  messages,
  sendMessage,
  setChatInput,
  selectedPersona,
  survey,
}: {
  chatInput: string;
  messages: ChatMessage[];
  sendMessage: () => Promise<void>;
  setChatInput: (value: string) => void;
  selectedPersona?: Persona;
  survey: SurveyForm;
}) {
  const fullscreenRef = useRef<HTMLDivElement | null>(null);

  const openFullscreen = async () => {
    await fullscreenRef.current?.requestFullscreen();
  };

  return (
    <div className="videoCallPanel">
      <div className="videoCallHeader">
        <div>
          <p className="eyebrow">Future conversation</p>
          <h2>미래의 나와 영상통화</h2>
        </div>
        <button className="softButton" type="button" onClick={openFullscreen}>
          <Maximize2 size={17} />
          전체화면
        </button>
      </div>

      <div className="fullscreenStage" ref={fullscreenRef}>
        <div className="videoGrid">
          <FutureVideoTile
            imageUrl={selectedPersona?.imageUrl ?? '/future-portrait.svg'}
            label="미래의 나"
            title={selectedPersona?.title ?? '미래 자아'}
          />
          <CurrentCameraTile
            label="현재의 나"
            title={survey.mbti ? `${survey.mbti} 현재 자아` : '현재의 나'}
          />
        </div>
      </div>

      <div className="captionLog">
        {messages.length === 0 && <div className="emptyChat">아직 저장된 대화가 없습니다.</div>}
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
    </div>
  );
}

function FutureVideoTile({ imageUrl, label, title }: { imageUrl: string; label: string; title: string }) {
  return (
    <div className="videoTile futureTile">
      <img src={imageUrl} alt={label} />
      <div className="aiStreamBadge">AI video mock</div>
      <div className="videoNameplate">
        <span>{label}</span>
        <strong>{title}</strong>
      </div>
    </div>
  );
}

function CurrentCameraTile({ label, title }: { label: string; title: string }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [cameraState, setCameraState] = useState<'loading' | 'ready' | 'blocked'>('loading');

  useEffect(() => {
    let stream: MediaStream | null = null;

    const connectCamera = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        setCameraState('ready');
      } catch {
        setCameraState('blocked');
      }
    };

    connectCamera();

    return () => {
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  return (
    <div className="videoTile cameraTile">
      <video ref={videoRef} autoPlay muted playsInline />
      {cameraState !== 'ready' && (
        <div className="cameraFallback">
          <Camera size={30} />
          <span>{cameraState === 'loading' ? '카메라 연결 중' : '카메라 권한이 필요합니다'}</span>
        </div>
      )}
      <div className="videoNameplate">
        <span>{label}</span>
        <strong>{title}</strong>
      </div>
    </div>
  );
}

function FlowStepper({ step }: { step: FlowStep }) {
  const activeIndex = flowSteps.findIndex((item) => item.id === step);

  return (
    <ol className="flowStepper">
      {flowSteps.map((item, index) => (
        <li className={index <= activeIndex ? 'complete' : ''} key={item.id}>
          <span>{index + 1}</span>
          {item.label}
        </li>
      ))}
    </ol>
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
