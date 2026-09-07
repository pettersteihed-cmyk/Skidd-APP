import { Layers } from 'lucide-react';

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
  pisteMapPdfUrl?: string;
  liftsGondola?: number;
  liftsChairlift?: number;
  liftsDragLift?: number;
  liftsOther?: number;
  className?: string;
}

/**
 * Fem flex-barn i rad, vänster till höger, som fyra visuella kolumner (Höjdinfo + bergskam räknas
 * som EN kolumn, kolumn 4, fast de är två separata flex-barn): (1) Pist — pistlängd + Pistkarta-
 * länk, (2) Pistfördelning — punktlista med km per pistfärg, (3) Liftar — totalt antal +
 * uppdelning per lifttyp, (4a) Höjdinfo — Topphöjd/Fallhöjd/Dalhöjd, (4b) en bergskam som en enkel
 * KONTURLINJE (bara stroke, ingen fylld yta) — kort platt sektion, diagonal stigning, en liten
 * sadelpunkt ca en tredjedel in, jämn/lugn lutning vidare upp till huvudtoppen, och sedan en
 * KORTARE nedåtgående sträcka som slutar halvvägs ner (inte hela vägen till baslinjen). Samma dova
 * blågrå ton som resten av modalen. justify-between (med gap-4 som minsta avstånd) fördelar
 * kolumnerna JÄMNT över hela den tillgängliga bredden. De flesta kolumnerna är topp-justerade med
 * en fast, jämn radmellanrum (gap-4) mellan punkterna istället för att sträckas ut — annars blir
 * det stora, ojämna tomrum i kolumner med få poster jämfört med kolumner med fler. Pist-kolumnen
 * och Pistfördelningen använder däremot items-stretch + justify-between på sin egen kolumn (istället
 * för fast gap) så deras innehåll sprids ut över HELA radens höjd — som alltid styrs av den högsta
 * kolumnen — vilket bl.a. gör att Pistkarta-länken hamnar i exakt samma vertikala läge som sista
 * raden i Pistfördelningen, utan att behöva räkna ut ett exakt gap-värde för hand. Illustrationen
 * har en extra höger-marginal (mr-6) utöver justify-between-placeringen, för större avstånd till
 * Affiliate Hub-kolumnen än om den låg helt flush med radens egen högerkant.
 * Tänkt att återanvändas t.ex. i kompakt läge senare, därför en egen liten komponent.
 */
export default function MountainProfile({
  maxAlt,
  minAlt,
  lifts,
  pisteKm,
  pisteSegments,
  pisteMapPdfUrl,
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
      {/* Kolumn 1: Pist — pistlängd + Pistkarta-länk. justify-between på kolumnen håller
          pistlängd-blocket högst upp och trycker länken hela vägen ner till kolumnens
          (stretchade) underkant — samma nivå som "Svart"-raden i Pistfördelningen. */}
      <div className="flex flex-col justify-between py-1">
        <div>
          <div className="text-[12px] font-semibold uppercase tracking-wide text-slate-400">Pistlängd</div>
          <div className="text-sm font-bold text-slate-800">{pisteKm} km</div>
        </div>
        {pisteMapPdfUrl && (
          <a
            href={pisteMapPdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[14px] font-bold uppercase tracking-wide text-sky-600 transition hover:text-sky-700"
          >
            <Layers className="h-3 w-3" /> Pistkarta
          </a>
        )}
      </div>

      {/* Kolumn 2: Pistfördelning — punktlista med km per färg. justify-between (istället för fast
          gap) sprider ut raderna över hela den stretchade kolumnhöjden, så listan matchar
          höjdinfo-kolumnens totala höjd exakt utan hårdkodat radavstånd. */}
      <div className="flex flex-col justify-between py-1">
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

      {/* Kolumn 3: Liftar — totalt antal överst, sedan uppdelning per typ. */}
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

      {/* Kolumn 4a: Höjdinfo */}
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

      {/* Kolumn 4b: Bergskam — en enda konturlinje (stroke, ingen fill): platt start, diagonal
          stigning, liten sadelpunkt ~1/3 in, jämn lutning upp till toppen, kortare nedgång som
          slutar halvvägs. w-full + justify-between på föräldern trycker den ut mot högerkanten.
          Bredden (w-[173px]) och höjden (h-[154px]) matchar den högsta kolumnens naturliga
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
        className="mr-6 h-[154px] w-[173px] shrink-0 -translate-x-[50px]"
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
