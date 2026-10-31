# Product

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

## Stack

TypeScript, React Native, Expo SDK 58, Expo Router, Expo development builds, MapLibre React Native, and TomTom Orbis Places.

## Users

Philippine bus and LRT-1, LRT-2, and MRT-3 commuters who need to sleep, rest, or focus while traveling to a selected destination.

## Product purpose

Navo helps riders avoid missing a chosen destination by combining saved destination alarms with a separate route-sequence companion. The destination-first flow lets a rider save a station, bus drop-off, or place by searching or pinning it on a map, then turn its alarm on before a ride. No starting location is required.

## Positioning

A local-first destination alarm for Philippine public transit. Saved points and alarm evaluation stay on the device; selecting a new point through TomTom search or map tiles requires a network connection.

## Operating context

Riders may be on moving buses or trains, in noisy or crowded conditions, with intermittent connectivity, a locked screen, and a phone that may restrict background location or notifications.

## Current implementation and constraints

The source includes destination search and map selection through TomTom, saved destination alarms, background location sampling, and local notification delivery. Alarm evaluation uses saved coordinates and usable GPS fixes. The app also includes ordered LRT-1, LRT-2, and MRT-3 station lists and rider-authored bus routes.

Release gate: confirm with TomTom that the applicable API and map license permits storing provider-derived destination coordinates for a rider's saved alarms. [Public third-party terms](https://www.tomtom.com/en-gb/legal/third-party-product-terms/) restrict creating certain digital map databases and define one to include latitude/longitude of individual addresses; this project has not received license-specific confirmation.

Bundled rail data contains names and station order, but no rail station coordinates. Bus coordinates are recorded by the rider and are not independently verified. Route direction and deviation advice use coarse straight-line checks. There is no live transit feed, live operating status, ETA, or lock-screen progress surface.

TomTom search and map requests require a key and network access while choosing a place. The EXPO_PUBLIC_TOMTOM_API_KEY value is included in the client build and must be treated as public client configuration. Search terms and map tile requests go to TomTom. The source does not configure a Navo backend or upload GPS samples used by alarms.

Background location and local notifications are implemented in source, but device behavior varies with platform permissions, OS version, user settings, and device manufacturer. No safety-critical or guaranteed-on-time claim is established. Physical-device acceptance and reliability measurements are still needed.

## Brand commitments

The name is Navo. The approved mark is the supplied transparent Gradient Navigation N artwork: a sculpted blue-to-teal capital N, a sweeping white route, and a gradient location pin above the right-hand stroke. The mark has no wordmark. Keep the editable source transparent; use a deep navy backplate for the app and launcher icon variants so the white route remains legible. The first screens should feel like a quiet rider companion: calm setup and readable, prominent trip status.

## Evidence on hand

The repository contains editable Navo marks and generated platform icons under assets, with visual tokens documented in DESIGN.md. The source contains unit tests for route and destination-alarm rules, but no recorded physical-device acceptance or measured alert reliability.

The app bundles rail station names and order and includes rider-saved bus coordinates. No independently verified rail stop coordinates or live transit source are included. TomTom is used for place search and map tiles, not for live transit service information.

## Product principles

- Be useful without a network connection after route data or a destination is available on device.
- Make the selected route, destination, alert mode, and current confidence easy to understand.
- Show the source and quality of transit data; do not present preview coordinates as verified.
- Explain permission and platform limits at the moment they affect an alert.
- Keep a clear manual fallback available during a trip.

## Accessibility and inclusion

Use readable text, high-contrast status and alert messaging, clear spoken labels for controls, and sufficiently large touch targets. Keep key route and reliability information understandable without relying on color alone.
