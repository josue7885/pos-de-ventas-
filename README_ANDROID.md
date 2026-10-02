Android build & install guide (Windows)

This README explains how to build and install the Android app produced by the Capacitor + Electron POS project on Windows. It assumes the project root is the folder that contains this README and the "android" Capacitor project.

Prerequisites
- Node.js 18.x (project tested on Node 18)
- npm (comes with Node)
- Java JDK 11+ installed and JAVA_HOME set
- Android SDK & Android Studio installed
- Android SDK platform-tools (adb) in PATH
- Gradle wrapper is included in android/ (Android Studio created it)
- Capacitor and CLI are installed locally (npx cap commands are used)

Quick steps (debug APK)
1. From project root open PowerShell (Run as Administrator if you have permission issues).
2. Sync web assets into the native project and build:
   .\scripts\build-android-debug.ps1

3. Install the resulting APK to an emulator or device (emulator must be running):
   .\scripts\install-android-debug.ps1

4. Alternatively open Android Studio to inspect and produce signed builds:
   .\scripts\open-android-studio.ps1
   - In Android Studio choose Build -> Generate Signed Bundle / APK to create a signed release.

Notes and production signing
- For production release you must create an Android keystore and sign the app. Use Android Studio "Generate Signed Bundle / APK" and provide the keystore and passwords.
- Do NOT commit keystore or passwords to source control. Keep them in a secure place or use CI secret storage.

Server URL and configuration
- The Android app is a web wrapper and needs to connect to the local POS server when running on a device. If building an APK that will connect to a development server running on the host machine, set the server base URL in the app configuration (in app.js or settings) to the host IP address (e.g., http://192.168.1.42:3000) and ensure the device and the server machine are on the same network.
- For production standalone use, include the server inside the app (Electron/embedded server) or deploy the server remotely with HTTPS and configure the app to point to that URL.

Debugging and common issues
- adb not found: ensure platform-tools are in PATH (e.g., C:\Users\<you>\AppData\Local\Android\Sdk\platform-tools)
- Gradle build fails: open the android project in Android Studio and accept SDK/gradle updates; use the IDE to resolve missing SDK components.
- Server connectivity: device/emulator must reach the server via network. Use `adb reverse tcp:3000 tcp:3000` for emulators to map host port.

CI / automated builds
- For CI/CD, keep signing artifacts (keystore, PFX) in secure secret storage and use Gradle CLI to assemble and sign.

If you want, can add a small Gradle properties template to help configure signing and a PowerShell script to create a release build (signed) — tell me and it will be added.
