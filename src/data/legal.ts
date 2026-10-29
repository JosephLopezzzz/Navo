export const LEGAL_DOCUMENT_VERSION = '2026-10-29';

export interface LegalLink { label: string; url: string }
export interface LegalSection { title: string; body?: string; links?: LegalLink[] }
export interface LegalPage { title: string; sections: LegalSection[] }
export type LegalPageKey = 'privacy' | 'terms' | 'location-safety' | 'map-data' | 'all';

const pages: Record<Exclude<LegalPageKey, 'all'>, LegalPage> = {
  privacy: {
    title: 'Privacy policy',
    sections: [
      {
        title: 'Operator and effective date',
        body: 'Draft for review. Operator / data controller: [add the responsible person or organization]. Business address: [add if required]. Privacy contact or email: [add a monitored contact]. Effective date: [set before publication]. Confirm the applicable Philippine privacy requirements and Android backup behavior before release.',
      },
      {
        title: 'Information stored on your device',
        body: 'Navo stores saved destination names and coordinates, alarm distances and states, route stops, trip progress, appearance and sampling settings, and the latest location fix with its time, accuracy, and status in the app database. Optional onboarding preferences (your display name, primary travel mode, rail line, and how you use Navo) are also stored on this device. You can leave the name blank.',
      },
      {
        title: 'Location and notifications',
        body: 'When an alarm or route trip is active, Navo uses foreground and background location to evaluate stop proximity on your device. Arrival alerts are local notifications. The Android location foreground service may show a persistent system notification while location monitoring runs. If you choose “Find nearby,” Navo sends your current coordinates to TomTom to request nearby suggestions. Navo does not send those coordinates to a Navo server.',
      },
      {
        title: 'TomTom requests',
        body: 'Place searches send the text you enter, a search session identifier, and selected place identifiers to TomTom over HTTPS. Nearby searches send the coordinates you choose to use for nearby results. Map requests send tile requests for the area visible on the map. The source does not configure a Navo backend, account system, analytics SDK, or upload of the GPS samples used by alarm evaluation. Confirm provider processing locations and transfer details from the applicable TomTom agreement before publication.',
        links: [
          { label: 'TomTom privacy statement', url: 'https://www.tomtom.com/privacy/' },
          { label: 'TomTom product terms', url: 'https://www.tomtom.com/en-gb/legal/third-party-product-terms/' },
        ],
      },
      {
        title: 'Retention and deletion',
        body: 'Saved app state remains in the local database until it is changed or app data is cleared. Removing a destination from Alarms also removes its destination alarm. This version has no in-app export or one-action erase-all control, and custom bus routes do not yet have an in-app delete action. Confirm system backup and complete deletion behavior before publishing this policy.',
      },
      {
        title: 'Owner review required',
        body: 'The owner must confirm the data controller, contact, retention period, device-backup behavior, third-party processing details, applicable jurisdiction, and user rights before publication. Review the Data Privacy Act of 2012 and current National Privacy Commission guidance with qualified Philippine counsel.',
        links: [{ label: 'National Privacy Commission · Data Privacy Act', url: 'https://privacy.gov.ph/data-privacy-act/' }],
      },
    ],
  },
  terms: {
    title: 'Terms of use',
    sections: [
      {
        title: 'Draft details',
        body: 'Draft for review. Service operator: [add the responsible person or organization]. Contact or support email: [add a monitored contact]. Business address: [add if required]. Effective date: [set before publication]. Applicable jurisdiction: [confirm before publication].',
      },
      {
        title: 'Use as a travel aid',
        body: 'Navo helps you save a destination and receive proximity notifications. You remain responsible for checking route signs, announcements, stop names, and your surroundings. Use the app lawfully and do not interfere with public transport operations or other passengers.',
      },
      {
        title: 'No guaranteed arrival alert',
        body: 'Navo is not an emergency, safety-critical, or guaranteed wake-up service. GPS, permissions, signal, battery settings, Android background limits, notification settings, and service availability can delay or prevent an alert. Do not rely on Navo as your only way to know when to get off. ',
      },
      {
        title: 'Maps and provider content',
        body: 'TomTom place and map content is subject to the applicable provider terms. Navo has not confirmed that its selected license permits long-term storage of provider-derived destination coordinates. The operator must confirm those rights before public distribution.',
        links: [{ label: 'TomTom product terms', url: 'https://www.tomtom.com/en-gb/legal/third-party-product-terms/' }],
      },
    ],
  },
  'location-safety': {
    title: 'Location and safety',
    sections: [
      { title: 'Keep checking your stop', body: 'Navo is a reminder aid, not a guaranteed alarm clock or safety-critical service. Keep track of your trip and follow transit signs and announcements.' },
      { title: 'What can affect an alert', body: 'GPS accuracy, indoor or underground coverage, mobile signal, location permissions, notification settings, battery saver, Android background restrictions, and device manufacturer behavior can delay or prevent location checks and alerts. Navo uses local notifications and does not override Focus or silent mode, so an alert may be muted. The alarm waits until your phone moves away from the saved destination area before it monitors for your next arrival.' },
      { title: 'During an active alarm or trip', body: 'Navo checks location while an alarm or trip is active. Android shows a persistent location-service notification during background monitoring. Turning off permissions or restricting Navo in system settings can stop checks; open Settings to review permissions.' },
      { title: 'Route data limits', body: 'Bundled LRT and MRT route lists contain station order, not verified coordinates, so those trips use manual progress. Rider-created bus route coordinates are entered by the rider and are not independently verified. Navo does not provide a live transit feed or ETA.' },
    ],
  },
  'map-data': {
    title: 'Map data and licenses',
    sections: [
      { title: 'Credits on the map', body: 'The full-screen map keeps the MapLibre attribution control, TomTom copyright caption, and MapLibre mark visible. The map may display provider-supplied credits such as © TomTom and © OpenStreetMap. These credits are part of the map view and should remain legible.' },
      {
        title: 'OpenStreetMap',
        body: 'OpenStreetMap data is available under the Open Database License (ODbL). TomTom provides the map copyright caption used by the app; the map attribution control and the links here provide access to additional source and license information.',
        links: [
          { label: 'OpenStreetMap copyright and license', url: 'https://www.openstreetmap.org/copyright' },
          { label: 'OpenStreetMap attribution guidance', url: 'https://osmfoundation.org/wiki/Attribution_Guidelines' },
          { label: 'Open Database License', url: 'https://opendatacommons.org/licenses/odbl/1-0/' },
        ],
      },
      {
        title: 'TomTom and MapLibre',
        body: 'Navo uses TomTom Orbis Places for place search and TomTom Orbis Map Display for raster map tiles. MapLibre Native renders the map. Provider content remains subject to the relevant agreements and notices.',
        links: [
          { label: 'TomTom Orbis map copyrights', url: 'https://docs.tomtom.com/map-display-api/documentation/tomtom-orbis-maps/v2/copyrights/copyrights' },
          { label: 'TomTom product terms', url: 'https://www.tomtom.com/en-gb/legal/third-party-product-terms/' },
          { label: 'MapLibre Native license', url: 'https://github.com/maplibre/maplibre-native/blob/main/LICENSE.md' },
        ],
      },
      { title: 'License review needed', body: 'Navo has not received license-specific confirmation that the selected TomTom API agreement permits storing provider-derived destination coordinates for saved alarms. The owner must confirm the applicable license before public distribution.' },
    ],
  },
};

export const legalPages: Record<LegalPageKey, LegalPage> = {
  ...pages,
  all: {
    title: 'Privacy & legal',
    sections: Object.values(pages).flatMap((page) => [
      { title: page.title },
      ...page.sections,
    ]),
  },
};

export function isLegalPageKey(value: string | string[] | undefined): value is LegalPageKey {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(legalPages, value);
}
