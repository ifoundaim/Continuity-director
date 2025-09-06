# Continuity Director + SceneLock (YC Room)

A tiny demo showing **consistent setting + consistent characters** and **surgical edit-only** with **Gemini 2.5 Flash Image**.

## Setup
1. `cp .env.sample .env.local` and fill `GEMINI_API_KEY`.
2. `npm i`
3. `npm run dev`

## Endpoints
- `POST /api/generate` → `{ camera, extra?, aimDesc?, emDesc? }`
- `POST /api/edit` → `{ instruction, imageBase64 }`
- `POST /api/fuse` → `{ baseImageBase64, objectImageBase64, placement }`

## Notes
- SceneLock preset: `src/scene/yc_room_v1.json` (20×14×10 ft YC room).
- Scale anchors: Aim **170 cm**, Em **160.02 cm** (locked).
- Anime/cel-shaded enforced in prompt templates.
- Simple file cache in `.cache/` to reduce API usage (delete to refresh).

