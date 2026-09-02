import type { Resort } from '@/types';

export const RESORTS: Resort[] = [
  { name: "Les 3 Vallées (Val Thorens, Courchevel)", region: "Savoie", lat: 45.298, lng: 6.580, maxAlt: 3230, minAlt: 1100, pisteKm: 600, lifts: 158, airport: "Genève (GVA)", transferMin: 150, train: false, skiInOut: "Utmärkt", price: "$$$$" },
  { name: "Paradiski (Les Arcs, La Plagne)", region: "Savoie", lat: 45.572, lng: 6.780, maxAlt: 3226, minAlt: 1200, pisteKm: 425, lifts: 130, airport: "Genève (GVA)", transferMin: 135, train: true, skiInOut: "Utmärkt", price: "$$$" },
  { name: "Tignes - Val d'Isère", region: "Savoie", lat: 45.468, lng: 6.905, maxAlt: 3456, minAlt: 1550, pisteKm: 300, lifts: 78, airport: "Genève (GVA)", transferMin: 165, train: false, skiInOut: "Mycket bra", price: "$$$$" },
  { name: "Portes du Soleil (Avoriaz, Morzine)", region: "Haute-Savoie", lat: 46.192, lng: 6.772, maxAlt: 2466, minAlt: 900, pisteKm: 600, lifts: 208, airport: "Genève (GVA)", transferMin: 90, train: false, skiInOut: "Utmärkt i Avoriaz", price: "$$$" },
  { name: "Le Grand Massif (Flaine, Samoëns)", region: "Haute-Savoie", lat: 46.006, lng: 6.691, maxAlt: 2500, minAlt: 700, pisteKm: 265, lifts: 62, airport: "Genève (GVA)", transferMin: 75, train: false, skiInOut: "Utmärkt i Flaine", price: "$$" },
  { name: "Les Sybelles (Le Corbier)", region: "Savoie", lat: 45.239, lng: 6.269, maxAlt: 2620, minAlt: 1100, pisteKm: 310, lifts: 68, airport: "Chambéry (CMF)", transferMin: 90, train: false, skiInOut: "Bra", price: "$$" },
  { name: "Alpe d'Huez Grand Domaine", region: "Isère", lat: 45.092, lng: 6.069, maxAlt: 3330, minAlt: 1125, pisteKm: 250, lifts: 69, airport: "Grenoble (GNB)", transferMin: 90, train: false, skiInOut: "Bra", price: "$$$" },
  { name: "Les Deux Alpes", region: "Isère", lat: 45.008, lng: 6.121, maxAlt: 3600, minAlt: 1300, pisteKm: 200, lifts: 44, airport: "Grenoble (GNB)", transferMin: 90, train: false, skiInOut: "Bra", price: "$$$" },
  { name: "Serre Chevalier (Briançon)", region: "Hautes-Alpes", lat: 44.933, lng: 6.586, maxAlt: 2800, minAlt: 1200, pisteKm: 250, lifts: 59, airport: "Turin (TRN)", transferMin: 120, train: true, skiInOut: "Medel", price: "$$" },
  { name: "Évasion Mont-Blanc (Megève)", region: "Haute-Savoie", lat: 45.857, lng: 6.617, maxAlt: 2353, minAlt: 850, pisteKm: 400, lifts: 109, airport: "Genève (GVA)", transferMin: 75, train: false, skiInOut: "Medel", price: "$$$$" },
  { name: "Chamonix-Mont-Blanc", region: "Haute-Savoie", lat: 45.923, lng: 6.869, maxAlt: 3842, minAlt: 1035, pisteKm: 119, lifts: 47, airport: "Genève (GVA)", transferMin: 75, train: true, skiInOut: "Dåligt (Buss krävs)", price: "$$$$" },
  { name: "Via Lattea (Montgenèvre)", region: "Hautes-Alpes", lat: 44.931, lng: 6.722, maxAlt: 2800, minAlt: 1350, pisteKm: 400, lifts: 69, airport: "Turin (TRN)", transferMin: 90, train: false, skiInOut: "Bra", price: "$$" },
  { name: "Espace San Bernardo (La Rosière)", region: "Savoie", lat: 45.627, lng: 6.848, maxAlt: 2800, minAlt: 1176, pisteKm: 152, lifts: 38, airport: "Genève (GVA)", transferMin: 150, train: false, skiInOut: "Mycket bra", price: "$$" },
  { name: "Espace Diamant (Les Saisies)", region: "Savoie", lat: 45.759, lng: 6.536, maxAlt: 2069, minAlt: 1000, pisteKm: 192, lifts: 82, airport: "Genève (GVA)", transferMin: 90, train: false, skiInOut: "Bra", price: "$$" },
  { name: "Val Cenis", region: "Savoie", lat: 45.281, lng: 6.900, maxAlt: 2800, minAlt: 1300, pisteKm: 125, lifts: 29, airport: "Turin (TRN)", transferMin: 120, train: false, skiInOut: "Bra", price: "$" },
];

export const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string;
