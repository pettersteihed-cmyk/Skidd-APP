import { useEffect, useRef, type MutableRefObject } from 'react';
import type mapboxgl from 'mapbox-gl';
import type { FogSpecification, SnowSpecification } from 'mapbox-gl';

// Atmosfärisk dis. Rör bara fog/sky-känslan - terräng (mapbox-dem + setTerrain) och
// sky-lagret hanteras redan i MapView.tsx (initStyleDependentLayers) och dupliceras inte här.
const FOG: FogSpecification = {
  range: [0.5, 10],
  color: '#ffffff',
  'high-color': '#a3ccff',
  'horizon-blend': 0.1,
  'space-color': '#0a1a2f',
  'star-intensity': 0,
};

// Snöintensiteten trappas upp mot högre zoom, så effekten är diskret långt ifrån men
// tydligare nära marken, i stället för ett platt värde oavsett avstånd.
const SNOW_INTENSITY_BY_ZOOM: SnowSpecification['intensity'] = [
  'interpolate', ['linear'], ['zoom'],
  10, 0.1,
  14, 0.6,
];

const SNOW: SnowSpecification = {
  density: 1,
  intensity: SNOW_INTENSITY_BY_ZOOM,
};

interface UseMapAtmosphereOptions {
  mapRef: MutableRefObject<mapboxgl.Map | null>;
  // Av som standard - snö är en medveten opt-in, inte en del av basupplevelsen.
  snowEnabled?: boolean;
}

// Lägger till fog och (prop-styrd) snö ovanpå kartan. Precis som terräng och sky
// nollas fog/snö av mapbox-gl vid varje setStyle(), så de måste sättas om både direkt
// och vid varje efterföljande 'style.load' - samma mönster som initStyleDependentLayers
// använder för terräng/sky, men som en egen, fristående lyssnare här.
export function useMapAtmosphere({ mapRef, snowEnabled = false }: UseMapAtmosphereOptions): void {
  const snowEnabledRef = useRef(snowEnabled);
  snowEnabledRef.current = snowEnabled;

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const applyAtmosphere = () => {
      map.setFog(FOG);
      map.setSnow(snowEnabledRef.current ? SNOW : null);
    };

    if (map.isStyleLoaded()) applyAtmosphere();
    map.on('style.load', applyAtmosphere);
    return () => {
      map.off('style.load', applyAtmosphere);
    };
  }, [mapRef]);

  // Låter snowEnabled slås av/på direkt utan att vänta på ett stilbyte.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    map.setSnow(snowEnabled ? SNOW : null);
  }, [mapRef, snowEnabled]);
}
