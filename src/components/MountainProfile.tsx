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
 * som EN kolumn, kolumn 3, fast de är två separata flex-barn): (1) Pist — pistlängd som EN rad
 * ("Pistlängd – 600 km", etikett+värde inline) och Pistfördelningen (punktlista med km per
 * pistfärg) direkt under i samma kolumn (Pistkarta-länken bor numera i sektionsrubriken i
 * ResortModal.tsx, inte här), (2) Liftar — totalt antal som samma inline-rad ("Liftar – 158"),
 * sedan uppdelning per lifttyp, (3a) Höjdinfo — Topphöjd/Fallhöjd/Dalhöjd (fortfarande tvåradigt
 * etikett-över-värde, inte inline — bara Pist/Liftar-radernas sammanfattning slogs ihop), (3b) en
 * bergskam som en enkel KONTURLINJE (bara stroke, ingen fylld yta) — kort platt sektion, diagonal
 * stigning, en liten sadelpunkt ca en tredjedel in, jämn/lugn lutning vidare upp till huvudtoppen,
 * och sedan en KORTARE nedåtgående sträcka som slutar halvvägs ner (inte hela vägen till
 * baslinjen). Samma dova blågrå ton som resten av modalen. justify-between (med gap-4 som minsta
 * avstånd) fördelar kolumnerna JÄMNT över hela den tillgängliga bredden. De tre textkolumnerna
 * (Pist/Liftar/Höjdinfo) använder medvetet TÄTA, fasta gap-värden (gap-[13.5px]/gap-[5.5px] i
 * Pist/Liftar, gap-2 i Höjdinfo — inte utspridda via flex/justify-between) — värdena är kalibrerade i
 * webbläsaren (Playwright) så att sista raden i alla tre kolumner (Svart / Övrigt / Dalhöjd)
 * landar exakt i samma höjd trots att kolumnerna har olika antal rader OCH olika radformat
 * (Pist/Liftars sammanfattning är en rad, Höjdinfos block är två rader — gap-6 i Pist/Liftar är
 * ovanligt stort just för att kompensera för den "saknade" raden). Om innehållet i någon kolumn
 * ändras igen behöver gap-värdena och SVG-höjden (se kommentar vid svg-taggen) sannolikt räknas
 * om på samma sätt. Illustrationen har
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
    { key: 'gondola', label: 'Gondol', value: liftsGondola },
    { key: 'chairlift', label: 'Stolslift', value: liftsChairlift },
    { key: 'draglift', label: 'Släplift', value: liftsDragLift },
    { key: 'other', label: 'Övrigt', value: liftsOther },
  ];

  return (
    <div className={`flex w-full items-stretch justify-between gap-4 ${className}`}>
      {/* Kolumn 1: Pist — pistlängd och Pistfördelningen direkt under i samma kolumn. Pistlängd
          är en enda rad ("Pistlängd – 600 km", etikett+värde inline) istället för tvåradigt
          etikett-över-värde som Höjdinfo-kolumnen. gap-[5.5px] mellan färgraderna är det
          avsiktliga radavståndet i listan (höjt stegvis: 2px → 2.4px → 3px → 4px → 5.5px).
          gap-[13.5px] mellan raden och listan sänks i motsvarande takt för varje höjning (senast:
          18px → 13.5px, dvs -4.5px för de tre radgapens +1.5px vardera) så sista raden ("Svart")
          fortsatt landar i höjd med de andra kolumnernas sista rad trots det ökade radavståndet
          (se filkommentaren ovan för helheten). Varje färgrad är justify-between (dot+etikett i en
          egen span till vänster, km-värdet för sig till höger) istället för allt i en rak linje
          med en "·"-avskiljare — det högerjusterar km-värdena så deras högerkant matchar
          "600 km"-värdets högerkant i Pistlängd-raden ovanför (samma column-bredd, satt av den
          bredaste raden — hittills alltid Pistlängd-raden). */}
      <div className="flex flex-col gap-[13.5px] py-1">
        <div className="text-sm">
          <span className="font-medium text-slate-400">Pistlängd</span>
          <span className="text-slate-300"> – </span>
          <span className="font-bold text-slate-800">{pisteKm} km</span>
        </div>
        <div className="flex flex-col gap-[5.5px]">
          {pisteSegments.map((seg) => (
            seg.km > 0 && (
              <div key={seg.key} className="flex items-center justify-between gap-2 text-sm text-slate-700">
                <span className="flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${seg.dot}`} />
                  <span className="font-medium text-slate-500">{seg.label}</span>
                </span>
                <span className="font-bold text-slate-800">{seg.km} km</span>
              </div>
            )
          ))}
        </div>
      </div>

      {/* Kolumn 2: Liftar — totalt antal ("Liftar – 158"), sedan uppdelning per typ. Samma
          gap-[13.5px]/gap-[5.5px] som Kolumn 1, av samma skäl (se kommentaren där). Rubrikraden
          är (liksom uppdelningsraderna nedan) en justify-between-rad — etikett+tankstreck i en
          egen vänsterspan, totalvärdet som fristående högerspan — istället för en enda inline-rad.
          Det garanterar att totalvärdets högerkant alltid matchar uppdelningsradernas högerkant
          (de stretchar alla till samma kolumnbredd via align-items: stretch), oavsett hur breda
          etiketterna eller siffrorna är — inte bara en bieffekt av att just den här raden råkar
          vara den bredaste i kolumnen. */}
      <div className="flex flex-col gap-[13.5px] py-1">
        <div className="flex items-center justify-between gap-2 text-sm">
          <span>
            <span className="font-medium text-slate-400">Liftar</span>
            <span className="text-slate-300"> – </span>
          </span>
          <span className="font-bold text-slate-800">{lifts}</span>
        </div>
        <div className="flex flex-col gap-[5.5px]">
          {liftBreakdown.map((l) => (
            <div key={l.key} className="flex items-center justify-between gap-2 text-sm text-slate-500">
              <span>{l.label}:</span>
              <span className="font-bold text-slate-800">{l.value ?? '–'}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Kolumn 3a: Höjdinfo — gap-2 mellan de tre blocken (neddraget från tidigare gap-4) av
          samma kompakthets-/avstämningsskäl som Kolumn 1/2. */}
      <div className="flex flex-col gap-2 py-1">
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
          Bredden (w-[173px]) och höjden (h-[138px]) matchar den högsta kolumnens naturliga
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
        className="mr-6 h-[138px] w-[173px] shrink-0 -translate-x-[50px]"
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
