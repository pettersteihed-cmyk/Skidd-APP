# Offpist-underlag — ifyllnadsmall

Underlag för de valfria fälten i `Resort` (`src/types.ts`) inför AI-chatten. Fylls i
manuellt från verifierade källor (ortens egen information, guidebyråer, pistkartor) —
inte från `description` eller Excel-kolumnen `resortTypes`, som är overifierade.
Lämna en cell tom hellre än att gissa. Branthet och offpist är säkerhetskritiskt
(se regel 7 i `CLAUDE.md`).

## Fälten

| Fält | Typ | Format i tabellen | Betydelse |
|---|---|---|---|
| `offpistNiva` | heltal 1–5 | en siffra | Hur **krävande** terrängen är — inte hur mycket offpist som finns. Se skalan nedan. |
| `offpistTillgang` | lista | kommaseparerat, ett eller flera av: `liftnara`, `kort-stigning`, `turakning`, `guide-kravs` | Hur offpistterrängen nås. |
| `glaciarakning` | ja/nej | `ja` / `nej` | Det finns en skidbar glaciär inom pistsystemet som man åker på egen hand. Guidade glaciärturer utanför pist räknas inte här — de hör till `offpistTillgang` `guide-kravs` och beskrivs i `offpistNote`. |
| `guideverksamhet` | ja/nej | `ja` / `nej` | Om det finns guider/guidebyrå att boka på orten. |
| `offpistNote` | fritext | kort mening | Det viktigaste att veta om offpisten på orten. |
| `boendeTyper` | lista | kommaseparerat, ett eller flera av: `by`, `lagenhetsort`, `lyx`, `budget` | Vilka typer av boende orten erbjuder. |
| `nyborjarvanlig` | heltal 1–5 | en siffra | Se skalan nedan. |

### Värden i listfälten (tolkning av namnen — bekräfta)

| Värde | Tolkning |
|---|---|
| `liftnara` | Offpist som nås direkt från lift, utan stigning |
| `kort-stigning` | Kräver en kortare stigning/traverse från lift |
| `turakning` | Kräver turskidåkning (stighudar) |
| `guide-kravs` | Terrängen bör/ska bara åkas med guide |
| `by` | Traditionell by med hotell/chalets |
| `lagenhetsort` | Planerad skidort byggd kring lägenhetskomplex |
| `lyx` | Lyxboende finns i betydande utsträckning |
| `budget` | Budgetboende finns i betydande utsträckning |

### Skala `offpistNiva` (fastställd)

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

| id | Ort | offpistNiva | offpistTillgang | glaciarakning | guideverksamhet | offpistNote | boendeTyper | nyborjarvanlig |
|---|---|---|---|---|---|---|---|---|
| les-3-vallees | Les 3 Vallées (Val Thorens, Courchevel) | | | | | | | |
| paradiski | Paradiski (Les Arcs, La Plagne) | | | | | | | |
| tignes-val-disere | Tignes - Val d'Isère | | | | | | | |
| portes-du-soleil | Portes du Soleil (Avoriaz, Morzine) | | | | | | | |
| le-grand-massif | Le Grand Massif (Flaine, Samoëns) | | | | | | | |
| les-sybelles | Les Sybelles (Le Corbier) | | | | | | | |
| alpe-dhuez | Alpe d'Huez Grand Domaine | | | | | | | |
| les-deux-alpes | Les Deux Alpes | | | | | | | |
| serre-chevalier | Serre Chevalier (Briançon) | | | | | | | |
| evasion-mont-blanc | Évasion Mont-Blanc (Megève) | | | | | | | |
| chamonix | Chamonix-Mont-Blanc | | | | | | | |
| via-lattea | Via Lattea (Montgenèvre) | | | | | | | |
| espace-san-bernardo | Espace San Bernardo (La Rosière) | | | | | | | |
| espace-diamant | Espace Diamant (Les Saisies) | | | | | | | |
| val-cenis | Val Cenis | | | | | | | |
