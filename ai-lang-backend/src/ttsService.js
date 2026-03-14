const textToSpeech = require("@google-cloud/text-to-speech");

const client = new textToSpeech.TextToSpeechClient();

/**
 * Known French words/phrases used in our replies.
 * Sorted longest-first so multi-word phrases are matched before single words.
 * These get wrapped in <lang xml:lang="fr-FR"> so the French Neural2 voice
 * pronounces them with full native French phonology.
 */
const FRENCH_PHRASES = [
  // Multi-word phrases first
  "comment allez-vous", "comment ça va", "comment ca va",
  "s'il vous plaît", "s'il vous plait",
  "merci beaucoup", "de rien",
  "je vais très bien", "je vais bien",
  "je voudrais", "je m'appelle", "je ne comprends pas", "je n'ai pas compris",
  "où voulez-vous aller", "ou voulez-vous aller",
  "qu'est-ce que vous voulez",
  "c'est délicieux", "c'est delicieux",
  "bien sûr", "bien sur",
  "pas loin", "près d'ici", "pres d'ici",
  "juste en face", "devant vous", "tout droit",
  "à droite", "a droite", "à gauche", "a gauche",
  "au revoir", "à bientôt", "a bientot",
  "bonne nuit", "bonne tentative",
  "au coin", "à pied", "a pied",
  "plat du jour",
  "de l'eau", "eau gazeuse", "eau plate",
  "un café", "un thé", "du pain",
  "la carte", "l'addition", "le menu",
  "je vous recommande",
  "la gare", "le musée", "le musee", "la pharmacie", "l'hôtel", "l'hotel",
  "comment y aller",
  "excellent choix",
  "très bien", "tres bien",
  "pas mal",
  // Single words
  "bonjour", "bonsoir", "salut", "enchanté", "enchante",
  "bienvenue", "merci", "voilà", "voila",
  "oui", "non", "magnifique", "parfait", "bravo",
  "continuez", "intéressant", "interessant",
  "délicieux", "delicieux", "super",
];

/**
 * Escapes XML special characters for SSML.
 */
function escapeXml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Wraps English explanation segments in <lang xml:lang="en-US"> so the
 * French base voice pronounces them with clearer English phonology.
 *
 * French phrases are left unwrapped — the fr-FR-Neural2 voice pronounces
 * them natively with zero extra hints needed.
 *
 * @param {string} text - plain mixed-language text
 * @returns {string} SSML
 */
function buildSsml(text) {
  const pattern = FRENCH_PHRASES
    .map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
  const regex = new RegExp(`(${pattern})`, "gi");

  const parts = text.split(regex);
  const ssmlBody = parts
    .map((part) => {
      const isFrench = regex.test(part);
      regex.lastIndex = 0;
      if (isFrench) {
        // Native French voice — no tag needed, it will pronounce it perfectly
        return escapeXml(part);
      }
      // Wrap English segments so the French voice sounds clearer on English words
      return `<lang xml:lang="en-US">${escapeXml(part)}</lang>`;
    })
    .join("");

  return `<speak>${ssmlBody}</speak>`;
}

/**
 * Synthesises text into MP3 audio using Google Cloud TTS.
 *
 * Uses fr-FR-Neural2-E — a native French female voice (Sophie).
 * English explanation segments are wrapped in <lang xml:lang="en-US">
 * for clearer pronunciation, while French words are spoken natively.
 *
 * @param {string} text - plain text (may contain French words)
 * @returns {Promise<Buffer>} MP3 audio bytes
 */
async function synthesise(text) {
  const ssml = buildSsml(text);

  const [response] = await client.synthesizeSpeech({
    input: { ssml },
    voice: {
      languageCode: "fr-FR",
      name: "fr-FR-Neural2-E", // Natural French female voice
      ssmlGender: "FEMALE",
    },
    audioConfig: {
      audioEncoding: "MP3",
      speakingRate: 0.90, // A touch slower so learners can follow
      pitch: 1.0,
    },
  });

  return response.audioContent;
}

module.exports = { synthesise };
