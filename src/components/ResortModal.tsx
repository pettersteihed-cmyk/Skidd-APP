import { useEffect } from 'react';
import {
  X, Mountain, ArrowDown, Cable, Plane, Train, Clock, Ruler, MapPin, CheckCircle2,
} from 'lucide-react';
import type { Resort } from '@/types';

interface ResortModalProps {
  resort: Resort | null;
  onClose: () => void;
}

export default function ResortModal({ resort, onClose }: ResortModalProps) {
  useEffect(() => {
    if (!resort) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [resort, onClose]);

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
      className="fixed inset-0 z-[1000] flex items-end justify-center bg-slate-900/40 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header banner — ortens bild om den finns, annars blå gradient som fallback */}
        <div
          className={`relative h-28 px-6 pt-5 ${
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
          <button
            onClick={onClose}
            aria-label="Stäng"
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

        {/* Body */}
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
        </div>
      </div>
    </div>
  );
}
