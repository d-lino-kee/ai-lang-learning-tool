const mockSendMessage = jest.fn();
const mockStartChat = jest.fn(() => ({ sendMessage: mockSendMessage }));
const mockGetGenerativeModel = jest.fn(() => ({ startChat: mockStartChat, generateContent: jest.fn().mockResolvedValue({ response: { text: () => 'Welcome!' } }) }));

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

import { generateAIResponse, generateBlobIntro, ConversationMessage } from '../ai/conversation.ai';
import { getHistory, appendToHistory, clearHistory, getImmersionLevel } from '../ai/history.store';

// ─────────────────────────────────────────────────────────────────────────────
describe('generateAIResponse — immersion levels', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns AI text on happy path', async () => {
    mockSendMessage.mockResolvedValue({
      response: { text: () => 'Bonjour! Comment puis-je vous aider?' },
    });

    const result = await generateAIResponse('Hello', 'en-US', 'fr-FR', 0, [], 1);
    expect(result).toBe('Bonjour! Comment puis-je vous aider?');
  });

  it('includes immersion level 0 instruction — native language only', async () => {
    mockSendMessage.mockResolvedValue({ response: { text: () => 'Hello!' } });

    await generateAIResponse('Hi', 'en-US', 'fr-FR', 0, []);

    const systemInstruction = mockGetGenerativeModel.mock.calls[0][0].systemInstruction;
    expect(systemInstruction).toContain('ENTIRELY in English');
    expect(systemInstruction).toContain('Do not use any French');
  });

  it('includes immersion level 50 instruction — mixed languages', async () => {
    mockSendMessage.mockResolvedValue({ response: { text: () => 'Half and half!' } });

    await generateAIResponse('Hi', 'en-US', 'fr-FR', 50, []);

    const systemInstruction = mockGetGenerativeModel.mock.calls[0][0].systemInstruction;
    expect(systemInstruction).toContain('half');
  });

  it('includes immersion level 100 instruction — target language only', async () => {
    mockSendMessage.mockResolvedValue({ response: { text: () => 'Bonjour!' } });

    await generateAIResponse('Hi', 'en-US', 'fr-FR', 100, []);

    const systemInstruction = mockGetGenerativeModel.mock.calls[0][0].systemInstruction;
    expect(systemInstruction).toContain('ENTIRELY in French');
  });

  it('includes literacy-aware context in all prompts', async () => {
    mockSendMessage.mockResolvedValue({ response: { text: () => 'Ok!' } });

    await generateAIResponse('Hi', 'en-US', 'fr-FR', 0, []);

    const systemInstruction = mockGetGenerativeModel.mock.calls[0][0].systemInstruction;
    expect(systemInstruction).toContain('illiterate');
    expect(systemInstruction).toContain('cannot read or write');
  });

  it('throws when Gemini returns empty text', async () => {
    mockSendMessage.mockResolvedValue({ response: { text: () => '' } });

    await expect(
      generateAIResponse('Hello', 'en-US', 'fr-FR', 0, [])
    ).rejects.toThrow('Gemini returned no text response');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('generateBlobIntro', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns intro text for the blob', async () => {
    mockGetGenerativeModel.mockReturnValue({
      startChat: mockStartChat,
      generateContent: jest.fn().mockResolvedValue({
        response: { text: () => 'Hi! I am LinguaBlob. Tap me to start learning!' },
      }),
    });

    const result = await generateBlobIntro('en-US', 'fr-FR');
    expect(result).toBe('Hi! I am LinguaBlob. Tap me to start learning!');
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
    // 55 exchanges = 11 level-ups × 10 = 110 → capped at 100
    for (let i = 0; i < 55; i++) {
      appendToHistory(device, `user ${i}`, `model ${i}`, 1);
    }
    expect(getImmersionLevel(device, 1)).toBe(100);
  });

  it('resets immersion level when history is cleared', () => {
    for (let i = 0; i < 5; i++) {
      appendToHistory(device, `user ${i}`, `model ${i}`, 1);
    }
    expect(getImmersionLevel(device, 1)).toBe(10);

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
