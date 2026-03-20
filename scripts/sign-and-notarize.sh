#!/bin/bash
set -e

# This script handles code signing and notarization for macOS builds
# It expects the following environment variables:
# - APPLE_CERTIFICATE: Base64 encoded certificate
# - APPLE_CERTIFICATE_PASSWORD: Password for the certificate
# - APPLE_SIGNING_IDENTITY: The signing identity (e.g., "Developer ID Application: Company Name (TEAM_ID)")
# - APPLE_ID: Apple ID email
# - APPLE_PASSWORD: App-specific password for notarization
# - APPLE_TEAM_ID: Team ID
# - DMG_PATH: Path to the DMG file to sign

if [ -z "$DMG_PATH" ]; then
  echo "Error: DMG_PATH environment variable not set"
  exit 1
fi

if [ ! -f "$DMG_PATH" ]; then
  echo "Error: DMG file not found at $DMG_PATH"
  exit 1
fi

# Skip if credentials are not provided (local development)
if [ -z "$APPLE_CERTIFICATE" ] || [ -z "$APPLE_ID" ]; then
  echo "Skipping code signing and notarization (credentials not provided)"
  exit 0
fi

echo "Setting up code signing certificate..."

# Create temporary keychain
KEYCHAIN_PATH=$(mktemp -d)/build.keychain
KEYCHAIN_PASSWORD=$(openssl rand -base64 32)

security create-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN_PATH"
security default-keychain -s "$KEYCHAIN_PATH"
security unlock-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN_PATH"

# Import certificate
CERT_PATH=$(mktemp).p12
echo "$APPLE_CERTIFICATE" | base64 --decode > "$CERT_PATH"
security import "$CERT_PATH" -k "$KEYCHAIN_PATH" -P "$APPLE_CERTIFICATE_PASSWORD" -T /usr/bin/codesign

# Allow codesign to use the certificate without prompting
security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$KEYCHAIN_PASSWORD" "$KEYCHAIN_PATH"

echo "Notarizing application..."

# Submit for notarization
NOTARIZE_RESPONSE=$(xcrun notarytool submit "$DMG_PATH" \
  --apple-id "$APPLE_ID" \
  --password "$APPLE_PASSWORD" \
  --team-id "$APPLE_TEAM_ID" \
  --wait \
  --output-format json)

REQUEST_ID=$(echo "$NOTARIZE_RESPONSE" | jq -r '.id')
STATUS=$(echo "$NOTARIZE_RESPONSE" | jq -r '.status')

if [ "$STATUS" != "Accepted" ]; then
  echo "Notarization failed!"
  echo "$NOTARIZE_RESPONSE" | jq '.'
  exit 1
fi

echo "Notarization successful (Request ID: $REQUEST_ID)"

# Staple the notarization ticket
echo "Stapling notarization ticket..."
xcrun stapler staple "$DMG_PATH"

echo "Code signing and notarization complete!"

# Cleanup
rm -f "$CERT_PATH"
security delete-keychain "$KEYCHAIN_PATH"
