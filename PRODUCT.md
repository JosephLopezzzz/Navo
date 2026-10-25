# Product

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

## Stack

delegated: TypeScript, React Native, Expo development builds, chosen for a shared mobile codebase with native background location and notifications.

## Users

Philippine bus and LRT-1, LRT-2, and MRT-3 commuters who need to sleep, rest, or focus while traveling to a selected destination.

## Product Purpose

Navo helps riders wake or get notified near a chosen stop so they are less likely to miss their destination. Success means a rider can choose a route and stop, understand the alert conditions, and receive useful approaching-stop and destination alerts where their device permits.

## Positioning

An offline-first destination alarm for Philippine public transit that sequences known stops and combines route context with device location, while exposing route-data quality and alert reliability.

## Operating Context

Riders may be on moving buses or trains, in noisy or crowded conditions, with intermittent connectivity, a locked screen, and a phone that may restrict background location or notifications.

## Capabilities and Constraints

The requested scope includes train station sequencing for LRT-1, LRT-2, and MRT-3; bus destination tracking; configurable wake-up and sleep modes; background location on supported devices; approaching-stop alerts; wrong-direction and route-deviation advisories; battery-conscious sampling; lock-screen progress where platforms permit; permission guidance; and honest fallback indicators. These capabilities require platform-specific permissions and a development build. The repository currently has no verified transit data source; any bundled route coordinates and operating details must be marked as preview data until verified. iOS and Android background execution and notification behavior vary by OS version, user settings, and device manufacturer. No safety-critical or guaranteed-on-time claim is established.

## Brand Commitments

The name is Navo. The approved mark is the supplied transparent Gradient Navigation N artwork: a sculpted blue-to-teal capital N, a sweeping white route, and a gradient location pin above the right-hand stroke. The mark has no wordmark. Keep the editable source transparent; use a deep navy backplate for the app and launcher icon variants so the white route remains legible. The first screens should feel like a quiet rider companion: calm setup and readable, prominent trip status.

## Evidence on Hand

The user supplied the product scope and a textual description of the chosen mark. The referenced conversation preview does not include the attached logo image or the earlier comprehensive master prompt. No route dataset, device acceptance evidence, live location integration, or verified reliability measurements are available yet.

## Product Principles

- Be useful without a network connection after route data is available on device.
- Make the selected route, destination, alert mode, and current confidence easy to understand.
- Show the source and quality of transit data; do not present preview coordinates as verified.
- Explain permission and platform limits at the moment they affect an alert.
- Keep a clear manual fallback available during a trip.

## Accessibility & Inclusion

Use readable text, high-contrast status and alert messaging, clear spoken labels for controls, and sufficiently large touch targets. Keep key route and reliability information understandable without relying on color alone.
