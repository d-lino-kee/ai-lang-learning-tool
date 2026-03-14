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

// ── AI response with separated feedback and reply ─────────────────────────────
// feedback = what the AI says about what the user just said
// reply    = the conversational continuation
// Both are kept separate so Engineer A can animate the Blob differently
// during feedback (e.g. a "thinking" expression) vs during the reply
export interface AIResponseResult {
  feedback: string;
  reply: string;
  fullText: string; // feedback + reply joined — used for TTS and history
  hadTargetLanguage: boolean; // true if the user attempted the target language
}

// ─────────────────────────────────────────────────────────────────────────────
// Feedback instruction builder
//
// Controls how the AI gives feedback based on the immersion level.
// At low levels feedback is simple English encouragement.
// At high levels feedback is in the target language itself.
// ─────────────────────────────────────────────────────────────────────────────
function buildFeedbackInstruction(
  nativeLang: string,
  targetLang: string,
  level: ImmersionLevel
): string {
  if (level === 0) {
    // No target language expected yet — just acknowledge warmly
    return `FEEDBACK RULE:
The user is not expected to speak any ${targetLang} yet.
If they tried anyway, say "Wonderful try!" in ${nativeLang} and gently model the correct phrase.
Otherwise just acknowledge what they said warmly in ${nativeLang} and continue.
Keep feedback to one short sentence.`;
  }

  if (level <= 20) {
    return `FEEDBACK RULE:
The user may attempt simple ${targetLang} words or phrases.
If they used any ${targetLang}, acknowledge it warmly in ${nativeLang} — for example:
"Great job saying [what they said]!" or "Almost! The correct way is [correction]."
If the phrase was wrong, say the correct version clearly once so they can hear it.
Keep feedback to one short sentence in ${nativeLang}.`;
  }

  if (level <= 40) {
    return `FEEDBACK RULE:
The user should be attempting short ${targetLang} phrases by now.
Always open with one sentence of feedback in ${nativeLang} about what they said:
- If correct: "Perfect! [repeat their phrase back]" 
- If close: "Almost! Say [correct version] — [correct version]."
- If in ${nativeLang} only: Gently encourage them to try in ${targetLang}.
Then continue the conversation.`;
  }

  if (level <= 60) {
    return `FEEDBACK RULE:
The user should now be speaking mostly in ${targetLang}.
Open with feedback that is half ${nativeLang} and half ${targetLang}:
- If correct: Confirm in ${targetLang} then add a short English encouragement.
- If there was a grammar mistake: Say the corrected phrase in ${targetLang} twice 
  clearly, then briefly explain what was wrong in ${nativeLang} in one sentence.
- If they spoke ${nativeLang}: Remind them in ${targetLang} to keep trying.
Keep feedback to 1-2 sentences before continuing.`;
  }

  if (level <= 80) {
    return `FEEDBACK RULE:
Give all feedback in ${targetLang} with only brief ${nativeLang} support if needed.
- If correct: Confirm enthusiastically in ${targetLang}.
- If there was a grammar or vocabulary mistake: Say "Presque!" (Almost!) then 
  model the correct phrase in ${targetLang} clearly twice.
- Only use ${nativeLang} if the correction would be impossible to understand otherwise.
Keep feedback to 1-2 sentences.`;
  }

  // level 90–100
  return `FEEDBACK RULE:
Give ALL feedback entirely in ${targetLang}. No ${nativeLang} at all.
- If correct: Confirm with enthusiasm in ${targetLang}.
- If there was any mistake: Say "Presque!" then model the correct phrase 
  clearly twice in ${targetLang} so the user hears the right version.
- Be warm and encouraging — the user has come a long way.
Keep feedback to 1-2 sentences before continuing the conversation.`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Immersion level instruction builder
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
    return `LANGUAGE RULE: Respond mostly in ${nativeLang} (about ${100 - level}%).
Sprinkle in 1-2 simple ${targetLang} words or a very short phrase, then immediately
say the same thing in ${nativeLang} so the user understands.`;
  }
  if (level <= 40) {
    return `LANGUAGE RULE: Mix ${nativeLang} and ${targetLang} roughly ${100 - level}/${level}.
Use simple ${targetLang} phrases for key parts of your response, supported with ${nativeLang}.
Always say a new ${targetLang} phrase in ${nativeLang} right after.`;
  }
  if (level <= 60) {
    return `LANGUAGE RULE: About half ${nativeLang} and half ${targetLang}.
Use ${targetLang} for the main content and ${nativeLang} for encouragement and clarification.`;
  }
  if (level <= 80) {
    return `LANGUAGE RULE: Respond mostly in ${targetLang} (about ${level}%).
Use ${nativeLang} only to clarify confusion or offer encouragement.`;
  }
  if (level < 100) {
    return `LANGUAGE RULE: Respond almost entirely in ${targetLang}.
Only use ${nativeLang} if the user is clearly stuck or asks for help directly.`;
  }
  return `LANGUAGE RULE: Respond ENTIRELY in ${targetLang}.
Do not use any ${nativeLang}. The user is ready for full immersion.`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main AI response function — now returns separated feedback + reply
// ─────────────────────────────────────────────────────────────────────────────
export async function generateAIResponse(
  userText: string,
  nativeLanguage: SupportedLanguage,
  targetLanguage: SupportedLanguage,
  immersionLevel: ImmersionLevel,
  conversationHistory: ConversationMessage[],
  scenarioId?: number
): Promise<AIResponseResult> {
  const nativeLangName = LANGUAGE_NAMES[nativeLanguage];
  const targetLangName = LANGUAGE_NAMES[targetLanguage];
  const scenarioPrompt = scenarioId
    ? SCENARIO_PROMPTS[scenarioId] ?? DEFAULT_PROMPT
    : DEFAULT_PROMPT;

  const feedbackInstruction = buildFeedbackInstruction(
    nativeLangName,
    targetLangName,
    immersionLevel
  );

  const immersionInstruction = buildImmersionInstruction(
    nativeLangName,
    targetLangName,
    immersionLevel
  );

  // Detect whether the user attempted the target language
  // so the pipeline knows whether feedback is relevant
  const hadTargetLanguage = detectTargetLanguageAttempt(userText, targetLanguage);

  const systemPrompt = `${scenarioPrompt}

IMPORTANT CONTEXT:
- This app is for users who are illiterate in their own language.
- The user cannot read or write — all communication is spoken and visual only.
- Never reference text, writing, spelling, or reading in your responses.
- The user's native language is ${nativeLangName}. They are learning ${targetLangName}.
- The user's message has been transcribed from speech — be forgiving of transcription errors.
- Do not use bullet points, numbered lists, or any formatting.
- Be warm, patient, and celebratory of any progress.

${feedbackInstruction}

${immersionInstruction}

RESPONSE FORMAT:
Your response MUST follow this exact structure — two parts separated by the marker "|||":

[Your feedback on what the user just said] ||| [Your conversational reply continuing the scenario]

Example at low immersion:
"Great job! You said bonjour perfectly! ||| Now, can you tell me your name?"

Example at high immersion:
"Presque! Say je m'appelle, not je suis appelle. Je m'appelle. ||| Très bien, continuons. Quel est votre expérience?"

The feedback part comes FIRST, then |||, then the reply.
Keep the total response to 3-4 sentences across both parts.
Never include the ||| marker more than once.`;

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
      maxOutputTokens: 300,
      temperature: 0.7,
      topP: 0.9,
    },
  });

  const recentHistory = conversationHistory.slice(-10);
  const chat = model.startChat({ history: recentHistory });
  const result = await chat.sendMessage(userText);
  const rawText = result.response.text().trim();

  if (!rawText) throw new Error('Gemini returned no text response');

  // Split on the ||| separator
  const parts = rawText.split('|||');

  const feedback = parts[0]?.trim() ?? rawText;
  const reply = parts[1]?.trim() ?? '';

  // Join with a natural pause beat between feedback and reply for TTS
  const fullText = reply ? `${feedback} ${reply}` : feedback;

  return { feedback, reply, fullText, hadTargetLanguage };
}

// ─────────────────────────────────────────────────────────────────────────────
// Simple heuristic to detect if the user attempted the target language.
// Used by the pipeline to decide whether to generate separate feedback audio.
// ─────────────────────────────────────────────────────────────────────────────
function detectTargetLanguageAttempt(
  text: string,
  targetLanguage: SupportedLanguage
): boolean {
  // French-specific common words and characters
  if (targetLanguage === 'fr-FR') {
    const frenchIndicators = /\b(bonjour|merci|oui|non|je|tu|il|elle|nous|vous|un|une|le|la|les|de|du|au|avec|pour|dans|est|sont|avoir|être|vouloir|pouvoir|aller)\b/i;
    const frenchChars = /[àâäéèêëîïôùûüÿçœæ]/i;
    return frenchIndicators.test(text) || frenchChars.test(text);
  }
  if (targetLanguage === 'es-ES') {
    const spanishIndicators = /\b(hola|gracias|sí|no|yo|tú|él|ella|nosotros|un|una|el|la|los|las|de|con|para|en|es|son|tener|ser|ir|querer)\b/i;
    const spanishChars = /[áéíóúüñ¿¡]/i;
    return spanishIndicators.test(text) || spanishChars.test(text);
  }
  // Default: assume they attempted it if the text is short (likely a word or phrase)
  return text.split(' ').length <= 6;
}

// ─────────────────────────────────────────────────────────────────────────────
// Blob intro message
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
