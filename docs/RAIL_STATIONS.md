# Rail destination station catalog

Version: `2026-11-12.1`. Source review: 12 November 2026.

The 51 points in [rail-stations.ts](../src/data/rail-stations.ts) represent the stations already listed in Navo: 25 LRT-1, 13 LRT-2 and 13 MRT-3. The catalog is bundled locally so choosing a station or searching its aliases does not call a general places service. Each entry has a stable station ID, the existing route stop ID, line, city, aliases, coordinate and a pinned source revision.

## Source and reuse

Coordinates are Wikidata structured `P625` statements, retrieved through the Wikidata entity API on 12 November 2026. Wikidata structured data is [CC0](https://www.wikidata.org/wiki/Wikidata:Licensing) ([CC0 legal text](https://creativecommons.org/publicdomain/zero/1.0/)). The coordinate data may be copied and redistributed with the app. Source links are retained for traceability. No TomTom search result coordinates or OpenStreetMap data were used to build this catalog. App code retains the repository's licensing; this statement describes the sourced coordinate data.

English Wikipedia page properties were used to resolve candidate entity IDs, then each selected entity's rail-line statement `P81` was matched against LRT-1 `Q4165124`, LRT-2 `Q4165317` or MRT-3 `Q13422345`. Only a single non-deprecated Earth coordinate was accepted, preferring a preferred-rank coordinate if available. Station names and line membership were checked against the existing route list. Points were checked for finite coordinates, Metro Manila/Antipolo bounds, separate identities at interchanges and plausible neighboring-station spacing.

The two Cubao stations and the LRT-2 Santolan / MRT-3 Santolan–Annapolis stations are separate entities. The North Avenue MRT entity is `Q7054031`, not the common station. V. Mapa's deprecated longitude `120.01723611111` was rejected; its current non-deprecated coordinate is used. The extension stations retain the current app display names even when Wikidata's English labels retain earlier names (Asia World/PITX, Redemptorist/Redemptorist–Aseana, Ninoy Aquino/Ninoy Aquino Avenue).

[LRMC confirms](https://lrmc.ph/2023/08/20/lrt-1-roosevelt-station-is-now-fernando-poe-jr-station/amp/) that Fernando Poe Jr. Station is the former Roosevelt Station in Quezon City. FPJ, Roosevelt and Fernando Poe Jr. therefore resolve to one LRT-1 station ID. Other local search aliases describe the same station on the selected line, rather than general streets, people or businesses.

## Evidence boundaries and updates

This is a source review of representative station points, not an onsite survey or a guarantee of entrance, platform or GPS accuracy. Wikidata includes community-maintained data and many source statements are imported from Wikipedia. Do not claim operator certification, accessible entrance routing or live transit service. Map imagery still needs the map provider/network or an existing cache. The catalog is separate from `routes.ts`: rail journey route coordinates remain missing, so this destination-picker improvement does not activate automatic route checks.

Saving a station destination stores the selected coordinates with station ID and catalog version. Future catalog updates must not rewrite existing saved alarm locations silently; the user must reselect and save to adopt a changed point. Re-review the entity, line and coordinate before modifying an entry, increment the catalog version and record the new pinned revision.

## Pinned coordinate evidence

| Line | Station | Wikidata source revision | Latitude, longitude |
| --- | --- | --- | --- |
| LRT-1 | Fernando Poe Jr. | [Q7366465, rev. 2539957875](https://www.wikidata.org/w/index.php?title=Q7366465&oldid=2539957875#P625) | 14.657494444444, 121.02121111111 |
| LRT-1 | Balintawak | [Q4850961, rev. 2539957899](https://www.wikidata.org/w/index.php?title=Q4850961&oldid=2539957899#P625) | 14.657344444444, 121.00396111111 |
| LRT-1 | Monumento | [Q6906948, rev. 2539957902](https://www.wikidata.org/w/index.php?title=Q6906948&oldid=2539957902#P625) | 14.654094444444, 120.98390555556 |
| LRT-1 | 5th Avenue | [Q4641238, rev. 2539957727](https://www.wikidata.org/w/index.php?title=Q4641238&oldid=2539957727#P625) | 14.644416666666666, 120.98358333333333 |
| LRT-1 | R. Papa | [Q7273909, rev. 2539957901](https://www.wikidata.org/w/index.php?title=Q7273909&oldid=2539957901#P625) | 14.636166666666666, 120.98233333333333 |
| LRT-1 | Abad Santos | [Q3551687, rev. 2539957751](https://www.wikidata.org/w/index.php?title=Q3551687&oldid=2539957751#P625) | 14.630641666667, 120.98139722222 |
| LRT-1 | Blumentritt | [Q3547861, rev. 2539957757](https://www.wikidata.org/w/index.php?title=Q3547861&oldid=2539957757#P625) | 14.622791666667, 120.98293611111 |
| LRT-1 | Tayuman | [Q3545738, rev. 2539957749](https://www.wikidata.org/w/index.php?title=Q3545738&oldid=2539957749#P625) | 14.616794444444, 120.98275833333 |
| LRT-1 | Bambang | [Q4853329, rev. 2539957927](https://www.wikidata.org/w/index.php?title=Q4853329&oldid=2539957927#P625) | 14.611111111111, 120.9825 |
| LRT-1 | Doroteo Jose | [Q5298225, rev. 2539957795](https://www.wikidata.org/w/index.php?title=Q5298225&oldid=2539957795#P625) | 14.605475, 120.98206944444 |
| LRT-1 | Carriedo | [Q5046330, rev. 2522888557](https://www.wikidata.org/w/index.php?title=Q5046330&oldid=2522888557#P625) | 14.599, 120.98135833333 |
| LRT-1 | Central Terminal | [Q5061908, rev. 2539957913](https://www.wikidata.org/w/index.php?title=Q5061908&oldid=2539957913#P625) | 14.592902777778, 120.98162222222 |
| LRT-1 | United Nations | [Q3706974, rev. 2562014191](https://www.wikidata.org/w/index.php?title=Q3706974&oldid=2562014191#P625) | 14.582491666667, 120.98466111111 |
| LRT-1 | Pedro Gil | [Q3706989, rev. 2539957785](https://www.wikidata.org/w/index.php?title=Q3706989&oldid=2539957785#P625) | 14.576630555556, 120.98799166667 |
| LRT-1 | Quirino | [Q3543640, rev. 2539957791](https://www.wikidata.org/w/index.php?title=Q3543640&oldid=2539957791#P625) | 14.570219444444, 120.991675 |
| LRT-1 | Vito Cruz | [Q3706986, rev. 2539957783](https://www.wikidata.org/w/index.php?title=Q3706986&oldid=2539957783#P625) | 14.563475, 120.99468055556 |
| LRT-1 | Gil Puyat | [Q5560598, rev. 2539957893](https://www.wikidata.org/w/index.php?title=Q5560598&oldid=2539957893#P625) | 14.554127777778, 120.99717777778 |
| LRT-1 | Libertad | [Q11843242, rev. 2562005706](https://www.wikidata.org/w/index.php?title=Q11843242&oldid=2562005706#P625) | 14.547783333333, 120.99863055556 |
| LRT-1 | EDSA | [Q3544822, rev. 2539957787](https://www.wikidata.org/w/index.php?title=Q3544822&oldid=2539957787#P625) | 14.538825, 121.00068333333 |
| LRT-1 | Baclaran | [Q4839901, rev. 2539957746](https://www.wikidata.org/w/index.php?title=Q4839901&oldid=2539957746#P625) | 14.534305555555555, 120.99836111111111 |
| LRT-1 | Redemptorist–Aseana | [Q7305783, rev. 2539957904](https://www.wikidata.org/w/index.php?title=Q7305783&oldid=2539957904#P625) | 14.53028, 120.99294 |
| LRT-1 | MIA Road | [Q6749690, rev. 2539957831](https://www.wikidata.org/w/index.php?title=Q6749690&oldid=2539957831#P625) | 14.51843, 120.99299 |
| LRT-1 | PITX | [Q4806495, rev. 2539957742](https://www.wikidata.org/w/index.php?title=Q4806495&oldid=2539957742#P625) | 14.50848, 120.99128 |
| LRT-1 | Ninoy Aquino Avenue | [Q11843238, rev. 2309437856](https://www.wikidata.org/w/index.php?title=Q11843238&oldid=2309437856#P625) | 14.49864, 120.99436 |
| LRT-1 | Dr. Santos | [Q5304374, rev. 2539957867](https://www.wikidata.org/w/index.php?title=Q5304374&oldid=2539957867#P625) | 14.4853, 120.98956 |
| LRT-2 | Antipolo | [Q16786991, rev. 2198014045](https://www.wikidata.org/w/index.php?title=Q16786991&oldid=2198014045#P625) | 14.624722222222223, 121.1211111111111 |
| LRT-2 | Marikina–Pasig | [Q5370456, rev. 2539957829](https://www.wikidata.org/w/index.php?title=Q5370456&oldid=2539957829#P625) | 14.620277777777778, 121.10027777777778 |
| LRT-2 | Santolan | [Q7420577, rev. 2539957860](https://www.wikidata.org/w/index.php?title=Q7420577&oldid=2539957860#P625) | 14.622138888889, 121.08591666667 |
| LRT-2 | Katipunan | [Q3547775, rev. 2539957771](https://www.wikidata.org/w/index.php?title=Q3547775&oldid=2539957771#P625) | 14.631097222222, 121.07295833333 |
| LRT-2 | Anonas | [Q4770011, rev. 2539957735](https://www.wikidata.org/w/index.php?title=Q4770011&oldid=2539957735#P625) | 14.628, 121.06469444444 |
| LRT-2 | Araneta Center–Cubao | [Q4784087, rev. 2539957730](https://www.wikidata.org/w/index.php?title=Q4784087&oldid=2539957730#P625) | 14.622677777778, 121.05263611111 |
| LRT-2 | Betty Go-Belmonte | [Q3545741, rev. 2539957755](https://www.wikidata.org/w/index.php?title=Q3545741&oldid=2539957755#P625) | 14.618572222222, 121.04273055556 |
| LRT-2 | Gilmore | [Q5562533, rev. 2539957888](https://www.wikidata.org/w/index.php?title=Q5562533&oldid=2539957888#P625) | 14.613652777778, 121.03434722222 |
| LRT-2 | J. Ruiz | [Q3547809, rev. 2539957763](https://www.wikidata.org/w/index.php?title=Q3547809&oldid=2539957763#P625) | 14.610555555555555, 121.0261111111111 |
| LRT-2 | V. Mapa | [Q3547816, rev. 2539957761](https://www.wikidata.org/w/index.php?title=Q3547816&oldid=2539957761#P625) | 14.60409, 121.01712 |
| LRT-2 | Pureza | [Q3545800, rev. 2539957773](https://www.wikidata.org/w/index.php?title=Q3545800&oldid=2539957773#P625) | 14.601666666667, 121.00519444444 |
| LRT-2 | Legarda | [Q3545784, rev. 2539957769](https://www.wikidata.org/w/index.php?title=Q3545784&oldid=2539957769#P625) | 14.60085, 120.99269166667 |
| LRT-2 | Recto | [Q3547794, rev. 2539957766](https://www.wikidata.org/w/index.php?title=Q3547794&oldid=2539957766#P625) | 14.603497222222, 120.98340277778 |
| MRT-3 | North Avenue | [Q7054031, rev. 2563480306](https://www.wikidata.org/w/index.php?title=Q7054031&oldid=2563480306#P625) | 14.652444444444, 121.03216666667 |
| MRT-3 | Quezon Avenue | [Q7271600, rev. 2563511486](https://www.wikidata.org/w/index.php?title=Q7271600&oldid=2563511486#P625) | 14.642444444444, 121.03867361111 |
| MRT-3 | GMA Kamuning | [Q6359855, rev. 2563486138](https://www.wikidata.org/w/index.php?title=Q6359855&oldid=2563486138#P625) | 14.635144444444, 121.04336111111 |
| MRT-3 | Araneta–Cubao | [Q4784084, rev. 2563488332](https://www.wikidata.org/w/index.php?title=Q4784084&oldid=2563488332#P625) | 14.619430555556, 121.05103611111 |
| MRT-3 | Santolan–Annapolis | [Q7420578, rev. 2563489528](https://www.wikidata.org/w/index.php?title=Q7420578&oldid=2563489528#P625) | 14.607711111111, 121.05644166667 |
| MRT-3 | Ortigas | [Q7105026, rev. 2563491598](https://www.wikidata.org/w/index.php?title=Q7105026&oldid=2563491598#P625) | 14.587938888889, 121.05670555556 |
| MRT-3 | Shaw Boulevard | [Q7491149, rev. 2563498017](https://www.wikidata.org/w/index.php?title=Q7491149&oldid=2563498017#P625) | 14.581397222222, 121.05368055556 |
| MRT-3 | Boni | [Q4941965, rev. 2563498558](https://www.wikidata.org/w/index.php?title=Q4941965&oldid=2563498558#P625) | 14.573763888889, 121.04816666667 |
| MRT-3 | Guadalupe | [Q5613240, rev. 2563499275](https://www.wikidata.org/w/index.php?title=Q5613240&oldid=2563499275#P625) | 14.566861111111, 121.04546666667 |
| MRT-3 | Buendia | [Q4985497, rev. 2563501259](https://www.wikidata.org/w/index.php?title=Q4985497&oldid=2563501259#P625) | 14.554202777778, 121.03409444444 |
| MRT-3 | Ayala | [Q3706979, rev. 2563502185](https://www.wikidata.org/w/index.php?title=Q3706979&oldid=2563502185#P625) | 14.548941666667, 121.02767222222 |
| MRT-3 | Magallanes | [Q3551682, rev. 2563503138](https://www.wikidata.org/w/index.php?title=Q3551682&oldid=2563503138#P625) | 14.541786111111, 121.01923333333 |
| MRT-3 | Taft Avenue | [Q3706982, rev. 2563503737](https://www.wikidata.org/w/index.php?title=Q3706982&oldid=2563503737#P625) | 14.537516666667, 121.00140555556 |

## Acceptance checks

Implementation checks on 12 November 2026 passed: Expo lint, TypeScript, all 167 workspace tests, and Android/iOS JavaScript exports. Exports validate bundling; they do not establish native marker rendering or camera framing. The device checks below remain pending.

- Search Fernando Poe Jr., FPJ and Roosevelt on LRT-1: each yields the same station, with a marker at its saved coordinate.
- Switch between LRT-2 and MRT-3 Cubao or Santolan: each line selects its own station point.
- Pan/zoom, use My location, switch map theme and fail map loading: the selected station identity and coordinate remain stable.
- Select a station with the network off: the catalog selection remains available; a map-load failure must still allow confirmation.
- Edit an older destination: its existing coordinate stays intact until the user selects and saves a station.
- Test large text, screen reader labels, keyboard search and small screens on both mobile platforms.
