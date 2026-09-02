import { useState } from 'react';
import { Search, Train, Snowflake, Clock, Tag, Layers, ChevronDown } from 'lucide-react';
import type { Filters, PriceLevel, Resort } from '@/types';

interface SidebarProps {
  filters: Filters;
  setFilters: (f: Filters) => void;
  resorts: Resort[];
  allResorts: Resort[];
  activeId: string | null;
  onSelect: (resort: Resort) => void;
  showSnowMap: boolean;
  onToggleSnowMap: () => void;
}

interface AccordionSectionProps {
  title: string;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

function AccordionSection({ title, isOpen, onToggle, children }: AccordionSectionProps) {
  return (
    <div className="border-b border-slate-100">
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between py-3 text-left"
      >
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</span>
        <ChevronDown
          className={`h-3.5 w-3.5 text-slate-400 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>
      <div className={`grid transition-all duration-300 ease-in-out ${isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
        <div className="overflow-hidden">
          <div className="pb-4">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

const PRICE_LEVELS: PriceLevel[] = ['$', '$$', '$$$', '$$$$'];

export default function Sidebar({ filters, setFilters, resorts, allResorts, activeId, onSelect, showSnowMap, onToggleSnowMap }: SidebarProps) {
  const maxTransferRange = Math.max(...allResorts.map((r) => r.transferMin));
  const maxPisteRange = Math.max(...allResorts.map((r) => r.pisteKm));

  const [open, setOpen] = useState({
    transfertid: true,
    pris: true,
    egenskaper: true,
    pistlangd: false,
    orter: true,
  });

  const toggle = (key: keyof typeof open) =>
    setOpen((prev) => ({ ...prev, [key]: !prev[key] }));

  const togglePrice = (level: PriceLevel) => {
    const has = filters.priceLevels.includes(level);
    setFilters({
      ...filters,
      priceLevels: has ? filters.priceLevels.filter((p) => p !== level) : [...filters.priceLevels, level],
    });
  };

  const clearAll = () => {
    setFilters({
      maxTransfer: maxTransferRange,
      priceLevels: [],
      trainOnly: false,
      minPisteKm: 0,
      search: '',
    });
  };

  const hasActiveFilters =
    filters.maxTransfer < maxTransferRange ||
    filters.priceLevels.length > 0 ||
    filters.trainOnly ||
    filters.minPisteKm > 0 ||
    filters.search.trim() !== '';

  return (
    <aside className="flex h-full w-full flex-col bg-white">
      {/* Header */}
      <div className="border-b border-slate-200 px-5 py-5">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-blue-700 text-white shadow-md shadow-blue-500/20">
            <Snowflake className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-base font-bold leading-tight text-slate-900">Franska Alperna</h1>
            <p className="text-xs text-slate-500">Skidorter explorer</p>
          </div>
        </div>
      </div>

      {/* Scrollbar area */}
      <div className="flex-1 overflow-y-auto px-5">

        {/* Sök — alltid synlig */}
        <div className="py-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              placeholder="Sök ort eller system…"
              className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-sm text-slate-800 outline-none transition focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100"
            />
          </div>
        </div>

        {/* Transfertid */}
        <AccordionSection title="Transfertid" isOpen={open.transfertid} onToggle={() => toggle('transfertid')}>
          <div className="flex items-center justify-between mb-2">
            <span className="flex items-center gap-1.5 text-[11px] text-slate-400">
              <Clock className="h-3 w-3" /> Max transfertid
            </span>
            <span className="rounded-md bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">
              {filters.maxTransfer} min
            </span>
          </div>
          <input
            type="range"
            min={60}
            max={maxTransferRange}
            step={5}
            value={filters.maxTransfer}
            onChange={(e) => setFilters({ ...filters, maxTransfer: Number(e.target.value) })}
            className="slider-blue w-full"
          />
          <div className="mt-1 flex justify-between text-[10px] text-slate-400">
            <span>60 min</span>
            <span>{maxTransferRange} min</span>
          </div>
        </AccordionSection>

        {/* Prisnivå */}
        <AccordionSection title="Prisnivå" isOpen={open.pris} onToggle={() => toggle('pris')}>
          <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mb-2">
            <Tag className="h-3 w-3" /> Välj en eller flera nivåer
          </div>
          <div className="flex flex-wrap gap-2">
            {PRICE_LEVELS.map((level) => {
              const active = filters.priceLevels.includes(level);
              return (
                <button
                  key={level}
                  onClick={() => togglePrice(level)}
                  className={`rounded-full border px-3.5 py-1.5 text-sm font-semibold transition ${
                    active
                      ? 'border-blue-600 bg-blue-600 text-white shadow-sm shadow-blue-500/30'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  {level}
                </button>
              );
            })}
          </div>
        </AccordionSection>

        {/* Egenskaper */}
        <AccordionSection title="Egenskaper" isOpen={open.egenskaper} onToggle={() => toggle('egenskaper')}>
          <div className="space-y-2">
            <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-3">
              <span className="flex items-center gap-2 text-sm font-medium text-slate-700">
                <Train className="h-4 w-4 text-emerald-600" /> Endast tåg till ort
              </span>
              <button
                onClick={() => setFilters({ ...filters, trainOnly: !filters.trainOnly })}
                className={`relative h-6 w-11 rounded-full transition ${filters.trainOnly ? 'bg-emerald-500' : 'bg-slate-300'}`}
                aria-pressed={filters.trainOnly}
              >
                <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${filters.trainOnly ? 'left-[22px]' : 'left-0.5'}`} />
              </button>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-3">
              <span className="flex items-center gap-2 text-sm font-medium text-slate-700">
                <Layers className="h-4 w-4 text-sky-600" /> Visa pistkarta
              </span>
              <button
                onClick={onToggleSnowMap}
                className={`relative h-6 w-11 rounded-full transition ${showSnowMap ? 'bg-sky-500' : 'bg-slate-300'}`}
                aria-pressed={showSnowMap}
              >
                <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${showSnowMap ? 'left-[22px]' : 'left-0.5'}`} />
              </button>
            </div>
          </div>
        </AccordionSection>

        {/* Pistlängd */}
        <AccordionSection title="Pistlängd" isOpen={open.pistlangd} onToggle={() => toggle('pistlangd')}>
          <div className="flex items-center justify-between mb-2">
            <span className="flex items-center gap-1.5 text-[11px] text-slate-400">
              <Snowflake className="h-3 w-3" /> Min pistlängd
            </span>
            <span className="rounded-md bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">
              {filters.minPisteKm} km
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={maxPisteRange}
            step={10}
            value={filters.minPisteKm}
            onChange={(e) => setFilters({ ...filters, minPisteKm: Number(e.target.value) })}
            className="slider-blue w-full"
          />
          <div className="mt-1 flex justify-between text-[10px] text-slate-400">
            <span>0 km</span>
            <span>{maxPisteRange} km</span>
          </div>
        </AccordionSection>

        {/* Rensa filter */}
        {hasActiveFilters && (
          <button
            onClick={clearAll}
            className="my-3 w-full rounded-lg border border-slate-200 py-2 text-xs font-semibold text-slate-500 transition hover:bg-slate-50 hover:text-slate-700"
          >
            Rensa alla filter
          </button>
        )}

        {/* Orter */}
        <AccordionSection
          title={`Orter (${resorts.length})`}
          isOpen={open.orter}
          onToggle={() => toggle('orter')}
        >
          {resorts.length === 0 ? (
            <p className="py-4 text-center text-sm text-slate-400">Inga orter matchar filtren.</p>
          ) : (
            <ul className="space-y-1.5">
              {resorts.map((resort) => {
                const active = activeId === resort.name;
                return (
                  <li key={resort.name}>
                    <button
                      onClick={() => onSelect(resort)}
                      className={`w-full rounded-lg border px-3 py-2.5 text-left transition ${
                        active
                          ? 'border-blue-500 bg-blue-50 shadow-sm'
                          : 'border-transparent hover:border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-sm font-semibold leading-snug text-slate-800">{resort.name}</span>
                        <span className="shrink-0 text-xs font-bold text-emerald-600">{resort.price}</span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-500">
                        <span>{resort.region}</span>
                        <span className="text-slate-300">•</span>
                        <span>{resort.pisteKm} km pist</span>
                        <span className="text-slate-300">•</span>
                        <span>{resort.transferMin} min</span>
                        {resort.train && (
                          <>
                            <span className="text-slate-300">•</span>
                            <span className="font-medium text-emerald-600">Tåg</span>
                          </>
                        )}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </AccordionSection>

        <div className="h-4" />
      </div>
    </aside>
  );
}
