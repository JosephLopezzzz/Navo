<p align="center">
  <img src="assets/icon.png" alt="Navo navigation mark on a deep navy background" width="104" />
</p>

<h1 align="center">Navo</h1>

<p align="center"><strong>Rest easy. Arrive on time.</strong></p>

<p align="center">
  A smart, location-aware commute alarm for Philippine riders who want to rest or focus without losing track of their destination.
</p>

<p align="center">
  <a href="https://github.com/JosephLopezzzz/Navo/actions/workflows/ci.yml"><img src="https://github.com/JosephLopezzzz/Navo/actions/workflows/ci.yml/badge.svg?branch=main" alt="CI status for main" /></a>
</p>

Navo helps riders save a station, bus drop-off, or other place and receive a local notification as their phone approaches it. A separate route companion supports ordered rail station lists and rider-created bus routes.

> Navo is in active development. Location and notification behavior still needs to be acceptance-tested on supported physical devices; alerts are not guaranteed.

## Current capabilities

| Capability | Current state |
| --- | --- |
| Destination alarms | Implemented in source. Choose a radius, then turn the alarm on when a ride begins. New alarms start off. |
| Place search and map pins | Implemented with TomTom Orbis Places and MapLibre. A TomTom key and network connection are required while choosing a destination. |
| Destination notifications | Implemented in source. The evaluator ignores fixes with accuracy worse than 80 m, waits until the phone leaves the destination area, then requires two usable fixes near the saved point before sending a local notification. Device acceptance is pending. |
| Background monitoring | Implemented in source through Expo Location and TaskManager while a trip or destination alarm is active. Device acceptance is pending. |
| Rail route sequences | LRT-1, LRT-2, and MRT-3 station names and order are bundled. Coordinates are not included, so rail trips use manual stop confirmation. |
| Rider-created bus routes | Riders can save stops in travel order and explicitly record a location at a stop. Automatic route checks are available only when every stop has a location. |
| Route trip alerts | Manual stop confirmation, sleep mode, and every-stop or destination-only alert modes are implemented. Automatic checks still depend on usable saved coordinates. |
| Route guidance | Direction and route-deviation advisories use coarse straight-line checks. Curves, station access paths, or GPS drift can make them inaccurate. |
| Local storage | SQLite stores routes, destinations, settings, alarm state, and trip state. Existing AsyncStorage state is copied into SQLite on first database initialization. |

Destination alarms use a default 500 m radius, adjustable to 250, 500, 750, or 1,000 m. They do not need an origin point. A missed or low-quality GPS fix does not remove the manual route-progress action.

Navo does not provide live bus or train service data, an ETA, or a guaranteed alarm-clock override. Background location and notifications depend on permissions, device settings, and operating-system behavior.

## App preview

There are no real in-app screenshots in the repository yet. See the [screenshot capture guide](docs/screenshots/README.md) for the file convention and privacy checklist. Screenshots should be added after a real device or emulator review; generated mockups are not app evidence.

## How it works

1. Add a destination by searching TomTom places or choosing a point on the map.
2. Choose an alert radius and save the destination. It stays on the device and its alarm remains off.
3. Turn on the alarm when the ride starts. Navo requests location and notification permissions.
4. Navo waits for the phone to move away from the saved point, then checks usable location updates while the alarm is active.
5. When consecutive usable fixes are near the destination, Navo sends a local notification and switches that alarm off.

For route-based trips, choose a rail line or create a bus route, select boarding and destination stops, then track progress with location points where available or confirm stops manually.

## Technology

| Area | Implementation |
| --- | --- |
| Mobile app | Expo SDK 58, React Native 0.88, TypeScript |
| Navigation | Expo Router with screens under src/app |
| Maps and place search | MapLibre React Native and TomTom Orbis Places/raster tiles |
| Location and alerts | Expo Location, TaskManager, and Notifications |
| Local state | SQLite through expo-sqlite; legacy AsyncStorage state is imported on first open |
| Tests and checks | Vitest, Expo lint, TypeScript, Expo Doctor, and Android bundle export |
| Builds | EAS development and preview profiles; Android preview builds produce an internal APK |

## Run locally

### Requirements

- Node.js 24 and npm
- A TomTom API key for destination search and map tiles
- An Android or iOS development build for native MapLibre, location, and notification features

### Install and configure

~~~sh
npm ci
~~~

Copy .env.example to .env.local and set EXPO_PUBLIC_TOMTOM_API_KEY. In PowerShell:

~~~powershell
Copy-Item .env.example .env.local
~~~

The key is included in the mobile client configuration. Treat it as client-visible, restrict it in your TomTom account, and do not put server credentials in this variable. The local .env.local file is ignored by Git.

For cloud builds, set the same variable in the EAS development and preview environments. A Git-ignored local file is not available to remote CI by default. Since this is client-visible configuration, create it with plaintext visibility in the EAS dashboard or run this command with your own key:

~~~sh
npx eas-cli@latest env:set --name EXPO_PUBLIC_TOMTOM_API_KEY --value YOUR_TOMTOM_KEY --environment preview --visibility plaintext
~~~

Replace `YOUR_TOMTOM_KEY` with your TomTom client key. See [Expo environment variables](https://docs.expo.dev/guides/environment-variables/) and [EAS environment variables](https://docs.expo.dev/eas/environment-variables/).

Repeat the `env:set` command with `--environment development` if you also build the development profile.

Without a key, TomTom place search and map tiles are unavailable. The route sequence screens do not need the key.

### Install a development build

Expo Go does not include the native MapLibre module. Create and install a development build:

~~~sh
npx eas-cli@latest build --profile development --platform android
~~~

For an iOS device build, use:

~~~sh
npx eas-cli@latest build --profile development --platform ios
~~~

EAS may ask for account and signing setup. The project declares both iOS and Android, but this repository does not yet include physical-device acceptance evidence for either platform.

After installing the development build, start Metro:

~~~sh
npm run start -- --dev-client --lan
~~~

Local native builds are also available with npm run android or npm run ios when the matching Android or Apple toolchain is installed.

### Build an internal Android preview

~~~sh
npx eas-cli@latest build --profile preview --platform android
~~~

The preview profile is configured for an installable APK. It is for internal testing and is not a store release.

## Validate changes

~~~sh
npm run lint
npm run typecheck
npm test
npx expo-doctor@1.21.5
npx expo export --platform android
~~~

The Android export checks the JavaScript bundle and Expo config. It does not verify background location, notification delivery, or alarm reliability on a phone. Those require an installed development build and device testing.

## Privacy and data

- Saved destinations, route data, alarm state, settings, and GPS checks are stored and evaluated on the device. The app source does not configure a Navo backend or analytics service.
- Place-search text is sent to TomTom. The app also requests TomTom map tiles and attribution when the map is used.
- Background location runs only while a trip or destination alarm is active and required permissions are granted. Operating-system or device settings can pause or limit it.
- On first database creation, local storage seeds state from the previous AsyncStorage key when present.

Before public release, review the applicable [TomTom API and map terms](https://www.tomtom.com/en-gb/legal/third-party-product-terms/) for storing provider-derived destination coordinates. The current third-party terms restrict using licensed products to create certain digital map databases, with a definition that includes coordinates of individual addresses; the public text does not settle whether this personal saved-destination use is covered by the selected API license. Confirm the license for this app before distribution.

Do not include API keys, private trip details, or exact personal coordinates in public issues or screenshots.

## Route data and known limits

Bundled rail lists contain station names and order only. Their source references are [LRTA Railway Operations](https://www.lrta.gov.ph/railway-operations/) for LRT-1 and LRT-2 and the [DOTr-MRT3 fare matrix](https://www.dotrmrt3.gov.ph/fare-matrix.pdf) for MRT-3. They do not include audited station coordinates or live operating status.

Bus stops and optional coordinates are entered by the rider and stay local. Straight-line route checks are advisory and can be wrong on curved roads or with noisy GPS. Review the location quality and use manual stop confirmation when an automatic check is unavailable.

## Architecture

~~~mermaid
flowchart TD
  Screens["Expo Router screens"] --> State["AppStateProvider"]
  State --> Store["SQLite local state<br/>imports prior AsyncStorage state"]
  Screens --> Domain["Trip engine and destination alarm evaluator"]
  Domain --> Location["Background location service"]
  Location --> Platform["Expo Location, TaskManager, Notifications"]
  Screens --> Map["MapLibre destination picker"]
  Map --> TomTom["TomTom search, map tiles, attribution"]
  Screens --> Routes["Bundled rail order and rider-created bus routes"]
  Routes --> Domain
~~~

- src/app contains routes and screens.
- src/domain contains trip and destination-alarm rules.
- src/data/routes.ts contains bundled rail station order.
- src/services contains local persistence, background tracking, and TomTom requests.
- src/state coordinates saved app state for the screens.
- assets contains the editable marks and generated platform icons.

## Brand

Deep Current anchors the identity: Midnight #07182F, Ocean #0D294B, Sapphire #0869A8, Aqua #00D3C5, and Cloud #F7FAFF. Arctic Pearl is the default light interface, with an Obsidian-inspired optional night palette. See [DESIGN.md](DESIGN.md) for tokens and component guidance.

## Roadmap

1. Validate alarm behavior on physical Android and iOS devices, including locked-screen updates, permission denial, notification settings, and battery restrictions.
2. Improve location confidence and battery behavior with repeatable device measurements.
3. Verify transit station data and coordinates against current operator sources before enabling automatic rail alerts.
4. Evaluate Philippine transit integrations; live service status and ETAs need a reliable, documented source.
5. Expand accessibility, permission guidance, and tests for storage migration and platform service behavior.

## Project documents

- [Product behavior and constraints](PRODUCT.md)
- [Visual system](DESIGN.md)
- [Route companion scope](scopes/route-companion.md)
- [Unreleased changes](CHANGELOG.md)
## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request. Bug and feature reports can use the repository's issue templates.

## License

No LICENSE file is currently included. Reuse and redistribution terms have not been specified.

## Maintainer

Maintained by [JosephLopezzzz](https://github.com/JosephLopezzzz).
