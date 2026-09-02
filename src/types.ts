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
}

export type PriceLevel = '$' | '$$' | '$$$' | '$$$$';

export interface Filters {
  maxTransfer: number;
  priceLevels: PriceLevel[];
  trainOnly: boolean;
  minPisteKm: number;
  search: string;
}
