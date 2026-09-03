import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type TransitionEvent } from 'react';
import {
  X, Mountain, ArrowDown, Cable, Plane, Train, Clock, Ruler, MapPin, CheckCircle2, ChevronDown,
} from 'lucide-react';
import type { Resort } from '@/types';

interface ResortModalProps {
  resort: Resort | null;
  onClose: () => void;
}

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

// Samma duration/easing för alla geometri-övergångar (kort, bildhuvud, layoutbyte)
const EASE = 'cubic-bezier(0.4, 0, 0.2, 1)';
const DURATION_MS = 500;
const COMPACT_RADIUS = 16; // px — matchar Tailwinds rounded-2xl

export default function ResortModal({ resort, onClose }: ResortModalProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  // Kortets naturliga (kompakta) geometri, ommätt varje gång det renderas i sitt CSS-styrda
  // vilo-läge — det är målet vi animerar tillbaka till när vi fäller ihop från fullskärm.
  const naturalRectRef = useRef<Rect | null>(null);

  const [isExpanded, setIsExpanded] = useState(false);
  // Explicit pixel-geometri som styr kortets position/storlek under och strax efter en animation.
  // null = låt CSS-klasserna (kompakt, centrerat kort) sköta layouten själva.
  const [cardStyle, setCardStyle] = useState<CSSProperties | null>(null);

  const expand = () => {
    const el = cardRef.current;
    if (!el) { setIsExpanded(true); return; }
    const r = el.getBoundingClientRect();
    // Lås nuvarande (kompakta) geometri som explicita pixelvärden först — inget visuellt hopp —
    // så nästa uppdatering (fullskärmsmålet) har ett riktigt "från"-läge att animera ifrån.
    setCardStyle({ top: r.top, left: r.left, width: r.width, height: r.height, borderRadius: COMPACT_RADIUS });
    requestAnimationFrame(() => {
      setIsExpanded(true);
      setCardStyle({ top: 0, left: 0, width: window.innerWidth, height: window.innerHeight, borderRadius: 0 });
    });
  };

  const collapse = () => {
    const el = cardRef.current;
    const target = naturalRectRef.current;
    if (!el || !target) { setIsExpanded(false); setCardStyle(null); return; }
    const r = el.getBoundingClientRect();
    setCardStyle({ top: r.top, left: r.left, width: r.width, height: r.height, borderRadius: 0 });
    requestAnimationFrame(() => {
      setIsExpanded(false);
      setCardStyle({ top: target.top, left: target.left, width: target.width, height: target.height, borderRadius: COMPACT_RADIUS });
    });
  };

  // Efter en avslutad hopfällning: släpp de explicita pixelvärdena så kortet återgår till att
  // styras av CSS-klasserna (och därmed förblir responsivt om fönstret ändrar storlek).
  const handleCardTransitionEnd = (e: TransitionEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    if (!isExpanded) setCardStyle(null);
  };

  useEffect(() => {
    if (!resort) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (isExpanded) collapse();
      else onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [resort, onClose, isExpanded]);

  // Nollställ till kompakt läge när en ny ort öppnas (eller modalen stängs)
  useEffect(() => {
    setIsExpanded(false);
    setCardStyle(null);
  }, [resort]);

  // Mät kortets naturliga (kompakta) geometri varje gång det vilar i CSS-styrt läge.
  useLayoutEffect(() => {
    if (!resort || isExpanded || cardStyle) return;
    const el = cardRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    naturalRectRef.current = { top: r.top, left: r.left, width: r.width, height: r.height };
  }, [resort, isExpanded, cardStyle]);

  if (!resort) return null;

  const stats = [
    { icon: Mountain, label: 'Tophöjd', value: `${resort.maxAlt} m` },
    { icon: ArrowDown, label: 'Dalhöjd', value: `${resort.minAlt} m` },
    { icon: Cable, label: 'Liftar', value: `${resort.lifts}` },
    { icon: Ruler, label: 'Pistlängd', value: `${resort.pisteKm} km` },
    { icon: Clock, label: 'Transfertid', value: `${resort.transferMin} min` },
    { icon: Plane, label: 'Närmaste flygplats', value: resort.airport },
  ];

  return (
    <div
      className="fixed inset-0 z-[1000] bg-slate-900/40 backdrop-blur-sm"
      onClick={isExpanded ? undefined : onClose}
    >
      {/* Modal-kortet — samma element hela vägen: kompakt centrerat kort <-> fullskärm.
          Position/bredd/höjd/border-radius animeras via transition, ingen ny komponent monteras. */}
      <div
        ref={cardRef}
        onClick={(e) => e.stopPropagation()}
        onTransitionEnd={handleCardTransitionEnd}
        style={{
          ...cardStyle,
          transitionProperty: 'top, left, width, height, border-radius',
          transitionDuration: `${DURATION_MS}ms`,
          transitionTimingFunction: EASE,
        }}
        className={`fixed flex flex-col overflow-hidden bg-white shadow-2xl ${
          cardStyle ? '' : 'left-1/2 top-1/2 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-2xl'
        }`}
      >
        {/* Header banner — ortens bild om den finns, annars blå gradient som fallback.
            Krymper något i höjd när modalen är expanderad. */}
        <div
          className={`relative shrink-0 px-6 pt-5 transition-all duration-500 ease-in-out ${
            isExpanded ? 'h-20' : 'h-28'
          } ${resort.heroImageUrl ? 'bg-slate-800 bg-cover bg-center' : 'bg-gradient-to-br from-sky-600 via-blue-700 to-indigo-800'}`}
          style={resort.heroImageUrl ? { backgroundImage: `url(${resort.heroImageUrl})` } : undefined}
        >
          {resort.heroImageUrl ? (
            // Mörk gradient-overlay ovanpå bilden — transparent högst upp, mörkare mot botten, så vit text förblir läsbar
            <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-black/30 to-black/70 pointer-events-none" />
          ) : (
            <div className="absolute inset-0 opacity-20 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 20% 30%, white 1px, transparent 1px)', backgroundSize: '24px 24px' }} />
          )}
          <button
            onClick={isExpanded ? collapse : onClose}
            aria-label={isExpanded ? 'Visa kompakt läge' : 'Stäng'}
            className="absolute right-4 top-4 z-10 flex h-10 w-10 cursor-pointer items-center justify-center rounded-full bg-white/20 text-white transition hover:bg-white/40"
          >
            <X className="h-4 w-4 pointer-events-none" />
          </button>
          <div className="relative">
            <span className="inline-flex items-center gap-1 rounded-full bg-white/20 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-white">
              <MapPin className="h-3 w-3" /> {resort.region}
            </span>
            <h2 className="mt-2 text-lg font-bold leading-tight text-white drop-shadow-sm">{resort.name}</h2>
          </div>
        </div>

        {/* Body — enkolumn i kompakt läge, två kolumner (~65/35) när expanderad */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <div className={isExpanded ? 'grid grid-cols-[65%_35%] gap-6' : ''}>
            {/* Vänster kolumn — taggar, stat-grid och (senare) längre brödtext */}
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

              {/* Mer information — bara synlig i kompakt läge */}
              {!isExpanded && (
                <button
                  onClick={expand}
                  className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-200 py-2.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 hover:text-slate-800"
                >
                  Mer information
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Höger kolumn — reserverad, fylls i steg 4 */}
            {isExpanded && <div />}
          </div>
        </div>
      </div>
    </div>
  );
}
