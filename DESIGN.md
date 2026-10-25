---
name: Navo
description: A quiet, destination-first route companion for Philippine commuters.
colors:
  brand-midnight: "#07182F"
  brand-ocean: "#0D294B"
  brand-sapphire: "#0869A8"
  brand-aqua: "#00D3C5"
  brand-cloud: "#F7FAFF"
  navo-gradient: "linear-gradient(105deg, #0B3B88 0%, #0869A8 48%, #00D3C5 100%)"
  arctic-pearl: "#F7FAFF"
  surface-white: "#FFFFFF"
  raised-ice: "#EDF3F9"
  route-ink: "#07182F"
  muted-ink: "#41546C"
  quiet-ink: "#566D86"
  registration-line: "#D7E2ED"
  route-sapphire: "#0869A8"
  route-sapphire-wash: "#E2F0F9"
  wayfinding-teal: "#007B78"
  success-green: "#176A4A"
  success-wash: "#E8F4ED"
  alert-amber: "#87590E"
  alert-amber-wash: "#FFF3D9"
  alert-red: "#A12D36"
  alert-red-wash: "#FCEBED"
  obsidian: "#050C17"
  night-surface: "#0A1626"
  night-raised: "#0D294B"
  night-ink: "#F7FAFF"
  night-muted: "#C1D0E0"
  night-quiet: "#9BAFC4"
  night-line: "#263B54"
  night-route-sapphire: "#3F9ED4"
  night-route-sapphire-wash: "#102E49"
  night-wayfinding-aqua: "#00D3C5"
  night-success: "#8BD8AB"
  night-success-wash: "#132D29"
  night-alert-amber: "#F6CE7C"
  night-alert-amber-wash: "#352A18"
  night-alert-red: "#FFB3B8"
  night-alert-red-wash: "#3B2028"
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
    backgroundColor: "{colors.brand-sapphire}"
    textColor: "{colors.surface-white}"
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
    backgroundColor: "{colors.raised-ice}"
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
    backgroundColor: "{colors.brand-sapphire}"
    height: "3px"
  destination-progress:
    backgroundImage: "{colors.navo-gradient}"
    height: "3px"
---

# Design System: Navo

## Overview

**Creative North Star: Deep Current, Quiet Route Plate.** Navo carries a permanent navy, sapphire, and aqua brand identity across themes. The default interface uses Arctic Pearl: a bright, cool-white reading surface with navy text, clear separators, and one connected route line. Obsidian is an optional, manually selected night palette built from deep blue-black surfaces.

The gradient is reserved for the Navo mark, splash branding, active trip progress, and a small number of important branded highlights. Most controls and surfaces stay solid. Route order, manual progress, and source quality remain clear without implying live service data or an ETA.

## Color roles

- **Brand Midnight** (#07182F): launcher and splash backplate, primary brand surface, and the fixed brand anchor in every theme.
- **Brand Ocean** (#0D294B): secondary brand surfaces and dark-theme raised surfaces.
- **Brand Sapphire** (#0869A8): primary action, selected route, and progress color.
- **Brand Aqua** (#00D3C5): signature gradient end and restrained active-route detail. Do not use it for small text on light surfaces.
- **Brand Cloud** (#F7FAFF): light canvas and the logo's white route detail.
- **Navo gradient** (105deg, #0B3B88 0%, #0869A8 48%, #00D3C5 100%): brand graphics and the active destination progress line.
- **Arctic Pearl** (#F7FAFF): default screen background; primary surfaces stay white and secondary surfaces use a light blue-gray tint.
- **Obsidian** (#050C17): optional dark canvas, with deep navy surfaces and high-contrast Cloud text.
- **Status colors:** success, warning, and error keep separate semantic roles in both themes. Status is always paired with text, never color alone.

## Typography and layout

Use the native platform sans serif with a clear scale: 32px screen titles, 19px section headings, 16px body text, 14px supporting copy, and compact 11px data labels. Keep stop numbers tabular and route names prominent. Mobile screens use a single column, 24px side insets, safe-area spacing, and 44px minimum touch targets.

## Components

- **Primary button:** Sapphire, 54px minimum height, 14px corners, one primary action per screen.
- **Secondary button:** transparent or surface fill, fine outline, 50px minimum height.
- **Data seal:** compact labeled status with a dot, semantic color, and tinted surface.
- **Route sequence:** a fine track with numbered stops. The active trip may use the Navo gradient for its progress fill; other route previews use solid Sapphire.
- **Settings options:** native-feeling selectable rows with a visible selected state and saved appearance preference.
- **Text field:** native text input with a quiet underline and readable placeholder.

## Native behavior

Use the platform's stack, tabs, status bar, switches, system permissions, and safe areas. Light mode is the persisted default even when the device uses dark appearance; the rider can choose Obsidian in Settings, and native controls follow that saved choice. Keep the route sequence and manual confirmation available when location is unavailable. Do not add map decoration until route coordinates have been checked.

## Product truth

Keep existing route rules and alert behavior. Rail routes currently have station order but no audited coordinates; bus coordinates are rider-saved. Show when location and notification limits affect alerts, retain the manual progress action, and do not imply an ETA, live feed, guaranteed delivery, or alarm-clock override.
