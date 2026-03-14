#!/bin/sh
# Decode base64 GCP service account key if provided
if [ -n "$GCP_SA_KEY_BASE64" ] && [ -z "$GOOGLE_APPLICATION_CREDENTIALS" ]; then
  echo "$GCP_SA_KEY_BASE64" | base64 -d > /tmp/gcp-sa-key.json
  export GOOGLE_APPLICATION_CREDENTIALS=/tmp/gcp-sa-key.json
  echo "GCP credentials decoded from GCP_SA_KEY_BASE64"
fi

exec "$@"
