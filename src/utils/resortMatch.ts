import type { OffpistTillgang, PriceLevel, Resort } from '@/types';
import { RESORTS } from '@/data/resorts';
import { nearestAirport } from '@/utils/transfer';

/**
 * Filtrering och rangordning av orter — steg 2 av AI-chatten (ren TypeScript, ingen AI).
 *
 * matchResorts() returnerar de tre bäst matchande orterna. Klarar färre än tre filtret lättas
 * filtren i viktordning (lägst vikt först) och varje lättning rapporteras i `relaxed`, så att
 * chatten kan säga vad som inte kunde uppfyllas. Orter som klarade det ursprungliga filtret
 * rankas alltid före orter som bara kom med via lättning (`viaLattning`). Två filter lättas aldrig:
 *  - offpistNivaMax (säkerhetsspärr, regel 7): att höja taket kunde ge en nybörjare orter vars
 *    lugnaste offpist är svårare än den bett om.
 *  - tagResa: den som väljer tåg har ofta ett skäl som inte går att förhandla bort.
 * Räcker det inte returneras färre än tre orter med `underfilled: true` och `blockedBy`.
 */

/** Alla fält valfria. Ett fält som inte anges filtrerar inte. */
export interface ResortFilter {
  /** Nivåspann 1–5. Orten matchar om dess spann överlappar filtrets. */
  offpistNivaMin?: number;
  offpistNivaMax?: number;
  /** Orten måste ha alla angivna värden. */
  offpistTillgang?: OffpistTillgang[];
  glaciarakning?: boolean;
  guideverksamhet?: boolean;
  /** Mot närmaste flygplats (nearestAirport). */
  maxTransferMin?: number;
  priceMax?: PriceLevel;
  /** Tom lista = inget landfilter. */
  countries?: string[];
  minPisteKm?: number;
  /** true = orten måste ha tåg. false/utelämnat = inget krav. */
  tagResa?: boolean;
}

/** Vikter ≥ 0 för rangordningen. Vikt som inte anges är 1. */
export interface RankWeights {
  offpist?: number;
  pistKm?: number;
  transfer?: number;
  pris?: number;
}

type Dimension = keyof Required<RankWeights>;

export interface Relaxation {
  filter: keyof ResortFilter;
  /** Värdet användaren angav. */
  from: unknown;
  /** Värdet efter lättning; null = filtret togs bort helt. */
  to: unknown;
}

export interface RankedResort {
  resort: Resort;
  /** Viktat medelvärde av delpoängen, 0–1. */
  score: number;
  delpoang: Record<Dimension, number>;
  /** true om orten bara kom med efter lättning (klarade inte det ursprungliga filtret). */
  viaLattning: boolean;
}

export interface MatchResult {
  results: RankedResort[];
  /** En post per filter som lättades, i den ordning de lättades. */
  relaxed: Relaxation[];
  /** true om färre än tre orter klarar filtret även efter all tillåten lättning. */
  underfilled: boolean;
  /** Filter som inte får lättas och som stod kvar när underfilled är true. */
  blockedBy: (keyof ResortFilter)[];
}

const ANTAL = 3;
const PRISNIVAER: PriceLevel[] = ['$', '$$', '$$$', '$$$$'];
const TILLGANG_ORDNING: OffpistTillgang[] = ['liftnara', 'kort-stigning', 'turakning', 'guide-kravs'];
// Vid lika vikt lättas offpist sist, eftersom det är det säkerhetsrelevanta.
const DIMENSIONER: Dimension[] = ['pistKm', 'pris', 'transfer', 'offpist'];
const TRANSFER_STEG = 30;
const PISTKM_STEG = 50;

// --- Validering ---

function validera(filter: ResortFilter, weights: RankWeights): void {
  const niva = (v: number | undefined, namn: string) => {
    if (v !== undefined && !(Number.isInteger(v) && v >= 1 && v <= 5)) {
      throw new Error(`${namn} måste vara ett heltal 1–5, fick ${v}`);
    }
  };
  niva(filter.offpistNivaMin, 'offpistNivaMin');
  niva(filter.offpistNivaMax, 'offpistNivaMax');
  if (filter.offpistNivaMin !== undefined && filter.offpistNivaMax !== undefined
      && filter.offpistNivaMin > filter.offpistNivaMax) {
    throw new Error(`offpistNivaMin (${filter.offpistNivaMin}) är större än offpistNivaMax (${filter.offpistNivaMax})`);
  }
  for (const t of filter.offpistTillgang ?? []) {
    if (!TILLGANG_ORDNING.includes(t)) throw new Error(`Okänt offpistTillgang-värde: ${t}`);
  }
  if (filter.priceMax !== undefined && !PRISNIVAER.includes(filter.priceMax)) {
    throw new Error(`Okänd priceMax: ${filter.priceMax}`);
  }
  for (const [namn, v] of Object.entries(weights)) {
    if (v !== undefined && !(Number.isFinite(v) && v >= 0)) throw new Error(`Vikten ${namn} måste vara ≥ 0, fick ${v}`);
  }
}

// --- Filtrering ---

function nivaspann(filter: ResortFilter): [number, number] | null {
  if (filter.offpistNivaMin === undefined && filter.offpistNivaMax === undefined) return null;
  return [filter.offpistNivaMin ?? 1, filter.offpistNivaMax ?? 5];
}

function klarar(r: Resort, f: ResortFilter): boolean {
  const spann = nivaspann(f);
  if (spann) {
    if (r.offpistNivaMin === undefined || r.offpistNivaMax === undefined) return false;
    if (r.offpistNivaMin > spann[1] || r.offpistNivaMax < spann[0]) return false;
  }
  if (f.offpistTillgang?.length && !f.offpistTillgang.every((t) => r.offpistTillgang?.includes(t))) return false;
  if (f.glaciarakning !== undefined && r.glaciarakning !== f.glaciarakning) return false;
  if (f.guideverksamhet !== undefined && r.guideverksamhet !== f.guideverksamhet) return false;
  if (f.maxTransferMin !== undefined && nearestAirport(r).transferMin > f.maxTransferMin) return false;
  if (f.priceMax !== undefined && PRISNIVAER.indexOf(r.price) > PRISNIVAER.indexOf(f.priceMax)) return false;
  if (f.countries?.length && !f.countries.includes(r.country)) return false;
  if (f.minPisteKm !== undefined && r.pisteKm < f.minPisteKm) return false;
  if (f.tagResa && !r.train) return false;
  return true;
}

// --- Lättning ---

type Steg = { filter: keyof ResortFilter; to: unknown };

/** Nästa lättningssteg inom en dimension, eller null om inget mer finns att lätta där. */
function nastaSteg(dim: Dimension, f: ResortFilter, maxTransfer: number): Steg | null {
  switch (dim) {
    case 'offpist':
      if (f.guideverksamhet !== undefined) return { filter: 'guideverksamhet', to: null };
      if (f.glaciarakning !== undefined) return { filter: 'glaciarakning', to: null };
      if (f.offpistTillgang?.length) {
        const kvar = f.offpistTillgang.slice(0, -1);
        return { filter: 'offpistTillgang', to: kvar.length ? kvar : null };
      }
      // Bara golvet sänks. offpistNivaMax lättas aldrig (säkerhetsspärr).
      if (f.offpistNivaMin !== undefined && f.offpistNivaMin > 1) {
        return { filter: 'offpistNivaMin', to: f.offpistNivaMin - 1 };
      }
      return null;
    case 'transfer':
      if (f.maxTransferMin === undefined) return null;
      return { filter: 'maxTransferMin', to: f.maxTransferMin + TRANSFER_STEG >= maxTransfer ? null : f.maxTransferMin + TRANSFER_STEG };
    case 'pistKm':
      if (f.minPisteKm === undefined || f.minPisteKm <= 0) return null;
      return { filter: 'minPisteKm', to: Math.max(0, f.minPisteKm - PISTKM_STEG) };
    case 'pris': {
      if (f.priceMax === undefined || f.priceMax === '$$$$') return null;
      return { filter: 'priceMax', to: PRISNIVAER[PRISNIVAER.indexOf(f.priceMax) + 1] };
    }
  }
}

function tillampa(f: ResortFilter, steg: Steg): ResortFilter {
  const ny: ResortFilter = { ...f };
  if (steg.to === null) delete ny[steg.filter];
  else (ny as Record<string, unknown>)[steg.filter] = steg.to;
  return ny;
}

// --- Rangordning ---

function delpoang(r: Resort, filter: ResortFilter, alla: Resort[]): Record<Dimension, number> {
  const norm = (v: number, min: number, max: number) => (max === min ? 1 : (v - min) / (max - min));
  const km = alla.map((a) => a.pisteKm);
  const tid = alla.map((a) => nearestAirport(a).transferMin);

  // Offpist: täckning × (1 − överskott / 4).
  //  - täckning = andel av filtrets nivåspann (räknat i hela steg) som ortens spann täcker.
  //  - överskott = hur många steg ortens Max ligger över filtrets Max (4 = största möjliga).
  //    En ort vars spann når långt över det efterfrågade taket rankas lägre, så att den som ber
  //    om lugn terräng får orter med lugnare karaktär först. Bara överskott uppåt räknas — anges
  //    bara Min (t.ex. expert, nivå 5) är taket 5 och ingen ort får avdrag.
  // Utan nivåfilter får alla 0,5, så att vikten inte av misstag gynnar svår terräng.
  const spann = nivaspann(filter);
  let offpist = 0.5;
  if (spann) {
    if (r.offpistNivaMin === undefined || r.offpistNivaMax === undefined) offpist = 0;
    else {
      const overlapp = Math.min(r.offpistNivaMax, spann[1]) - Math.max(r.offpistNivaMin, spann[0]) + 1;
      const tackning = Math.max(0, overlapp) / (spann[1] - spann[0] + 1);
      const overskott = Math.max(0, r.offpistNivaMax - spann[1]);
      offpist = tackning * (1 - overskott / 4);
    }
  }

  return {
    offpist,
    pistKm: norm(r.pisteKm, Math.min(...km), Math.max(...km)),
    transfer: 1 - norm(nearestAirport(r).transferMin, Math.min(...tid), Math.max(...tid)),
    pris: 1 - PRISNIVAER.indexOf(r.price) / (PRISNIVAER.length - 1),
  };
}

function rangordna(kandidater: Resort[], filter: ResortFilter, weights: RankWeights, alla: Resort[]): RankedResort[] {
  const w: Record<Dimension, number> = {
    offpist: weights.offpist ?? 1, pistKm: weights.pistKm ?? 1, transfer: weights.transfer ?? 1, pris: weights.pris ?? 1,
  };
  const summa = DIMENSIONER.reduce((s, d) => s + w[d], 0);
  return kandidater
    .map((resort) => {
      const dp = delpoang(resort, filter, alla);
      const score = summa === 0 ? 0 : DIMENSIONER.reduce((s, d) => s + w[d] * dp[d], 0) / summa;
      return { resort, score, delpoang: dp, viaLattning: !klarar(resort, filter) };
    })
    // Två nivåer: orter som klarade det ursprungliga filtret först, sedan de som bara kom med
    // via lättning — inbördes efter poäng. Lika poäng: fler pistkilometer först, sedan id, så att
    // resultatet alltid är detsamma.
    .sort((a, b) => (Number(a.viaLattning) - Number(b.viaLattning))
      || (Math.abs(b.score - a.score) > 1e-9 ? b.score - a.score : 0)
      || b.resort.pisteKm - a.resort.pisteKm || a.resort.id.localeCompare(b.resort.id));
}

// --- Huvudfunktion ---

export function matchResorts(filter: ResortFilter, weights: RankWeights = {}, resorts: Resort[] = RESORTS): MatchResult {
  validera(filter, weights);
  const maxTransfer = Math.max(...resorts.map((r) => nearestAirport(r).transferMin));
  const vikt = (d: Dimension) => weights[d] ?? 1;
  // Lägst vikt lättas först; vid lika vikt gäller ordningen i DIMENSIONER.
  const lattningsordning = [...DIMENSIONER].sort((a, b) => vikt(a) - vikt(b));

  let aktuellt: ResortFilter = { ...filter };
  let kandidater = resorts.filter((r) => klarar(r, aktuellt));
  const relaxed = new Map<keyof ResortFilter, Relaxation>();
  const notera = (steg: Steg) => {
    const post = relaxed.get(steg.filter) ?? { filter: steg.filter, from: filter[steg.filter], to: null };
    post.to = steg.to;
    relaxed.set(steg.filter, post);
  };

  for (const dim of lattningsordning) {
    let steg: Steg | null;
    while (kandidater.length < ANTAL && (steg = nastaSteg(dim, aktuellt, maxTransfer))) {
      aktuellt = tillampa(aktuellt, steg);
      notera(steg);
      kandidater = resorts.filter((r) => klarar(r, aktuellt));
    }
  }
  // countries lättas sist, och tas då bort helt.
  if (kandidater.length < ANTAL && aktuellt.countries?.length) {
    const steg: Steg = { filter: 'countries', to: null };
    aktuellt = tillampa(aktuellt, steg);
    notera(steg);
    kandidater = resorts.filter((r) => klarar(r, aktuellt));
  }

  const underfilled = kandidater.length < ANTAL;
  const blockedBy: (keyof ResortFilter)[] = [];
  if (underfilled) {
    if (aktuellt.offpistNivaMax !== undefined) blockedBy.push('offpistNivaMax');
    if (aktuellt.tagResa) blockedBy.push('tagResa');
  }

  return {
    results: rangordna(kandidater, filter, weights, resorts).slice(0, ANTAL),
    relaxed: [...relaxed.values()],
    underfilled,
    blockedBy,
  };
}
