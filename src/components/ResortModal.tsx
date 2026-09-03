import { useEffect, useRef, useState } from 'react';
import {
  X, Mountain, ArrowDown, Cable, Plane, Train, Clock, Ruler, MapPin, CheckCircle2, ChevronDown,
  Ticket, BedDouble, Car, Package, ArrowUpRight,
} from 'lucide-react';
import type { Resort } from '@/types';

interface ResortModalProps {
  resort: Resort | null;
  onClose: () => void;
}

export default function ResortModal({ resort, onClose }: ResortModalProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Tvåfas-scroll för headern i expanderat läge:
  // Fas 1 — headern ligger i normalt dokumentflöde (osynlig "overlayTranslate"-state = null) och
  // scrollar med resten som vanligt, precis som texten under.
  // Fas 2 — triggas i onScroll när headern annars skulle glida ut ovanför kortets överkant (dess
  // nederkant når toppen). Då tar en absolut positionerad "overlay"-kopia av headern över, animerad
  // med en CSS-transition på transform: translateY — den låses i sin NUVARANDE (nästan bortscrollade)
  // position först, och glider sedan mjukt ner till vila högst upp, istället för att hoppa dit direkt.
  const scrollRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const [isHeaderStuck, setIsHeaderStuck] = useState(false);
  // null = fas 1 (ingen overlay). Ett tal = fas 2, overlayns aktuella translateY i px (animeras mot 0).
  const [overlayTranslate, setOverlayTranslate] = useState<number | null>(null);

  const handleScroll = () => {
    const scrollEl = scrollRef.current;
    const headerEl = headerRef.current;
    if (!scrollEl || !headerEl) return;
    // "Bildens nederkant når modalens överkant" = vi har scrollat minst headerns egen höjd.
    const stuck = scrollEl.scrollTop >= headerEl.offsetHeight;
    if (stuck && !isHeaderStuck) {
      // Just passerat tröskeln: lås overlayn på headerns NUVARANDE (nästan osynliga) position
      // direkt (inget hopp), animera den sedan till 0 (vila högst upp) på nästa frame.
      setOverlayTranslate(-scrollEl.scrollTop);
      requestAnimationFrame(() => requestAnimationFrame(() => setOverlayTranslate(0)));
    } else if (!stuck && isHeaderStuck) {
      // Scrollat tillbaka upp under tröskeln: släpp overlayn, det vanliga flödet tar över igen.
      setOverlayTranslate(null);
    }
    setIsHeaderStuck(stuck);
  };

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

  // Nollställ till kompakt läge när en ny ort öppnas (eller modalen stängs)
  useEffect(() => {
    setIsExpanded(false);
    setIsHeaderStuck(false);
    setOverlayTranslate(null);
  }, [resort]);

  // Nollställ fas 1 varje gång man går ur expanderat läge, så nästa expansion alltid börjar löst
  useEffect(() => {
    if (!isExpanded) {
      setIsHeaderStuck(false);
      setOverlayTranslate(null);
    }
  }, [isExpanded]);

  if (!resort) return null;

  const stats = [
    { icon: Mountain, label: 'Tophöjd', value: `${resort.maxAlt} m` },
    { icon: ArrowDown, label: 'Dalhöjd', value: `${resort.minAlt} m` },
    { icon: Cable, label: 'Liftar', value: `${resort.lifts}` },
    { icon: Ruler, label: 'Pistlängd', value: `${resort.pisteKm} km` },
    { icon: Clock, label: 'Transfertid', value: `${resort.transferMin} min` },
    { icon: Plane, label: 'Närmaste flygplats', value: resort.airport },
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
  // orter har det ifyllt, men skyddar mot framtida orter utan data).
  const pc = resort.pisteColors ?? { green: 25, blue: 25, red: 25, black: 25 };
  const pisteSegments = [
    { key: 'green', label: 'Grön', value: pc.green, bar: 'bg-green-500', dot: 'bg-green-500' },
    { key: 'blue', label: 'Blå', value: pc.blue, bar: 'bg-blue-500', dot: 'bg-blue-500' },
    { key: 'red', label: 'Röd', value: pc.red, bar: 'bg-red-500', dot: 'bg-red-500' },
    { key: 'black', label: 'Svart', value: pc.black, bar: 'bg-slate-900', dot: 'bg-slate-900' },
  ];

  // Praktisk info — den första flygplatsen är alltid resort.airport/transferMin;
  // additionalAirports (om någon ort någonsin får fler) läggs på efter.
  const allAirports = [
    { name: resort.airport, transferMin: resort.transferMin },
    ...(resort.additionalAirports ?? []),
  ];

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
          isExpanded ? 'text-[42px]' : 'text-lg'
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

        {/* Fas 2-overlay — en fristående kopia av headern, absolut positionerad ovanpå allt annat
            i kortet. Visas bara under och efter övergången (overlayTranslate !== null). Startar på
            headerns nuvarande, nästan bortscrollade position (inget hopp) och CSS-transitionar sedan
            transform till translateY(0) — en mjuk glidning till vila högst upp i stället för ett hopp. */}
        {isExpanded && overlayTranslate !== null && (
          <div
            className="absolute left-0 right-0 top-0 z-20 transition-transform duration-300 ease-out"
            style={{ transform: `translateY(${overlayTranslate}px)` }}
          >
            {headerBanner}
          </div>
        )}

        {/* Body — EN delad scroll för allt innehåll (bild + taggar + stat-grid + fördjupad info +
            Affiliate Hub) i expanderat läge, precis som i kompakt läge, bara bredare. Headern ligger
            som FÖRSTA barn i den scrollbara ytan och rör sig i normalt dokumentflöde (fas 1) tills
            onScroll ovan aktiverar fas 2-overlayn — då göms den här in-flow-kopian (visibility) så
            det aldrig syns två bilder samtidigt. Ingen kapslad/separat scroll för höger- eller
            vänsterkolumnen — Affiliate Hub scrollar med som vanlig text istället för att kännas
            fastlåst. */}
        <div ref={scrollRef} onScroll={isExpanded ? handleScroll : undefined} className="flex-1 overflow-y-auto">
          {isExpanded ? (
            <>
              <div ref={headerRef} style={overlayTranslate !== null ? { visibility: 'hidden' } : undefined}>
                {headerBanner}
              </div>
              <div className="grid grid-cols-[65%_35%] gap-6 px-6 py-5">
                {/* Vänster kolumn — taggar, stat-grid, Om orten / Pistfördelning / Praktisk info */}
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

                  {/* stats grid */}
                  <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                    {stats.map((s) => (
                      <div key={s.label} className="rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2.5">
                        <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                          <s.icon className="h-3 w-3" /> {s.label}
                        </div>
                        <div className="mt-0.5 text-sm font-bold text-slate-800">{s.value}</div>
                      </div>
                    ))}
                  </div>

                  {/* Om orten */}
                  {resort.description && (
                    <div className="mt-5">
                      <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">Om orten</h3>
                      <p className="text-sm leading-relaxed text-slate-600">{resort.description}</p>
                    </div>
                  )}

                  {/* Pistfördelning */}
                  <div className="mt-5">
                    <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">Pistfördelning</h3>
                    <div className="flex h-3 w-full overflow-hidden rounded-full bg-slate-100">
                      {pisteSegments.map((seg) => (
                        seg.value > 0 && (
                          <div key={seg.key} className={seg.bar} style={{ width: `${seg.value}%` }} title={`${seg.label} ${seg.value}%`} />
                        )
                      ))}
                    </div>
                    <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1">
                      {pisteSegments.map((seg) => (
                        <span key={seg.key} className="flex items-center gap-1.5 text-xs text-slate-500">
                          <span className={`h-2 w-2 rounded-full ${seg.dot}`} />
                          {seg.label} {seg.value}%
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Praktisk info */}
                  <div className="mt-5">
                    <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">Praktisk info</h3>
                    <dl className="text-sm">
                      {resort.season && (
                        <div className="flex items-center justify-between border-b border-slate-100 py-2">
                          <dt className="text-slate-500">Säsong</dt>
                          <dd className="font-semibold text-slate-800">{resort.season}</dd>
                        </div>
                      )}
                      <div className="flex items-center justify-between border-b border-slate-100 py-2">
                        <dt className="text-slate-500">Höjdskillnad</dt>
                        <dd className="font-semibold text-slate-800">{resort.maxAlt - resort.minAlt} m</dd>
                      </div>
                      {allAirports.map((a, i) => (
                        <div key={`${a.name}-${i}`} className="flex items-center justify-between border-b border-slate-100 py-2 last:border-0">
                          <dt className="text-slate-500">{allAirports.length > 1 ? `Flygplats ${i + 1}` : 'Flygplats'}</dt>
                          <dd className="font-semibold text-slate-800">{a.name} · {a.transferMin} min</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                </div>

                {/* Höger kolumn — Affiliate Hub. Ingen egen scroll/positionering längre; den flyter
                    och scrollar med resten av raden precis som en vanlig sidopanel i innehållet. */}
                <div className="rounded-2xl bg-gradient-to-b from-blue-950 to-slate-900 p-5">
                  <h3 className="mb-1 text-xs font-bold uppercase tracking-wide text-blue-300">Affiliate Hub</h3>
                  <p className="mb-4 text-[11px] text-blue-100/60">Boka det du behöver för resan</p>
                  <div className="space-y-2.5">
                    {affiliateButtons.map((b) => (
                      <a
                        key={b.label}
                        href={b.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group flex items-center gap-2.5 rounded-xl bg-white/10 px-3.5 py-3 text-sm font-semibold text-white transition hover:bg-white/20"
                      >
                        <b.icon className="h-4 w-4 shrink-0 text-blue-300" />
                        <span className="flex-1">{b.label}</span>
                        <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-blue-300/70 transition group-hover:text-white" />
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

              {/* stats grid */}
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                {stats.map((s) => (
                  <div key={s.label} className="rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2.5">
                    <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                      <s.icon className="h-3 w-3" /> {s.label}
                    </div>
                    <div className="mt-0.5 text-sm font-bold text-slate-800">{s.value}</div>
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
