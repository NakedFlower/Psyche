# Tavus MVP Latency Notes

## What To Measure

The current MVP is Tavus-hosted, so the most useful measurements are product
level rather than model-internal.

- Click-to-conversation-url time.
- Conversation URL to visible room time.
- User speech to avatar response start.
- Interruption handling delay.
- Failed session creation rate.
- Active conversation cleanup success.

## Current Risks

- Tavus account can hit maximum concurrent conversations if sessions are not
  ended.
- A conversation can be created but the iframe may fail to load, so the UI also
  exposes a "새 탭에서 열기" link.
- Korean response quality depends on both persona prompt and Tavus language/TTS
  settings.

## Next Optimizations

- Keep a local conversation state and always end the previous session before
  creating a new one.
- Add a visible loading state and a 30-second client timeout.
- Add server-side timeout around Tavus API calls.
- Store generated Tavus persona IDs instead of re-creating personas per call.
- Measure persona creation time separately from conversation creation time.

