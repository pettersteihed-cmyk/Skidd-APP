export interface Resort {
  name: string;
  /**
   * Stabilt, kort id (kebab-case, t.ex. "les-3-vallees") — det KANONISKA id:t definierat i
   * "Orter"-fliken i skidorter_data-Excel-filen (se dess "Läs mig"-flik: "ÄNDRA INTE utan att
   * också uppdatera i koden"). Samma värde som ort_id-kolumnen i Excelns "Snöhistorik"-flik
   * och i snohistorik_export.csv. Används för att slå upp en orts data i
   * src/data/snowHistory.ts. Byt bara om Excel-filens "Orter"-flik ändrar id för orten.
   */
  id: string;
  /** Land — tillagt inför framtida expansion till fler länder i Alperna (Schweiz, Österrike,
   * Italien m.fl.). Alla nuvarande orter är "Frankrike". Driver landfiltret i sidopanelen. */
  country: string;
  region: string;
  lat: number;
  lng: number;
  maxAlt: number;
  minAlt: number;
  pisteKm: number;
  lifts: number;
  /**
   * Uppdelning av liftantalet per typ, till "Liftar"-kolumnen i Skidsystemet. Alla fyra är
   * valfria/oberoende av varandra — saknas ett fält för en ort visas "–" i UI:t istället för att
   * dölja raden eller krascha. Behöver inte summera till `lifts`.
   */
  liftsGondola?: number;
  liftsChairlift?: number;
  liftsDragLift?: number;
  liftsOther?: number;
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
   * Löptext till "Om orten" i expanderad ortmodal (3-5 meningar). AI-genererad platshållartext
   * (commit 63ef9db), innehåller okontrollerade påståenden utöver övrig data.
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
   * Ytterligare flygplatser utöver `airport`/`transferMin` (som listas först i datan).
   * "Praktisk info" listar alla. Ifyllt för alla 15 orter (en extra flygplats per ort). Den
   * förstlistade är inte alltid den närmaste — använd `nearestAirport` (src/utils/transfer.ts).
   */
  additionalAirports?: { name: string; transferMin: number }[];
  /**
   * Länk till ortens officiella pistkarta (PDF eller webbsida) — visas som "PISTKARTA"-länk i
   * Skidsystemet-sektionen. Just nu platshållar-URL:er för alla orter tills riktiga länkar finns.
   */
  pisteMapPdfUrl?: string;
  // Fält inför AI-chatten — valfria tills de är ifyllda för orterna.
  offpistTillgang?: OffpistTillgang[];
  offpistNivaMin?: Betyg1Till5;
  offpistNivaMax?: Betyg1Till5;
  offpistNote?: string;
  glaciarakning?: boolean;
  guideverksamhet?: boolean;
  boendeTyper?: BoendeTyp[];
  nyborjarvanlig?: Betyg1Till5;
}

export type PriceLevel = '$' | '$$' | '$$$' | '$$$$';

export type OffpistTillgang = 'liftnara' | 'kort-stigning' | 'turakning' | 'guide-kravs';

export type BoendeTyp = 'by' | 'lagenhetsort' | 'lyx' | 'budget';

/** Heltalsbetyg 1–5. */
export type Betyg1Till5 = 1 | 2 | 3 | 4 | 5;

export interface Filters {
  maxTransfer: number;
  priceLevels: PriceLevel[];
  trainOnly: boolean;
  minPisteKm: number;
  search: string;
  /** Valda länder — tom array = inget landfilter aktivt (visa alla), samma mönster som priceLevels. */
  countries: string[];
}
