# Psyche Frontend

Psyche MVP front-end prototype based on the challenge proposal and the Notion API spec.

## Current Prototype

- `prototype.html` is a no-build clickable prototype that can be opened directly in a browser.
- React/Vite source lives in `src/` and mirrors the same flow for the production front-end.
- Backend and AI calls are temporarily mocked in `src/api/mockApi.ts`.

## Product Flow

1. Login
2. Text survey profile entry and source face image upload
3. Future persona generation waiting step
4. Conversation weight controls: idealism, career, directness
5. Voice/video session mock with chat log persistence mock
6. Dashboard for generated persona list and remaining generation credits

## API Mapping

The mock layer follows the Notion API spec:

- `POST /api/v1/auth/login`
- `POST /api/v1/auth/refresh`
- `POST /api/v1/auth/social/kakao`
- `POST /api/v1/auth/logout`
- `POST /api/v1/surveys`
- `POST /api/v1/surveys/image`
- `POST /api/v1/personas/generate`
- `PATCH /api/v1/personas/{id}/weights`
- `GET /api/v1/personas`
- `POST /api/v1/chats/session`
- `POST /api/v1/chats/{id}/logs`
- `POST /api/v1/chats/{id}/recording`
- `GET /api/v1/credits/balance`
- `POST /api/v1/payments/unlock`

## React Setup

When Node package tooling is available:

```bash
npm install
npm run dev
```

Replace `src/api/mockApi.ts` with a real HTTP client once the backend is ready.
