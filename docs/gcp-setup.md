# Google Cloud Platform Setup

## Required APIs

Enable these APIs in your GCP project:

1. **Cloud Speech-to-Text API**
2. **Cloud Translation API**
3. **Cloud Text-to-Speech API**

```bash
gcloud services enable speech.googleapis.com
gcloud services enable translate.googleapis.com
gcloud services enable texttospeech.googleapis.com
```

## Service Account

Create a service account with the following IAM roles:

| Role | Purpose |
|------|---------|
| `roles/speech.client` | Speech-to-Text recognition |
| `roles/cloudtranslate.user` | Translation API access |
| `roles/texttospeech.client` | Text-to-Speech synthesis |

```bash
# Create service account
gcloud iam service-accounts create linguablob \
  --display-name="LinguaBlob Backend"

# Assign roles
SA_EMAIL="linguablob@YOUR_PROJECT.iam.gserviceaccount.com"

gcloud projects add-iam-policy-binding YOUR_PROJECT \
  --member="serviceAccount:$SA_EMAIL" \
  --role="roles/speech.client"

gcloud projects add-iam-policy-binding YOUR_PROJECT \
  --member="serviceAccount:$SA_EMAIL" \
  --role="roles/cloudtranslate.user"

gcloud projects add-iam-policy-binding YOUR_PROJECT \
  --member="serviceAccount:$SA_EMAIL" \
  --role="roles/texttospeech.client"

# Download key
gcloud iam service-accounts keys create gcp-sa-key.json \
  --iam-account=$SA_EMAIL
```

## Local Development

Set in your `.env`:

```
GOOGLE_APPLICATION_CREDENTIALS=/path/to/gcp-sa-key.json
GOOGLE_CLOUD_PROJECT=your-project-id
```

## Docker / CI

Base64-encode the key and pass as an environment variable:

```bash
# Encode
cat gcp-sa-key.json | base64 -w 0 > gcp-sa-key.b64

# Set in .env or CI secrets
GCP_SA_KEY_BASE64=$(cat gcp-sa-key.b64)
```

The Docker entrypoint will decode it automatically.

## Validate

Run the validation script to check all 3 APIs:

```bash
npm run validate-gcp
```

Expected output:
```
Validating Google Cloud credentials...
  Project: your-project-id
  ✓ Speech-to-Text — OK
  ✓ Translation — OK
  ✓ Text-to-Speech — OK

All GCP APIs validated successfully!
```
