# Destination alarm screen implementation

Status: implemented in source, 16 November 2026. `src/app/alarm/alert.tsx` implements the three stage screens and their session-bound actions. The PNG/HTML sheets below remain design references, not native captures. Native lock-screen takeover and continuous background ringing are separate capabilities; this implementation uses ordinary OS-managed notification cues and a full-page in-app screen. Phone acceptance remains required.

[Interactive review aid](design/navo-alarm-experience/index.html) · [Obsidian sheet](design/navo-alarm-experience/dark-stages.png) · [Arctic Pearl sheet](design/navo-alarm-experience/light-stages.png)

## Implemented experience

Keep the Clock reference’s readable message and large action targets, adapted to destination travel. Lead with the current stage and saved destination, rather than a clock time. Use the existing Navo theme, system type, safe areas, and shared press feedback. Preserve both Arctic Pearl and Obsidian; do not force a dark alarm screen when the rider selected light appearance.

High-importance local notifications carry a session-bound link to the dedicated in-app destination alert route. Foreground events open one screen, and multiple events expose a Next alert control. A notification tap is held through saved-data hydration and opens a validated current event. Navo does not launch itself over another app or take over the lock screen.

## Three messages

| Stage | Main message | Supporting information | Main action |
| --- | --- | --- | --- |
| Selected approach distance | Your stop is close. | Saved destination, rounded straight-line distance, and “Get ready to leave when it is safe.” | I’m getting off |
| Confirmed destination area | You’re at your destination. | Saved destination, “In the destination area”, and “Check your surroundings before getting off.” | I’m here |
| Possible missed stop | You may have passed your stop. | Saved destination, last usable distance and “Moving away from the saved point”, plus a safe next-step prompt. | Check destination |

“Arrived” means the phone entered the saved destination area with usable GPS; it cannot confirm a platform, vehicle stop, or safe place to alight. The possible-missed copy must remain uncertain. Never claim that GPS proves a person missed a stop or failed to get off. Do not show an ETA, exact platform, live train position, or an animation implying those are known.

The distance examples in the sheets are illustrative. Production text uses the shared rounded distance formatter. On stale GPS, replace the current estimate with a labeled last-known value and reading age; if no usable reading exists, omit the number.

## Editor settings

In Create/Edit Alarm, replace the single-distance selector with **Repeat alerts**, with helper text “Choose when Navo should alert you.” Offer multi-select distances **200 m, 500 m, 1 km, and 2 km**, then independent **At destination** and **May have passed stop** switches. Show checkmarks and accessible checked states on distance choices. Selecting another distance adds it; it does not clear the others. Keep the exact selected list visible when returning to the editor. Show an inline validation message if every stage is disabled.

Use a separate Android **Vibrate with alerts** switch with the stage settings, followed by the sound choice. On iOS, explain that notification vibration follows system settings. The editor’s Save alarm action persists all selections together; Cancel leaves the saved alarm unchanged. A short summary such as “1 km · 500 m · at destination · possible missed stop” can appear on the saved alarm’s detail view. “Repeat” means once at each selected point in the current trip, not a time loop and not an automatically recurring daily alarm.

## Actions and state ownership

- **I’m getting off:** acknowledge and silence this event only. Continue later selected approach, arrival, and possible-missed checks. Acknowledgment does not advance a manual journey or change the destination.
- **I’m here:** an explicit rider confirmation that this destination is complete. Silence the current event, end only this destination alarm session, and suppress a later possible-missed warning for that session. Keep the destination saved and leave other alarms or an active journey unchanged. Its helper text says “Confirms this destination is complete”; this is an intentional completion action, not the generic mute action.
- **Check destination:** acknowledge this event and open the saved coordinate snapshot. Preserve station identity; a camera movement cannot edit the destination. When map images are unavailable, retain the saved name, coordinate summary, and an option to return to the alert. It does not choose another route or automatically rearm an alarm.
- **Mute this alert:** stop this event’s foreground audio/vibration and dismiss its corresponding system notification. Future stages remain enabled. Mute must not mean disable, snooze, or end all monitoring.
- **End tracking…:** a separate text action with a native confirmation, “End this destination alarm?” The confirmation names the destination and says later alerts will stop; choices are “Keep tracking” and “End this alarm”. End only the identified session, leaving other work active.

Do not copy the Clock app’s time-based Snooze into the first version: ten minutes can carry a rider well past a nearby stop. Additional approach distances are the repeat mechanism. Each selected threshold is eligible once per armed session; canceled gestures, route navigation, or revisiting an event cannot replay it.

Every action carries alarm ID, event ID, and session ID. Recheck current stored state before mutating it. A tap from an older session, a deleted alarm, or an already acknowledged event must be a safe no-op with a clear “This alert has ended” recovery. Persist acknowledgment/completion before dismissing the screen. Failed storage writes keep the action available with an inline retry; they must not claim that monitoring ended.

## Presentation and accessibility

Use an Expo Router route outside the tab stack. Standard system Back closes the view without disabling tracking or silently changing acknowledgment. Closing and muting are different actions. Honor Android predictive Back and iOS swipe navigation rather than trapping the rider.

Use a vertical reading order: stage, destination, line/type, distance/context, safe action guidance, primary action, helper, mute, end tracking. Map the same content to notification title/body. The app screen uses native safe areas, a scrollable body, and actions that remain reachable at large text sizes. At narrow widths or enlarged fonts, let labels wrap and allow the action region to scroll; do not shrink type or truncate the destination.

Reuse `NavoPressable` for custom actions. Keep shared subtle sink-and-spring settings, native switch feedback, and static borders. Use at least 48dp Android / 44pt iOS targets with separation. Use semantic status color plus text, never color alone; the possible-missed state uses amber rather than a red emergency treatment. The current Navo palette provides the foreground/background pairs shown in the comps.

Announce a new stage once to the screen reader, then focus the stage heading when the rider opens the view. Do not announce every GPS update. Distance labels include their unit and approximation. A vibration setting supplements the visible message and selected sound; it does not override device restrictions.

No pulsing, flashing, spinning map pin, or shaking full-screen content is needed. At most use a short system transition and the existing press feedback; Remove animations / Reduce Motion keeps a static composition.

## Delivery and recovery

| Condition | Proposed behavior |
| --- | --- |
| Screen locked or Navo backgrounded | Deliver the system notification according to allowed settings. Open the app screen on user tap. Do not claim it was seen or heard merely because the post succeeded. |
| App starts from a notification | Hydrate SQLite, validate event/session IDs, then navigate once. Keep the event intent while startup loads; do not force onboarding animations or wait for map tiles. |
| Several alarms fire | Keep durable events for each alarm. Show one selected event, a clear count, and a “Next alert” action. Do not let another destination replace a screen while the rider is acting. |
| Arrival overtakes an older close alert | Prefer the later valid stage for that same session when opening the view. Do not play stale approach messages in a burst after the rider is already at or past the destination. |
| Notification denied, channel muted, Focus, or sound unavailable | Explain the actual status in the active alarm panel with a system-settings link when applicable. Foreground visual information remains available. Do not bypass the OS with another channel or substitute continuous audio to evade a mute choice. |
| GPS lost underground or stale | Show “Waiting for a fresh location” with last-known context; do not infer arrival or a missed stop from silence, elapsed time, or one poor sample. |
| Rider remains at destination | Complete on “I’m here”, or apply the detector’s bounded arrival-observation window. Do not monitor forever solely to wait for a missed-stop signal. |
| User confirms arrival then walks away | No possible-missed warning for the completed session. A later ride requires explicit rearming. |
| Delivery retry or process restart | Resume from persisted events and acknowledgments, deduplicate by event ID, and retain only current sessions. No duplicate ring because a screen remounted. |

## Platform boundaries

Android supports urgent high-importance notifications, but presentation is controlled by system and channel settings. Its full-screen intent path is separate from ordinary local notification delivery. [Android’s time-sensitive notification guidance](https://developer.android.com/develop/ui/views/notifications/time-sensitive) also describes heads-up presentation while the device is being used.

Android 14+ full-screen intent access and Play eligibility must be evaluated before a later lock-screen activity is built. A destination reminder must not assume it qualifies as an alarm-clock app. The user’s grant and the Play declaration/review are separate requirements; denied access requires a notification fallback. [Google Play’s current requirements](https://support.google.com/googleplay/android-developer/answer/13392821) describe default grants for qualifying calling/alarm functionality and the special-access flow for other cases. This proposal does not add `USE_FULL_SCREEN_INTENT`, overlays, accessibility-service tricks, or background activity launches.

For iOS, propose a system local notification plus notification actions and an in-app route. The documented UserNotifications interaction model supports registered actions and handling foreground notifications; it does not establish arbitrary app takeover of the lock screen. Treat Clock-equivalent takeover as unsupported in this design. Do not promise critical alerts, bypassing Focus, or continuous background ringing. [Apple notification interactions](https://developer.apple.com/documentation/usernotifications/handling-notifications-and-notification-related-actions), [action categories](https://developer.apple.com/documentation/usernotifications/declaring-your-actionable-notification-types), and [notification authorization](https://developer.apple.com/documentation/usernotifications/asking-permission-to-use-notifications) define the normal supported path.

## Implementation and proof

1. Implemented: schema 7 retains bounded alert-screen events independently of notification retries, with presented-event IDs and session-safe present/silence/acknowledge/complete/end actions. A later stage cannot make an acknowledged older reminder current again.
2. Implemented: the three themed screen states, pinned events, Next alert, read-only saved-coordinate map, storage and stale-session recovery, and notification-tap/foreground navigation. Native sound notifications use explicit user-tap deep links; no background activity is auto-launched.
3. Implemented: existing OS-managed cues are canceled on mute, completion, end, Back/blur, and app background. Close-only silence removes a queued retry while keeping the screen event unacknowledged. No second audio player, continuous ring, or sound-policy override is introduced. Android cancellation follows NotificationManager; iOS audible cancellation remains a device acceptance item.
4. The action buttons are in the app screen. Extra notification-tray action buttons and Android full-screen intent are separate follow-ups; full-screen access/distribution eligibility has not been assumed.
5. Native acceptance: locked/unlocked/foreground/background; denied permission and muted channel; Focus/silent; cold start; rapid/repeated taps; simultaneous alarms; deleted/rearmed alarms; storage failure; offline maps; GPS gaps; both themes; screen reader; large text; Reduce Motion; sound and vibration. Automated/domain and browser layout checks are narrower evidence.

The SVG/PNG sheets are visual proposals at 360dp composition scale. The interactive HTML demonstrates action meanings only. They are not native-device captures, a proof of responsiveness, or evidence of sound/vibration delivery. Existing `DESIGN.md` and application UI remain unchanged by these proposal files.
