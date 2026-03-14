# LinguaBlob Backend

Node.js + Express + TypeScript backend for the Speech-to-Speech language learning app.

## Quick Start

```bash
cp .env.example .env       # Fill in your GCP + DB credentials
npm install
npm run dev                # Starts on port 4000 with hot-reload
```

## Endpoints

| Method | Path                  | Description                              |
|--------|-----------------------|------------------------------------------|
| GET    | /health               | DB + server liveness check               |
| POST   | /api/s2s/translate    | Full STT → Translation → TTS pipeline    |
| GET    | /api/s2s/mock         | Hardcoded response for frontend dev      |
| WS     | /ws/s2s               | Streaming WebSocket pipeline             |

## REST: POST /api/s2s/translate

**Request body:**
```json
{
  "audioBase64": "<base64-encoded audio>",
  "audioMimeType": "audio/webm",
  "sourceLanguage": "en-US",
  "targetLanguage": "fr-FR",
  "scenarioId": 1,
  "deviceId": "abc123fingerprint"
}
```

**Success response (200):**
```json
{
  "success": true,
  "audioBase64": "<base64 MP3>",
  "sourceText": "Hello, I would like to apply for the job.",
  "translatedText": "Bonjour, je voudrais postuler pour le poste.",
  "metrics": {
    "sttLatencyMs": 320,
    "translationLatencyMs": 110,
    "ttsLatencyMs": 430,
    "totalLatencyMs": 860,
    "sourceTextLength": 44
  }
}
```

**Error response (422):**
```json
{
  "success": false,
  "audioHint": "ERR_NO_SPEECH",
  "message": "No speech content detected in audio"
}
```

All `audioHint` codes map to earcon audio files on the frontend — the UI never shows text errors.

## WebSocket: /ws/s2s

**Protocol (client → server):**
1. Send a JSON `config` frame first
2. Stream binary audio chunks as ArrayBuffer
3. Send a JSON `end` frame to trigger processing

**Config frame:**
```json
{
  "type": "config",
  "sourceLanguage": "en-US",
  "targetLanguage": "fr-FR",
  "scenarioId": 1,
  "deviceId": "abc123",
  "audioMimeType": "audio/webm"
}
```

**Server → client frames:**
- `{ "type": "processing", "stage": "stt" | "translation" | "tts" }` — progress updates
- `{ "type": "result", "audioBase64": "...", "sourceText": "...", ... }` — final audio
- `{ "type": "error", "audioHint": "ERR_...", "message": "..." }` — error

## File Structure

```
src/
├── server.ts              # Entry point, Express + WebSocket setup
├── types/index.ts         # Shared contract types (used by all 3 engineers)
├── pipeline/
│   └── s2s.pipeline.ts    # Core STT → Translation → TTS logic
├── controllers/
│   └── s2s.controller.ts  # REST request/response handlers
├── ws/
│   └── s2s.ws.ts          # WebSocket session management
├── routes/
│   ├── s2s.routes.ts
│   └── health.routes.ts
├── db/
│   ├── connection.ts       # MySQL pool
│   └── interactions.db.ts  # Interaction logging (non-blocking)
└── middleware/
    ├── validate.middleware.ts
    ├── error.middleware.ts
    ├── rateLimit.middleware.ts
    └── logger.middleware.ts
```

## GCP Setup

1. Create a GCP project and enable: **Cloud Speech-to-Text API**, **Cloud Translation API**, **Cloud Text-to-Speech API**
2. Create a service account with roles: `Cloud Speech Client`, `Cloud Translation API User`, `Cloud Text-to-Speech API User`
3. Download the JSON key → save as `gcp-credentials.json` in the project root
4. Set `GOOGLE_APPLICATION_CREDENTIALS=./gcp-credentials.json` in `.env`

## Coordination Notes (for Eng A & Eng C)

- **Eng A (Frontend):** Hit `GET /api/s2s/mock` from day one — it returns a real response shape with a silent MP3 so your audio player code works immediately.
- **Eng C (DB/Infra):** The DB schema is in `schema.sql` at the repo root. The backend will fail gracefully if the DB is down (health check returns 503, interactions are silently dropped).
- **Shared types:** Import from `src/types/index.ts` — this is the source of truth for `S2SRequest`, `S2SResponse`, `WsConfigFrame`, `AudioHintCode`, etc.
