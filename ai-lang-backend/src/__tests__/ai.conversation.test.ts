const mockSendMessage = jest.fn();
const mockStartChat = jest.fn(() => ({ sendMessage: mockSendMessage }));
const mockGenerateContent = jest.fn();
const mockGetGenerativeModel = jest.fn(() => ({
  startChat: mockStartChat,
  generateContent: mockGenerateContent,
}));

jest.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
    getGenerativeModel: mockGetGenerativeModel,
  })),
  HarmCategory: {
    HARM_CATEGORY_HARASSMENT: 'HARM_CATEGORY_HARASSMENT',
    HARM_CATEGORY_HATE_SPEECH: 'HARM_CATEGORY_HATE_SPEECH',
  },
  HarmBlockThreshold: { BLOCK_MEDIUM_AND_ABOVE: 'BLOCK_MEDIUM_AND_ABOVE' },
}));

import { generateAIResponse, generateBlobIntro } from '../ai/conversation.ai';
import { getHistory, appendToHistory, clearHistory, getImmersionLevel } from '../ai/history.store';

// ─────────────────────────────────────────────────────────────────────────────
describe('generateAIResponse — feedback + reply structure', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns separated feedback and reply when ||| separator is present', async () => {
    mockSendMessage.mockResolvedValue({
      response: {
        text: () => 'Great job saying bonjour! ||| Now tell me, what is your name?',
      },
    });

    const result = await generateAIResponse('bonjour', 'en-US', 'fr-FR', 10, []);

    expect(result.feedback).toBe('Great job saying bonjour!');
    expect(result.reply).toBe('Now tell me, what is your name?');
    expect(result.fullText).toBe('Great job saying bonjour! Now tell me, what is your name?');
  });

  it('returns full text as feedback when no ||| separator', async () => {
    mockSendMessage.mockResolvedValue({
      response: { text: () => 'Well done! Keep going.' },
    });

    const result = await generateAIResponse('hello', 'en-US', 'fr-FR', 0, []);

    expect(result.feedback).toBe('Well done! Keep going.');
    expect(result.reply).toBe('');
    expect(result.fullText).toBe('Well done! Keep going.');
  });

  it('detects target language attempt for French', async () => {
    mockSendMessage.mockResolvedValue({
      response: { text: () => 'Très bien! ||| Continuons.' },
    });

    const result = await generateAIResponse('je veux aller au docteur', 'en-US', 'fr-FR', 50, []);
    expect(result.hadTargetLanguage).toBe(true);
  });

  it('returns hadTargetLanguage false for pure English at low immersion', async () => {
    mockSendMessage.mockResolvedValue({
      response: { text: () => 'Good try! ||| Now try in French.' },
    });

    const result = await generateAIResponse(
      'I want to go to the doctor today please',
      'en-US',
      'fr-FR',
      10,
      []
    );
    expect(result.hadTargetLanguage).toBe(false);
  });

  it('includes ENTIRELY native language rule at immersion 0', async () => {
    mockSendMessage.mockResolvedValue({
      response: { text: () => 'Welcome! ||| Let us begin.' },
    });

    await generateAIResponse('hello', 'en-US', 'fr-FR', 0, []);

    const systemInstruction = mockGetGenerativeModel.mock.calls[0][0].systemInstruction;
    expect(systemInstruction).toContain('ENTIRELY in English');
    expect(systemInstruction).toContain('Do not use any French');
  });

  it('includes full immersion rule at immersion 100', async () => {
    mockSendMessage.mockResolvedValue({
      response: { text: () => 'Parfait! ||| Continuons la conversation.' },
    });

    await generateAIResponse('je suis prêt', 'en-US', 'fr-FR', 100, []);

    const systemInstruction = mockGetGenerativeModel.mock.calls[0][0].systemInstruction;
    expect(systemInstruction).toContain('ENTIRELY in French');
  });

  it('includes ||| format instruction in system prompt', async () => {
    mockSendMessage.mockResolvedValue({
      response: { text: () => 'Good! ||| Next question.' },
    });

    await generateAIResponse('test', 'en-US', 'fr-FR', 20, []);

    const systemInstruction = mockGetGenerativeModel.mock.calls[0][0].systemInstruction;
    expect(systemInstruction).toContain('|||');
  });

  it('includes literacy-aware context', async () => {
    mockSendMessage.mockResolvedValue({
      response: { text: () => 'Ok! ||| Continue.' },
    });

    await generateAIResponse('hi', 'en-US', 'fr-FR', 0, []);

    const systemInstruction = mockGetGenerativeModel.mock.calls[0][0].systemInstruction;
    expect(systemInstruction).toContain('illiterate');
    expect(systemInstruction).toContain('cannot read or write');
  });

  it('throws when Gemini returns empty text', async () => {
    mockSendMessage.mockResolvedValue({ response: { text: () => '' } });

    await expect(
      generateAIResponse('hello', 'en-US', 'fr-FR', 0, [])
    ).rejects.toThrow('Gemini returned no text response');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('generateBlobIntro', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns intro text', async () => {
    mockGenerateContent.mockResolvedValue({
      response: { text: () => 'Hi! I am LinguaBlob. Tap me to start!' },
    });

    const result = await generateBlobIntro('en-US', 'fr-FR');
    expect(result).toBe('Hi! I am LinguaBlob. Tap me to start!');
  });

  it('throws when Gemini returns empty intro', async () => {
    mockGenerateContent.mockResolvedValue({ response: { text: () => '' } });

    await expect(generateBlobIntro('en-US', 'fr-FR')).rejects.toThrow(
      'Gemini returned no intro text'
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('History Store — immersion level progression', () => {
  const device = 'immersion-test-device';

  beforeEach(() => clearHistory(device, 1));

  it('starts at immersion level 0', () => {
    expect(getImmersionLevel(device, 1)).toBe(0);
  });

  it('advances immersion level after 5 successful exchanges', () => {
    for (let i = 0; i < 5; i++) {
      appendToHistory(device, `user ${i}`, `model ${i}`, 1);
    }
    expect(getImmersionLevel(device, 1)).toBe(10);
  });

  it('advances again after another 5 exchanges', () => {
    for (let i = 0; i < 10; i++) {
      appendToHistory(device, `user ${i}`, `model ${i}`, 1);
    }
    expect(getImmersionLevel(device, 1)).toBe(20);
  });

  it('caps immersion level at 100', () => {
    for (let i = 0; i < 55; i++) {
      appendToHistory(device, `user ${i}`, `model ${i}`, 1);
    }
    expect(getImmersionLevel(device, 1)).toBe(100);
  });

  it('resets immersion when history is cleared', () => {
    for (let i = 0; i < 5; i++) {
      appendToHistory(device, `user ${i}`, `model ${i}`, 1);
    }
    clearHistory(device, 1);
    expect(getImmersionLevel(device, 1)).toBe(0);
  });

  it('tracks immersion independently per scenario', () => {
    for (let i = 0; i < 5; i++) {
      appendToHistory(device, `u${i}`, `m${i}`, 1);
    }
    expect(getImmersionLevel(device, 1)).toBe(10);
    expect(getImmersionLevel(device, 2)).toBe(0);
  });
});
