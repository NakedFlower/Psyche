# Web App

LiveKit client test UI for the avatar lab.

## Goal

Connect a browser to a LiveKit room and render:

- User camera/microphone tracks.
- AI agent audio track.
- AI avatar video track published by `avatar-worker`.

## First Milestone

Build the smallest UI that can:

1. Join a LiveKit room.
2. Show local user audio/video status.
3. Show remote participant tracks.
4. Display latency events from the data channel.

## Current Stack

- Plain browser UI served by `apps/agent/server.js`.
- LiveKit Client SDK loaded as an ESM browser module.
- Shared event schemas from `packages/shared`.

## Run

Start the token/static server from the repository root:

```sh
node apps/agent/server.js
```

Then open:

```txt
http://127.0.0.1:5174
```

The UI can:

- Request a LiveKit room token from `/api/livekit/token`.
- Join a LiveKit room.
- Publish local microphone/camera tracks.
- Render remote audio/video tracks.
- Show participants, connection state, track counts, and LiveKit data-channel events.
- Start an embedded agent simulator from the main UI for single-browser testing.
- Open `/agent-sim.html` as a browser-based stand-in for the future AI agent.

## Agent Simulator

The main UI's "Start embedded agent sim" button creates a second LiveKit room
connection in the same page, publishes quiet synthetic audio plus a generated
placeholder video track, and emits `latency.metric` data-channel events. This
makes it possible to verify remote track rendering without opening a second
browser.

`/agent-sim.html` provides the same behavior as a separate browser page.
