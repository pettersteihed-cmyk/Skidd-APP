import { useMemo, useState, useCallback } from 'react';
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
      {/* Sidebar - fixed width on desktop, full width overlay on mobile */}
      <div className="absolute inset-y-0 left-0 z-[500] w-[340px] max-w-[85vw] border-r border-slate-200 shadow-xl md:relative md:shadow-none">
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

      {/* Map fills the rest */}
      <main className="relative flex-1">
        <MapView
          resorts={filtered}
          activeId={activeResort?.name ?? null}
          onSelect={handleSelect}
          flyTarget={flyTarget}
          showSnowMap={showSnowMap}
        />
      </main>

      <ResortModal resort={activeResort} onClose={() => setActiveResort(null)} />
    </div>
  );
}
