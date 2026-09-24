# Offpist-underlag — ifyllnadsmall

Underlag för de valfria fälten i `Resort` (`src/types.ts`) inför AI-chatten. Fylls i
manuellt från verifierade källor (ortens egen information, guidebyråer, pistkartor) —
inte från `description` eller Excel-kolumnen `resortTypes`, som är overifierade.
Lämna en cell tom hellre än att gissa. Branthet och offpist är säkerhetskritiskt
(se regel 7 i `CLAUDE.md`).

## Fälten

| Fält | Typ | Format i tabellen | Betydelse |
|---|---|---|---|
| `offpistNivaMin` | heltal 1–5 | en siffra | Den lugnaste meningsfulla offpistterrängen på orten. Se skalan nedan. |
| `offpistNivaMax` | heltal 1–5 | en siffra | Den mest krävande offpistterrängen på orten. Se skalan nedan. |
| `offpistTillgang` | lista | kommaseparerat, ett eller flera av: `liftnara`, `kort-stigning`, `turakning`, `guide-kravs` | Hur offpistterrängen nås. |
| `glaciarakning` | ja/nej | `ja` / `nej` | Det finns en skidbar glaciär inom pistsystemet som man åker på egen hand. Guidade glaciärturer utanför pist räknas inte här — de hör till `offpistTillgang` `guide-kravs` och beskrivs i `offpistNote`. |
| `guideverksamhet` | ja/nej | `ja` / `nej` | Om det finns guider/guidebyrå att boka på orten. |
| `offpistNote` | fritext | kort mening | Det viktigaste att veta om offpisten på orten. |
| `boendeTyper` | lista | kommaseparerat, ett eller flera av: `by`, `lagenhetsort`, `lyx`, `budget` | Vilka typer av boende orten erbjuder. |
| `nyborjarvanlig` | heltal 1–5 | en siffra | Se skalan nedan. |

### Värden i `offpistTillgang` (fastställda)

| Värde | Betydelse |
|---|---|
| `liftnara` | Åkning direkt från liften utan stigning |
| `kort-stigning` | 15–45 min till fots eller med stighudar öppnar väsentligt mer terräng |
| `turakning` | Meningsfull åkning kräver längre turer med utrustning |
| `guide-kravs` | Glaciär eller terräng där lokal kunskap behövs för att åka ansvarsfullt |

### Värden i `boendeTyper` (tolkning av namnen — bekräfta)

| Värde | Tolkning |
|---|---|
| `by` | Traditionell by med hotell/chalets |
| `lagenhetsort` | Planerad skidort byggd kring lägenhetskomplex |
| `lyx` | Lyxboende finns i betydande utsträckning |
| `budget` | Budgetboende finns i betydande utsträckning |

### Skala `offpistNivaMin` / `offpistNivaMax` (fastställd)

Skalan anger hur **krävande** terrängen är — inte hur mycket offpist som finns.
Orten graderas som ett spann: `offpistNivaMin` är den lugnaste meningsfulla
offpistterrängen på orten, `offpistNivaMax` den mest krävande.

**Regel:** `offpistNivaMax` räknar in all terräng som nås från orten, även
turåkning, heliskiing och guidad glaciäråkning. `offpistNivaMin` är den
lugnaste meningsfulla offpistterrängen, aldrig 1 om orten har offpist alls.

| Steg | Betydelse |
|---|---|
| 1 | I princip bara preparerad pist |
| 2 | Enstaka lättare åkning bredvid pisten |
| 3 | Bra åkning utanför pisten, mestadels inom liftsystemet |
| 4 | Stora offpistområden, branta partier, kräver vana och utrustning |
| 5 | Högalpin terräng, glaciärer, lavinutrustning och kunskap krävs |

### Skala `nyborjarvanlig` — ej fastställd

Skalstegen är inte definierade ännu. Fyll i betydelsen per steg innan värdena
sätts, så att alla orter graderas mot samma skala.

| Steg | Betydelse |
|---|---|
| 1 | |
| 2 | |
| 3 | |
| 4 | |
| 5 | |

## Ifyllnadstabell

| id | Ort | offpistNivaMin | offpistNivaMax | offpistTillgang | glaciarakning | guideverksamhet | offpistNote | boendeTyper | nyborjarvanlig |
|---|---|---|---|---|---|---|---|---|---|
| les-3-vallees | Les 3 Vallées (Val Thorens, Courchevel) | | | | | | | | |
| paradiski | Paradiski (Les Arcs, La Plagne) | | | | | | | | |
| tignes-val-disere | Tignes - Val d'Isère | | | | | | | | |
| portes-du-soleil | Portes du Soleil (Avoriaz, Morzine) | | | | | | | | |
| le-grand-massif | Le Grand Massif (Flaine, Samoëns) | | | | | | | | |
| les-sybelles | Les Sybelles (Le Corbier) | | | | | | | | |
| alpe-dhuez | Alpe d'Huez Grand Domaine | | | | | | | | |
| les-deux-alpes | Les Deux Alpes | | | | | | | | |
| serre-chevalier | Serre Chevalier (Briançon) | | | | | | | | |
| evasion-mont-blanc | Évasion Mont-Blanc (Megève) | | | | | | | | |
| chamonix | Chamonix-Mont-Blanc | | | | | | | | |
| via-lattea | Via Lattea (Montgenèvre) | | | | | | | | |
| espace-san-bernardo | Espace San Bernardo (La Rosière) | | | | | | | | |
| espace-diamant | Espace Diamant (Les Saisies) | | | | | | | | |
| val-cenis | Val Cenis | | | | | | | | |
