# Routes: assessment and enhancement plan

Reviewed 12 November 2026 against the current source and the supplied Routes screenshot.

## Decision: keep and enhance

Keep Routes as an offline stop guide and saved bus route library. Destination alarms watch a single saved point. Routes adds ordered stops between boarding and arrival, travel in either direction, the next stop, and manual progress. Removing it would also remove the entry point to existing saved bus routes. Source review establishes these capabilities; it does not establish how often riders use them.

| Option | Result | Recommendation |
| --- | --- | --- |
| Enhance the current module | Clear manual journeys, recoverable current trips, useful bus routes, and a direct path to station alarms | Recommended; builds on existing working features |
| Replace it with a full journey planner | Requires routing and transfer rules, service data, provenance, and ongoing maintenance | Revisit when those data and requirements exist |
| Remove the tab | Simplifies navigation but requires a new home for saved bus routes, current trips, and existing links | Revisit only with evidence that the guide is unnecessary; retain rider data and a recovery path |

The primary job is: choose a route, follow its stop order, and return to the current trip. An arrival reminder belongs in the existing destination alarm editor. The separate rail station catalog supplies station points for that editor; it must not automatically make a rail journey GPS-complete.

## Findings

- `routes.tsx` repeated three warning badges and an explanation of absent coordinates. Its headline described only rail, despite containing a bus library. It had no current-trip entry point.
- Its rail rows added `borderWidth: 1` only while pressed. This changed the row geometry and layered an accent outline over shared press feedback. Settings, station picker, and trip selector rows use stable geometry with `NavoPressable`. There is no separate hover implementation in these native controls.
- `trip/setup.tsx` created `activeTrip` and `activeRoute`, but called its action “Start destination alarm.” No destination alarm was created or armed. The Sleep mode description also promised automatic alerts on manual routes.
- Starting a trip replaces an existing active trip without a resume/replace decision.
- `bus/new.tsx` navigates before its async state write finishes. It appends routes from a rendered snapshot and permits saving during location capture. A failed save can lose the draft or open an unavailable route.
- Saved bus routes have no editing, reordering, or deletion controls.
- `trip/active.tsx` has no in-flight guard on manual confirmation. Rapid taps can advance two stops. Its empty-state route action opened Alarms.

## Implemented UI and navigation improvements

- The Routes title and description now cover rail and bus. Rail names, endpoints, and stop counts form one grouped list, with larger supporting text and tighter section grouping.
- One explanation identifies manual rail progress. “Add a station alarm” opens the existing rail alarm picker as a separate action.
- Current active trips have “Continue trip”; completed trips awaiting cleanup have “Finish trip.” Both open the existing trip screen.
- The empty bus library is an actionable creation row. Populated libraries have a labeled compact Add action. Loading and storage errors are distinguished from an empty library.
- Rail rows use static geometry and the existing card press preset. Add uses the compact preset. Shared timing, spring, ripple, cancellation, and Reduce Motion behavior remain centralized in `NavoPressable`.
- Setup says “Start manual trip” without journey locations and shows alert preferences only when the journey can use them. Counts describe stops after boarding. The decorative 54% progress fill before a trip starts is removed.
- Active-trip copy describes manual progress for both rail and unmapped bus routes. Empty-state recovery and completed/ended trips return to Routes.

Validation for this UI pass: Expo lint, TypeScript, 12 existing route/trip regression tests, and the Android JavaScript export passed. No Android device was attached for native layout or interaction checks; those remain pending. No new style-mirroring tests or dependencies were added.

## Functional work implemented

The core changes in phases 1–3 are implemented in source as of 15 November 2026. Device acceptance in phase 4 remains pending. The route library, trip setup, progress screen, and station-alarm handoff retain the existing shared UI components and press feedback.

### 1. Make saves and progress reliable

1. **Bus save:** awaits `mutateState` and appends against the latest stored routes. A shared operation lock prevents repeat submission and saving during location capture. Drafts survive errors; stable route IDs make retries idempotent after an uncertain commit. Blank intermediate stops and invalid coordinate pairs produce explicit errors.
2. **Trip replacement:** offers Resume or Replace for an active trip, and Finish or Start new trip for a completed trip. The transaction checks the trip identity and current bus template so an older dialog cannot replace a newer session or start a changed template.
3. **Manual progress:** confirmation is locked while saving. Both trip identity and the rendered stop index are checked, so duplicate or stale confirmations cannot advance another stop. Notification failure is separate from successfully saved progress. Undo remains a future option until completion and notification reconciliation are specified.
4. **Screen lifetime:** delayed saves, copies, and native dialog actions retain ownership of their original focused screen visit. Writes and cleanup can finish after navigation, while stale callbacks cannot redirect a different screen. Storage errors have a non-replacing Retry action, preserving open drafts.

Acceptance: failed writes keep the draft/progress visible; two taps during a pending operation create one save/advance; recording a location cannot race a route save; replacing a trip is explicit; unrelated destination alarms retain their state.

### 2. Improve rail setup and connect the alarm flow

1. Boarding/destination search uses names and aliases within the selected line, keeping the two Cubao and Santolan stations distinct.
2. Swap reverses the endpoints. The opposite selected endpoint is unavailable in each picker; changing boarding never silently moves the destination.
3. “Create alarm for this station” maps the destination's existing stop ID to its catalog station ID. The alarm editor opens that station's map confirmation, then saves new alarms off. Unknown IDs show a recovery screen. Journey progress and alarm setup remain separate.

Acceptance: forward/reverse sequences and stop counts are correct; the same stop cannot be both endpoints; a selected destination opens its own catalog point; a missing catalog match has an explicit recovery; journey routes retain their current coordinate status.

### 3. Complete saved bus route maintenance

Each bus route has independent primary and More controls. More exposes Edit, Duplicate, Create reversed copy, and confirmed Delete actions. The editor supports moving stops, reversing their order, and clearing saved points. Edits preserve stop IDs and an active journey's route snapshot; deletion is blocked while an active or unfinished completed trip uses the template. New copies receive distinct route and stop IDs. Partially mapped routes keep manual progress, and saved GPS points remain rider supplied.

Acceptance: edits survive restart, route names and order remain correct, deleting a template cannot strand an active trip, and GPS behavior is enabled only with valid coordinates for every journey stop.

### 4. Validate on devices — pending

Review both themes, small screens, large text, long route names, many saved routes, and screen reader labels. Check rapid/held presses, scrolling away from a press, navigation interruption, and Reduce Motion. Confirm that row content never shifts or gains an outline during a press. Run lint/typecheck plus meaningful persistence and trip regression tests for each functional phase.

The current screenshot provides visual evidence of the old layout only. Source checks and JavaScript exports do not establish native interaction or screen acceptance.

The source review was independently calibrated using a temporary worktree outside the checkout: replacing the shared submit button with clickable text was detected. That proof covered component reuse in source; it did not exercise native layout, text scaling, scrolling, gestures, or notification delivery.

## Final source validation — 15 November 2026

- Expo lint and strict TypeScript passed.
- All 182 tests in 20 files passed, including concurrent route appends, failed-write retries, immutable trip snapshots, in-use deletion protection, duplicate/stale confirmations, and screen-visit ownership.
- Android and iOS JavaScript exports passed in `dist/navo-routes-functional-android` and `dist/navo-routes-functional-ios`. These are bundle checks, not native builds.
- Independent review of the five screens and domain actions found no remaining source blockers after the storage-recovery and navigation fixes.
- The temporary calibration worktree was removed. No Android device was connected for native acceptance; the device checklist above remains pending.
