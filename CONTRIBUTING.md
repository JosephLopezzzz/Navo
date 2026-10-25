# Contributing to Navo

Thanks for helping improve Navo. Keep changes focused and describe user-visible behavior accurately, especially where location permissions, transit data, or notification delivery are involved.

## Set up

1. Install Node.js 24 and npm.
2. Install dependencies with npm ci.
3. Copy .env.example to .env.local and add a TomTom key for place search and map tiles.
4. Install a development build before testing native map, location, or notification behavior. See the [README setup guide](README.md#run-locally).

Do not commit local environment files or API keys. Values prefixed with EXPO_PUBLIC_ are visible in the client app.

## Before opening a pull request

- Create a focused feature branch from the current base branch.
- Run the relevant checks:

  ~~~sh
  npm run lint
  npm run typecheck
  npm test
  npx expo-doctor@1.21.5
  npx expo export --platform android
  ~~~

- For location or notification changes, state whether behavior was checked on a physical device and include the OS and app build details.
- For UI changes, add genuine screenshots following the [capture guide](docs/screenshots/README.md). Remove personal routes and exact coordinates.
- Call out changes to permissions, stored data, migration behavior, or known limitations.

Open a pull request with the repository template. A green bundle export or unit test does not establish device-level alarm reliability.