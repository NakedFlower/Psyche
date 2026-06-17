# Psyche Avatar Lab

Psyche의 Tavus 기반 안정 MVP와 별도로 진행하는 실시간 AI 아바타 R&D 브랜치입니다.

이 브랜치의 목표는 아래 경험을 자체 파이프라인으로 검증하는 것입니다.

- 사용자의 설문을 바탕으로 미래 자아 페르소나 생성
- 현재 사진을 바탕으로 미래 자아 얼굴 생성
- 사용자 음성 샘플을 바탕으로 미래 자아 목소리 구성
- LiveKit 화상통화 UI 안에서 미래 자아와 음성 대화
- GPU 서버에서 립싱크/아바타 영상 생성

이 저장소는 아직 완전한 프로덕션 서비스가 아니라, 다음 질문에 답하기 위한 실험용 연구 트랙입니다.

1. Tavus 없이도 미래 자아 아바타 경험을 만들 수 있는가
2. LiveKit + Realtime + GPU lipsync 조합으로 어느 정도 품질과 지연시간이 나오는가
3. 나중에 기존 Psyche 프론트/백엔드에 API 형태로 붙일 수 있는가

## 현재까지 구현된 것

### 1. 설문 -> 미래 자아 페르소나 생성

- 사용자 입력:
  - MBTI
  - 가치관
  - 목표
  - 현재 고민
  - 장기 방향성
  - 미래 성향 가중치
- 출력:
  - 미래 자아 설명
  - 말투/태도
  - Realtime agent용 시스템 프롬프트

현재는 Azure 기반 persona 생성 경로를 우선 사용합니다.

### 2. 현재 사진 -> 미래 자아 얼굴 생성

- 사용자의 현재 사진을 업로드
- Azure 이미지 생성 모델로 미래 얼굴 생성
- 현재 얼굴 정체성은 유지하되,
  - 헤어스타일
  - 분위기
  - 의상
  - 미래 커리어/성공 궤적
  가 달라지도록 프롬프트를 구성

### 3. 사용자 음성 샘플 -> 미래 자아 음성 준비

- 2~3분 정도의 사용자 음성 샘플을 업로드
- 립싱크용 5초 샘플을 자동으로 잘라서 `runs/lipsync-seeds/` 아래에 저장
- ElevenLabs custom voice를 만들거나,
- 이미 만들어진 voice를 재사용

현재는 `Prepare` 단계에서 room 단위 세션 상태에 `voiceId`를 저장하고, agent가 이를 읽어 사용하도록 바뀌었습니다.

### 4. LiveKit 화상통화 UI

- 브라우저에서 LiveKit room join
- 내 카메라/마이크 송출
- 미래 자아 패널 표시
- `Prepare` / `Join` 분리
- 준비 상태 체크리스트 표시
- 전체화면 모드 지원

### 5. Realtime 음성 에이전트

- Node 기반 LiveKit participant
- Azure OpenAI Realtime 기반 음성 대화
- 단순 VAD 기반 턴 감지
- barge-in(interrupt) 지원
- 사용자 말이 들어오면 기존 응답 중단 가능

### 6. GPU 아바타 워커

실험한 모델:

- Wav2Lip
- MuseTalk
- LivePortrait (idle loop)

현재는 다음 두 축으로 실험 중입니다.

1. **실시간 음성 대화 자체**
2. **응답 음성에 맞는 아바타 영상 생성**

완전한 초저지연 실시간 얼굴 합성은 아직 연구 중이며, 지금은 idle loop / speaking loop / generated reply video를 조합하는 방식으로 검증하고 있습니다.

## 현재 파이프라인

### A. Prepare 단계

브라우저 UI에서 `Prepare`를 누르면:

1. 설문 기반 persona 생성
2. 미래 얼굴 생성
3. 음성 샘플 업로드 및 ElevenLabs voice 준비
4. LivePortrait idle loop 생성
5. MuseTalk speaking loop 생성
6. 현재 room 기준 prepared session 저장

즉, `Join` 전에 미래 자아에 필요한 재료를 먼저 다 만들어 둡니다.

### B. Join 단계

`Join`을 누르면:

1. 브라우저가 LiveKit room에 입장
2. 로컬 agent가 동일 room에 participant로 입장
3. agent가 prepared session을 읽어
   - persona
   - voice
   - future face
   를 반영
4. 사용자가 말하면 Realtime 응답 생성
5. TTS 및 아바타 재생 파이프라인이 동작

## 저장소 구조

```txt
apps/
  web/             # 브라우저 테스트 UI
  agent/           # 토큰 서버 + persona/image/voice API + LiveKit room agent
  avatar-worker/   # GPU 서버에서 실행하는 lipsync / idle inference 서버

packages/
  shared/          # 공용 타입/이벤트 구조

models/            # 모델 체크포인트 및 외부 리포지토리 위치
scripts/           # 모델 세팅, 호스트 실행, 벤치마크 스크립트
docs/              # 아키텍처 / 레이턴시 / 모델 비교 문서
docker/            # 컨테이너 기반 실험용 파일
runs/              # 실험 결과물 저장 (커밋 금지)
```

## 로컬에서 실행하는 기본 구조

현재 개발 환경에서는 보통 **프로세스 2개**가 필요합니다.

### 1. 로컬 웹/API 서버

역할:

- 브라우저 UI 제공
- LiveKit 토큰 발급
- persona 생성 API
- future image 생성 API
- voice clone / reuse API
- prepared session 저장 API

실행:

```sh
cd psyche-ai
npm run dev:avatar
```

기본 주소:

```txt
http://127.0.0.1:5174
```

### 2. 로컬 room agent

역할:

- LiveKit room에 AI participant로 입장
- Azure Realtime 응답 처리
- ElevenLabs TTS 또는 OpenAI 음성 출력
- prepared session 로드

실행:

```sh
cd psyche-ai
npm run dev:avatar:agent
```

## GPU 서버가 필요한 부분

GPU 서버는 다음 작업에 필요합니다.

- Wav2Lip
- MuseTalk
- LivePortrait

즉,
- 설문
- persona
- LiveKit room join
- Azure Realtime 음성 대화

이 정도는 로컬에서도 되지만,

- 실제 speaking loop 생성
- generated avatar video
- idle animation 실험

은 GPU 서버가 있어야 제대로 검증할 수 있습니다.

## GPU 서버와 연결하는 방식

보통 흐름은 이렇습니다.

1. 로컬에서 코드 수정
2. GitHub에 push
3. GPU 서버에서 pull
4. GPU 서버에서 `avatar-worker` 실행
5. 로컬에서 SSH 터널로 GPU worker 포트 연결

예시:

```sh
ssh -L 8080:127.0.0.1:8080 gpu
```

이렇게 하면 로컬에서는 GPU 서버의 avatar-worker를 아래 주소로 호출할 수 있습니다.

```txt
http://127.0.0.1:8080
```

## 다른 컴퓨터에서 재현하려면

다른 개발자가 이 브랜치를 실행하려면 아래 순서가 가장 안전합니다.

### 1. 필수 준비물

- Node.js 20+
- npm
- ffmpeg / ffprobe
- LiveKit Cloud 프로젝트
- Azure OpenAI / Azure AI Foundry 접근 권한
- 필요 시 ElevenLabs API key
- GPU 서버 접근 권한 (MuseTalk / Wav2Lip 실험 시)

macOS에서 ffmpeg 설치 예시:

```sh
brew install ffmpeg
```

### 2. 저장소 클론

```sh
git clone <repo-url>
cd psyche-ai
npm install
```

### 3. 환경변수 파일 준비

`.env.example`을 복사해서 `.env`를 만듭니다.

```sh
cp .env.example .env
```

그 다음 아래 항목들을 실제 값으로 채웁니다.

- `LIVEKIT_URL`
- `LIVEKIT_API_KEY`
- `LIVEKIT_API_SECRET`
- `AZURE_OPENAI_API_KEY`
- `AZURE_OPENAI_ENDPOINT`
- `AZURE_OPENAI_DEPLOYMENT_NAME`
- `AZURE_OPENAI_PERSONA_ENDPOINT`
- `AZURE_OPENAI_PERSONA_DEPLOYMENT`
- `AZURE_OPENAI_IMAGE_ENDPOINT`
- `AZURE_OPENAI_IMAGE_API_KEY`
- `AZURE_OPENAI_IMAGE_DEPLOYMENT`
- `ELEVENLABS_API_KEY` (선택)

### 4. 로컬 서버 실행

```sh
npm run dev:avatar
```

### 5. room agent 실행

```sh
npm run dev:avatar:agent
```

### 6. 브라우저에서 접속

```txt
http://127.0.0.1:5174
```

### 7. 실제 테스트 순서

1. 현재 사진 업로드
2. 음성 샘플 업로드
3. 설문 입력
4. `Prepare`
5. `Join`
6. 대화 테스트

## 자주 막히는 포인트

### 1. `Missing required environment variables`

- `.env` 값 누락
- 서버 재시작 안 함

### 2. `ELEVENLABS_VOICE_ID` 관련 혼란

이제는 고정 env 값이 필수는 아닙니다.

현재 구조는:

- `Prepare`가 room별 voice/session 상태를 저장
- `room-agent`가 이를 읽어서 사용

즉, `.env`의 `ELEVENLABS_VOICE_ID`는 **고정 테스트 voice를 재사용할 때만 선택적으로 사용**하면 됩니다.

### 3. `EADDRINUSE 127.0.0.1:5174`

이미 같은 포트에서 `npm run dev:avatar`가 떠 있는 상태입니다.
기존 프로세스를 종료하고 다시 실행해야 합니다.

### 4. `ECONNREFUSED 127.0.0.1:5174`

`room-agent`가 prepared session을 읽으려는데,
로컬 웹/API 서버가 안 떠 있을 때 생깁니다.

즉, 항상 `npm run dev:avatar`를 먼저 켜야 합니다.

### 5. `ENOSPC: no space left on device`

실험 결과물(`runs/`)이 쌓이거나 디스크가 꽉 찼을 때 생깁니다.
특히 이미지, voice sample, realtime avatar 산출물을 정리해 주세요.

### 6. LiveKit 401 Unauthorized

- `LIVEKIT_URL`
- `LIVEKIT_API_KEY`
- `LIVEKIT_API_SECRET`

이 3개가 같은 LiveKit 프로젝트 세트인지 확인해야 합니다.

## 현재 권장 개발 모드

가장 안정적인 현재 개발 모드는 아래 조합입니다.

- LiveKit Cloud 사용
- Azure Realtime 사용
- Azure persona/image generation 사용
- ElevenLabs는 필요 시 재사용 voice 기반으로 사용
- GPU 서버는 avatar-worker 전용으로 분리

즉,

- 로컬: 웹 + room agent + 설문/이미지/voice 준비
- GPU: lipsync / idle / avatar rendering

이 분리 구조가 현재 가장 관리하기 쉽습니다.

## 커밋하면 안 되는 것

아래는 커밋하지 않는 것을 원칙으로 합니다.

- `.env`
- 모든 API key / secret
- `runs/` 산출물
- `models/` 내부 대용량 체크포인트
- 개인 음성 샘플 / 생성 음성 파일

## 현재 상태 요약

이 브랜치는 지금 다음 수준까지 왔습니다.

- 미래 자아 설문 파이프라인 동작
- 미래 얼굴 생성 동작
- 음성 샘플 업로드 및 voice 준비 동작
- LiveKit room 입장 및 AI participant 연결
- Azure Realtime 기반 음성 대화
- GPU 기반 speaking loop / idle loop 생성 실험 가능
- room 단위 prepared session 저장 및 agent 동적 로드 구조 반영

아직 남은 과제는:

- 더 자연스러운 idle animation
- 더 빠른 speaking 전환
- 완전한 실시간 lipsync
- 기존 Psyche 프론트/백엔드와 API 통합

## 참고

- agent 세부 구현과 실험 메모는 [apps/agent/README.md](apps/agent/README.md) 참고
- 아바타 모델 체크포인트와 GPU 세팅은 [apps/avatar-worker/README.md](apps/avatar-worker/README.md) 참고
