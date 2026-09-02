import { useMemo, useState, useCallback } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import MapView from '@/components/MapView';
import Sidebar from '@/components/Sidebar';
import ResortModal from '@/components/ResortModal';
import { RESORTS } from '@/data/resorts';
import type { Filters, Resort } from '@/types';

const MAX_TRANSFER_DEFAULT = Math.max(...RESORTS.map((r) => r.transferMin));
const MAX_PISTE = Math.max(...RESORTS.map((r) => r.pisteKm));

const DEFAULT_FILTERS: Filters = {
  maxTransfer: MAX_TRANSFER_DEFAULT,
  priceLevels: [],
  trainOnly: false,
  minPisteKm: 0,
  search: '',
};

export default function App() {
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [activeResort, setActiveResort] = useState<Resort | null>(null);
  const [flyTarget, setFlyTarget] = useState<{ lat: number; lng: number; zoom?: number; nonce: number } | null>(null);
  const [showSnowMap, setShowSnowMap] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [resizeTrigger, setResizeTrigger] = useState(0);

  const filtered = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    return RESORTS.filter((r) => {
      if (r.transferMin > filters.maxTransfer) return false;
      if (filters.priceLevels.length > 0 && !filters.priceLevels.includes(r.price)) return false;
      if (filters.trainOnly && !r.train) return false;
      if (r.pisteKm < filters.minPisteKm) return false;
      if (q && !(`${r.name} ${r.region}`.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [filters]);

  const handleSelect = useCallback((resort: Resort) => {
    setActiveResort(resort);
    setFlyTarget({ lat: resort.lat, lng: resort.lng, nonce: Date.now() });
  }, []);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-100 font-sans">
      {/* Sidebar-wrapper — animerar bredd, ingen overflow-hidden (skulle klippa toggle-knappen) */}
      <div
        className={`relative z-[500] flex-shrink-0 transition-all duration-300 ease-in-out ${
          sidebarOpen ? 'w-[340px]' : 'w-0'
        } ${sidebarOpen ? 'border-r border-slate-200' : ''}`}
      >
        {/* Klipp-container — klipper det utglida innehållet */}
        <div className="absolute inset-y-0 left-0 w-[340px] overflow-hidden shadow-xl">
          {/* Slide-wrapper — glider ut åt vänster vid stängning */}
          <div
            className={`h-full transition-transform duration-300 ease-in-out ${
              sidebarOpen ? 'translate-x-0' : '-translate-x-full'
            }`}
          >
            <Sidebar
              filters={filters}
              setFilters={setFilters}
              resorts={filtered}
              allResorts={RESORTS}
              activeId={activeResort?.name ?? null}
              onSelect={handleSelect}
              showSnowMap={showSnowMap}
              onToggleSnowMap={() => setShowSnowMap((v) => !v)}
            />
          </div>
        </div>

        {/* Toggle-knapp — utanför klipp-containern, följer wrapper-kanten */}
        <button
          onClick={() => { setSidebarOpen((v) => !v); setResizeTrigger((n) => n + 1); }}
          aria-label={sidebarOpen ? 'Stäng sidopanel' : 'Öppna sidopanel'}
          className="absolute right-0 top-1/2 z-[600] -translate-y-1/2 translate-x-full cursor-pointer rounded-r-lg bg-white py-3 pl-1 pr-1.5 shadow-md transition hover:bg-slate-50"
        >
          {sidebarOpen
            ? <ChevronLeft className="h-4 w-4 text-slate-500" />
            : <ChevronRight className="h-4 w-4 text-slate-500" />}
        </button>
      </div>

      {/* Map fills the rest */}
      <main className="relative flex-1">
        <MapView
          resorts={filtered}
          activeId={activeResort?.name ?? null}
          onSelect={handleSelect}
          flyTarget={flyTarget}
          showSnowMap={showSnowMap}
          resizeTrigger={resizeTrigger}
        />
      </main>

      <ResortModal resort={activeResort} onClose={() => setActiveResort(null)} />
    </div>
  );
}
