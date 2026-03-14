import { runS2SPipeline, S2SRequestWithHistory } from '../pipeline/s2s.pipeline';

jest.mock('@google-cloud/speech', () => ({
  SpeechClient: jest.fn().mockImplementation(() => ({
    recognize: jest.fn().mockResolvedValue([{
      results: [{ alternatives: [{ transcript: 'Hello I would like to apply for the job' }] }],
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
  generateAIResponse: jest.fn().mockResolvedValue(
    'That is great! In French we say "Bonjour". That means hello!'
  ),
}));

import { generateAIResponse } from '../ai/conversation.ai';
const mockAI = generateAIResponse as jest.MockedFunction<typeof generateAIResponse>;

const baseRequest: S2SRequestWithHistory = {
  audioBase64: Buffer.from('audio').toString('base64'),
  audioMimeType: 'audio/webm',
  nativeLanguage: 'en-US',
  targetLanguage: 'fr-FR',
  immersionLevel: 10,
  scenarioId: 1,
  deviceId: 'test-device',
  conversationHistory: [],
};

describe('S2S Pipeline', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns success with correct fields on happy path', async () => {
    const result = await runS2SPipeline(baseRequest);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.sourceText).toBe('Hello I would like to apply for the job');
    expect(result.aiResponseText).toContain('Bonjour');
    expect(result.immersionLevel).toBe(10);
    expect(result.audioBase64).toBeTruthy();
  });

  it('passes immersion level to the AI', async () => {
    await runS2SPipeline({ ...baseRequest, immersionLevel: 50 });

    expect(mockAI).toHaveBeenCalledWith(
      expect.any(String),
      'en-US',
      'fr-FR',
      50,
      [],
      1
    );
  });

  it('uses native language voice at immersion level 0', async () => {
    const { TextToSpeechClient } = require('@google-cloud/text-to-speech');
    const mockSynthesize = jest.fn().mockResolvedValue([{ audioContent: Buffer.from('mp3') }]);
    TextToSpeechClient.mockImplementation(() => ({ synthesizeSpeech: mockSynthesize }));

    await runS2SPipeline({ ...baseRequest, immersionLevel: 0 });

    const callArgs = mockSynthesize.mock.calls[0][0];
    expect(callArgs.voice.languageCode).toBe('en-US');
  });

  it('uses target language voice at immersion level > 0', async () => {
    const { TextToSpeechClient } = require('@google-cloud/text-to-speech');
    const mockSynthesize = jest.fn().mockResolvedValue([{ audioContent: Buffer.from('mp3') }]);
    TextToSpeechClient.mockImplementation(() => ({ synthesizeSpeech: mockSynthesize }));

    await runS2SPipeline({ ...baseRequest, immersionLevel: 10 });

    const callArgs = mockSynthesize.mock.calls[0][0];
    expect(callArgs.voice.languageCode).toBe('fr-FR');
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
