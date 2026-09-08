interface PisteSegment {
  key: string;
  label: string;
  km: number;
  dot: string;
}

interface MountainProfileProps {
  maxAlt: number;
  minAlt: number;
  lifts: number;
  pisteKm: number;
  pisteSegments: PisteSegment[];
  liftsGondola?: number;
  liftsChairlift?: number;
  liftsDragLift?: number;
  liftsOther?: number;
  className?: string;
}

/**
 * Fyra flex-barn i rad, vänster till höger, som tre visuella kolumner (Höjdinfo + bergskam räknas
 * som EN kolumn, kolumn 3, fast de är två separata flex-barn): (1) Pist — pistlängd överst och
 * Pistfördelningen (punktlista med km per pistfärg) direkt under i samma kolumn (Pistkarta-länken
 * bor numera i sektionsrubriken i ResortModal.tsx, inte här), (2) Liftar — totalt antal +
 * uppdelning per lifttyp, (3a) Höjdinfo — Topphöjd/Fallhöjd/Dalhöjd, (3b) en bergskam som en enkel
 * KONTURLINJE (bara stroke, ingen fylld yta) — kort platt sektion, diagonal stigning, en liten
 * sadelpunkt ca en tredjedel in, jämn/lugn lutning vidare upp till huvudtoppen, och sedan en
 * KORTARE nedåtgående sträcka som slutar halvvägs ner (inte hela vägen till baslinjen). Samma dova
 * blågrå ton som resten av modalen. justify-between (med gap-4 som minsta avstånd) fördelar
 * kolumnerna JÄMNT över hela den tillgängliga bredden. Alla kolumner är topp-justerade med fast,
 * jämnt radavstånd (gap-4 mellan huvudposterna, gap-1.5 mellan Pistfördelningens tätare
 * enradsposter) istället för att sträckas ut för att fylla radhöjden — enklare och mer
 * förutsägbart nu när Pist-kolumnen bär två olika typer av innehåll (Pistlängd + Pistfördelning)
 * snarare än att ensam behöva stretcha för att matcha höjden på övriga kolumner. Illustrationen har
 * en extra höger-marginal (mr-6) utöver justify-between-placeringen, för större avstånd till
 * Affiliate Hub-kolumnen än om den låg helt flush med radens egen högerkant.
 * Tänkt att återanvändas t.ex. i kompakt läge senare, därför en egen liten komponent.
 */
export default function MountainProfile({
  maxAlt,
  minAlt,
  lifts,
  pisteKm,
  pisteSegments,
  liftsGondola,
  liftsChairlift,
  liftsDragLift,
  liftsOther,
  className = '',
}: MountainProfileProps) {
  const fallhojd = maxAlt - minAlt;

  // "–" istället för att dölja raden eller krascha när ett lifttyp-fält saknas för orten.
  const liftBreakdown = [
    { key: 'gondola', label: 'Linbana/gondol', value: liftsGondola },
    { key: 'chairlift', label: 'Stolslift', value: liftsChairlift },
    { key: 'draglift', label: 'Släplift', value: liftsDragLift },
    { key: 'other', label: 'Övrigt', value: liftsOther },
  ];

  return (
    <div className={`flex w-full items-stretch justify-between gap-4 ${className}`}>
      {/* Kolumn 1: Pist — pistlängd överst, Pistfördelningen direkt under i samma kolumn. */}
      <div className="flex flex-col gap-4 py-1">
        <div>
          <div className="text-[12px] font-semibold uppercase tracking-wide text-slate-400">Pistlängd</div>
          <div className="text-sm font-bold text-slate-800">{pisteKm} km</div>
        </div>
        <div className="flex flex-col gap-1.5">
          {pisteSegments.map((seg) => (
            seg.km > 0 && (
              <div key={seg.key} className="flex items-center gap-2 text-sm text-slate-700">
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${seg.dot}`} />
                <span className="font-medium text-slate-500">{seg.label}</span>
                <span className="text-slate-300">·</span>
                <span className="font-bold text-slate-800">{seg.km} km</span>
              </div>
            )
          ))}
        </div>
      </div>

      {/* Kolumn 2: Liftar — totalt antal överst, sedan uppdelning per typ. */}
      <div className="flex flex-col gap-4 py-1">
        <div>
          <div className="text-[12px] font-semibold uppercase tracking-wide text-slate-400">Liftar</div>
          <div className="text-sm font-bold text-slate-800">{lifts} liftar</div>
        </div>
        <div className="flex flex-col gap-1">
          {liftBreakdown.map((l) => (
            <div key={l.key} className="text-sm text-slate-500">
              {l.label}: <span className="font-bold text-slate-800">{l.value ?? '–'}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Kolumn 3a: Höjdinfo */}
      <div className="flex flex-col gap-4 py-1">
        <div>
          <div className="text-[12px] font-semibold uppercase tracking-wide text-slate-400">Topphöjd</div>
          <div className="text-sm font-bold text-slate-800">{maxAlt} m</div>
        </div>
        <div>
          <div className="text-[12px] font-semibold uppercase tracking-wide text-slate-400">Fallhöjd</div>
          <div className="text-sm font-bold text-slate-800">{fallhojd} m</div>
        </div>
        <div>
          <div className="text-[12px] font-semibold uppercase tracking-wide text-slate-400">Dalhöjd</div>
          <div className="text-sm font-bold text-slate-800">{minAlt} m</div>
        </div>
      </div>

      {/* Kolumn 3b: Bergskam — en enda konturlinje (stroke, ingen fill): platt start, diagonal
          stigning, liten sadelpunkt ~1/3 in, jämn lutning upp till toppen, kortare nedgång som
          slutar halvvägs. w-full + justify-between på föräldern trycker den ut mot högerkanten.
          Bredden (w-[173px]) och höjden (h-[160px]) matchar den högsta kolumnens naturliga
          renderade höjd så helheten känns balanserad. preserveAspectRatio="none" krävs eftersom
          viewBox-proportionerna (160×100) annars skulle skala om HELA grafiken proportionellt vid
          bredd/höjd-ändringar istället för att tillåta oberoende x/y-skalning; vectorEffect håller
          strecket lika tjockt trots det. -translate-x-[50px] flyttar illustrationen ytterligare
          50px åt vänster via transform (ren visuell förskjutning) istället för att öka mr-6 — en
          större margin skulle ändra hur justify-between fördelar det lediga utrymmet mellan ALLA
          kolumnerna och därmed knuffa ihop de andra, medan transform inte påverkar elementets
          layout-box och därför lämnar de andra kolumnernas positioner orörda. */}
      <svg
        viewBox="0 0 160 100"
        preserveAspectRatio="none"
        className="mr-6 h-[160px] w-[173px] shrink-0 -translate-x-[50px]"
        aria-hidden="true"
      >
        <path
          d="M0,96 L22,93 L40,72 L54,82 L115,26 L156,62"
          fill="none"
          stroke="#64748b"
          strokeWidth="5"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  );
}
