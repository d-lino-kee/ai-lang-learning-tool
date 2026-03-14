const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const SCENARIO_CONTEXTS = {
  everyday: "You are roleplaying a casual everyday conversation, as if two people just bumped into each other on the street.",
  restaurant: "You are roleplaying a restaurant scenario. You are a friendly server and the user is a customer ordering food and drinks.",
  directions: "You are roleplaying a directions scenario. The user is a tourist who is lost in a French city and you are a helpful local giving them directions.",
};

const SYSTEM_PROMPT = `You are Sophie, a warm and encouraging French language tutor having a spoken conversation with a beginner learner.

Your personality:
- Friendly, patient, and enthusiastic
- You speak mostly in English but naturally weave in French words and short French phrases
- You always explain what French words mean right after saying them
- When the user attempts French (even badly), you praise them warmly and gently correct or build on what they said
- You never make the user feel embarrassed for trying

Your speech rules (VERY IMPORTANT — this text will be spoken aloud):
- Keep responses short: 2-4 sentences max
- Never use bullet points, asterisks, markdown, or lists — plain spoken sentences only
- Never say things like "As an AI" or "I cannot"
- Do not repeat the same praise phrase twice in a row (vary it: "Bravo!", "Magnifique!", "Très bien!", "Super!", "Excellent!")

Teaching style:
- If the user speaks English, reply naturally in English with some French sprinkled in, and teach them the French equivalent of key words
- If the user attempts French (even just one word), enthusiastically praise them, then continue the conversation building on what they said
- If you do not understand what they said, ask them to try again in a friendly way and give them a hint phrase to attempt
- Always keep the conversation flowing naturally — do not quiz or lecture, just chat and teach through conversation`;

/**
 * In-memory conversation history per session.
 * Key: sessionId, Value: array of { role, parts } objects for Gemini
 */
const sessions = new Map();

/**
 * Generates a conversational reply using Gemini.
 *
 * @param {object} options
 * @param {string} options.sessionId     - unique ID for this conversation session
 * @param {string} options.scenario      - "everyday" | "restaurant" | "directions" | null
 * @param {string} options.userSaid      - transcribed user speech
 * @param {string} options.language      - detected language BCP-47 code e.g. "fr-FR"
 * @returns {Promise<string>}            - Sophie's reply (plain text, ready for TTS)
 */
async function generateReply({ sessionId, scenario, userSaid, language }) {
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, []);
  }
  const history = sessions.get(sessionId);

  const scenarioContext = scenario ? SCENARIO_CONTEXTS[scenario] : "";
  const langNote = language.startsWith("fr")
    ? "The user just spoke in French or attempted French."
    : "The user spoke in English.";

  const fullSystemInstruction = [SYSTEM_PROMPT, scenarioContext, langNote]
    .filter(Boolean)
    .join("\n\n");

  const chat = model.startChat({
    systemInstruction: { parts: [{ text: fullSystemInstruction }] },
    history,
  });

  const userMessage = userSaid || "(the user said nothing — gently prompt them to speak)";

  const result = await chat.sendMessage(userMessage);
  const raw = result.response.text();

  // Strip markdown formatting so TTS doesn't read "asterisk asterisk" etc.
  const reply = raw
    .replace(/\*\*(.*?)\*\*/g, "$1")  // **bold**
    .replace(/\*(.*?)\*/g, "$1")      // *italic*
    .replace(/`(.*?)`/g, "$1")        // `code`
    .replace(/#{1,6}\s/g, "")         // ## headings
    .replace(/[-*•]\s/g, "")          // bullet points
    .replace(/\n+/g, " ")             // newlines → space
    .trim();

  // Save turns to history so the conversation is continuous
  history.push({ role: "user", parts: [{ text: userMessage }] });
  history.push({ role: "model", parts: [{ text: reply }] });

  // Keep history to last 20 turns to avoid token overflow
  if (history.length > 40) {
    history.splice(0, 2);
  }

  console.log(`[LLM][${scenario ?? "intro"}][${language}] → "${reply}"`);
  return reply;
}

/**
 * Clears the conversation history for a session (e.g. on page reload).
 */
function clearSession(sessionId) {
  sessions.delete(sessionId);
}

module.exports = { generateReply, clearSession };
