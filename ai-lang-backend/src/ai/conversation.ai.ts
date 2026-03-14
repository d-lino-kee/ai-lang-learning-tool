import {
  GoogleGenerativeAI,
  HarmCategory,
  HarmBlockThreshold,
} from '@google/generative-ai';
import { SupportedLanguage, ImmersionLevel } from '../types';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

// ── Language display names for prompts ────────────────────────────────────────
const LANGUAGE_NAMES: Record<SupportedLanguage, string> = {
  'en-US': 'English',
  'fr-FR': 'French',
  'es-ES': 'Spanish',
  'ar-SA': 'Arabic',
  'pt-BR': 'Portuguese',
};

// ── Scenario system prompts ───────────────────────────────────────────────────
const SCENARIO_PROMPTS: Record<number, string> = {
  1: `You are a professional HR manager conducting a job interview or helping someone
      with a job application. Guide the user through common job application scenarios
      such as introducing themselves, discussing their experience, and answering
      interview questions. Use formal, professional language.`,

  2: `You are a helpful doctor's receptionist or medical professional. Help the user
      practise common medical appointment scenarios such as describing symptoms,
      booking appointments, and understanding medical instructions. Use clear, simple
      language and be patient and reassuring.`,

  3: `You are a friendly local resident helping someone navigate everyday situations
      such as shopping, asking for directions, ordering food, or casual conversation.
      Use natural, common everyday language and phrases.`,
};

// ── Default prompt for the Blob home screen ───────────────────────────────────
const DEFAULT_PROMPT = `You are LinguaBlob, a friendly and encouraging language learning
assistant built into a visual app for users who cannot read or write. You help people
learn new languages through natural spoken conversation only. Be warm, patient,
and supportive. Celebrate small wins. Keep your responses concise — they will be
spoken aloud, so avoid anything that sounds like a list or written instructions.`;

// ── Conversation history type ─────────────────────────────────────────────────
export interface ConversationMessage {
  role: 'user' | 'model';
  parts: [{ text: string }];
}

// ─────────────────────────────────────────────────────────────────────────────
// Immersion level instruction builder
//
// This is the core of the gradual language transition mechanic.
// At immersion 0 the AI speaks entirely in the user's native language.
// As immersion increases, the AI gradually mixes in the target language
// until at 100 it speaks entirely in the target language.
// ─────────────────────────────────────────────────────────────────────────────
function buildImmersionInstruction(
  nativeLang: string,
  targetLang: string,
  level: ImmersionLevel
): string {
  if (level === 0) {
    return `LANGUAGE RULE: Respond ENTIRELY in ${nativeLang}. 
Do not use any ${targetLang} yet. The user is just getting started.`;
  }

  if (level <= 20) {
    return `LANGUAGE RULE: Respond mostly in ${nativeLang} (about ${100 - level}% of your response).
Sprinkle in 1-2 simple ${targetLang} words or a very short phrase, then immediately 
say the same thing in ${nativeLang} so the user understands.
Example pattern: "That is great! In ${targetLang} we say [simple word]. [Repeat in ${nativeLang}]."`;
  }

  if (level <= 40) {
    return `LANGUAGE RULE: Mix ${nativeLang} and ${targetLang} roughly ${100 - level}/${level}.
Use simple ${targetLang} phrases for key parts of your response, and support them 
with ${nativeLang} context so the user follows along.
Always say a new ${targetLang} phrase in ${nativeLang} right after to confirm understanding.`;
  }

  if (level <= 60) {
    return `LANGUAGE RULE: Your response should be about half ${nativeLang} and half ${targetLang}.
Use ${targetLang} for the main content and ${nativeLang} for encouragement and clarification.
If you introduce a new word or phrase in ${targetLang}, briefly explain it in ${nativeLang}.`;
  }

  if (level <= 80) {
    return `LANGUAGE RULE: Respond mostly in ${targetLang} (about ${level}% of your response).
Use ${nativeLang} only to clarify something the user seems confused about, or to 
offer encouragement. The user is doing well — push them to use ${targetLang} more.`;
  }

  if (level < 100) {
    return `LANGUAGE RULE: Respond almost entirely in ${targetLang}.
Only use ${nativeLang} if the user is clearly stuck or asks for help directly.
Otherwise stay in ${targetLang} and gently encourage the user to keep going.`;
  }

  // level === 100
  return `LANGUAGE RULE: Respond ENTIRELY in ${targetLang}. 
Do not use any ${nativeLang}. The user is ready for full immersion.
If they struggle, respond with a simple encouraging phrase in ${targetLang} only.`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main AI response function
// ─────────────────────────────────────────────────────────────────────────────
export async function generateAIResponse(
  userText: string,
  nativeLanguage: SupportedLanguage,
  targetLanguage: SupportedLanguage,
  immersionLevel: ImmersionLevel,
  conversationHistory: ConversationMessage[],
  scenarioId?: number
): Promise<string> {
  const nativeLangName = LANGUAGE_NAMES[nativeLanguage];
  const targetLangName = LANGUAGE_NAMES[targetLanguage];
  const scenarioPrompt = scenarioId
    ? SCENARIO_PROMPTS[scenarioId] ?? DEFAULT_PROMPT
    : DEFAULT_PROMPT;

  const immersionInstruction = buildImmersionInstruction(
    nativeLangName,
    targetLangName,
    immersionLevel
  );

  const systemPrompt = `${scenarioPrompt}

IMPORTANT CONTEXT:
- This app is designed for users who are illiterate in their own language.
- The user cannot read or write — all communication is spoken and visual only.
- Never reference text, writing, spelling, or reading in your responses.
- The user's native language is ${nativeLangName}. They are learning ${targetLangName}.
- The user's message has been transcribed from speech — be forgiving of errors.
- Keep responses to 2-4 short sentences — they will be spoken aloud.
- Do not use bullet points, numbered lists, or any formatting.
- Be warm, patient, and celebratory of any progress.

${immersionInstruction}`;

  const model = genAI.getGenerativeModel({
    model: 'gemini-1.5-flash',
    systemInstruction: systemPrompt,
    safetySettings: [
      {
        category: HarmCategory.HARM_CATEGORY_HARASSMENT,
        threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
      },
      {
        category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
        threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
      },
    ],
    generationConfig: {
      maxOutputTokens: 256,
      temperature: 0.7,
      topP: 0.9,
    },
  });

  const recentHistory = conversationHistory.slice(-10);
  const chat = model.startChat({ history: recentHistory });
  const result = await chat.sendMessage(userText);
  const text = result.response.text();

  if (!text) throw new Error('Gemini returned no text response');

  return text.trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// Blob intro message — called once when the app first loads on a new device.
// Speaks entirely in the user's native language to explain how the app works.
// ─────────────────────────────────────────────────────────────────────────────
export async function generateBlobIntro(
  nativeLanguage: SupportedLanguage,
  targetLanguage: SupportedLanguage
): Promise<string> {
  const nativeLangName = LANGUAGE_NAMES[nativeLanguage];
  const targetLangName = LANGUAGE_NAMES[targetLanguage];

  const model = genAI.getGenerativeModel({
    model: 'gemini-1.5-flash',
    generationConfig: { maxOutputTokens: 150, temperature: 0.5 },
  });

  const prompt = `You are LinguaBlob, a friendly language learning assistant in a 
visual app for people who cannot read or write. 

Introduce yourself in ${nativeLangName} ONLY. Tell the user:
- You are here to help them learn ${targetLangName}
- They just need to tap the blob and speak
- You will start by talking to them in ${nativeLangName} and slowly teach them ${targetLangName}
- They can pick a scenario card (job, doctor, everyday) or just chat

Keep it to 3 short spoken sentences. Warm, simple, encouraging. No text references.`;

  const result = await model.generateContent(prompt);
  const text = result.response.text();

  if (!text) throw new Error('Gemini returned no intro text');

  return text.trim();
}
