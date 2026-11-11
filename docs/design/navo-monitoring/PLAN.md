# Navo monitoring UI proposal

This is a visual proposal based on the supplied Android screenshots. The compact home layout and offline banner shown in the mockups have not been implemented. The saved destination row now follows the monitoring mockup, including its front-facing bus icon and divider. The requested Android launcher padding and ongoing destination/distance notification are implemented separately in source; they need an updated installed build and device acceptance.

## Design direction

Keep Navo's Arctic Pearl, navy and sapphire theme, system typography, simple saved cards and three-tab navigation. Improve hierarchy through shorter copy and compact grouping. Keep the existing mark; do not redesign it or add a large branded header to the alarm screen.

1. **Normal monitoring:** retain the greeting and Add alarm action on one row. Show Saved alarms and a compact saved/on count. Reduce the active panel to destination, distance, monitoring status, location age and one short `Alert at 500 m · Straight-line distance` line. Preserve a separate list with destination/type/toggle only. Do not add a progress percentage or ETA without a starting point or route data.
2. **Offline with usable GPS:** keep monitoring visually normal. A small informational strip can say `Offline · Your saved alarm still works` after an actual connectivity check. Do not label lack of internet as a GPS failure. New searches and map loading have a separate internet requirement.
3. **Weak or stale GPS:** retain the previous usable value with `Last known` and its check time. Show a GPS-specific status and recovery instruction. Never show zero, interpolate movement, or imply arrival from missing readings.
4. **Selection:** replace the greeting/title/count stack with one contextual `1 selected` bar, Close, and Select all. Hide the active panel and Add alarm while selecting. Keep the Delete action above the bottom navigation with safe-area spacing and retain the deletion confirmation.
5. **Ongoing Android notification:** destination is the title; body begins with rounded distance and status. Show the actual GPS check time and straight-line qualification. Updates replace the existing service notification. Android controls notification geometry, truncation, status-bar icons and lock-screen visibility; the mockup is illustrative, not a custom notification layout implementation.
6. **Launcher icon:** center and reduce the original symbol inside the adaptive icon's safe area. Preserve its navy background, proportions, white route and gradient pin. Do not change the operating system's launcher grid sizing.

## Current offline behavior

| Capability | With internet disconnected |
| --- | --- |
| Read/edit/delete existing saved alarms and toggle them | Local SQLite state remains available; location/notification permissions still apply. |
| Calculate distance to a saved destination | Local coordinate calculation; requires a usable device location. No route/search request is made for each reading. |
| Deliver arrival alerts and update the ongoing notification | Local/native work; subject to usable GPS, permissions and OS background/notification restrictions. |
| Existing bundled tones and previously imported sounds | App/device-local assets; no sound download is needed. |
| Add a Place from known latitude/longitude | The existing `Use these coordinates` flow confirms the point locally without a provider search. Correctness of the entered coordinates is the rider's responsibility. |
| Rail station names, saved bus-route stop order and manual confirmation | Available locally. Names/order alone do not supply verified stop coordinates. |
| Search for a new place, resolve provider suggestions, reverse-geocode or load new map tiles | Requires network access in the current implementation. |
| Offline basemap coverage | No downloaded-map feature is implemented. Incidental cache contents are not guaranteed offline coverage. |

Save and confirm the destination before traveling offline. No internet and no GPS are different states. Native location services may need longer to obtain a usable reading without network assistance; underground or obstructed conditions may still prevent updates.

Offline acceptance should use an installed preview or production build with its JavaScript bundled. The project's development profile connects to Metro; loading or reloading that development session can require a reachable development server even though the location calculation itself is local.

## Implemented notification contract

- Tracks the viewed enabled alarm; changing the panel target persists that display preference for headless tasks. A disarmed/deleted target falls back to another enabled alarm. With no enabled saved alarm, a mapped active route trip supplies its destination.
- Shows the full saved destination title, rounded distance, status, absolute local GPS check time, and count of other enabled alarms where relevant.
- Distance-only redraws are limited to once per five seconds and only when content changed. Destination/status transitions bypass that limit. This does not request GPS more frequently or create another watcher.
- A single best-effort freshness timer can relabel a silent feed after the existing 45-second display freshness window. Background JS suspension can delay it; the fixed GPS clock time remains truthful even when no timer fires.
- Uses the existing low-priority native background-session notification. Arrival sound delivery remains separate. A failed progress redraw does not disable a working detector; later wakes retry it.
- When the last alarm/mapped trip ends, both the location task and its session notification stop. The logo asset update requires rebuilding/installing the native app.

## Mockups and implementation order

The images in `mockups/` are generated concept previews, not device acceptance evidence. Native notification rendering can differ across Android versions and manufacturers. Notification mockup ages represent a single illustrated moment; source uses a clock time to avoid a frozen relative-age label.

| Preview | File |
| --- | --- |
| Compact monitoring screen | [monitoring.png](mockups/monitoring.png) |
| Offline with usable GPS | [offline.png](mockups/offline.png) |
| Contextual selection and safe Delete placement | [selection.png](mockups/selection.png) |
| Android ongoing notification concept | [notification.png](mockups/notification.png) |
| Deterministic old/new launcher mask comparison | [launcher-sizing.png](launcher-sizing.png) |

The four screen previews use the built-in ImageGen tool. The launcher comparison is generated directly from existing SVG/PNG assets. The exact initial and refinement prompt set is saved in [PROMPTS.md](PROMPTS.md).

Recommended next UI pass after visual review: compact normal layout, contextual selection header, then connectivity-aware offline feedback. Keep arrival detection and saved-card interactions intact. Validate both themes, large system text, long destination names, multiple alarms, one-handed selection, and small-device safe areas before accepting the redesigned layouts.

The floating gray gear in the supplied screenshots is not rendered by the reviewed saved-alarm components. Identify whether it belongs to a device or development overlay before making unrelated app changes.

## Device checks for the implemented changes

- Install a matching updated build; inspect launcher masks and confirm the pin/route are not clipped.
- Monitor a saved destination with Wi-Fi/mobile data off but location on; verify distance and local arrival delivery.
- Background/lock the device; verify the existing ongoing notification changes destination/distance without duplicate notifications or repeated alert sounds.
- Stop GPS updates or enter a weak-signal area; verify last-known/check-time messaging and recovery.
- Switch the viewed destination among several active alarms, disarm/delete it, and confirm notification fallback.
- End the final workload and verify no ongoing notification or freshness timer remains.
- Check manufacturer lock-screen privacy settings, notification truncation, silent/Focus behavior and battery impact separately from JavaScript tests.

## References

- [Expo SDK 58 background-session update API](https://docs.expo.dev/versions/v58.0.0/sdk/location-next/#ensurebackgroundsessionstartedoptions)
- [Android adaptive icon safe area](https://developer.android.com/develop/ui/compose/system/icon_design_adaptive#design_adaptive_icons)
- [Device location without a data connection](https://doc.esri.com/en/arcgis-survey123/latest/get-started/faqgetanswers.html)
