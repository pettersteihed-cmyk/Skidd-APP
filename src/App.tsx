import { useMemo, useState, useCallback, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import MapView from '@/components/MapView';
import Sidebar from '@/components/Sidebar';
import ResortModal from '@/components/ResortModal';
import LandingPage from '@/pages/LandingPage';
import { RESORTS } from '@/data/resorts';
import { nearestAirport } from '@/utils/transfer';
import type { Filters, Resort } from '@/types';

const MAX_TRANSFER_DEFAULT = Math.max(...RESORTS.map((r) => nearestAirport(r).transferMin));

const DEFAULT_FILTERS: Filters = {
  maxTransfer: MAX_TRANSFER_DEFAULT,
  priceLevels: [],
  trainOnly: false,
  minPisteKm: 0,
  search: '',
  countries: [],
};

export default function App() {
  const location = useLocation();
  const isLanding = location.pathname === '/';

  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [activeResort, setActiveResort] = useState<Resort | null>(null);
  // Vilken ort kartan är "fokuserad" på — till skillnad från activeResort (som styr
  // detaljmodalen och nollställs när den stängs) ska den HÄR förbli satt tills
  // användaren väljer en annan ort, så att t.ex. branthet/sol-skugga i MapView
  // fortsätter fungera även efter att modalen stängts. Sätts i handleSelect, precis
  // som activeResort, men bara nollställd av isLanding-effekten nedan — aldrig av
  // ResortModals onClose.
  const [focusedResortId, setFocusedResortId] = useState<string | null>(null);
  const [flyTarget, setFlyTarget] = useState<{ lat: number; lng: number; zoom?: number; nonce: number } | null>(null);
  const [showSnowMap, setShowSnowMap] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [resizeTrigger, setResizeTrigger] = useState(0);

  // Styr sidopanelen baserat på rutten
  useEffect(() => {
    setSidebarOpen(!isLanding);
    setResizeTrigger((n) => n + 1);
    // OpenSnowMap-lagret och fokuserad ort ska alltid börja om nästa gång man går in
    // i kartvyn, oavsett vad de var satt till förra besöket — samma princip som
    // is3D/branthet i MapView.
    if (isLanding) {
      setShowSnowMap(false);
      setFocusedResortId(null);
    }
  }, [isLanding]);

  const filtered = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    return RESORTS.filter((r) => {
      if (nearestAirport(r).transferMin > filters.maxTransfer) return false;
      if (filters.priceLevels.length > 0 && !filters.priceLevels.includes(r.price)) return false;
      if (filters.countries.length > 0 && !filters.countries.includes(r.country)) return false;
      if (filters.trainOnly && !r.train) return false;
      if (r.pisteKm < filters.minPisteKm) return false;
      if (q && !(`${r.name} ${r.region}`.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [filters]);

  const handleSelect = useCallback((resort: Resort) => {
    setActiveResort(resort);
    setFocusedResortId(resort.id);
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
            />
          </div>
        </div>

        {/* Toggle-knapp — döljs på startsidan */}
        {!isLanding && (
          <button
            onClick={() => { setSidebarOpen((v) => !v); setResizeTrigger((n) => n + 1); }}
            aria-label={sidebarOpen ? 'Stäng sidopanel' : 'Öppna sidopanel'}
            className="absolute right-0 top-1/2 z-[600] -translate-y-1/2 translate-x-full cursor-pointer rounded-r-lg bg-white py-3 pl-1 pr-1.5 shadow-md transition hover:bg-slate-50"
          >
            {sidebarOpen
              ? <ChevronLeft className="h-4 w-4 text-slate-500" />
              : <ChevronRight className="h-4 w-4 text-slate-500" />}
          </button>
        )}
      </div>

      {/* Kartan — alltid monterad, överlever navigering */}
      <main className="relative flex-1">
        <MapView
          resorts={filtered}
          activeId={activeResort?.name ?? null}
          focusedResortId={focusedResortId}
          onSelect={handleSelect}
          flyTarget={flyTarget}
          showSnowMap={showSnowMap}
          onToggleSnowMap={() => setShowSnowMap((v) => !v)}
          resizeTrigger={resizeTrigger}
          isLanding={isLanding}
        />
      </main>

      {/* Landing-overlay — alltid monterad, opacity styrs av isLanding för smidig fade */}
      <div
        className={`fixed inset-0 z-[1500] transition-opacity duration-500 ${
          isLanding ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        <LandingPage />
      </div>

      <ResortModal resort={activeResort} onClose={() => setActiveResort(null)} />
    </div>
  );
}
