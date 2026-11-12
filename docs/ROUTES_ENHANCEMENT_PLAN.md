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

## Functional work proposed next

These phases are a proposal; the persistence and journey logic below has not been implemented as part of this UI pass.

### 1. Make saves and progress reliable

1. **Bus save:** await `mutateState`, append against the current stored route list, disable repeat submission and saving during capture, retain the draft on failure, and navigate only after persistence succeeds. Validate blank intermediate stops explicitly rather than silently removing them.
2. **Trip replacement:** offer Resume or Replace when another trip is active. Recheck that trip's identity in the transaction so an older dialog cannot replace a newer session. Handle a completed trip awaiting Finish separately.
3. **Manual progress:** lock confirmation while its write is pending and show a recoverable error. Preserve the current trip identity check. Consider undo only after defining how arrival/completion and notifications are reconciled.

Acceptance: failed writes keep the draft/progress visible; two taps during a pending operation create one save/advance; recording a location cannot race a route save; replacing a trip is explicit; unrelated destination alarms retain their state.

### 2. Improve rail setup and connect the alarm flow

1. Search boarding/destination names and aliases within the selected line, keeping the two Cubao and Santolan stations distinct.
2. Add Swap endpoints, and stop silently moving the destination when boarding is changed. Make incompatible selections explicit.
3. Add “Create alarm for this station” using the selected destination's existing stop ID to find its catalog station ID. Open the existing station map confirmation and alarm editor with that identity; save new alarms off. Keep journey progress and alarm setup separately understandable.

Acceptance: forward/reverse sequences and stop counts are correct; the same stop cannot be both endpoints; a selected destination opens its own catalog point; a missing catalog match has an explicit recovery; journey routes retain their current coordinate status.

### 3. Complete saved bus route maintenance

Add edit, reorder, duplicate/reverse, and delete. Preserve stop IDs through edits. Keep an active journey's route snapshot stable when its saved template changes; protect deletion while it is in use. Maintain a manual option for partially mapped routes and explain that saved GPS points are rider supplied.

Acceptance: edits survive restart, route names and order remain correct, deleting a template cannot strand an active trip, and GPS behavior is enabled only with valid coordinates for every journey stop.

### 4. Validate on devices

Review both themes, small screens, large text, long route names, many saved routes, and screen reader labels. Check rapid/held presses, scrolling away from a press, navigation interruption, and Reduce Motion. Confirm that row content never shifts or gains an outline during a press. Run lint/typecheck plus meaningful persistence and trip regression tests for each functional phase.

The current screenshot provides visual evidence of the old layout only. Source checks and JavaScript exports do not establish native interaction or screen acceptance.
