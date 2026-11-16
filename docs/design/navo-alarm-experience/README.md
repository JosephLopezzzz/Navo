# Navo alarm-screen review

These are proposal assets, not runtime screens. Read [the behavior and platform proposal](../../ALARM_EXPERIENCE_PLAN.md).

- `index.html`: interactive stage/theme review aid. Button feedback demonstrates proposed semantics; it changes no app state and plays no audio.
- `dark-stages.png` / `light-stages.png`: three-stage design sheets, rendered from their editable SVG equivalents.
- `generate-proposal.mjs`: deterministic source. Run `node docs/design/navo-alarm-experience/generate-proposal.mjs` from the repository root with the existing Sharp development dependency.
- `manifest.json`: provenance and output list. Original geometry and copy reference the existing Navo theme and the user-supplied Clock screenshots. No third-party artwork or alarm sounds are copied.

Distances and the station context are illustrative. Native safe-area, large-text, screen-reader, lifecycle, notification, and physical-device acceptance remain required before implementation is called complete.
