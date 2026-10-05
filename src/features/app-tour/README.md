# SchoolIMS app tours

The extended catalog covers 218 feature guides and 229 route identifiers across all seven portals, alongside seven complete portal walkthroughs and the original 21 welcome/task guides. Each feature has bilingual explanations of its purpose, available tools and safe next actions. Detailed screens that require a selected record are explained from their parent module rather than opened without context. App Tour sits below the dashboard quick-action cards in every portal, with additional Help buttons in the shared headers. The catalog contains English and Telugu instructions and sentence-level narration. No live AI, database migration, or progress synchronization is used.

## Enable and integrate

Production builds keep tours disabled until `EXPO_PUBLIC_APP_TOUR_ENABLED=true` is set **before export/build**. Development enables tours by default; set the flag to `false` to disable them there. Keep the production flag off until the acceptance checklist below passes. Rebuild Android/iOS binaries to include the SDK-compatible `expo-audio` dependency; the guarded audio loader supports device-speech fallback in older binaries.

`TourProvider` is mounted in the root layout. `useAppTour()` exposes `open`, `start`, `resume`, `back`, `next`, `retry`, `jumpToChapter`, and `exit`. The library supports English/Telugu search through titles and explanations, categories, progress filters, and guides for the current screen. `start(id)` resumes paused progress; `start(id, true)` restarts. Exiting closes the overlay and stops narration while retaining the current screen and drafts.

Register existing controls with `TourTarget`; `native` clones a measurable native element or a component that forwards its ref. Use a wrapper for other custom components. IDs must be stable and start with their portal or `screen.`. `content/target-bindings.json` records source files and screen-area IDs for the extended catalog. Native targets forward refs through nested bindings. Registration follows screen focus; persistent navigator chrome can explicitly pass `active`. Use `TourScrollView` for automatic target reveal. Place `TourModalContent` inside a native Modal and give it a unique host ID when adding modal steps.

Task completion uses `emitTourEvent(eventId)` or the target's `event` prop. The latter forwards the existing press handler and then emits the event; text entry emits only after a nonempty keyboard Search/Done submission. Events never invoke handlers themselves. Submission, payment, upload, sending, and record-changing controls must be explanation steps with `readOnly: true` in the catalog. No guide performs these operations. Prerequisites can use `TourCondition` and a step's `prerequisite` field.

Access is rechecked before navigation through existing role, permission, school feature-flag, feature-access APIs, and staff portal settings such as payslip visibility. Complete walkthroughs include only eligible chapters; the active definition is frozen so an asynchronous eligibility response cannot shift the current step. Shared screens retain the originating portal. Staff view-as navigation preserves its route context and isolates progress for each viewed staff member. Cached feature decisions expire and are scoped to the same identity as progress. The eight-second readiness deadline yields localized Retry, Skip, and Exit controls. Skipped steps remain resumable. Narration starts only after a real registered control is measured.

Invitations appear once per school, user and portal, independently of child or staff view-as context. Existing dismissal keys are migrated. The session also remembers an invitation if a storage write fails; unreadable storage suppresses automatic invitations. The overlay lock queues first-use invitations behind existing popups. Fingerprint/privacy locks pause guides; required updates unmount the tour provider and stop narration. Driver invitations are suppressed during an active trip. App backgrounding pauses guides. Tour cards support keyboard focus containment and Escape, reduced motion, readable text when speech is unavailable, and persistent navigation controls below scrollable instructions.

## Audio and local storage

Playback tries verified cached premium clips, remote premium clips, an installed matching device voice, then readable instructions with an audio-unavailable message. Premium playback uses `expo-audio`; device speech uses `expo-speech`. `audioOwner` coordinates tours with existing read-aloud controls. Generation tokens cancel stale navigation, voice lookup, player, and completion callbacks. Paused device narration resumes from the current sentence, including Android.

Native clips live in the application's document directory. Web and Tauri clips use IndexedDB. Downloaded bytes are checked against SHA-256 and byte length; invalid cache entries are removed. The hub supports per-language downloads and cache removal after premium assets have been published. An empty manifest intentionally keeps device/text fallback usable without cloud configuration.

Preferences and progress use the `schoolims_tours_v1:` AsyncStorage prefix, outside the existing version-cache cleanup policy. Keys include school, user, access context, portal, tour, and content version. Preferences follow the app language until the user overrides tour language. Narration defaults off when a screen reader is detected. Content versions invalidate old progress; narration versions invalidate synthesized clips.

Complete walkthroughs track visited steps individually. Chapter jumps do not mark earlier chapters complete. Finishing with skipped or unvisited explanations keeps a resumable cursor. Completed chapters also update their individual feature guide progress. Newly eligible chapters can resume even if the earlier available chapters were completed.

## Premium release workflow

Review `content/catalog.json` and the extended source `content/features.json` with English and Telugu speakers. Run `npm run tour:catalog` from the frontend after editing feature content; it generates `content/extended-catalog.json` and `content/categories.json`. Do not edit these generated files by hand. For a published feature change, increment that feature’s `version` and the catalog `contentVersion` (the complete walkthrough version). Increment only the changed feature’s `narrationVersion` when narration requires replacement. Other features keep their explicit versions and reuse unchanged MP3 hashes. Complete walkthrough steps reference their feature guide audio, so clips are generated only once. Display copy and narration are independent fields; narration arrays contain one sentence per clip. When published content changes, increment its content and/or narration version. Voice names and hashing inputs must agree between frontend `narration.ts` and backend `scripts/tourAudio.mjs`.

Run these commands from `SchoolIMS-Backend`:

```sh
npm run tour:check
npm run test:tour
npm run tour:generate
# Listen to every staged English and Telugu clip before publishing.
npm run tour:publish
npm run tour:check -- --require-audio
```

Generation uses Google Cloud Application Default Credentials, an enabled Text-to-Speech API, and billing. Default voices are `en-IN-Chirp3-HD-Achernar` and `te-IN-Chirp3-HD-Achernar`. Changed text/locale/voice/narration-version hashes create new MP3 files; unchanged hashes reuse staged files. Files stage in the backend's ignored `.tour-audio` directory. `--staging` and `--frontend` override paths.

Publishing requires backend-only `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. It validates every staged checksum before uploading immutable generic narration into the public `schoolims-tour-audio` bucket and writes `content/audio-manifest.json` atomically. `tour:publish` passes `--reviewed`; run it only after listening through both languages. Generation and publishing are separate commands. No Google or storage-service credentials belong in the frontend bundle.

References: [Google Chirp 3 HD](https://docs.cloud.google.com/text-to-speech/docs/chirp3-hd), [Expo SDK 54 audio](https://docs.expo.dev/versions/v54.0.0/sdk/audio/), [Expo SDK 54 speech](https://docs.expo.dev/versions/v54.0.0/sdk/speech/).

## Validation and acceptance

Automated frontend checks:

```sh
npm run tour:catalog:check
npm run test:tour
npx jest --runInBand src/__tests__/staffHome.test.tsx src/__tests__/staffDiary.test.tsx src/__tests__/manageStaffDiary.test.tsx src/__tests__/staffStudentAttendance.test.tsx
npm run typecheck
npx expo export --platform web
```

Tests cover exhaustive route/navigation coverage, bilingual search, frozen chapter eligibility, chapter jumps, staff view-as identity, staff payslip settings, nested native refs, shared-screen navigation, reusable narration assets, delayed-start cancellation, state cancellation, target timeout/retry, explicit completion events, feature/progress identity isolation, content versions, interruptions, completed progress, locale selection, missing Telugu voices, premium fallback, pause/resume, and shared audio ownership. Generation, publication and the local release check reject missing translations, invalid or unregistered targets/routes, stale hashes, and incomplete premium manifests.

Before enabling production, finish this acceptance checklist on authenticated school accounts:

- Walk every guide in English and Telugu on Android, iOS, mobile and desktop browsers, and the Tauri shell. Confirm target alignment and scrolling with real records and empty lists.
- Verify offline startup and language packs, failed downloads, unavailable Telugu voices, denied browser autoplay, narration speed/pause/replay, app backgrounding, rapid navigation, and account/context switching.
- Verify fingerprint/privacy locks, required updates, popup ordering, and active driver trips. Check that leaving a guide preserves unsaved drafts and existing navigation guards.
- Verify native modal hosts for any subsequently added modal steps, keyboard/orientation changes, large text, reduced motion, screen-reader focus, keyboard navigation, contrast, and touch targets.
- Review translations and listen through every generated clip in both languages. Run the strict premium manifest check, rebuild/export, then enable the flag only after acceptance.

At implementation time, cloud synthesis/publication and physical-device/authenticated/Tauri acceptance have not been performed. The frontend repository already has unrelated TypeScript diagnostics; compare against its baseline before treating the full type-check failure as a tour regression.

## Coverage maintenance

Feature guide counts: student/parent 37; staff/teacher 32; admin 88; accounts 30; driver 10; gatekeeper 16; applicant 5. Counts shown to users depend on current access. Add new routes to `content/features.json`, bind real screen controls, regenerate the catalog and run backend `tour:check`. The coverage validator fails when implemented routes or navigation destinations lack a guide. Authentication, bootstrap and development-only pages have explicit exclusions. Existing placeholder features are described as they currently behave; tours do not activate their unfinished actions.
