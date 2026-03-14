const speech = require("@google-cloud/speech");

const client = new speech.SpeechClient();

/**
 * Transcribes a complete audio buffer using Google Cloud Speech-to-Text.
 *
 * Optimised for a French-learning app where users speak:
 *   - English only
 *   - French only (including imperfect/learner French)
 *   - A mix of both (code-switching)
 *
 * fr-FR is the primary language so Google's acoustic model is biased
 * toward French phonology — this dramatically improves recognition of
 * learner French attempts even when pronunciation is imperfect.
 * English is listed as an alternative so English words are still caught.
 *
 * @param {Buffer} audioBuffer - raw audio bytes
 * @param {string} mimeType    - e.g. "audio/webm;codecs=opus"
 * @returns {Promise<{ transcript: string, language: string }>}
 */
async function transcribe(audioBuffer, mimeType = "audio/webm") {
  let encoding = "WEBM_OPUS";
  if (mimeType.startsWith("audio/ogg")) encoding = "OGG_OPUS";

  const [response] = await client.recognize({
    config: {
      encoding,
      // fr-FR is PRIMARY — biases recognition toward French phonology.
      // This is the single biggest improvement for learner French recognition.
      languageCode: "fr-FR",
      alternativeLanguageCodes: [
        "fr-CA",  // Canadian French (similar phonology, helps with some sounds)
        "en-US",  // Catches English words in mixed sentences
        "en-GB",  // Additional English fallback
      ],
      // latest_long handles code-switching (mixed languages) better than latest_short
      model: "latest_long",
      // Enhanced model gives the best possible accuracy
      useEnhanced: true,
      enableAutomaticPunctuation: true,
      // Optimised for short conversational phrases (typical in language learning)
      speechContexts: [
        {
          phrases: [
            // Common French phrases learners attempt — giving these as hints
            // boosts recognition when pronunciation is imperfect
            "bonjour", "bonsoir", "salut", "au revoir", "à bientôt",
            "merci", "merci beaucoup", "de rien", "s'il vous plaît",
            "oui", "non", "peut-être",
            "comment allez-vous", "comment ça va", "ça va",
            "je m'appelle", "je voudrais", "je ne sais pas",
            "je ne comprends pas", "pouvez-vous répéter",
            "où est", "où se trouve", "comment aller",
            "la gare", "le musée", "la pharmacie", "l'hôtel",
            "à droite", "à gauche", "tout droit",
            "un café", "un thé", "de l'eau", "l'addition",
            "c'est délicieux", "c'est combien",
            "excusez-moi", "pardon",
            "bien sûr", "d'accord", "voilà",
            "je suis", "nous sommes",
            // English words commonly mixed in
            "hello", "yes", "no", "please", "thank you",
            "excuse me", "where is", "how much",
          ],
          boost: 15, // Strong boost — helps Google commit to these over similar-sounding English
        },
      ],
    },
    audio: {
      content: audioBuffer.toString("base64"),
    },
  });

  const results = response.results ?? [];

  const transcript = results
    .map((r) => r.alternatives?.[0]?.transcript ?? "")
    .filter(Boolean)
    .join(" ")
    .trim();

  const language = results[0]?.languageCode || "fr-FR";

  console.log(`[STT] lang: ${language} | transcript: "${transcript}"`);

  return { transcript, language };
}

module.exports = { transcribe };
