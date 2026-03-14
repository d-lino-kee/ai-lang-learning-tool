import { WebSocketServer, WebSocket } from 'ws';
import { runS2SPipeline } from '../pipeline/s2s.pipeline';
import { logInteraction } from '../db/interactions.db';
import { validateWsDeviceId } from '../middleware/auth.middleware';
import {
  WsConfigFrame,
  WsServerFrame,
  WsClientFrame,
  S2SRequest,
} from '../types';

interface SessionState {
  config: WsConfigFrame | null;
  audioChunks: Buffer[];
  isProcessing: boolean;
}

export function setupWebSocket(wss: WebSocketServer): void {
  wss.on('connection', (ws: WebSocket) => {
    console.log('[ws] Client connected');

    const session: SessionState = {
      config: null,
      audioChunks: [],
      isProcessing: false,
    };

    // ── Incoming messages ──────────────────────────────────────────────────
    ws.on('message', async (data, isBinary) => {
      // Binary frames = raw audio chunks
      if (isBinary) {
        if (!session.config) {
          sendFrame(ws, {
            type: 'error',
            audioHint: 'ERR_INTERNAL',
            message: 'Received audio before config frame',
          });
          return;
        }
        session.audioChunks.push(Buffer.from(data as ArrayBuffer));
        return;
      }

      // Text frames = JSON control messages
      let frame: WsClientFrame;
      try {
        frame = JSON.parse(data.toString()) as WsClientFrame;
      } catch {
        sendFrame(ws, { type: 'error', audioHint: 'ERR_INTERNAL', message: 'Invalid JSON frame' });
        return;
      }

      if (frame.type === 'config') {
        if (!validateWsDeviceId(frame.deviceId)) {
          sendFrame(ws, {
            type: 'error',
            audioHint: 'ERR_INTERNAL',
            message: 'Invalid or missing deviceId in config frame',
          });
          ws.close();
          return;
        }
        session.config = frame;
        session.audioChunks = [];
        session.isProcessing = false;
        return;
      }

      if (frame.type === 'end') {
        await processSession(ws, session);
      }
    });

    ws.on('close', () => console.log('[ws] Client disconnected'));
    ws.on('error', (err) => console.error('[ws] Error:', err.message));
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Process accumulated audio chunks through the pipeline
// ─────────────────────────────────────────────────────────────────────────────
async function processSession(ws: WebSocket, session: SessionState): Promise<void> {
  if (session.isProcessing || !session.config) return;
  session.isProcessing = true;

  const { config } = session;
  const combinedAudio = Buffer.concat(session.audioChunks);

  if (combinedAudio.length === 0) {
    sendFrame(ws, { type: 'error', audioHint: 'ERR_NO_SPEECH', message: 'No audio received' });
    session.isProcessing = false;
    return;
  }

  // Notify client: STT in progress
  sendFrame(ws, { type: 'processing', stage: 'stt' });

  const request: S2SRequest = {
    audioBase64: combinedAudio.toString('base64'),
    audioMimeType: config.audioMimeType,
    sourceLanguage: config.sourceLanguage,
    targetLanguage: config.targetLanguage,
    scenarioId: config.scenarioId,
    deviceId: config.deviceId,
  };

  // Hook into the pipeline — emit processing frames at each stage
  // (The pipeline itself is atomic; we send stage notifications before calling it)
  sendFrame(ws, { type: 'processing', stage: 'translation' });

  const result = await runS2SPipeline(request).catch((err) => ({
    success: false as const,
    audioHint: 'ERR_INTERNAL' as const,
    message: (err as Error).message,
  }));

  // Non-blocking DB log
  setImmediate(() => {
    logInteraction({
      deviceId: config.deviceId,
      scenarioId: config.scenarioId ?? null,
      sourceLanguage: config.sourceLanguage,
      targetLanguage: config.targetLanguage,
      success: result.success,
      sourceText: result.success ? result.sourceText : null,
      translatedText: result.success ? result.translatedText : null,
      audioHint: result.success ? null : result.audioHint,
      metrics: result.success ? result.metrics : null,
    }).catch((err) => console.error('[db] ws logInteraction failed:', err));
  });

  if (!result.success) {
    sendFrame(ws, { type: 'error', audioHint: result.audioHint, message: result.message });
  } else {
    sendFrame(ws, { type: 'processing', stage: 'tts' });
    sendFrame(ws, {
      type: 'result',
      audioBase64: result.audioBase64,
      sourceText: result.sourceText,
      translatedText: result.translatedText,
      metrics: result.metrics,
    });
  }

  // Reset for next recording
  session.audioChunks = [];
  session.isProcessing = false;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: safely send a JSON frame
// ─────────────────────────────────────────────────────────────────────────────
function sendFrame(ws: WebSocket, frame: WsServerFrame): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(frame));
  }
}
