# Active alarm distance

Navo tracks the destination the rider explicitly enables. It does not guess where the rider intends to travel or automatically enable a saved alarm.

## Rider experience

- A separate panel below the Saved alarms heading shows the viewed destination, rounded distance, monitoring status, and the age of the last usable location.
- Saved alarm cards continue to show only destination, Rail/Bus/Place type, and the native switch. Tap a card to edit; hold to select for deletion. The distance panel is hidden during bulk selection.
- The initial viewed target is the most recently enabled alarm. It remains selected while it exists. When several alarms are enabled, Change destination selects which one to display without enabling or disabling any alarm.
- All enabled alarms are monitored using one shared location task, alongside any mapped active route trip. Disabling or deleting one alarm must not stop checks needed by another alarm or trip.
- Status distinguishes finding location, waiting to leave the alert area, monitoring, weak GPS, delayed updates, unavailable tracking, pending delivery, and acknowledged alert delivery.
- After arrival detection, the panel freezes the last known distance. Alert pending means notification delivery has not been acknowledged; Alert sent means Navo's delivery call succeeded, not that the rider heard it. Phone notification, Focus, and silent settings still apply.
- With no enabled alarm, the most recent alerted alarm may remain visible. The panel disappears when no enabled or alerted saved alarm remains.

Distances are straight-line estimates to the saved point, not road or rail travel distances or an ETA. Distances below 1 km are rounded to 25 m with a 25 m display floor; longer distances use one decimal kilometre. A correct calculation cannot validate an incorrectly selected destination pin. Bundled station order is not a verified coordinate catalog.

## Reading quality and freshness

The detector rejects invalid or out-of-range coordinates, unknown/negative/over-80 m accuracy, negative or non-finite timestamps, readings over 60 seconds old, readings more than 5 seconds ahead of the current clock, and alarm samples captured before that alarm's session began. Duplicate and out-of-order samples cannot advance an alarm. Usable samples in an OS batch are processed chronologically; rejected samples do not replace the last good location.

The display uses a stricter 45-second freshness window. A reading may remain eligible for detector processing between 45 and 60 seconds old while the panel already labels it Last known and reports a delayed update. This is intentional: the display must not present delayed telemetry as live. Tracking errors also mark retained distances as Last known. Missing data never becomes a fabricated zero-distance reading.

The panel receives accepted updates from a narrow in-memory subscription. Its age label ticks every five seconds only while its screen is focused and the app is active. No per-card GPS request, distance network request, or panel database poll is added. Persisted state remains the recovery source for another headless runtime or app resume.

## Sampling policy

These are implemented request values that still require device tuning. Distance bands are measured outside the alert radius, after accounting for location uncertainty and elapsed travel headroom. The closest enabled alarm or mapped upcoming route stop can demand a stricter profile.

| Profile | Initial condition | Accuracy | Android minimum time | Movement threshold | Automatic iOS pause |
| --- | --- | --- | --- | --- | --- |
| Recovery | Missing, stale, unusable, or pre-session location | High | 5 seconds | 10 m | Off |
| Departure | Every enabled alarm is still waiting to leave and confidently inside its area; no other workload needs a stricter request | Balanced | 10 seconds | 25 m | On |
| Near confirmation burst | A recent first inside reading needs a second usable confirmation | High | 2 seconds | 0 m | Off |
| Near | Within 1 km outside the alert boundary, or insufficient travel headroom | High | 2 seconds | 10 m | Off |
| Approaching | Within 3 km outside the alert boundary, or limited travel headroom | High | Up to 5 seconds | 25 m | Off |
| Far | Sufficient distance and travel headroom | Balanced | 20–30 seconds | 75–150 m | On |

Departure requires the distance plus location uncertainty to be within the alarm radius. It avoids continuously requesting navigation-level accuracy while the rider is still at the saved location. Monitoring alarms or mapped route stops can override it. The confirmation burst removes the movement threshold so a rider who stops inside the alert area can supply a second reading. It does not remove freshness, accuracy, or two-reading validation.

Far values respect the saved sampling preference within those bounds. Travel headroom uses at least 35 m/s as a conservative estimate; a reported lower speed cannot justify longer sleeps. A more demanding profile applies immediately. Relaxing a profile requires a stable lower-demand request for at least 60 seconds, reducing repeated native reconfiguration. Departure is an exception and applies immediately while confidently inside, because arrival checks have not armed yet. A single cancellable reconciliation timer reevaluates relaxation even if another location callback does not arrive; shutdown or a changed request cancels obsolete work. Re-registering the same task updates options rather than creating per-alarm tasks.

The coordinator checks device-wide location services separately from app permissions. If services are off, it stops both location updates and the Android background session and shows a location-off status. Startup, foreground resume, workload changes, and a 30-second health check while foregrounded reconcile tracking without prompting for permissions. This health check does not add another GPS subscription. Headless updates still depend on OS delivery; a foreground timer is not a background scheduler.

Expo's time interval option is Android-only. iOS uses its location service, accuracy, movement threshold, and pause behavior. OS batching, throttling, device power restrictions, and termination can delay or stop delivery. The request values are not guaranteed update schedules. No battery saving, smoothness, or on-time alert result has been measured or accepted by this source change alone.

## Expo SDK 58 Android compatibility

Android uses the existing `expo-location` task for batched readings and adjustable intervals. Its task options omit `foregroundService`: the legacy API rejects options updates made from the background when that option requests a service start. Instead, the coordinator manages the SDK 58 `expo-location/next` background session separately, starting it while Navo is in the foreground. That documented session supplies the location foreground service and its persistent notification; it does not add a second position watcher or per-alarm task. Legacy task updates still require granted background location permission.

The session and location task are both stopped when no alarm or mapped route trip needs them, or when required permissions are no longer granted. A missing session cannot be newly started from the background; reopening Navo provides the foreground recovery opportunity. The coordinator must expose a tracking problem rather than promise continued updates when native startup fails. See [Expo SDK 58 background sessions](https://docs.expo.dev/versions/v58.0.0/sdk/location-next/#start-a-background-session).

`expo-location/next` and its `LocationModuleNext` native module ship in the installed SDK 58 `expo-location` package. This change adds no dependency, but the installed development or release binary must match that native package. A JavaScript export cannot prove native module availability, Android service lifecycle behavior, or device delivery.

## Native acceptance checklist

Use an updated development or release build on physical Android and iOS devices. JavaScript export and simulated GPS tests do not establish background reliability.

- [ ] Enable a saved destination outside its radius; confirm automatic distance updates and correct units. Enable near the destination; verify waiting-to-leave behavior and no immediate arrival alert.
- [ ] Leave an alarm enabled while still inside its departure area. Verify the departure request, then travel away and return. Stop moving after one inside reading; confirm the zero-distance-filter burst can obtain a second usable reading without relaxing the two-reading rule.
- [ ] Travel at bus and train speeds through recovery, far, approaching, and near conditions. Confirm batches do not lose short pass-throughs and two usable nearby readings still gate arrival.
- [ ] Enable multiple alarms, choose a displayed target, and enable another alarm. Verify the viewed target stays selected and all alarms remain monitored.
- [ ] Combine alarms with a mapped route trip. Disable/delete the displayed alarm during a location update and verify remaining workloads continue without resurrected alarms or duplicate notifications.
- [ ] Lock the screen and background the app for a representative ride. Resume it; verify actual fix ages, state reconciliation, and appropriate last-known labels.
- [ ] On Android, start tracking while Navo is foregrounded, then cross sampling bands with the screen locked. Verify the independent background session remains available, legacy options changes do not throw a service-start error, and stopping the last workload removes the foreground service notification.
- [ ] Test after disconnecting network access, with the destination already saved. Distance calculation should remain local; unavailable map/search services must not prevent saved-point distance checks.
- [ ] Test weak GPS, an underground section, location services off, and recovery outdoors. Verify old distance never appears live and unusable samples never become zero or replace the last good fix.
- [ ] Revoke location/background/notification permission while monitoring, then restore it. Confirm clear status, safe task reconciliation, and no silent permission prompt loop.
- [ ] Test notification delivery failure and retry, plus Focus/silent settings. Confirm pending versus acknowledged delivery and no duplicate session alert.
- [ ] Test battery saver and vendor background restrictions. Force-close and reopen the app; verify honest unavailable/delayed states and reconciliation rather than a guaranteed background claim.
- [ ] Compare the same route/device/build conditions against the previous fixed policy: record battery change, accepted-fix age, display delay, native registration count, database writes, and alert timing. Retain results before claiming an optimization benefit.
- [ ] Inspect both themes, large system text, screen-reader labels, long destination names, and selector controls. Confirm no repeated live announcement for every distance update.
