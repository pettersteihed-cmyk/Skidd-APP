import { useEffect, useState } from 'react';
import {
  X, Mountain, ArrowDown, Cable, Plane, Train, Clock, Ruler, MapPin, CheckCircle2, ChevronDown,
} from 'lucide-react';
import type { Resort } from '@/types';

interface ResortModalProps {
  resort: Resort | null;
  onClose: () => void;
}

export default function ResortModal({ resort, onClose }: ResortModalProps) {
  const [isExpanded, setIsExpanded] = useState(false);

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
  }, [resort]);

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
      {/* Modal-kortet — alltid centrerat (top/left 50% + translate -50%/-50%), i både kompakt och
          expanderat läge. Kompakt <-> expanderat är rena CSS-klasser (fast width/height per läge)
          som Tailwinds transition-all/duration-500/ease-in-out (= cubic-bezier(0.4,0,0.2,1))
          animerar deklarativt. Eftersom translate(-50%,-50%) är relativt kortets EGEN storlek
          räknas centreringen om varje frame medan width/height animerar — det ger "zoomar in från
          mitten"-känslan utan att vi någonsin mäter eller räknar ut positioner i JS. */}
      <div
        onClick={(e) => e.stopPropagation()}
        className={`fixed left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl bg-white shadow-2xl transition-all duration-500 ease-in-out ${
          // Expanderat: samma marginal (3rem) på alla fyra sidor oavsett skärmens proportioner.
          // Kompakt: INGEN satt höjd — kortet får sin naturliga höjd efter innehållet (header +
          // badges + stat-grid + knapp), så det aldrig blir högre än det behöver vara. max-h är
          // bara en säkerhetsspärr för ovanligt korta fönster, där kroppen (overflow-y-auto) tar
          // över och scrollar istället för att kortet växer utanför skärmen.
          isExpanded ? 'h-[calc(100vh-6rem)] w-[calc(100vw-6rem)]' : 'max-h-[85vh] w-[600px]'
        }`}
      >
        {/* Header banner — ortens bild om den finns, annars blå gradient som fallback.
            I expanderat läge 20% lägre än tidigare (450px -> 360px), i samma transition som kortet. */}
        <div
          className={`relative shrink-0 transition-all duration-500 ease-in-out ${
            isExpanded ? 'h-[288px]' : 'h-[180px]'
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
            onClick={() => (isExpanded ? setIsExpanded(false) : onClose())}
            aria-label={isExpanded ? 'Visa kompakt läge' : 'Stäng'}
            className="absolute right-4 top-4 z-10 flex h-10 w-10 cursor-pointer items-center justify-center rounded-full bg-white/20 text-white transition hover:bg-white/40"
          >
            <X className="h-4 w-4 pointer-events-none" />
          </button>
          {/* Ortnamn — nere till vänster i bilden, båda lägena (max-w så långa namn radbryter
              istället för att krocka med badgen på högersidan) */}
          <h2
            className={`absolute bottom-5 left-6 max-w-[60%] text-left font-bold leading-tight text-white drop-shadow-md ${
              isExpanded ? 'text-[42px]' : 'text-lg'
            }`}
          >
            {resort.name}
          </h2>
          {/* Region-badge — nere till höger i bilden (motsatt ortnamnet). Expanderat är ~20% mindre
              än förra stegets dubblade storlek; kompakt är tillbaka på sin ursprungliga, mindre
              storlek (samma kompakt/expanderat-förhållande som innan badgen dubblades). */}
          <span
            className={`absolute bottom-5 right-6 inline-flex max-w-[38%] items-center whitespace-nowrap rounded-full bg-white/20 font-semibold uppercase tracking-wide text-white ${
              isExpanded ? 'gap-1.5 px-4 py-1 text-lg' : 'gap-1 px-2.5 py-0.5 text-[11px]'
            }`}
          >
            <MapPin className={`shrink-0 ${isExpanded ? 'h-5 w-5' : 'h-3 w-3'}`} /> {resort.region}
          </span>
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
                  onClick={() => setIsExpanded(true)}
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
