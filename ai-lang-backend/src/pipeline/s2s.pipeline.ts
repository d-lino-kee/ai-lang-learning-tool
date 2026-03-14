import { SpeechClient } from '@google-cloud/speech';
import { TextToSpeechClient } from '@google-cloud/text-to-speech';
import { generateAIResponse, ConversationMessage } from '../ai/conversation.ai';
import {
  S2SRequest,
  S2SResponse,
  S2SErrorResponse,
  PipelineMetrics,
  AudioHintCode,
  SupportedLanguage,
  ImmersionLevel,
} from '../types';

const sttClient = new SpeechClient();
const ttsClient = new TextToSpeechClient();

// ── TTS voice map ─────────────────────────────────────────────────────────────
const TTS_VOICE_MAP: Record<SupportedLanguage, { languageCode: string; name: string }> = {
  'en-US': { languageCode: 'en-US', name: 'en-US-Neural2-F' },
  'fr-FR': { languageCode: 'fr-FR', name: 'fr-FR-Neural2-A' },
  'es-ES': { languageCode: 'es-ES', name: 'es-ES-Neural2-A' },
  'ar-SA': { languageCode: 'ar-XA', name: 'ar-XA-Wavenet-A' },
  'pt-BR': { languageCode: 'pt-BR', name: 'pt-BR-Neural2-A' },
};

export interface S2SRequestWithHistory extends S2SRequest {
  conversationHistory: ConversationMessage[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Main pipeline: STT → Gemini AI (with immersion) → TTS
//
// The TTS language used depends on the immersion level:
// - At low immersion: respond in the native language voice
// - At high immersion: respond in the target language voice
// - In between: use the target language voice (Gemini mixes languages in the text)
// ─────────────────────────────────────────────────────────────────────────────
export async function runS2SPipeline(
  req: S2SRequestWithHistory
): Promise<S2SResponse | S2SErrorResponse> {
  const pipelineStart = Date.now();
  const audioBuffer = Buffer.from(req.audioBase64, 'base64');

  // ── Step 1: Speech-to-Text (always in the user's native language) ──────────
  const sttStart = Date.now();
  let sourceText: string;
  try {
    sourceText = await recognizeSpeech(audioBuffer, req.audioMimeType, req.nativeLanguage);
  } catch (err) {
    return buildError('ERR_NO_SPEECH', `STT failed: ${(err as Error).message}`);
  }

  if (!sourceText.trim()) {
    return buildError('ERR_NO_SPEECH', 'No speech content detected in audio');
  }
  const sttLatencyMs = Date.now() - sttStart;

  // ── Step 2: Gemini generates a response mixed according to immersion level ──
  const aiStart = Date.now();
  let aiResponse: string;
  try {
    aiResponse = await generateAIResponse(
      sourceText,
      req.nativeLanguage,
      req.targetLanguage,
      req.immersionLevel,
      req.conversationHistory,
      req.scenarioId
    );
  } catch (err) {
    return buildError('ERR_AI_FAIL', `Gemini AI failed: ${(err as Error).message}`);
  }
  const aiLatencyMs = Date.now() - aiStart;

  // ── Step 3: TTS — use target language voice once any immersion has started ──
  // At immersion 0 use the native voice; otherwise use the target voice.
  // This ensures the pronunciation the user hears matches what they're learning.
  const ttsLanguage: SupportedLanguage =
    req.immersionLevel === 0 ? req.nativeLanguage : req.targetLanguage;

  const ttsStart = Date.now();
  let audioBase64: string;
  try {
    audioBase64 = await synthesizeSpeech(aiResponse, ttsLanguage);
  } catch (err) {
    return buildError('ERR_TTS_FAIL', `TTS failed: ${(err as Error).message}`);
  }
  const ttsLatencyMs = Date.now() - ttsStart;

  const metrics: PipelineMetrics = {
    sttLatencyMs,
    aiLatencyMs,
    ttsLatencyMs,
    totalLatencyMs: Date.now() - pipelineStart,
    sourceTextLength: sourceText.length,
  };

  return {
    success: true,
    audioBase64,
    sourceText,
    aiResponseText: aiResponse,
    immersionLevel: req.immersionLevel,
    metrics,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 1: Google Cloud Speech-to-Text
// ─────────────────────────────────────────────────────────────────────────────
async function recognizeSpeech(
  audioBuffer: Buffer,
  mimeType: S2SRequest['audioMimeType'],
  language: SupportedLanguage
): Promise<string> {
  const encoding =
    mimeType === 'audio/wav'
      ? 'LINEAR16'
      : mimeType === 'audio/ogg'
      ? 'OGG_OPUS'
      : 'WEBM_OPUS';

  const [response] = await sttClient.recognize({
    config: {
      encoding: encoding as any,
      sampleRateHertz: 16000,
      languageCode: language,
      model: 'latest_long',
      useEnhanced: true,
      enableWordConfidence: true,
    },
    audio: { content: audioBuffer.toString('base64') },
  });

  const results = response.results ?? [];
  if (!results.length) return '';

  return results
    .map((r) => r.alternatives?.[0]?.transcript ?? '')
    .join(' ')
    .trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 3: Google Cloud Text-to-Speech
// ─────────────────────────────────────────────────────────────────────────────
async function synthesizeSpeech(
  text: string,
  language: SupportedLanguage
): Promise<string> {
  const voice = TTS_VOICE_MAP[language];

  const [response] = await ttsClient.synthesizeSpeech({
    input: { text },
    voice: {
      languageCode: voice.languageCode,
      name: voice.name,
    },
    audioConfig: {
      audioEncoding: 'MP3',
      speakingRate: 0.85, // Slightly slower — helps language learners follow along
      pitch: 0.0,
      effectsProfileId: ['headphone-class-device'],
    },
  });

  const audioContent = response.audioContent;
  if (!audioContent) throw new Error('TTS returned no audio content');

  return Buffer.from(audioContent as Uint8Array).toString('base64');
}

function buildError(hint: AudioHintCode, message: string): S2SErrorResponse {
  return { success: false, audioHint: hint, message };
}
