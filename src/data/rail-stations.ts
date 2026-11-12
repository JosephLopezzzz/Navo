/**
 * Representative station points from Wikidata P625 (CC0), source-reviewed 2026-11-12.
 * These are station locations, not surveyed entrances or platform stopping positions.
 * See docs/RAIL_STATIONS.md for pinned revisions, review method and limitations.
 * Kept separate from routes.ts so destination picks do not enable journey GPS logic.
 */
export const RAIL_CATALOG_VERSION = '2026-11-12.1';
export type RailLineId = 'lrt-1' | 'lrt-2' | 'mrt-3';

export interface RailStation {
  id: string;
  stopId: string;
  lineId: RailLineId;
  name: string;
  city: string;
  aliases: readonly string[];
  latitude: number;
  longitude: number;
  sourceUrl: string;
  sourceLabel: string;
  reviewedAt: string;
}

type StationPoint = readonly [
  id: string, stopId: string, lineId: RailLineId, name: string, city: string,
  aliases: readonly string[], latitude: number, longitude: number, entityId: string, revision: number,
];

const stationPoints: readonly StationPoint[] = [
  ["lrt-1-fernando-poe-jr", "lrt1-1", "lrt-1", "Fernando Poe Jr.", "Quezon City", ["FPJ","Roosevelt","Fernando Poe Junior"], 14.657494444444, 121.02121111111, "Q7366465", 2539957875],
  ["lrt-1-balintawak", "lrt1-2", "lrt-1", "Balintawak", "Quezon City", [], 14.657344444444, 121.00396111111, "Q4850961", 2539957899],
  ["lrt-1-monumento", "lrt1-3", "lrt-1", "Monumento", "Caloocan", [], 14.654094444444, 120.98390555556, "Q6906948", 2539957902],
  ["lrt-1-5th-avenue", "lrt1-4", "lrt-1", "5th Avenue", "Caloocan", ["Fifth Avenue"], 14.644416666666666, 120.98358333333333, "Q4641238", 2539957727],
  ["lrt-1-r-papa", "lrt1-5", "lrt-1", "R. Papa", "Manila", ["Ricardo Papa"], 14.636166666666666, 120.98233333333333, "Q7273909", 2539957901],
  ["lrt-1-abad-santos", "lrt1-6", "lrt-1", "Abad Santos", "Manila", [], 14.630641666667, 120.98139722222, "Q3551687", 2539957751],
  ["lrt-1-blumentritt", "lrt1-7", "lrt-1", "Blumentritt", "Manila", [], 14.622791666667, 120.98293611111, "Q3547861", 2539957757],
  ["lrt-1-tayuman", "lrt1-8", "lrt-1", "Tayuman", "Manila", [], 14.616794444444, 120.98275833333, "Q3545738", 2539957749],
  ["lrt-1-bambang", "lrt1-9", "lrt-1", "Bambang", "Manila", [], 14.611111111111, 120.9825, "Q4853329", 2539957927],
  ["lrt-1-doroteo-jose", "lrt1-10", "lrt-1", "Doroteo Jose", "Manila", ["D Jose"], 14.605475, 120.98206944444, "Q5298225", 2539957795],
  ["lrt-1-carriedo", "lrt1-11", "lrt-1", "Carriedo", "Manila", [], 14.599, 120.98135833333, "Q5046330", 2522888557],
  ["lrt-1-central-terminal", "lrt1-12", "lrt-1", "Central Terminal", "Manila", ["Central"], 14.592902777778, 120.98162222222, "Q5061908", 2539957913],
  ["lrt-1-united-nations", "lrt1-13", "lrt-1", "United Nations", "Manila", ["UN","U N"], 14.582491666667, 120.98466111111, "Q3706974", 2562014191],
  ["lrt-1-pedro-gil", "lrt1-14", "lrt-1", "Pedro Gil", "Manila", [], 14.576630555556, 120.98799166667, "Q3706989", 2539957785],
  ["lrt-1-quirino", "lrt1-15", "lrt-1", "Quirino", "Manila", [], 14.570219444444, 120.991675, "Q3543640", 2539957791],
  ["lrt-1-vito-cruz", "lrt1-16", "lrt-1", "Vito Cruz", "Manila", [], 14.563475, 120.99468055556, "Q3706986", 2539957783],
  ["lrt-1-gil-puyat", "lrt1-17", "lrt-1", "Gil Puyat", "Pasay", ["Buendia"], 14.554127777778, 120.99717777778, "Q5560598", 2539957893],
  ["lrt-1-libertad", "lrt1-18", "lrt-1", "Libertad", "Pasay", ["Arnaiz"], 14.547783333333, 120.99863055556, "Q11843242", 2562005706],
  ["lrt-1-edsa", "lrt1-19", "lrt-1", "EDSA", "Pasay", [], 14.538825, 121.00068333333, "Q3544822", 2539957787],
  ["lrt-1-baclaran", "lrt1-20", "lrt-1", "Baclaran", "Pasay", [], 14.534305555555555, 120.99836111111111, "Q4839901", 2539957746],
  ["lrt-1-redemptorist-aseana", "lrt1-21", "lrt-1", "Redemptorist–Aseana", "Parañaque", ["Redemptorist","Aseana"], 14.53028, 120.99294, "Q7305783", 2539957904],
  ["lrt-1-mia-road", "lrt1-22", "lrt-1", "MIA Road", "Parañaque", ["Manila International Airport Road"], 14.51843, 120.99299, "Q6749690", 2539957831],
  ["lrt-1-pitx", "lrt1-23", "lrt-1", "PITX", "Parañaque", ["Asia World","Parañaque Integrated Terminal Exchange"], 14.50848, 120.99128, "Q4806495", 2539957742],
  ["lrt-1-ninoy-aquino-avenue", "lrt1-24", "lrt-1", "Ninoy Aquino Avenue", "Parañaque", ["Ninoy Aquino"], 14.49864, 120.99436, "Q11843238", 2309437856],
  ["lrt-1-dr-santos", "lrt1-25", "lrt-1", "Dr. Santos", "Parañaque", ["Doctor Santos","Sucat"], 14.4853, 120.98956, "Q5304374", 2539957867],
  ["lrt-2-antipolo", "lrt2-1", "lrt-2", "Antipolo", "Antipolo", ["Masinag"], 14.624722222222223, 121.1211111111111, "Q16786991", 2198014045],
  ["lrt-2-marikina-pasig", "lrt2-2", "lrt-2", "Marikina–Pasig", "Pasig", ["Marikina Pasig","Emerald"], 14.620277777777778, 121.10027777777778, "Q5370456", 2539957829],
  ["lrt-2-santolan", "lrt2-3", "lrt-2", "Santolan", "Pasig", [], 14.622138888889, 121.08591666667, "Q7420577", 2539957860],
  ["lrt-2-katipunan", "lrt2-4", "lrt-2", "Katipunan", "Quezon City", [], 14.631097222222, 121.07295833333, "Q3547775", 2539957771],
  ["lrt-2-anonas", "lrt2-5", "lrt-2", "Anonas", "Quezon City", [], 14.628, 121.06469444444, "Q4770011", 2539957735],
  ["lrt-2-araneta-center-cubao", "lrt2-6", "lrt-2", "Araneta Center–Cubao", "Quezon City", ["Cubao","Araneta Cubao","Araneta City Cubao"], 14.622677777778, 121.05263611111, "Q4784087", 2539957730],
  ["lrt-2-betty-go-belmonte", "lrt2-7", "lrt-2", "Betty Go-Belmonte", "Quezon City", ["Betty Go Belmonte"], 14.618572222222, 121.04273055556, "Q3545741", 2539957755],
  ["lrt-2-gilmore", "lrt2-8", "lrt-2", "Gilmore", "Quezon City", [], 14.613652777778, 121.03434722222, "Q5562533", 2539957888],
  ["lrt-2-j-ruiz", "lrt2-9", "lrt-2", "J. Ruiz", "San Juan", ["Juan Ruiz"], 14.610555555555555, 121.0261111111111, "Q3547809", 2539957763],
  ["lrt-2-v-mapa", "lrt2-10", "lrt-2", "V. Mapa", "Manila", ["Victorino Mapa"], 14.60409, 121.01712, "Q3547816", 2539957761],
  ["lrt-2-pureza", "lrt2-11", "lrt-2", "Pureza", "Manila", [], 14.601666666667, 121.00519444444, "Q3545800", 2539957773],
  ["lrt-2-legarda", "lrt2-12", "lrt-2", "Legarda", "Manila", [], 14.60085, 120.99269166667, "Q3545784", 2539957769],
  ["lrt-2-recto", "lrt2-13", "lrt-2", "Recto", "Manila", [], 14.603497222222, 120.98340277778, "Q3547794", 2539957766],
  ["mrt-3-north-avenue", "mrt3-1", "mrt-3", "North Avenue", "Quezon City", ["North Ave"], 14.652444444444, 121.03216666667, "Q7054031", 2563480306],
  ["mrt-3-quezon-avenue", "mrt3-2", "mrt-3", "Quezon Avenue", "Quezon City", ["Quezon Ave"], 14.642444444444, 121.03867361111, "Q7271600", 2563511486],
  ["mrt-3-gma-kamuning", "mrt3-3", "mrt-3", "GMA Kamuning", "Quezon City", ["GMA","Kamuning"], 14.635144444444, 121.04336111111, "Q6359855", 2563486138],
  ["mrt-3-araneta-cubao", "mrt3-4", "mrt-3", "Araneta–Cubao", "Quezon City", ["Cubao","Araneta Center Cubao","Araneta City Cubao"], 14.619430555556, 121.05103611111, "Q4784084", 2563488332],
  ["mrt-3-santolan-annapolis", "mrt3-5", "mrt-3", "Santolan–Annapolis", "Quezon City", ["Santolan","Annapolis"], 14.607711111111, 121.05644166667, "Q7420578", 2563489528],
  ["mrt-3-ortigas", "mrt3-6", "mrt-3", "Ortigas", "Mandaluyong", [], 14.587938888889, 121.05670555556, "Q7105026", 2563491598],
  ["mrt-3-shaw-boulevard", "mrt3-7", "mrt-3", "Shaw Boulevard", "Mandaluyong", ["Shaw"], 14.581397222222, 121.05368055556, "Q7491149", 2563498017],
  ["mrt-3-boni", "mrt3-8", "mrt-3", "Boni", "Mandaluyong", ["Boni Avenue"], 14.573763888889, 121.04816666667, "Q4941965", 2563498558],
  ["mrt-3-guadalupe", "mrt3-9", "mrt-3", "Guadalupe", "Makati", [], 14.566861111111, 121.04546666667, "Q5613240", 2563499275],
  ["mrt-3-buendia", "mrt3-10", "mrt-3", "Buendia", "Makati", ["Gil Puyat"], 14.554202777778, 121.03409444444, "Q4985497", 2563501259],
  ["mrt-3-ayala", "mrt3-11", "mrt-3", "Ayala", "Makati", [], 14.548941666667, 121.02767222222, "Q3706979", 2563502185],
  ["mrt-3-magallanes", "mrt3-12", "mrt-3", "Magallanes", "Makati", [], 14.541786111111, 121.01923333333, "Q3551682", 2563503138],
  ["mrt-3-taft-avenue", "mrt3-13", "mrt-3", "Taft Avenue", "Pasay", ["Taft","EDSA"], 14.537516666667, 121.00140555556, "Q3706982", 2563503737],
];

export const railStations: readonly RailStation[] = stationPoints.map(
  ([id, stopId, lineId, name, city, aliases, latitude, longitude, entityId, revision]) => ({
    id, stopId, lineId, name, city, aliases, latitude, longitude,
    sourceUrl: `https://www.wikidata.org/w/index.php?title=${entityId}&oldid=${revision}#P625`,
    sourceLabel: 'Wikidata (CC0)',
    reviewedAt: '2026-11-12',
  }),
);

const stationsById = new Map(railStations.map((station) => [station.id, station]));

export function getRailStation(id: string | undefined): RailStation | undefined {
  return id ? stationsById.get(id) : undefined;
}

function normalizeStationSearch(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(?:lrt|mrt)\s*[123]\b/g, ' ')
    .replace(/\b(?:line\s*[123]|station|stations|philippines)\b/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

/** Always searches within the selected line; provider addresses never enter this list. */
export function searchRailStations(lineId: string, query: string): RailStation[] {
  const words = normalizeStationSearch(query).split(' ').filter(Boolean);
  return railStations.filter((station) => station.lineId === lineId && (
    words.length === 0 || [station.name, ...station.aliases].some((label) => {
      const normalized = normalizeStationSearch(label);
      return words.every((word) => normalized.includes(word));
    })
  ));
}
