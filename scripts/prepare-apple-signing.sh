#!/usr/bin/env bash
# Source this before `tauri build` on macOS CI.
#
# Tauri errors if APPLE_SIGNING_IDENTITY is not a substring of the
# certificate imported from APPLE_CERTIFICATE. The identity secret in
# this repo does not match the uploaded cert, which fails the bundle
# step. We always prefer the identity embedded in the certificate.
#
# Notarization also requires a Developer ID Application certificate.
# Apple Development / Apple Distribution certs are rejected by Apple,
# so those credentials are cleared unless the cert can be notarized.

if [ -z "${APPLE_CERTIFICATE:-}" ]; then
  echo "No APPLE_CERTIFICATE set; building unsigned"
  return 0 2>/dev/null || exit 0
fi

CERT_PATH=$(mktemp).p12
cleanup_cert() {
  rm -f "$CERT_PATH"
}
trap cleanup_cert EXIT

if ! echo "$APPLE_CERTIFICATE" | base64 --decode > "$CERT_PATH"; then
  echo "Failed to decode APPLE_CERTIFICATE; building unsigned"
  unset APPLE_CERTIFICATE APPLE_CERTIFICATE_PASSWORD APPLE_SIGNING_IDENTITY
  unset APPLE_ID APPLE_PASSWORD APPLE_TEAM_ID
  return 0 2>/dev/null || exit 0
fi

extract_cn() {
  local pem=""
  pem=$(openssl pkcs12 -in "$CERT_PATH" -nokeys -passin "pass:${APPLE_CERTIFICATE_PASSWORD:-}" 2>/dev/null) \
    || pem=$(openssl pkcs12 -in "$CERT_PATH" -nokeys -legacy -passin "pass:${APPLE_CERTIFICATE_PASSWORD:-}" 2>/dev/null) \
    || return 1
  echo "$pem" | openssl x509 -noout -subject 2>/dev/null \
    | sed -E 's/.*CN=([^/,]+).*/\1/' \
    | sed 's/[[:space:]]*$//'
}

EXTRACTED_IDENTITY=$(extract_cn || true)

if [ -n "$EXTRACTED_IDENTITY" ]; then
  echo "Using signing identity from certificate: $EXTRACTED_IDENTITY"
  export APPLE_SIGNING_IDENTITY="$EXTRACTED_IDENTITY"
else
  echo "Could not read identity from certificate; letting Tauri infer it"
  unset APPLE_SIGNING_IDENTITY
fi

if [[ "${APPLE_SIGNING_IDENTITY:-}" != Developer\ ID\ Application:* ]]; then
  echo "Certificate is not Developer ID Application; signing only (skipping notarization)"
  unset APPLE_ID APPLE_PASSWORD APPLE_TEAM_ID
fi
