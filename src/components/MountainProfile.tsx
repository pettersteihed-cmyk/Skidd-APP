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
  className?: string;
}

/**
 * Fyra sektioner i rad, vänster till höger: (1) pistinfo — Liftar/Pistlängd, (2) pistfördelning —
 * punktlista med km per pistfärg, (3) höjdinfo — Topphöjd/Fallhöjd/Dalhöjd, (4) en bergskam som en
 * enkel KONTURLINJE (bara stroke, ingen fylld yta) — kort platt sektion, diagonal stigning, en
 * liten sadelpunkt ca en tredjedel in, jämn/lugn lutning vidare upp till huvudtoppen, och sedan en
 * KORTARE nedåtgående sträcka som slutar halvvägs ner (inte hela vägen till baslinjen). Samma dova
 * blågrå ton som resten av modalen. justify-between (med gap-4 som minsta avstånd) fördelar de
 * fyra sektionerna JÄMNT över hela den tillgängliga bredden (istället för att klumpa ihop dem till
 * vänster). Pistinfo-/höjdinfo-kolumnerna är topp-justerade med en fast, jämn radmellanrum (gap-4)
 * mellan punkterna istället för att sträckas ut — annars blir det stora, ojämna tomrum i kolumnen
 * med bara två poster (Liftar/Pistlängd) jämfört med kolumnen med tre. Pistfördelningen använder
 * däremot items-stretch + justify-between på sin egen kolumn (istället för fast gap) så dess fyra
 * rader sprids ut över HELA radens höjd — som alltid styrs av den högsta kolumnen (höjdinfo, tre
 * poster) — vilket gör att pistfördelningens första/sista rad hamnar i exakt samma vertikala läge
 * som höjdinfo-kolumnens första/sista rad, utan att behöva räkna ut ett exakt gap-värde för hand.
 * Illustrationen har en extra höger-marginal (mr-6) utöver justify-between-placeringen, för större
 * avstånd till Affiliate Hub-kolumnen än om den låg helt flush med radens egen högerkant.
 * Tänkt att återanvändas t.ex. i kompakt läge senare, därför en egen liten komponent.
 */
export default function MountainProfile({ maxAlt, minAlt, lifts, pisteKm, pisteSegments, pisteMapPdfUrl, className = '' }: MountainProfileProps) {
  const fallhojd = maxAlt - minAlt;

  return (
    <div className={`flex w-full items-stretch justify-between gap-4 ${className}`}>
      {/* Pistinfo — justify-between (istället för fast gap) på ytterkolumnen håller Liftar/
          Pistlängd som en egen topp-grupp med sitt naturliga gap-4-avstånd, medan Pistkarta-länken
          som ANDRA/sista flex-barn trycks hela vägen ner till kolumnens (stretchade) underkant —
          samma nivå som "Svart"-raden i Pistfördelningen bredvid, som också landar vid
          kolumnhöjdens botten via sin egen justify-between+stretch. */}
      <div className="flex flex-col justify-between py-1">
        <div className="flex flex-col gap-4">
          <div>
            <div className="text-[12px] font-semibold uppercase tracking-wide text-slate-400">Liftar</div>
            <div className="text-sm font-bold text-slate-800">{lifts}</div>
          </div>
          <div>
            <div className="text-[12px] font-semibold uppercase tracking-wide text-slate-400">Pistlängd</div>
            <div className="text-sm font-bold text-slate-800">{pisteKm} km</div>
          </div>
        </div>
        {/* sky-600 + Layers-ikon (samma ton/ikon som "Visa pistkarta" i Sidebar.tsx) signalerar
            tydligt klickbar länk snarare än ännu en gråmärkt datapunkt; ingen underline, 14px
            (upp 2px från etiketternas 12px) och font-bold (upp från font-semibold) för egen vikt. */}
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

      {/* Pistfördelning — punktlista med km per färg. justify-between (istället för fast gap)
          sprider ut raderna över hela den stretchade kolumnhöjden, så listan matchar höjdinfo-
          kolumnens totala höjd exakt utan hårdkodat radavstånd. */}
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

      {/* Höjdinfo */}
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

      {/* Bergskam — en enda konturlinje (stroke, ingen fill): platt start, diagonal stigning, liten
          sadelpunkt ~1/3 in, jämn lutning upp till toppen, kortare nedgång som slutar halvvägs.
          w-full + justify-between på föräldern trycker den ut mot högerkanten. Bredden (w-[173px])
          och höjden (h-[154px]) matchar den tillagda Pistkarta-länken gjorde pistinfo-kolumnen till
          den nya högsta (154px, upp från 132px) — så helheten fortsatt känns balanserad.
          preserveAspectRatio="none" krävs eftersom viewBox-proportionerna (160×100) annars skulle
          skala om HELA grafiken proportionellt vid bredd/höjd-ändringar istället för att tillåta
          oberoende x/y-skalning; vectorEffect håller strecket lika tjockt trots det.
          -translate-x-[50px] flyttar illustrationen ytterligare 50px åt vänster via transform (ren
          visuell förskjutning) istället för att öka mr-6 — en större margin skulle ändra hur
          justify-between fördelar det lediga utrymmet mellan ALLA fyra sektionerna och därmed
          knuffa ihop pistinfo/pistfördelning/höjdinfo, medan transform inte påverkar elementets
          layout-box och därför lämnar de andra sektionernas positioner orörda. */}
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
