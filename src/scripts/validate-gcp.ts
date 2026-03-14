// ═══════════════════════════════════════════════════════════════════
//  GCP Credential Validation
//  Checks that all 3 required APIs are accessible.
//  Usage: npm run validate-gcp
// ═══════════════════════════════════════════════════════════════════

import dotenv from "dotenv";
dotenv.config();

async function validate() {
  console.log("Validating Google Cloud credentials...\n");

  const project = process.env.GOOGLE_CLOUD_PROJECT;
  if (!project) {
    console.error("✗ GOOGLE_CLOUD_PROJECT not set in .env");
    process.exit(1);
  }
  console.log(`  Project: ${project}`);

  // Handle base64-encoded service account (Docker/CI)
  if (process.env.GCP_SA_KEY_BASE64 && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    const fs = await import("fs");
    const path = "/tmp/gcp-sa-key.json";
    fs.writeFileSync(path, Buffer.from(process.env.GCP_SA_KEY_BASE64, "base64"));
    process.env.GOOGLE_APPLICATION_CREDENTIALS = path;
    console.log("  Using base64-decoded service account key\n");
  }

  const checks = [
    {
      name: "Speech-to-Text",
      test: async () => {
        const { SpeechClient } = await import("@google-cloud/speech");
        const client = new SpeechClient();
        // A lightweight call just to check auth
        await client.initialize();
        return true;
      },
      requiredRole: "roles/speech.client",
    },
    {
      name: "Translation",
      test: async () => {
        const { TranslationServiceClient } = await import("@google-cloud/translate");
        const client = new TranslationServiceClient();
        await client.initialize();
        return true;
      },
      requiredRole: "roles/cloudtranslate.user",
    },
    {
      name: "Text-to-Speech",
      test: async () => {
        const { TextToSpeechClient } = await import("@google-cloud/text-to-speech");
        const client = new TextToSpeechClient();
        await client.initialize();
        return true;
      },
      requiredRole: "roles/texttospeech.client",
    },
  ];

  let allPassed = true;

  for (const check of checks) {
    try {
      await check.test();
      console.log(`  ✓ ${check.name} — OK`);
    } catch (err: any) {
      allPassed = false;
      console.error(`  ✗ ${check.name} — FAILED`);
      console.error(`    Error: ${err.message}`);
      console.error(`    Required IAM role: ${check.requiredRole}`);
    }
  }

  console.log("");
  if (allPassed) {
    console.log("All GCP APIs validated successfully!");
  } else {
    console.error("Some API checks failed. Ensure your service account has:");
    checks.forEach((c) => console.error(`  - ${c.requiredRole}`));
    console.error("\nSee docs/gcp-setup.md for setup instructions.");
    process.exit(1);
  }
}

validate();
