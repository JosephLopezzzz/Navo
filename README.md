# Navo

Navo is an offline-first destination alarm for Philippine bus and LRT-1, LRT-2, and MRT-3 riders. It helps riders follow a stop sequence and receive local approaching-stop alerts where route coordinates, permissions, and device behavior allow them.

## MVP status

| Capability | Status |
| --- | --- |
| Rail station order and direction-aware trip setup | Implemented from operator/agency station lists |
| Manual stop confirmation | Implemented for rail and bus trips |
| Sleep mode and every-stop alerts | Implemented |
| Background location and local notifications | Implemented in the native app configuration; device acceptance is still required |
| Rider-authored bus stop sequences and optional GPS points | Implemented; all route data stays on the device |
| Wrong-direction advice | Implemented as a coarse distance trend check when every stop has a location |
| Route-deviation advice | Implemented as a coarse straight-line check between saved stops |
| Rail location alerts | Not enabled because station coordinates have not been independently checked |
| Live bus catalog, live service data, and ETA | Not implemented |
| Live lock-screen progress surface | Not implemented |

Location alerts use a 500 m approach radius and a 120 m arrival threshold when a fix is accurate within 80 m. A missed or low-quality fix never removes the manual progress action. The app never calls a location sample verified merely because it is present. Bus coordinates are collected only when the rider taps “Save current location” while physically at a stop. Straight-line checks can be wrong on curved roads or when GPS is noisy.

## Local development

Requirements: Node.js 24 and npm.

~~~sh
npm ci
npm run start
~~~

Background location and notifications use native modules, so Expo Go is not a suitable acceptance target. Install a development build, then start Metro for that client:

~~~sh
npx eas-cli@latest build --profile development --platform android
npx eas-cli@latest build --profile development --platform ios
npm run start -- --dev-client
~~~

An EAS account and signing credentials are needed for cloud builds. For a local Android build, use npx expo run:android with Android Studio and the Android SDK installed. iOS local builds require macOS and Xcode.

The development profile uses expo-dev-client; preview and production profiles are in eas.json.

## Checks

~~~sh
npm run lint
npm run typecheck
npm test
npx expo-doctor@1.21.5
npx expo export --platform android
~~~

The export check validates the JavaScript bundle and Expo config path. It does not prove background location, notification delivery, lock-screen behavior, or reliability on a physical phone. Those need a development build and device testing on supported Android and iOS versions.

## Data and privacy

- Custom routes, preferences, active-trip state, and the latest location fix are stored in local AsyncStorage.
- Navo has no backend, account, analytics, or location upload in this MVP.
- Location updates run only for an active trip after the rider grants the required permissions.
- Deleting app data removes locally saved routes and trip state.

## Data sources and limits

Rail station names and sequences are bundled from:

- [LRTA Railway Operations](https://www.lrta.gov.ph/railway-operations/) for LRT-1 and LRT-2
- [DOTr-MRT3 fare matrix](https://www.dotrmrt3.gov.ph/fare-matrix.pdf) for MRT-3

The app stores station order only. It has no audited station coordinates or live operating status, so rail progress uses manual confirmation. The station lists are a starter reference and should be checked against current operator notices before public release.

Background location requires platform permissions and may stop when the operating system or device manufacturer limits background work. Notifications may be delayed or silenced by device settings, Focus, or low-power restrictions. Navo is not a guaranteed alarm-clock override.

## Branding

- Editable transparent color mark: assets/navo-mark.svg
- Editable monochrome mark for Android and notifications: assets/navo-monogram.svg
- Generated mobile and Android adaptive icons: assets/icon.png, assets/android-icon-*.png, and assets/notification-icon.png
- Regenerate raster platform assets with npm run assets:icons
- Product and visual direction: PRODUCT.md, scopes/route-companion.md, and DESIGN.md

## Repository workflow

Work on a feature branch and open a pull request for review. Do not commit app implementation directly to main.
