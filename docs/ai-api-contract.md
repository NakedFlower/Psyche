# AI API Contract Draft

This contract reflects the current Tavus-first MVP. IDs can use `test` until
the real frontend/backend branches are integrated.

## B. Surveys And Data

The survey API remains the source of future persona data.

### Create Survey

```http
POST /api/v1/surveys
```

Request:

```json
{
  "mbti": "INTJ",
  "values": ["성장", "자유", "안정"],
  "habits": ["늦게 잠", "기록하기"],
  "goals": ["AI 제품 만들기", "건강 관리하기"],
  "concerns": ["커리어 불확실성", "꾸준함 부족"]
}
```

Response:

```json
{
  "surveyId": "test",
  "userId": "test"
}
```

### Upload Survey Image

```http
POST /api/v1/surveys/image
```

Request:

```txt
imageFile: Multipart file
```

Response:

```json
{
  "imageId": "test",
  "imageUrl": "https://example.com/test-image.png"
}
```

## C. Future Persona Generation

### Generate Tavus Replica From Image

```http
POST /api/v1/replicas/generate
```

Tavus image-to-replica requires a publicly accessible image URL and a stock
`voice_name`.

Request:

```json
{
  "trainImageUrl": "https://example.com/photo.png",
  "voiceName": "anna",
  "replicaName": "Psyche Future Self Replica",
  "autoFixTrainingImage": true
}
```

Response:

```json
{
  "replicaId": "test",
  "status": "started",
  "replicaName": "Psyche Future Self Replica",
  "trainImageUrl": "https://example.com/photo.png",
  "voiceName": "anna"
}
```

If replica creation is unavailable, for example on a free Tavus plan, the AI
server falls back to the default stock replica.

```json
{
  "warning": "Tavus replica creation failed. Falling back to default replica.",
  "replicaId": "test",
  "status": "fallback",
  "fallback": true,
  "fallbackReason": "Custom replica training is not available on this plan."
}
```

### Get Tavus Replica Status

```http
GET /api/v1/replicas/{id}
```

Response:

```json
{
  "replicaId": "test",
  "status": "completed",
  "trainingProgress": "100/100",
  "errorMessage": null
}
```

### Generate Tavus Persona

```http
POST /api/v1/personas/generate
```

For the next MVP step, this endpoint should create a persona prompt from survey
data and call Tavus Create Persona.

Request:

```json
{
  "targetYear": 10,
  "tavusReplicaId": "test",
  "sourceSurveyId": "test",
  "imageId": "test",
  "language": "korean",
  "weights": {
    "idealFuture": 60,
    "careerFocus": 60,
    "directness": 45
  },
  "voice": {
    "provider": "default"
  },
  "survey": {
    "mbti": "INTJ",
    "values": ["성장", "자유"],
    "habits": ["기록하기"],
    "goals": ["AI 제품 만들기"],
    "concerns": ["커리어 불확실성"]
  }
}
```

Weight semantics:

- `idealFuture`: `0` means realistic future, `100` means ideal future.
- `careerFocus`: `0` means family/life focus, `100` means career focus.
- `directness`: `0` means empathy-first, `100` means direct advice.

Response:

```json
{
  "personaId": "test",
  "tavusPersonaId": "test",
  "tavusReplicaId": "test",
  "targetYear": 10,
  "displayName": "10년 뒤의 나",
  "language": "korean",
  "weights": {
    "idealFuture": 60,
    "careerFocus": 60,
    "directness": 45
  },
  "systemPrompt": "항상 한국어로만 대화한다...",
  "conversation": {
    "styleSummary": "따뜻하지만 현실적으로 조언하는 말투"
  }
}
```

### Optional TTS Settings

When custom voice support is added, the request can include a TTS layer.

```json
{
  "voice": {
    "provider": "elevenlabs",
    "externalVoiceId": "test",
    "speed": 0.95,
    "stability": 0.7
  }
}
```

The server should translate this into Tavus `layers.tts` when creating the
Tavus persona.

## D. Tavus Video Conversation

### Create Chat Session

```http
POST /api/v1/chats/session
```

Current implementation:

- Uses `TAVUS_REPLICA_ID`.
- Uses `TAVUS_PERSONA_ID`.
- Passes `properties.language`.
- Ends the locally tracked active conversation before starting a new one.

Request:

```json
{
  "personaId": "test",
  "mode": "video",
  "language": "korean",
  "conversationName": "Psyche AI MVP Test"
}
```

Response:

```json
{
  "chatId": "test",
  "userId": "test",
  "personaId": "test",
  "mode": "video",
  "realtime": null,
  "avatar": {
    "enabled": true,
    "provider": "tavus",
    "avatarSessionId": "test",
    "joinUrl": "https://tavus.daily.co/test",
    "status": "active",
    "language": "korean"
  }
}
```

### End Chat Session

```http
PATCH /api/v1/chats/{id}/end
```

Current local test endpoint:

```http
PATCH /api/v1/chats/test/end
```

Request:

```json
{
  "avatarSessionId": "test",
  "reason": "user_ended"
}
```

Response:

```json
{
  "chatId": "test",
  "status": "ended",
  "provider": "tavus",
  "avatarSessionId": "test"
}
```
