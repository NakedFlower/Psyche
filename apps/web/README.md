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

## Planned Stack

- React or plain Vite client.
- LiveKit Client SDK.
- Shared event schemas from `packages/shared`.

