import { useEffect, useState } from 'react';
import {
  X, Plane, Train, Clock, MapPin, CheckCircle2, ChevronDown,
  Ticket, BedDouble, Car, Package, ArrowUpRight, Calendar,
} from 'lucide-react';
import type { Resort } from '@/types';
import MountainProfile from './MountainProfile';
import { SNOW_HISTORY } from '@/data/snowHistory';
import { airportsByTransfer } from '@/utils/transfer';

interface ResortModalProps {
  resort: Resort | null;
  onClose: () => void;
}

export default function ResortModal({ resort, onClose }: ResortModalProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Sticky-scroll för headern i expanderat läge: headern scrollar normalt med resten av
  // innehållet tills bara HEADER_STICKY_VISIBLE_PX av dess höjd återstår synligt i modalens
  // överkant — då fastnar den där (resterande innehåll fortsätter scrolla under) istället för
  // att glida hela vägen ur synfältet. Ren CSS (position: sticky + ett negativt top-värde,
  // se headerStickyTop nedan) istället för en JS-scrolllyssnare: sticky är till sin natur
  // kontinuerlig och hopp-fri (webbläsaren interpolerar övergången självt), så ingen egen
  // animations-/tröskellogik behövs — till skillnad från ett EARLIER-krav (nu ersatt) om att
  // headern skulle scrolla helt ur synfältet och sedan glida tillbaka i sin HELHET, vilket
  // position: sticky inte kan göra (sticky kan bara hålla kvar en kant, inte återintroducera
  // ett element som redan scrollat förbi) och som därför krävde en manuell overlay-animation.
  const HEADER_STICKY_VISIBLE_PX = 100;
  const headerHeightPx = 288; // matchar headerBanner:s h-[288px] i expanderat läge
  const headerStickyTop = HEADER_STICKY_VISIBLE_PX - headerHeightPx; // -188px

  useEffect(() => {
    if (!resort) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (isExpanded) setIsExpanded(false);
      else onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [resort, onClose, isExpanded]);

  // Nollställ till kompakt läge när en ort öppnas (eller modalen stängs). Ingen egen
  // reset behövs för sticky-headern längre — position: sticky återställer sig självt
  // naturligt (den är ju bara CSS) varje gång man scrollar tillbaka upp eller stänger/öppnar.
  useEffect(() => {
    setIsExpanded(false);
  }, [resort]);

  if (!resort) return null;

  // Alla flygplatser sorterade på transfertid, kortast först — så att "närmaste flygplats" i
  // kompakt läge och Ruta 1/2 i expanderat läge alltid visar samma flygplats med rätt tid
  // (den förstlistade i datan är inte alltid den närmaste, t.ex. Val Cenis).
  const allAirports = airportsByTransfer(resort);

  // Kompakt läge — tre kolumner, två staplade värden per kolumn (label överst i liten grå
  // versal text, värde i fetstil under), samma stil som kolumnerna i expanderat lägets
  // "Skidsystemet"-sektion (se MountainProfile.tsx). Varje kolumn är EN gemensam ljusgrå
  // bakgrundsruta istället för att varje värde hade sin egen separata ruta som förut.
  const compactColumns = [
    {
      key: 'height',
      rows: [
        { label: 'Topphöjd', value: `${resort.maxAlt} m` },
        { label: 'Dalhöjd', value: `${resort.minAlt} m` },
      ],
    },
    {
      key: 'system',
      rows: [
        { label: 'Pistlängd', value: `${resort.pisteKm} km` },
        { label: 'Liftar', value: `${resort.lifts}` },
      ],
    },
    {
      key: 'travel',
      rows: [
        { label: 'Närmaste flygplats', value: allAirports[0].name },
        { label: 'Transfertid', value: `${allAirports[0].transferMin} min` },
      ],
    },
  ];

  // Affiliate Hub — konverteringsyta i expanderat läge. Använder platshållar-URL:er från
  // resort.affiliateLinks om de finns i datan, annars ett dummy-href tills riktiga länkar finns.
  const affiliateButtons = [
    { icon: Ticket, label: 'Köp liftkort', href: resort.affiliateLinks?.liftPass ?? '#' },
    { icon: BedDouble, label: 'Boka boende', href: resort.affiliateLinks?.accommodation ?? '#' },
    { icon: Car, label: 'Boka hyrbil', href: resort.affiliateLinks?.carRental ?? '#' },
    { icon: Package, label: 'Hyr skidutrustning', href: resort.affiliateLinks?.equipmentRental ?? '#' },
  ];

  // Pistfördelning — faller tillbaka på jämn fördelning om fältet saknas (bör inte hända, alla 15
  // orter har det ifyllt, men skyddar mot framtida orter utan data). Visas som km per färg (av
  // total pistlängd), inte procent, i en punktlista.
  const pc = resort.pisteColors ?? { green: 25, blue: 25, red: 25, black: 25 };
  const pisteSegments = [
    { key: 'green', label: 'Grön', km: Math.round((resort.pisteKm * pc.green) / 100), dot: 'bg-green-500' },
    { key: 'blue', label: 'Blå', km: Math.round((resort.pisteKm * pc.blue) / 100), dot: 'bg-blue-500' },
    { key: 'red', label: 'Röd', km: Math.round((resort.pisteKm * pc.red) / 100), dot: 'bg-red-500' },
    { key: 'black', label: 'Svart', km: Math.round((resort.pisteKm * pc.black) / 100), dot: 'bg-slate-900' },
  ];

  // "Resa & praktiskt" (expanderat läge) — logistik: flygplats(er) med transfertid, tåg, säsong.
  // (Liftar/pistlängd hör tematiskt till "Skidsystemet" istället, se MountainProfile nedan.)
  //
  // Transfertid som "X h Y min" över 60 minuter (t.ex. 170 -> "2 h 50 min"), annars bara "X min"
  // som förut. Hela timmar utan rest (t.ex. 120) blir "2 h" utan onödigt "0 min".
  const formatTransferTime = (minutes: number) => {
    if (minutes < 60) return `${minutes} min`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m === 0 ? `${h} h` : `${h} h ${m} min`;
  };

  // Flygplatsrutorna (Ruta 1/2) är tvåkolumniga: flygplatsnamn till vänster, transfertid till
  // höger, i samma ruta — istället för separata Transfertid-/Flygplats-rutor som förut. Ruta 2
  // (Näst närmaste flygplats) byggs bara om allAirports[1] finns (dvs. additionalAirports är
  // ifyllt för orten) — annars göms den helt, ingen tom/trasig ruta.
  const airportTiles = allAirports.slice(0, 2).map((a, i) => ({
    key: `airport-${i}`,
    airportLabel: 'Flyg hit',
    airportValue: a.name,
    transferValue: formatTransferTime(a.transferMin),
  }));

  const otherTiles = [
    { key: 'train', icon: Train, label: 'Ort tillgänglig med tåg', value: resort.train ? 'Ja' : 'Nej' },
    ...(resort.season ? [{ key: 'season', icon: Calendar, label: 'Säsong', value: resort.season }] : []),
  ];

  // Snöhistorik (expanderat läge) — döljs helt (ingen rubrik, inget "saknar data") om orten
  // inte finns i SNOW_HISTORY, t.ex. en ort som ännu inte körts genom snöhistorik-exporten
  // (se scripts/fetchSnowHistory.ts). Sorterad senaste säsong först, se snowHistory.ts.
  const snowHistory = SNOW_HISTORY[resort.id];

  // Header-innehållet (bild/gradient, namn, badge) delas mellan kompakt läge, det normala
  // flödet i expanderat läge, och fas 2-overlayn — bara storlekar skiljer. Ingen egen ref/sticky-
  // logik här; det styrs av var/hur den här JSX:en placeras (se nedan).
  // Stäng-knappen ingår BARA i kompakt läge (headern rör sig aldrig där). I expanderat läge
  // scrollar/animeras headern (fas 1-flöde, fas 2-overlay), så knappen skulle försvinna/hoppa med
  // den — istället ligger en enda fristående stäng-knapp direkt på kortet (se nedan), alltid synlig.
  const headerBanner = (
    <div
      className={`relative shrink-0 ${isExpanded ? 'h-[288px]' : 'h-[180px]'} ${
        resort.heroImageUrl ? 'bg-slate-800 bg-cover bg-center' : 'bg-gradient-to-br from-sky-600 via-blue-700 to-indigo-800'
      }`}
      style={resort.heroImageUrl ? { backgroundImage: `url(${resort.heroImageUrl})` } : undefined}
    >
      {resort.heroImageUrl ? (
        // Mörk gradient-overlay ovanpå bilden — transparent högst upp, mörkare mot botten, så vit text förblir läsbar
        <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-black/30 to-black/70 pointer-events-none" />
      ) : (
        <div className="absolute inset-0 opacity-20 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 20% 30%, white 1px, transparent 1px)', backgroundSize: '24px 24px' }} />
      )}
      {!isExpanded && (
        <button
          onClick={onClose}
          aria-label="Stäng"
          className="absolute right-4 top-4 z-10 flex h-10 w-10 cursor-pointer items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm transition hover:bg-black/60"
        >
          <X className="h-4 w-4 pointer-events-none" />
        </button>
      )}
      <h2
        className={`absolute bottom-5 left-6 max-w-[60%] text-left font-bold leading-tight text-white drop-shadow-md ${
          isExpanded ? 'text-[42px]' : 'text-[26px]'
        }`}
      >
        {resort.name}
      </h2>
      <span
        className={`absolute bottom-5 right-6 inline-flex max-w-[38%] items-center whitespace-nowrap rounded-full bg-white/20 font-semibold uppercase tracking-wide text-white ${
          isExpanded ? 'gap-1.5 px-4 py-1 text-lg' : 'gap-1 px-2.5 py-0.5 text-[11px]'
        }`}
      >
        <MapPin className={`shrink-0 ${isExpanded ? 'h-5 w-5' : 'h-3 w-3'}`} /> {resort.region}
      </span>
    </div>
  );

  return (
    <div
      className="fixed inset-0 z-[1000] cursor-pointer bg-slate-900/40 backdrop-blur-sm"
      onClick={() => (isExpanded ? setIsExpanded(false) : onClose())}
    >
      {/* Modal-kortet — alltid centrerat (top/left 50% + translate -50%/-50%), i både kompakt och
          expanderat läge. Kompakt <-> expanderat är rena CSS-klasser (fast width/height per läge)
          som Tailwinds transition-all/duration-500/ease-in-out (= cubic-bezier(0.4,0,0.2,1))
          animerar deklarativt. Eftersom translate(-50%,-50%) är relativt kortets EGEN storlek
          räknas centreringen om varje frame medan width/height animerar — det ger "zoomar in från
          mitten"-känslan utan att vi någonsin mäter eller räknar ut positioner i JS. */}
      <div
        onClick={(e) => e.stopPropagation()}
        className={`fixed left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl bg-white shadow-2xl transition-all duration-500 ease-in-out ${
          // Expanderat: samma marginal (1.5rem) på alla fyra sidor oavsett skärmens proportioner.
          // Kompakt: INGEN satt höjd — kortet får sin naturliga höjd efter innehållet, så det aldrig
          // blir högre än det behöver vara. max-h är bara en säkerhetsspärr för ovanligt korta
          // fönster, där kroppen (overflow-y-auto) tar över och scrollar istället för att kortet
          // växer utanför skärmen.
          isExpanded ? 'h-[calc(100vh-3rem)] w-[calc(100vw-3rem)]' : 'max-h-[85vh] w-[600px]'
        }`}
      >
        {/* Kompakt läge: headern ligger utanför den scrollbara kroppen och rör sig aldrig — precis
            som innan sticky-experimentet. */}
        {!isExpanded && headerBanner}

        {/* Stäng-knapp (expanderat läge) — fristående, fäst direkt på KORTET (inte på headern eller
            dess overlay), så den alltid ligger kvar i övre högra hörnet oavsett scrollposition eller
            om headern är i fas 1 (scrollar bort) eller fas 2 (overlay). z-30 håller den ovanpå både
            bilden/overlayn (z-20) och allt scrollbart innehåll. */}
        {isExpanded && (
          <button
            onClick={() => setIsExpanded(false)}
            aria-label="Visa kompakt läge"
            className="absolute right-4 top-4 z-30 flex h-10 w-10 cursor-pointer items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm transition hover:bg-black/60"
          >
            <X className="h-4 w-4 pointer-events-none" />
          </button>
        )}

        {/* Body — EN delad scroll för allt innehåll (bild + taggar + stat-grid + fördjupad info +
            Affiliate Hub) i expanderat läge, precis som i kompakt läge, bara bredare. Headern
            ligger som FÖRSTA barn i den scrollbara ytan med position: sticky (se headerStickyTop
            ovan) — den scrollar normalt tills bara HEADER_STICKY_VISIBLE_PX återstår synligt,
            fastnar sedan där medan resten av innehållet fortsätter scrolla under. Ingen kapslad/
            separat scroll för höger- eller vänsterkolumnen — Affiliate Hub scrollar med som
            vanlig text istället för att kännas fastlåst. */}
        <div className="flex-1 overflow-y-auto scrollbar-thin">
          {isExpanded ? (
            <>
              <div className="sticky z-10" style={{ top: `${headerStickyTop}px` }}>
                {headerBanner}
              </div>
              <div className="grid grid-cols-[65%_35%] gap-6 px-6 py-5">
                {/* Vänster kolumn — ordning: taggar → Om orten → Skidsystemet (höjder/pistlängd +
                    pistfördelning) → Resa & praktiskt (transfertid/flygplats/liftar/säsong) */}
                <div>
                  {/* badges */}
                  <div className="mb-4 flex flex-wrap gap-2">
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                      {resort.price} prisnivå
                    </span>
                    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${resort.train ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                      <Train className="h-3 w-3" /> {resort.train ? 'Tåg till ort' : 'Inget tåg'}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700">
                      <CheckCircle2 className="h-3 w-3" /> Ski-in/ski-out: {resort.skiInOut}
                    </span>
                  </div>

                  {/* Om orten */}
                  {resort.description && (
                    <div className="mb-5">
                      <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">Om orten</h3>
                      <p className="text-sm leading-relaxed text-slate-600">{resort.description}</p>
                    </div>
                  )}

                  {/* Skidsystemet — pistfördelning (km per färg), liftar/pistlängd, topp-/dal-/
                      fallhöjd och bergssiluetten samlade i EN rad som en sammanhållen grupp.
                      Rubriken bär nu Pistkarta-länken (hela texten är klickbar, sky-600, ingen
                      understrykning) istället för att MountainProfile hade en egen länk längst
                      ner i Pist-kolumnen — mer upptäckbar, och frigör utrymme i kolumnen. Faller
                      tillbaka på vanlig, icke-klickbar rubriktext om orten saknar pisteMapPdfUrl. */}
                  <div className="mb-5">
                    <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">
                      {resort.pisteMapPdfUrl ? (
                        <a
                          href={resort.pisteMapPdfUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sky-600 transition hover:text-sky-700"
                        >
                          Skidsystemet – Pistkarta
                        </a>
                      ) : (
                        'Skidsystemet'
                      )}
                    </h3>
                    <MountainProfile
                      maxAlt={resort.maxAlt}
                      minAlt={resort.minAlt}
                      lifts={resort.lifts}
                      pisteKm={resort.pisteKm}
                      pisteSegments={pisteSegments}
                      liftsGondola={resort.liftsGondola}
                      liftsChairlift={resort.liftsChairlift}
                      liftsDragLift={resort.liftsDragLift}
                      liftsOther={resort.liftsOther}
                    />
                  </div>

                  {/* Resa & praktiskt — flygplats(er) med transfertid, tåg, säsong om satt.
                      Rutorna är olika breda från sm och uppåt: Ruta 3 (tåg) är 40px smalare, och
                      de 20px den frigör per sida läggs på Ruta 1/2 (flygplatsrutorna) — annars
                      radbryter "NÄST NÄRMASTE FLYGPLATS" i Ruta 2. Bredderna sätts av
                      .travel-tiles-grid i index.css (vanlig CSS, se kommentar där för varför inte
                      en Tailwind arbitrary-value-klass användes). mb-5 eftersom Snöhistorik
                      (om orten har data) kommer direkt under — annars är det sista sektionen
                      i vänsterkolumnen och behöver ingen bottenmarginal. */}
                  <div className="mb-5">
                    <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">Resa &amp; praktiskt</h3>
                    <div className="travel-tiles-grid grid grid-cols-2 gap-2.5">
                      {airportTiles.map((t) => (
                        <div key={t.key} className="rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2.5">
                          {/* flex-1/min-w-0 på vänsterkolumnen (istället för justify-between)
                              gör att den faktiskt växer in i utrymmet Ruta 1/2 fick extra bredd
                              från — annars hade den bredare rutan bara blivit mer TOMT MELLANRUM
                              mellan kolumnerna (justify-between sprider bara space BETWEEN barnen,
                              stretchar dem inte), och "NÄST NÄRMASTE FLYGPLATS" hade fortsatt
                              radbryta trots den bredare rutan. shrink-0 på transfertid-kolumnen
                              håller den kvar i sin naturliga bredd. */}
                          <div className="flex items-center gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-slate-400">
                                <Plane className="h-3 w-3" /> {t.airportLabel}
                              </div>
                              <div className="mt-0.5 text-sm font-bold text-slate-800">{t.airportValue}</div>
                            </div>
                            {/* items-end högerjusterar värdet under så dess högerkant linjerar
                                med TRANSFERTID-etikettens högerkant ovanför. */}
                            <div className="flex shrink-0 flex-col items-end">
                              <div className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-slate-400">
                                <Clock className="h-3 w-3" /> Transfertid
                              </div>
                              <div className="mt-0.5 text-sm font-bold text-slate-800">{t.transferValue}</div>
                            </div>
                          </div>
                        </div>
                      ))}
                      {otherTiles.map((t) => (
                        <div key={t.key} className="rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2.5">
                          <div className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-slate-400">
                            <t.icon className="h-3 w-3" /> {t.label}
                          </div>
                          <div className="mt-0.5 text-sm font-bold text-slate-800">{t.value}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Snöhistorik — en riktig <table> med EN gemensam rubrikrad (Säsong/Snöfall/
                      Max snödjup/Datum för max snödjup) istället för upprepade små etiketter per
                      rad. table-fixed gör att de fyra kolumnerna delar bredden JÄMNT (ingen
                      kolumn får extra utrymme baserat på sitt innehålls längd), så de sprider ut
                      sig över hela sektionens bredd istället för att klumpa ihop sig mot höger
                      kant. Alla rader ser likadana ut (ingen "bäst säsong"-markering). Senaste
                      säsongen överst, se snowHistory.ts. Attribution-raden längst ner är ett
                      licenskrav från Open-Meteo, inte valfri — visas alltid, även under
                      gratis-nivå-utvecklingsfasen (se snowHistory.ts). */}
                  {snowHistory && snowHistory.length > 0 && (
                    <div>
                      <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">Snöhistorik</h3>
                      <div className="overflow-hidden rounded-xl border border-slate-100">
                        <table className="w-full table-fixed text-sm">
                          <thead>
                            <tr className="bg-slate-50/60">
                              <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400">Säsong</th>
                              <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400">Snöfall</th>
                              <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400">Max snödjup</th>
                              <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400">Datum för max snödjup</th>
                            </tr>
                          </thead>
                          <tbody>
                            {snowHistory.map((s) => (
                              <tr key={s.season} className="border-t border-slate-100">
                                <td className="px-3 py-2 text-slate-700">{s.season}</td>
                                <td className="px-3 py-2 font-bold text-slate-800">{s.totalSnowfallCm} cm</td>
                                <td className="px-3 py-2 font-bold text-slate-800">{s.maxSnowDepthCm} cm</td>
                                <td className="px-3 py-2 text-slate-600">{s.maxSnowDepthDate}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <p className="mt-2 text-[11px] text-slate-400">
                        Väderdata från{' '}
                        <a
                          href="https://open-meteo.com"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline hover:text-slate-600"
                        >
                          Open-Meteo.com
                        </a>
                      </p>
                    </div>
                  )}
                </div>

                {/* Höger kolumn — Affiliate Hub. Ingen egen scroll/positionering längre; den flyter
                    och scrollar med resten av raden precis som en vanlig sidopanel i innehållet. */}
                <div className="rounded-2xl border border-slate-200 bg-slate-100 p-5">
                  <h3 className="mb-1 text-xs font-bold uppercase tracking-wide text-blue-700">Affiliate Hub</h3>
                  <p className="mb-4 text-[11px] text-slate-500">Boka det du behöver för resan</p>
                  <div className="space-y-2.5">
                    {affiliateButtons.map((b) => (
                      <a
                        key={b.label}
                        href={b.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm font-semibold text-slate-800 shadow-sm transition hover:border-blue-200 hover:bg-blue-50"
                      >
                        <b.icon className="h-4 w-4 shrink-0 text-blue-600" />
                        <span className="flex-1">{b.label}</span>
                        <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-slate-400 transition group-hover:text-blue-600" />
                      </a>
                    ))}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="px-6 py-5">
              {/* badges */}
              <div className="mb-4 flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                  {resort.price} prisnivå
                </span>
                <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${resort.train ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                  <Train className="h-3 w-3" /> {resort.train ? 'Tåg till ort' : 'Inget tåg'}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700">
                  <CheckCircle2 className="h-3 w-3" /> Ski-in/ski-out: {resort.skiInOut}
                </span>
              </div>

              {/* stats grid — tre kolumner, två staplade värden per kolumn i en gemensam ruta */}
              <div className="grid grid-cols-3 gap-2.5">
                {compactColumns.map((col) => (
                  <div key={col.key} className="flex flex-col gap-4 rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2.5">
                    {col.rows.map((r) => (
                      <div key={r.label}>
                        <div className="text-[12px] font-semibold uppercase tracking-wide text-slate-400">{r.label}</div>
                        <div className="mt-0.5 text-sm font-bold text-slate-800">{r.value}</div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>

              {/* Mer information — bara synlig i kompakt läge */}
              <button
                onClick={() => setIsExpanded(true)}
                className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-200 py-2.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 hover:text-slate-800"
              >
                Mer information
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
