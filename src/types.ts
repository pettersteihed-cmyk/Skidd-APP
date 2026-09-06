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
  /** Affiliate-länkar för "Affiliate Hub" i expanderad ortmodal. Saknas ett fält (eller hela objektet) faller motsvarande knapp tillbaka på en platshållar-URL. */
  affiliateLinks?: {
    liftPass?: string;
    accommodation?: string;
    carRental?: string;
    equipmentRental?: string;
  };
  /**
   * Löptext till "Om orten" i expanderad ortmodal (3-5 meningar). Just nu ifylld med
   * platshållartext härledd ur övrig data (region, höjd, prisnivå, ski-in/out) tills riktiga
   * redaktionella texter finns.
   */
  description?: string;
  /**
   * Uppskattad pistfördelning i procent (bör summera till 100) för "Pistfördelning" i expanderad
   * ortmodal. OBS: just nu grova, illustrativa uppskattningar baserade på ortens karaktär — inte
   * verifierad statistik från skidorterna själva.
   */
  pisteColors?: {
    green: number;
    blue: number;
    red: number;
    black: number;
  };
  /** Säsongsperiod (t.ex. "December–april") till "Praktisk info". Visas bara om satt. */
  season?: string;
  /**
   * Ytterligare flygplatser utöver `airport`/`transferMin` (som alltid räknas som den första).
   * "Praktisk info" listar alla. Ingen ort har detta ifyllt ännu.
   */
  additionalAirports?: { name: string; transferMin: number }[];
  /**
   * Länk till ortens officiella pistkarta (PDF eller webbsida) — visas som "PISTKARTA"-länk i
   * Skidsystemet-sektionen. Just nu platshållar-URL:er för alla orter tills riktiga länkar finns.
   */
  pisteMapPdfUrl?: string;
}

export type PriceLevel = '$' | '$$' | '$$$' | '$$$$';

export interface Filters {
  maxTransfer: number;
  priceLevels: PriceLevel[];
  trainOnly: boolean;
  minPisteKm: number;
  search: string;
}
