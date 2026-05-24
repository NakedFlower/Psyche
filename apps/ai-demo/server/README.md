# AI Demo Server

Local Tavus wrapper server.

Currently implemented:

- `POST /api/v1/chats/session`
- `PATCH /api/v1/chats/test/end`
- `GET /health`

The next endpoint to add is `POST /api/v1/personas/generate`, which should
create a survey-based persona prompt and register it with Tavus.
