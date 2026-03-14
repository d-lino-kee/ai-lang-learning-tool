import { runS2SPipeline, S2SRequestWithHistory } from '../pipeline/s2s.pipeline';

jest.mock('@google-cloud/speech', () => ({
  SpeechClient: jest.fn().mockImplementation(() => ({
    recognize: jest.fn().mockResolvedValue([{
      results: [{ alternatives: [{ transcript: 'je veux un rendez-vous' }] }],
    }]),
  })),
}));

jest.mock('@google-cloud/text-to-speech', () => ({
  TextToSpeechClient: jest.fn().mockImplementation(() => ({
    synthesizeSpeech: jest.fn().mockResolvedValue([{
      audioContent: Buffer.from('fake-mp3'),
    }]),
  })),
}));

jest.mock('../ai/conversation.ai', () => ({
  generateAIResponse: jest.fn().mockResolvedValue({
    feedback: 'Presque! Say je voudrais, not je veux.',
    reply: 'Très bien. Quel jour préférez-vous?',
    fullText: 'Presque! Say je voudrais, not je veux. Très bien. Quel jour préférez-vous?',
    hadTargetLanguage: true,
  }),
}));

import { generateAIResponse } from '../ai/conversation.ai';
const mockAI = generateAIResponse as jest.MockedFunction<typeof generateAIResponse>;

const baseRequest: S2SRequestWithHistory = {
  audioBase64: Buffer.from('audio').toString('base64'),
  audioMimeType: 'audio/webm',
  nativeLanguage: 'en-US',
  targetLanguage: 'fr-FR',
  immersionLevel: 50,
  scenarioId: 2,
  deviceId: 'test-device',
  conversationHistory: [],
};

describe('S2S Pipeline — feedback + reply', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns all feedback and reply fields on success', async () => {
    const result = await runS2SPipeline(baseRequest);

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.feedbackText).toBe('Presque! Say je voudrais, not je veux.');
    expect(result.replyText).toBe('Très bien. Quel jour préférez-vous?');
    expect(result.aiResponseText).toContain('Presque');
    expect(result.hadTargetLanguage).toBe(true);
    expect(result.feedbackAudioBase64).toBeTruthy();
    expect(result.replyAudioBase64).toBeTruthy();
    expect(result.audioBase64).toBeTruthy();
  });

  it('calls TTS three times — feedback, reply, and combined', async () => {
    const { TextToSpeechClient } = require('@google-cloud/text-to-speech');
    const mockSynthesize = jest.fn().mockResolvedValue([{ audioContent: Buffer.from('mp3') }]);
    TextToSpeechClient.mockImplementation(() => ({ synthesizeSpeech: mockSynthesize }));

    await runS2SPipeline(baseRequest);

    // 2 parallel (feedback + reply) + 1 combined = 3 calls
    expect(mockSynthesize).toHaveBeenCalledTimes(3);
  });

  it('uses native voice for feedback at low immersion', async () => {
    const { TextToSpeechClient } = require('@google-cloud/text-to-speech');
    const mockSynthesize = jest.fn().mockResolvedValue([{ audioContent: Buffer.from('mp3') }]);
    TextToSpeechClient.mockImplementation(() => ({ synthesizeSpeech: mockSynthesize }));

    await runS2SPipeline({ ...baseRequest, immersionLevel: 20 });

    // First call is feedback — should use native (en-US) voice
    const feedbackCall = mockSynthesize.mock.calls[0][0];
    expect(feedbackCall.voice.languageCode).toBe('en-US');
  });

  it('uses target voice for feedback at high immersion', async () => {
    const { TextToSpeechClient } = require('@google-cloud/text-to-speech');
    const mockSynthesize = jest.fn().mockResolvedValue([{ audioContent: Buffer.from('mp3') }]);
    TextToSpeechClient.mockImplementation(() => ({ synthesizeSpeech: mockSynthesize }));

    await runS2SPipeline({ ...baseRequest, immersionLevel: 60 });

    const feedbackCall = mockSynthesize.mock.calls[0][0];
    expect(feedbackCall.voice.languageCode).toBe('fr-FR');
  });

  it('passes immersion level to AI', async () => {
    await runS2SPipeline({ ...baseRequest, immersionLevel: 70 });

    expect(mockAI).toHaveBeenCalledWith(
      expect.any(String),
      'en-US',
      'fr-FR',
      70,
      [],
      2
    );
  });

  it('returns ERR_NO_SPEECH when STT is empty', async () => {
    const { SpeechClient } = require('@google-cloud/speech');
    SpeechClient.mockImplementation(() => ({
      recognize: jest.fn().mockResolvedValue([{ results: [] }]),
    }));

    const result = await runS2SPipeline(baseRequest);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.audioHint).toBe('ERR_NO_SPEECH');
  });

  it('returns ERR_AI_FAIL when Gemini throws', async () => {
    mockAI.mockRejectedValueOnce(new Error('quota exceeded'));

    const result = await runS2SPipeline(baseRequest);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.audioHint).toBe('ERR_AI_FAIL');
  });

  it('returns ERR_TTS_FAIL when TTS throws', async () => {
    const { TextToSpeechClient } = require('@google-cloud/text-to-speech');
    TextToSpeechClient.mockImplementation(() => ({
      synthesizeSpeech: jest.fn().mockRejectedValue(new Error('TTS down')),
    }));

    const result = await runS2SPipeline(baseRequest);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.audioHint).toBe('ERR_TTS_FAIL');
  });
});
