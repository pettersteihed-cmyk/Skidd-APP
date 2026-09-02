import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Snowflake, Map, Mountain, Train } from 'lucide-react';

export default function LandingPage() {
  const navigate = useNavigate();
  const [leaving, setLeaving] = useState(false);

  const handleEnter = () => {
    setLeaving(true);
    setTimeout(() => navigate('/karta'), 420);
  };

  return (
    <div
      className={`fixed inset-0 z-[1500] flex flex-col items-center justify-center transition-opacity duration-400 ${
        leaving ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
    >
      {/* Vinjett — kartan skiner igenom i mitten */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-slate-900/75 via-slate-900/25 to-slate-900/75" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-slate-900/50 via-transparent to-slate-900/50" />

      {/* Innehåll */}
      <div className="relative z-10 flex flex-col items-center px-6 text-center">
        {/* Logotyp */}
        <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10 backdrop-blur-sm ring-1 ring-white/20 shadow-2xl">
          <Snowflake className="h-8 w-8 text-white" />
        </div>

        {/* Rubrik */}
        <h1 className="mb-3 text-4xl font-bold tracking-tight text-white drop-shadow-lg sm:text-5xl">
          Franska Alperna
        </h1>
        <p className="mb-2 text-lg font-medium text-white/80">
          Skidorter explorer
        </p>
        <p className="mb-10 max-w-sm text-sm text-white/60">
          Utforska 15 skidorter med interaktiv karta, pistkarta och filter för transfertid, pris och tågförbindelser.
        </p>

        {/* Höjdpunkter */}
        <div className="mb-10 flex flex-wrap justify-center gap-3">
          {[
            { icon: Mountain, text: 'Topografi & liftar' },
            { icon: Map, text: 'OpenSnowMap-pister' },
            { icon: Train, text: 'Tågfilter' },
          ].map(({ icon: Icon, text }) => (
            <span
              key={text}
              className="flex items-center gap-1.5 rounded-full bg-white/10 px-3.5 py-1.5 text-xs font-medium text-white/80 ring-1 ring-white/15 backdrop-blur-sm"
            >
              <Icon className="h-3.5 w-3.5" />
              {text}
            </span>
          ))}
        </div>

        {/* CTA-knapp */}
        <button
          onClick={handleEnter}
          className="group flex items-center gap-2 rounded-xl bg-white px-8 py-3.5 text-sm font-semibold text-slate-900 shadow-2xl transition hover:bg-slate-50 hover:scale-105 active:scale-100"
        >
          <Map className="h-4 w-4 transition group-hover:translate-x-0.5" />
          Utforska kartan
        </button>
      </div>

      {/* Nederkant */}
      <p className="absolute bottom-6 text-[11px] text-white/30">
        Data: OpenStreetMap · OpenSnowMap · Mapbox
      </p>
    </div>
  );
}
