export interface Resort {
  name: string;
  region: string;
  lat: number;
  lng: number;
  maxAlt: number;
  minAlt: number;
  pisteKm: number;
  lifts: number;
  airport: string;
  transferMin: number;
  train: boolean;
  skiInOut: string;
  price: PriceLevel;
  /** Bild till ortmodalens header. Saknas fältet (eller är tomt) faller headern tillbaka på en blå gradient. */
  heroImageUrl?: string;
}

export type PriceLevel = '$' | '$$' | '$$$' | '$$$$';

export interface Filters {
  maxTransfer: number;
  priceLevels: PriceLevel[];
  trainOnly: boolean;
  minPisteKm: number;
  search: string;
}
