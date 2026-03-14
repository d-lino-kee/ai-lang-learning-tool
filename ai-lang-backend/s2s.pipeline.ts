import { SpeechClient } from '@google-cloud/speech';
import { TranslationServiceClient } from '@google-cloud/translate';
import { TextToSpeechClient } from '@google-cloud/text-to-speech';
import {
  S2SRequest,
  S2SResponse,
  S2SErrorResponse,
  PipelineMetrics,
  AudioHintCode,
  SupportedLanguage,
} from '../types';

// ── Google Cloud clients (instantiated once, reused) ─────────────────────────
const sttClient = new SpeechClient();
const translateClient = new TranslationServiceClient();
const ttsClient = new TextToSpeechClient();

const GCP_PROJECT = process.env.GCP_PROJECT_ID!;
const GCP_LOCATION = process.env.GCP_LOCATION ?? 'global';

// ── Language config maps ──────────────────────────────────────────────────────
const TTS_VOICE_MAP: Record<SupportedLanguage, { languageCode: string; name: string }> = {
  'en-US': { languageCode: 'en-US', name: 'en-US-Neural2-F' },
  'fr-FR': { languageCode: 'fr-FR', name: 'fr-FR-Neural2-A' },
  'es-ES': { languageCode: 'es-ES', name: 'es-ES-Neural2-A' },
  'ar-SA': { languageCode: 'ar-XA', name: 'ar-XA-Wavenet-A' },
  'pt-BR': { languageCode: 'pt-BR', name: 'pt-BR-Neural2-A' },
};

const TRANSLATE_LANG_MAP: Record<SupportedLanguage, string> = {
  'en-US': 'en',
  'fr-FR': 'fr',
  'es-ES': 'es',
  'ar-SA': 'ar',
  'pt-BR': 'pt',
};

// ── Scenario translation context (domain vocabulary hints) ───────────────────
const SCENARIO_CONTEXT: Record<number, string> = {
  1: 'This is a job application conversation. Use formal professional language.',
  2: 'This is a doctor appointment conversation. Use clear medical terminology.',
  3: 'This is everyday conversational language. Use simple, common phrases.',
};

// ─────────────────────────────────────────────────────────────────────────────
// Main pipeline function
// ─────────────────────────────────────────────────────────────────────────────
export async function runS2SPipeline(
  req: S2SRequest
): Promise<S2SResponse | S2SErrorResponse> {
  const pipelineStart = Date.now();
  const audioBuffer = Buffer.from(req.audioBase64, 'base64');

  // ── Step 1: Speech-to-Text ─────────────────────────────────────────────────
  const sttStart = Date.now();
  let sourceText: string;
  try {
    sourceText = await recognizeSpeech(audioBuffer, req.audioMimeType, req.sourceLanguage);
  } catch (err) {
    return buildError('ERR_NO_SPEECH', `STT failed: ${(err as Error).message}`);
  }

  if (!sourceText.trim()) {
    return buildError('ERR_NO_SPEECH', 'No speech content detected in audio');
  }
  const sttLatencyMs = Date.now() - sttStart;

  // ── Step 2: Translation ────────────────────────────────────────────────────
  const translateStart = Date.now();
  let translatedText: string;
  try {
    translatedText = await translateText(
      sourceText,
      req.sourceLanguage,
      req.targetLanguage,
      req.scenarioId
    );
  } catch (err) {
    return buildError('ERR_TRANSLATION_FAIL', `Translation failed: ${(err as Error).message}`);
  }
  const translationLatencyMs = Date.now() - translateStart;

  // ── Step 3: Text-to-Speech ─────────────────────────────────────────────────
  const ttsStart = Date.now();
  let audioBase64: string;
  try {
    audioBase64 = await synthesizeSpeech(translatedText, req.targetLanguage);
  } catch (err) {
    return buildError('ERR_TTS_FAIL', `TTS failed: ${(err as Error).message}`);
  }
  const ttsLatencyMs = Date.now() - ttsStart;

  // ── Assemble response ──────────────────────────────────────────────────────
  const metrics: PipelineMetrics = {
    sttLatencyMs,
    translationLatencyMs,
    ttsLatencyMs,
    totalLatencyMs: Date.now() - pipelineStart,
    sourceTextLength: sourceText.length,
  };

  return {
    success: true,
    audioBase64,
    sourceText,
    translatedText,
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
  const encoding = mimeType === 'audio/wav'
    ? 'LINEAR16'
    : mimeType === 'audio/ogg'
    ? 'OGG_OPUS'
    : 'WEBM_OPUS'; // audio/webm

  const [response] = await sttClient.recognize({
    config: {
      encoding: encoding as any,
      sampleRateHertz: 16000,
      languageCode: language,
      model: 'latest_long',
      useEnhanced: true,
      // Enable confidence scores to catch low-quality transcriptions
      enableWordConfidence: true,
    },
    audio: { content: audioBuffer.toString('base64') },
  });

  const results = response.results ?? [];
  if (!results.length) return '';

  // Use the highest-confidence alternative
  const transcript = results
    .map((r) => r.alternatives?.[0]?.transcript ?? '')
    .join(' ')
    .trim();

  return transcript;
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 2: Google Cloud Translation API v3
// ─────────────────────────────────────────────────────────────────────────────
async function translateText(
  text: string,
  sourceLang: SupportedLanguage,
  targetLang: SupportedLanguage,
  scenarioId?: number
): Promise<string> {
  const sourceCode = TRANSLATE_LANG_MAP[sourceLang];
  const targetCode = TRANSLATE_LANG_MAP[targetLang];

  // Build a glossary-aware request when a scenario context exists
  const glossaryConfig = scenarioId
    ? { glossaryConfig: undefined } // Extend here with custom glossaries per scenario
    : {};

  const [response] = await translateClient.translateText({
    parent: `projects/${GCP_PROJECT}/locations/${GCP_LOCATION}`,
    contents: [text],
    mimeType: 'text/plain',
    sourceLanguageCode: sourceCode,
    targetLanguageCode: targetCode,
    ...glossaryConfig,
  });

  const translated = response.translations?.[0]?.translatedText ?? '';
  if (!translated) throw new Error('Empty translation result');

  return translated;
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 3: Google Cloud Text-to-Speech
// ─────────────────────────────────────────────────────────────────────────────
async function synthesizeSpeech(
  text: string,
  targetLang: SupportedLanguage
): Promise<string> {
  const voice = TTS_VOICE_MAP[targetLang];

  const [response] = await ttsClient.synthesizeSpeech({
    input: { text },
    voice: {
      languageCode: voice.languageCode,
      name: voice.name,
    },
    audioConfig: {
      audioEncoding: 'MP3',
      speakingRate: 0.9,   // Slightly slower for language learners
      pitch: 0.0,
      effectsProfileId: ['headphone-class-device'],
    },
  });

  const audioContent = response.audioContent;
  if (!audioContent) throw new Error('TTS returned no audio content');

  return Buffer.from(audioContent as Uint8Array).toString('base64');
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function buildError(hint: AudioHintCode, message: string): S2SErrorResponse {
  return { success: false, audioHint: hint, message };
}
