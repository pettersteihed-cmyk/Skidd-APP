import type { Resort } from '@/types';

export interface Airport {
  name: string;
  transferMin: number;
}

/**
 * Ortens alla flygplatser — `airport`/`transferMin` plus `additionalAirports` — sorterade på
 * transfertid, kortast först (vid lika tid behålls ordningen i datan). Den förstlistade i datan
 * är inte alltid den närmaste (t.ex. Val Cenis: Lyon 190 min, Turin 100 min).
 */
export function airportsByTransfer(resort: Resort): Airport[] {
  return [
    { name: resort.airport, transferMin: resort.transferMin },
    ...(resort.additionalAirports ?? []),
  ].sort((a, b) => a.transferMin - b.transferMin);
}

/** Flygplatsen med kortast transfertid. Driver transfertidsfiltret och "närmaste flygplats" i UI:t. */
export function nearestAirport(resort: Resort): Airport {
  return airportsByTransfer(resort)[0];
}

/** Flygplatsnamn utan IATA-kod, t.ex. "Turin (TRN)" -> "Turin". */
export function shortAirportName(name: string): string {
  return name.replace(/\s*\([A-Z]{3}\)$/, '');
}
