import { useEffect, useState } from 'react';

interface WeatherForecastProps {
  lat: number;
  lng: number;
}

interface DailyTempByTime {
  night?: number;
  morn?: number;
  day?: number;
  eve?: number;
}

interface DailyForecast {
  date: string;
  tempMin: number;
  tempMax: number;
  temp?: DailyTempByTime;
  feelsLike?: DailyTempByTime;
  icon: string;
  windSpeed?: number;
  windDeg?: number;
  windGust?: number;
  snowCm?: number;
  sunrise?: string;
  sunset?: string;
}

interface WeatherData {
  current: {
    temp: number;
    icon: string;
    description: string;
  };
  daily: DailyForecast[];
}

// Enkla konturikoner (bara stroke, ingen fylld yta) i samma visuella stil som bergskammen i
// MountainProfile.tsx — istället för OpenWeathers fyllda standardikoner. currentColor gör att
// färgen styrs av föräldraelementets text-färgklass.
function WeatherIcon({ code, className = '' }: { code: string; className?: string }) {
  const group = code.slice(0, 2);
  const common = {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.6,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };

  switch (group) {
    case '01': // klart
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
          <circle cx="12" cy="12" r="5" {...common} />
          <g {...common}>
            <path d="M12 1.5v3" />
            <path d="M12 19.5v3" />
            <path d="M1.5 12h3" />
            <path d="M19.5 12h3" />
            <path d="M4.4 4.4l2.1 2.1" />
            <path d="M17.5 17.5l2.1 2.1" />
            <path d="M4.4 19.6l2.1-2.1" />
            <path d="M17.5 6.5l2.1-2.1" />
          </g>
        </svg>
      );
    case '02': // lätt molnigt
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
          <circle cx="9" cy="9" r="4" {...common} />
          <path d="M6.5 20h9a4 4 0 0 0 0.5-7.97A5.5 5.5 0 0 0 6 13.5" {...common} />
        </svg>
      );
    case '03':
    case '04': // molnigt
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
          <path d="M5.5 19h11a4 4 0 0 0 0.5-7.97A5.5 5.5 0 0 0 5.5 13a3.5 3.5 0 0 0 0 6z" {...common} />
        </svg>
      );
    case '09':
    case '10': // regn
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
          <path d="M5.5 14.5h11a4 4 0 0 0 0.5-7.97A5.5 5.5 0 0 0 5.5 8.5a3.5 3.5 0 0 0 0 6z" {...common} />
          <g {...common}>
            <path d="M9 18v3" />
            <path d="M13 18v3" />
            <path d="M17 18v3" />
          </g>
        </svg>
      );
    case '11': // åska
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
          <path d="M5.5 13.5h11a4 4 0 0 0 0.5-7.97A5.5 5.5 0 0 0 5.5 7.5a3.5 3.5 0 0 0 0 6z" {...common} />
          <path d="M13 15l-3 5h3l-2 4" {...common} />
        </svg>
      );
    case '13': // snö
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
          <path d="M5.5 13.5h11a4 4 0 0 0 0.5-7.97A5.5 5.5 0 0 0 5.5 7.5a3.5 3.5 0 0 0 0 6z" {...common} />
          <g {...common}>
            <path d="M9 17.5v4" />
            <path d="M7.3 18.5l3.4 2" />
            <path d="M10.7 18.5l-3.4 2" />
            <path d="M15 17.5v4" />
            <path d="M13.3 18.5l3.4 2" />
            <path d="M16.7 18.5l-3.4 2" />
          </g>
        </svg>
      );
    case '50': // dis
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
          <g {...common}>
            <path d="M4 9h16" />
            <path d="M2.5 13h19" />
            <path d="M4 17h16" />
          </g>
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
          <circle cx="12" cy="12" r="5" {...common} />
        </svg>
      );
  }
}

// Pil som visar vart vinden blåser (inte varifrån — OpenWeathers wind_deg är meteorologisk,
// dvs. anger varifrån vinden kommer, så pilen roteras 180° extra för att peka i flödesriktningen,
// samma konvention som SMHI/Yr använder för sina vindpilar).
function WindArrow({ deg, className = '' }: { deg: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      style={{ transform: `rotate(${(deg + 180) % 360}deg)` }}
      aria-hidden="true"
    >
      <g fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 20V4" />
        <path d="M6.5 9.5L12 4l5.5 5.5" />
      </g>
    </svg>
  );
}

const WEEKDAY_LABELS = ['sön', 'mån', 'tis', 'ons', 'tors', 'fre', 'lör'];
const TIME_LABELS: { key: keyof DailyTempByTime; label: string }[] = [
  { key: 'night', label: 'Natt' },
  { key: 'morn', label: 'Morgon' },
  { key: 'day', label: 'Dag' },
  { key: 'eve', label: 'Kväll' },
];

function dayLabel(dateStr: string, index: number): string {
  if (index === 0) return 'Idag';
  const date = new Date(`${dateStr}T00:00:00`);
  return WEEKDAY_LABELS[date.getDay()];
}

export default function WeatherForecast({ lat, lng }: WeatherForecastProps) {
  const [data, setData] = useState<WeatherData | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [expandedDate, setExpandedDate] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setStatus('loading');
    setData(null);
    setExpandedDate(null);

    fetch(`/.netlify/functions/weather?lat=${lat}&lon=${lng}`, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`Väder-anropet svarade ${res.status}`);
        return res.json();
      })
      .then((json) => {
        if (json?.error) throw new Error(json.error);
        setData(json as WeatherData);
        setStatus('ready');
      })
      .catch((err) => {
        if (err?.name === 'AbortError') return;
        setStatus('error');
      });

    return () => controller.abort();
  }, [lat, lng]);

  return (
    <div>
      <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">Väder</h3>

      {status === 'loading' && (
        <div className="flex items-center gap-2 rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2.5 text-sm text-slate-400">
          <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-slate-300 border-t-slate-500" />
          Hämtar väderdata …
        </div>
      )}

      {status === 'error' && (
        <div className="rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2.5 text-sm text-slate-400">
          Kunde inte hämta väderdata just nu.
        </div>
      )}

      {status === 'ready' && data && (
        <>
          {/* Aktuell temperatur — samma kortstil (rounded-xl/border-slate-100/bg-slate-50/60) som
              övriga rutor i Resa & praktiskt. */}
          <div className="mb-2 flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2.5">
            <WeatherIcon code={data.current.icon} className="h-7 w-7 shrink-0 text-slate-500" />
            <span className="text-lg font-bold text-slate-800">{data.current.temp}°</span>
          </div>

          {/* 5-dagarsprognos — kompakt kort per dag (ikon, vind, snöfall, soltider). Klick på ett
              kort expanderar det till en Natt/Morgon/Dag/Kväll-uppdelning av temp/känns-som —
              hålls bakom klick istället för att visas för alla fem samtidigt, annars blir fem
              kort × fyra underkolumner för trångt i modalens 65%-kolumn. Gammal cachad data (eller
              ett äldre svar) kan sakna de nya fälten helt — varje fält renderas bakom en egen
              `!== undefined`-kontroll så den utelämnas istället för att visa tomt/NaN. */}
          <div className="grid grid-cols-5 gap-2">
            {data.daily.slice(0, 5).map((day, i) => {
              const isExpanded = expandedDate === day.date;
              const hasWind = day.windSpeed !== undefined;
              const hasSnow = (day.snowCm ?? 0) > 0;
              const hasSunTimes = day.sunrise !== undefined && day.sunset !== undefined;
              const hasBreakdown = day.temp !== undefined || day.feelsLike !== undefined;

              return (
                <button
                  key={day.date}
                  type="button"
                  onClick={() => hasBreakdown && setExpandedDate(isExpanded ? null : day.date)}
                  className={`flex flex-col items-center gap-1 rounded-xl border border-slate-100 bg-slate-50/60 px-1 py-2 text-left ${
                    hasBreakdown ? 'cursor-pointer transition hover:bg-slate-100/80' : 'cursor-default'
                  } ${isExpanded ? 'col-span-5' : ''}`}
                >
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    {dayLabel(day.date, i)}
                  </span>
                  <WeatherIcon code={day.icon} className="h-5 w-5 text-slate-500" />
                  <span className="text-xs font-bold text-slate-800">{day.tempMax}°</span>
                  <span className="text-xs text-slate-400">{day.tempMin}°</span>

                  {hasWind && (
                    <span className="flex items-center gap-0.5 text-[10px] text-slate-400">
                      {day.windDeg !== undefined && <WindArrow deg={day.windDeg} className="h-2.5 w-2.5" />}
                      {day.windSpeed} m/s
                      {day.windGust !== undefined && `, byar ${day.windGust}`}
                    </span>
                  )}

                  {hasSnow && (
                    <span className="text-[10px] text-slate-400">ca {day.snowCm} cm</span>
                  )}

                  {hasSunTimes && (
                    <span className="text-[10px] text-slate-400">
                      {day.sunrise}–{day.sunset}
                    </span>
                  )}

                  {isExpanded && hasBreakdown && (
                    <div className="mt-2 grid w-full grid-cols-4 gap-2 border-t border-slate-200 pt-2">
                      {TIME_LABELS.map(({ key, label }) => {
                        const tempValue = day.temp?.[key];
                        if (tempValue === undefined) return null;
                        const feelsValue = day.feelsLike?.[key];

                        return (
                          <div key={key} className="flex flex-col items-center gap-0.5">
                            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                              {label}
                            </span>
                            <span className="text-xs font-bold text-slate-800">{tempValue}°</span>
                            {feelsValue !== undefined && (
                              <span className="text-[10px] text-slate-400">känns {feelsValue}°</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </>
      )}

      <p className="mt-2 text-[11px] text-slate-400">
        Väderdata från{' '}
        <a
          href="https://openweathermap.org"
          target="_blank"
          rel="noopener noreferrer"
          className="text-sky-600 transition hover:text-sky-700"
        >
          OpenWeather
        </a>
      </p>
    </div>
  );
}
