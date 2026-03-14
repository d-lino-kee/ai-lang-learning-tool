import { WebSocketServer, WebSocket } from 'ws';
import { setupWebSocket } from '../ws/s2s.ws';
import * as pipeline from '../pipeline/s2s.pipeline';
import * as db from '../db/interactions.db';

jest.mock('../pipeline/s2s.pipeline');
jest.mock('../db/interactions.db', () => ({ logInteraction: jest.fn().mockResolvedValue(undefined) }));

const mockRunPipeline = pipeline.runS2SPipeline as jest.MockedFunction<typeof pipeline.runS2SPipeline>;

// ── Helpers ───────────────────────────────────────────────────────────────────
function collectFrames(ws: WebSocket): Promise<any[]> {
  return new Promise((resolve) => {
    const frames: any[] = [];
    ws.on('message', (data) => frames.push(JSON.parse(data.toString())));
    ws.on('close', () => resolve(frames));
  });
}

function openClient(port: number): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${port}/ws/s2s`);
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
  });
}

const CONFIG_FRAME = JSON.stringify({
  type: 'config',
  sourceLanguage: 'en-US',
  targetLanguage: 'fr-FR',
  scenarioId: 1,
  deviceId: 'ws-test-device',
  audioMimeType: 'audio/webm',
});

const SUCCESS_RESULT = {
  success: true as const,
  audioBase64: Buffer.from('mp3').toString('base64'),
  sourceText: 'Hello',
  translatedText: 'Bonjour',
  metrics: {
    sttLatencyMs: 100,
    translationLatencyMs: 80,
    ttsLatencyMs: 200,
    totalLatencyMs: 380,
    sourceTextLength: 5,
  },
};

// ─────────────────────────────────────────────────────────────────────────────
describe('WebSocket S2S Handler', () => {
  let wss: WebSocketServer;
  let port: number;

  beforeEach((done) => {
    wss = new WebSocketServer({ port: 0 });
    setupWebSocket(wss);
    wss.on('listening', () => {
      port = (wss.address() as any).port;
      done();
    });
  });

  afterEach((done) => {
    wss.close(done);
    jest.clearAllMocks();
  });

  it('sends processing frames then result on happy path', async () => {
    mockRunPipeline.mockResolvedValue(SUCCESS_RESULT);

    const ws = await openClient(port);
    const framesPromise = collectFrames(ws);

    ws.send(CONFIG_FRAME);
    ws.send(Buffer.from('fake-audio-chunk'), { binary: true });
    ws.send(JSON.stringify({ type: 'end' }));

    // Wait for at least the result frame then close
    await new Promise<void>((resolve) => {
      ws.on('message', (data) => {
        const frame = JSON.parse(data.toString());
        if (frame.type === 'result') {
          ws.close();
          resolve();
        }
      });
    });

    const frames = await framesPromise;
    const types = frames.map((f) => f.type);

    expect(types).toContain('processing');
    expect(types).toContain('result');

    const resultFrame = frames.find((f) => f.type === 'result');
    expect(resultFrame.audioBase64).toBeTruthy();
    expect(resultFrame.sourceText).toBe('Hello');
  });

  it('sends error frame when pipeline returns ERR_NO_SPEECH', async () => {
    mockRunPipeline.mockResolvedValue({
      success: false,
      audioHint: 'ERR_NO_SPEECH',
      message: 'No speech detected',
    });

    const ws = await openClient(port);

    const errorFrame = await new Promise<any>((resolve) => {
      ws.on('message', (data) => {
        const frame = JSON.parse(data.toString());
        if (frame.type === 'error') resolve(frame);
      });
      ws.send(CONFIG_FRAME);
      ws.send(Buffer.from('audio'), { binary: true });
      ws.send(JSON.stringify({ type: 'end' }));
    });

    expect(errorFrame.audioHint).toBe('ERR_NO_SPEECH');
    ws.close();
  });

  it('sends error frame when no audio is received before end', async () => {
    const ws = await openClient(port);

    const errorFrame = await new Promise<any>((resolve) => {
      ws.on('message', (data) => {
        const frame = JSON.parse(data.toString());
        if (frame.type === 'error') resolve(frame);
      });
      ws.send(CONFIG_FRAME);
      // No audio chunks — send end immediately
      ws.send(JSON.stringify({ type: 'end' }));
    });

    expect(errorFrame.type).toBe('error');
    expect(errorFrame.audioHint).toBe('ERR_NO_SPEECH');
    ws.close();
  });

  it('sends error frame when binary audio arrives before config', async () => {
    const ws = await openClient(port);

    const errorFrame = await new Promise<any>((resolve) => {
      ws.on('message', (data) => {
        const frame = JSON.parse(data.toString());
        if (frame.type === 'error') resolve(frame);
      });
      // Send audio WITHOUT a config frame first
      ws.send(Buffer.from('audio'), { binary: true });
    });

    expect(errorFrame.type).toBe('error');
    ws.close();
  });

  it('resets state after processing so a second recording works', async () => {
    mockRunPipeline.mockResolvedValue(SUCCESS_RESULT);

    const ws = await openClient(port);
    let resultCount = 0;

    await new Promise<void>((resolve) => {
      ws.on('message', (data) => {
        const frame = JSON.parse(data.toString());
        if (frame.type === 'result') {
          resultCount++;
          if (resultCount === 2) {
            ws.close();
            resolve();
          } else {
            // Second recording
            ws.send(CONFIG_FRAME);
            ws.send(Buffer.from('audio2'), { binary: true });
            ws.send(JSON.stringify({ type: 'end' }));
          }
        }
      });

      // First recording
      ws.send(CONFIG_FRAME);
      ws.send(Buffer.from('audio1'), { binary: true });
      ws.send(JSON.stringify({ type: 'end' }));
    });

    expect(resultCount).toBe(2);
  });
});
