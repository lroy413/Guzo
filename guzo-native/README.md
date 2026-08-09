# guzo-native

The iOS shell. **Nothing is authored in here.** The app is `../index.html` and
`../sw.js`; `../build.sh` copies them into `www/`, and Capacitor wraps that.

## Why the shell exists at all

Not to put the website in a box — App Store review rejects that under
Guideline 4.2, and rightly. It exists for three things the web cannot do on
iOS:

- **HealthKit sleep.** Sleep drives readiness, which sizes the session. It is
  the one signal that changes what the app *does*, which is also why it is
  the argument that this is an app rather than a bookmark.
- **Durable storage.** WebView storage can be cleared by the OS under
  pressure. `@capacitor/preferences` writes to native storage, which is
  included in device and iCloud backups. See "Storage" below.
- **A wake lock that holds.** The Screen Wake Lock API was silently inert in
  home-screen web apps until iOS 18.4 and degrades quietly even now.

## Storage

The app keeps `localStorage` as its primary store — it is synchronous, and
`load()` runs at boot before any async API could answer. Capacitor Preferences
is a **mirror**, written after every save and read only when localStorage
comes up empty. That way the web build is unchanged, nothing becomes async,
and a WebView eviction costs nothing.

## Building without a Mac

`.github/workflows/ios.yml` runs on a macOS runner: it builds the web app,
copies it in, runs `cap add ios` and `pod install`, then archives and uploads
to TestFlight with an App Store Connect API key.

Secrets required on the repository:

| Secret | What it is |
|---|---|
| `ASC_KEY_ID` | App Store Connect API key ID |
| `ASC_ISSUER_ID` | The issuer ID from App Store Connect → Keys |
| `ASC_KEY_P8` | Contents of the `.p8` private key |
| `IOS_TEAM_ID` | Apple Developer team ID |

Until those exist the workflow still runs the build and stops before upload,
so it is useful as a compile check on its own.

## Locally, if you do have a Mac

```sh
cd .. && ./build.sh          # writes guzo-native/www/
cd guzo-native
npm install
npx cap add ios              # first time only
npx cap sync ios
npx cap open ios             # Xcode
```
