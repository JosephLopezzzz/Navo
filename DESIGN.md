---
name: Navo
description: A quiet route companion for a Philippine commuter’s destination trip.
colors:
  paper: "#F6F7F4"
  surface-white: "#FFFFFF"
  raised-mist: "#F0F2EF"
  route-ink: "#17211F"
  muted-ink: "#53615E"
  quiet-ink: "#71807D"
  registration-line: "#D9E0DC"
  route-blue: "#246DD0"
  route-blue-wash: "#E6F0FF"
  wayfinding-teal: "#087D73"
  success-green: "#176A4A"
  success-wash: "#E8F4ED"
  alert-amber: "#87590E"
  alert-amber-wash: "#FFF3D9"
  alert-red: "#A12D36"
  alert-red-wash: "#FCEBED"
  ink-on-blue: "#FFFFFF"
  night-paper: "#111715"
  night-surface: "#1B2220"
  night-raised: "#252E2B"
  night-ink: "#F1F5F2"
  night-muted: "#CCD6D1"
  night-quiet: "#A8B6B0"
  night-line: "#34423D"
  night-route-blue: "#86B7FF"
  night-route-blue-wash: "#1D3048"
  night-wayfinding-teal: "#6FD3C1"
  night-success: "#A7D9B9"
  night-success-wash: "#1C3528"
  night-alert-amber: "#F1C777"
  night-alert-amber-wash: "#392F1C"
  night-alert-red: "#FFB4BA"
  night-alert-red-wash: "#3D2528"
  night-ink-on-blue: "#10213A"
typography:
  headline:
    fontSize: "32px"
    fontWeight: 700
    lineHeight: "38px"
    letterSpacing: "-0.8px"
  section:
    fontSize: "19px"
    fontWeight: 600
    letterSpacing: "-0.25px"
  body:
    fontSize: "16px"
    fontWeight: 400
    lineHeight: "23px"
  supporting:
    fontSize: "14px"
    fontWeight: 400
    lineHeight: "20px"
  label:
    fontSize: "11px"
    fontWeight: 700
    letterSpacing: "0.45px"
  button:
    fontSize: "16px"
    fontWeight: 700
rounded:
  seal: "7px"
  control: "12px"
  action: "14px"
spacing:
  xs: "6px"
  sm: "10px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  xxl: "44px"
components:
  button-primary:
    backgroundColor: "{colors.route-blue}"
    textColor: "{colors.ink-on-blue}"
    typography: "{typography.button}"
    rounded: "{rounded.action}"
    height: "54px"
    padding: "0 24px"
  button-secondary:
    textColor: "{colors.route-ink}"
    typography: "{typography.button}"
    rounded: "{rounded.action}"
    height: "50px"
    padding: "0 24px"
  data-seal:
    backgroundColor: "{colors.raised-mist}"
    textColor: "{colors.muted-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.seal}"
    height: "28px"
  text-field:
    textColor: "{colors.route-ink}"
    typography: "{typography.body}"
    height: "48px"
    padding: "0 2px"
  route-line:
    backgroundColor: "{colors.route-blue}"
    height: "3px"
---

# Design System: Navo

## Overview

**Creative North Star: "The Quiet Route Plate"**

Navo treats each trip as a small printed wayfinding plate: a near-white field, one clear route line, numbered stops, fine separators, and a compact source-quality seal. The mark’s blue-to-teal gradient lives in the editable SVG; the interface uses route blue for the rider’s active choice and teal as a restrained supporting brand color.

The native interface keeps familiar tabs, switches, safe areas, and platform type. Setup stays calm and legible; an active trip brings the destination and next stop forward. The system shows what it knows about a route and leaves the rider a manual way to advance.

**Key Characteristics:**
- Paper-like light surfaces with a complete system-driven dark palette.
- One blue route signal, connected numbered stops, and fine registration lines.
- Calm setup, clear active progress, and visible data-quality seals.

## Colors

The palette pairs cool commuter paper and charcoal ink with Navo blue, a quieter teal, and separate status colors. The logo gradient is owned by the SVG source, not approximated as a single interface token.

### Primary
- **Route Blue** (#246DD0): Main action, current sequence, selected stops, and route progress in light mode.
- **Night Route Blue** (#86B7FF): Accessible route emphasis on dark surfaces.

### Secondary
- **Wayfinding Teal** (#087D73): Supporting brand detail and rider-saved location status.
- **Night Wayfinding Teal** (#6FD3C1): The same supporting role in dark mode.

### Tertiary
- **Success Green** (#176A4A): Confirmed arrival and successful permission or location state.
- **Alert Amber** (#87590E): Missing route coordinates, permission gaps, and uncertain reliability.
- **Alert Red** (#A12D36): Errors and destructive trip actions.

### Neutral
- **Commuter Paper** (#F6F7F4) and **Night Paper** (#111715): Main screen backgrounds.
- **Surface White** (#FFFFFF) and **Night Surface** (#1B2220): Primary readable surfaces.
- **Raised Mist** (#F0F2EF) and **Night Raised** (#252E2B): Quiet secondary surfaces and neutral seals.
- **Route Ink** (#17211F) and **Night Ink** (#F1F5F2): Main text.
- **Muted Ink** (#53615E) and **Night Muted** (#CCD6D1): Explanatory text and supporting route labels.
- **Quiet Ink** (#71807D) and **Night Quiet** (#A8B6B0): Low-priority labels and secondary marks.
- **Registration Line** (#D9E0DC) and **Night Line** (#34423D): Hairline dividers and route tracks.
- **Route Blue Wash** (#E6F0FF) and **Night Route Blue Wash** (#1D3048): Selected stops and selected controls.
- **Success Wash** (#E8F4ED) and **Night Success Wash** (#1C3528), **Alert Amber Wash** (#FFF3D9) and **Night Alert Amber Wash** (#392F1C), and **Alert Red Wash** (#FCEBED) and **Night Alert Red Wash** (#3D2528): Status backgrounds.
- **Ink on Blue** (#FFFFFF) and **Night Ink on Blue** (#10213A): Primary button text.

**The Accent Discipline Rule.** Route blue marks the current action or progress. Teal supports route authorship and confirmation; it does not replace warning or error colors.

## Typography

**Display Font:** Native platform sans-serif, at the screen-title role

**Body Font:** Native platform sans-serif

**Label/Mono Font:** Native platform sans-serif; tabular numerals are used for stop counts where available.

**Character:** Familiar system lettering keeps the app at home in iOS and Android. Weight and spacing create hierarchy without a separate display face.

### Hierarchy
- **Headline** (700, 32px, 38px line-height, -0.8px tracking): Screen titles and destination names.
- **Section** (600, 19px, -0.25px tracking): Route sections and stop-group headings.
- **Body** (400, 16px, 23px line-height): Instructions and essential trip context.
- **Supporting** (400, 14px, 20px line-height): Reliability explanations and secondary details.
- **Label** (700, 11px, 0.45px tracking, uppercase when it identifies a route field or seal): Stop order, source quality, and compact status.
- **Button** (700, 16px): Primary action labels.

**The Signal First Rule.** Put the destination, next stop, and trip action ahead of source and reliability detail. Keep reliability visible without giving it headline weight.

## Layout

The app uses a single-column, vertically scrolling mobile surface. The shared screen frame has 24px horizontal padding, 16px top padding, and 16px spacing between major groups; larger 24px gaps separate major tasks. Route setup and active trip use the same connected sequence, with passed, next, and destination stops visually distinct. Controls keep native interaction patterns and at least 44px touch areas where the screen defines them.

## Elevation & Depth

The visual system is flat. Screen tone, fine borders, and route-line position create grouping; shadows do not carry hierarchy.

**The Flat Plate Rule.** Separate route information with space, tone, and hairline dividers instead of floating-card shadows.

## Shapes

Buttons use a 14px radius; bus route actions and selected options use 12px; compact source seals use 7px. Route marks are circular, with thin outlines when they are upcoming. The route line stays straight and deliberate as a sequence diagram, not a geographic map.

## Components

- **Primary button:** Blue, 54px high, 14px corners, with centered 16px bold text. Use for the one main action on a screen.
- **Secondary button:** Clear surface with an ink label and a fine border, 50px high. Use for a reversible alternative.
- **Data seal:** Compact uppercase label, dot, fine status-colored border, and pale tone fill. Use it for source, permission, coordinate, and trip state.
- **Route line:** A 3px track with numbered stop markers; passed stops fill with route blue and the destination stays explicit.
- **Bus route field:** Underlined native text input with a plain label and no enclosing card.

## Do's and Don'ts

- **Do** show whether route coordinates are rider-saved, missing, or unavailable before starting location-based alerts.
- **Do** keep a manual confirmation action available when the app cannot use location.
- **Do** show the source and sequence without implying an ETA or live service feed.
- **Do** use native navigation and controls while carrying the route-plate language through the content.
- **Don't** show unverified station coordinates as operational route data.
- **Don't** present straight-line route checks as precise bus navigation.
- **Don't** imply Navo overrides Focus, silent mode, battery limits, or operating-system background restrictions.
- **Don't** add geographic map decoration until route coordinates have been checked.