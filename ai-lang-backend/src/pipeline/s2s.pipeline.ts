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
// Main pipeline: STT → Gemini AI (feedback + reply) → TTS
//
// The response now contains two audio tracks:
// - feedbackAudioBase64: the AI's feedback on what the user said
//   (e.g. "Almost! Say je veux, not je vouloir")
// - replyAudioBase64: the AI's conversational continuation
//   (e.g. "Now tell me, when is your appointment?")
//
// Engineer A can use these separately to animate the Blob differently —
// a "thinking/correcting" expression during feedback, then back to
// "talking" expression for the reply.
//
// Both are also available as a single combined audio track (audioBase64)
// if Engineer A just wants to play them back to back without different animations.
// ─────────────────────────────────────────────────────────────────────────────
export async function runS2SPipeline(
  req: S2SRequestWithHistory
): Promise<S2SResponse | S2SErrorResponse> {
  const pipelineStart = Date.now();
  const audioBuffer = Buffer.from(req.audioBase64, 'base64');

  // ── Step 1: Speech-to-Text ────────────────────────────────────────────────
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

  // ── Step 2: Gemini generates feedback + reply ─────────────────────────────
  const aiStart = Date.now();
  let aiResult: Awaited<ReturnType<typeof generateAIResponse>>;
  try {
    aiResult = await generateAIResponse(
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

  // ── Step 3: TTS — synthesize feedback and reply ───────────────────────────
  // Feedback is spoken in the native language voice (it's an explanation/correction).
  // Reply is spoken in the target language voice once any immersion has started.
  // At immersion 0 both use the native voice.
  const feedbackVoice: SupportedLanguage =
    req.immersionLevel <= 40 ? req.nativeLanguage : req.targetLanguage;

  const replyVoice: SupportedLanguage =
    req.immersionLevel === 0 ? req.nativeLanguage : req.targetLanguage;

  const ttsStart = Date.now();
  let feedbackAudioBase64: string;
  let replyAudioBase64: string;
  let audioBase64: string;

  try {
    // Run feedback and reply TTS in parallel to keep latency low
    const [feedbackAudio, replyAudio] = await Promise.all([
      // Only synthesize feedback separately if there is a reply to separate it from
      aiResult.reply
        ? synthesizeSpeech(aiResult.feedback, feedbackVoice)
        : synthesizeSpeech(aiResult.feedback, feedbackVoice),
      aiResult.reply
        ? synthesizeSpeech(aiResult.reply, replyVoice)
        : Promise.resolve(''),
    ]);

    feedbackAudioBase64 = feedbackAudio;
    replyAudioBase64 = replyAudio;

    // Also synthesize the full combined text as a single audio track
    // so Engineer A has the option to just play one thing
    audioBase64 = await synthesizeSpeech(aiResult.fullText, replyVoice);

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
    // Combined audio — play this if you want everything in one go
    audioBase64,
    // Separated audio — use these if you want different Blob animations
    feedbackAudioBase64,
    replyAudioBase64,
    // Text versions — for logging and debugging
    sourceText,
    aiResponseText: aiResult.fullText,
    feedbackText: aiResult.feedback,
    replyText: aiResult.reply,
    // Whether the user attempted the target language this turn
    hadTargetLanguage: aiResult.hadTargetLanguage,
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
      speakingRate: 0.85,
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
