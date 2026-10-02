Signed Android release: instructions and helper script

This project includes a helper PowerShell script to build a signed Android release APK.

Files added:
 - scripts\build-android-release.ps1  -> PowerShell script that writes android/keystore.properties and runs Gradle assembleRelease
 - README_ANDROID_RELEASE.md         -> this file
 - app_exec_pin.js                   -> client-side executive panel PIN helper (see below)

Important: DO NOT CHECK IN YOUR keystore or passwords. The script writes android/keystore.properties locally — ensure this file is ignored and removed after use.

Quick steps (local machine):
1. Place your keystore somewhere safe, e.g. C:\keystores\release-keystore.p12
2. Export environment variables or leave blank to be prompted by the script:
   - ANDROID_KEYSTORE_PATH
   - ANDROID_KEYSTORE_PASSWORD
   - ANDROID_KEY_ALIAS
   - ANDROID_KEY_PASSWORD

3. From the repo root (PowerShell):
   .\scripts\build-android-release.ps1

4. On success, APK is at: android\app\build\outputs\apk\release\app-release.apk
   Use adb to install on a device for testing:
   adb install -r android\app\build\outputs\apk\release\app-release.apk

Notes about signing config and Gradle
- This script writes android/keystore.properties in the android/ directory using the keys storeFile, storePassword, keyAlias and keyPassword. The android/app/build.gradle should be configured to read this file (common pattern). If your project uses a different signing setup, adapt the script to write the appropriate file or set environment variables in your CI.
- Never store secrets in the repository. Use CI secret variables or a secure key store.

app_exec_pin.js — Executive PIN lock (front-end)
- To enable PIN-based locking for the executive panel, include the script in index.html after app.js and app_utils.js, for example:
    <script src="app_utils.js"></script>
    <script src="app.js"></script>
    <script src="app_exec_pin.js"></script>

- Usage:
  - If the company settings form includes an input with id="setting-executive_pin" (and optional confirm field id="setting-executive_pin_confirm") the helper exposes a button hook with id="save-executive-pin-btn" to persist a PIN.
  - The script stores a SHA-256 hex hash of the PIN in state.companySettings.executive_pin_hash and in localStorage (as fallback). It will also attempt to call saveCompanySettings() if available to persist to server.
  - When the executive panel is opened, the script prompts for the PIN and verifies it by hashing.

Security caveats:
- This is a client-side protection: a determined attacker with access to the device or the app bundle can bypass it. For high-security scenarios, implement server-side verification (e.g., require the executive PIN as an additional factor on sensitive API endpoints).
- The script uses Web Crypto API (SHA-256) to avoid storing cleartext PINs.

If you want, the helper can be extended to:
- Force server-side validation by sending the entered PIN to a server endpoint that validates it against a securely stored hash (recommended for production).
- Add retry limits, lockouts, or OTP fallback.

If you want this integrated automatically into index.html, confirm and I will update index.html to include the app_exec_pin.js script tag and add the input fields and button into the settings form.
