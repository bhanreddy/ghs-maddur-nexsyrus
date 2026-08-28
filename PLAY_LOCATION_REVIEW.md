# Google Play background-location resubmission

Use this checklist for the Samskruthe School Nawabpet release that contains the prominent-disclosure fix.

## Declaration form

Declare one feature only: **Live school-bus tracking during an active driver trip**.

Suggested answer:

> Authorized school-bus drivers start a trip in the app. During that active trip, the app collects precise location in the background so assigned parents and authorized school staff can continue seeing the live bus position when the driver's screen is off, the app is not in use, or the driver uses another app. Background access is necessary because drivers must not keep the screen on while driving. Precise access is necessary to display the moving bus accurately and determine arrival at individual pickup stops; coarse location may be several kilometers wide and is not sufficient. Tracking begins only after the driver starts the trip and grants location permission, and it stops when the trip ends. Location is not used for advertising or sold.

Do not present automatic stop updates and route calibration as separate declared features. They are supporting parts of the single live bus-tracking workflow.

## Store listing

Add this paragraph prominently to the full Play Store description:

> **Live school-bus tracking:** During an active trip, authorized drivers can share the bus's precise location with assigned parents and authorized school staff. Location continues to update when the screen is off or the app is not in use so families can follow the bus safely. Tracking starts only when a driver starts a trip and stops when the trip ends.

Consider adding a store screenshot of the parent live-bus map or the driver's active trip screen.

## Review video

Record a new video from a clean Android install using the exact AAB being submitted:

1. Open the app and sign in with the reviewer-accessible driver account.
2. Open **Route**, choose the assigned bus and route, and tap **Start Trip**.
3. Hold on the full in-app location disclosure long enough for every line to be readable.
4. Tap **Continue**, then grant the Android foreground location permission.
5. Hold on the background-location disclosure, tap **Continue**, and grant **Allow all the time** in Android settings when requested.
6. Return to the active trip, show the persistent “Trip in progress” location notification, turn the screen off or place the app in the background, and show the live bus moving on an assigned parent's device.
7. End the trip and show that live tracking/notification stops.

Keep the link publicly viewable without requesting access. Google recommends a video around 30 seconds, but complete, readable evidence is more important than cutting required steps.

## Data Safety and privacy

- Review **Approximate location** and **Precise location** in Data Safety.
- The purpose is **App functionality** (live school-bus tracking), not advertising or analytics.
- Location is not ephemeral: detailed trip history can be retained for 30–90 days.
- Data is encrypted in transit.
- Ensure answers about “sharing” reflect that assigned parents and authorized school staff can view the relevant live bus position.
- Publish the updated policy at <https://schoolims.nexsyrus.com/privacy> before submitting the AAB.
- Use the same privacy-policy URL in Play Console and inside the app.

## Foreground-service declaration

Because the app targets Android 14 or newer and uses a location foreground service, complete the Play Console foreground-service declaration as well:

- Type: **Location**
- Use case: **Background Location Updates – User-initiated location sharing / vehicle activity tracking**
- Explain that the driver initiates it by tapping **Start Trip**.
- Explain that interruption would stop parents and school staff from seeing the moving bus and receiving accurate stop updates.
- Use the review video to show the Start Trip action, the persistent **Trip in progress** notification, background operation, and End Trip stopping the service.

## Release checks

- Build a new Android App Bundle with a higher Play version code.
- Verify the AAB manifest contains:
  - `ACCESS_COARSE_LOCATION`
  - `ACCESS_FINE_LOCATION`
  - `ACCESS_BACKGROUND_LOCATION`
  - `FOREGROUND_SERVICE`
  - `FOREGROUND_SERVICE_LOCATION`
- In every active Play track, replace/deactivate the rejected build so it is under **Not included**.
- Provide permanent, working reviewer credentials with an assigned driver, bus, route, and at least one parent account that can view the bus.
- Make sure the declaration text, video, store description, privacy policy, Data Safety form, and actual app behavior all describe the same single live bus-tracking feature.
