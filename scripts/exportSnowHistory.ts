/**
 * Kör snöhistorik-exporten för samtliga orter i src/data/resorts.ts.
 *
 * ⚠️ Använder Open-Meteos GRATIS-nivå — se header-kommentaren i fetchSnowHistory.ts.
 * Kör med: npm run snow:export
 */
import { fetchAllResortsSnowHistory, SEASONS, type SeasonSnowSummary } from "./fetchSnowHistory.ts";
import { RESORTS } from "../src/data/resorts.ts";
import { writeFileSync } from "node:fs";
import path from "node:path";

// OBS: kan INTE härledas från import.meta.url här — det här skriptet bundlas av
// scripts/run-snow-export.mjs till en temporär fil i systemets tempmapp innan det körs,
// så import.meta.url pekar då på tempfilen. Den riktiga projektroten skickas därför in
// via en miljövariabel från bootstrap-skriptet.
const PROJECT_ROOT = process.env.SNOW_EXPORT_PROJECT_ROOT ?? process.cwd();
const CSV_PATH = path.join(PROJECT_ROOT, "snohistorik_export.csv");

// Rimlighets-trösklar för att flagga misstänkta värden i terminalsammanfattningen.
// Grovt uppskattade för alpina orter ~1000–3800 möh under en hel vintersäsong.
const MISSTÄNKT_LÅGT_SNÖFALL_CM = 50;
const MISSTÄNKT_HÖGT_SNÖFALL_CM = 1500;
const MISSTÄNKT_LÅGT_MAXDJUP_CM = 20;
const MISSTÄNKT_HÖGT_MAXDJUP_CM = 500;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function toCsvRow(fields: (string | number | null)[]): string {
  return fields
    .map((f) => {
      const s = f === null || f === undefined ? "" : String(f);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    })
    .join(",");
}

function flaggaOrimligtVärde(rad: SeasonSnowSummary): string | null {
  if (rad.hämtningMisslyckades) return "hämtning misslyckades";
  const anledningar: string[] = [];
  if (rad.totaltSnöfallCm !== null) {
    if (rad.totaltSnöfallCm < MISSTÄNKT_LÅGT_SNÖFALL_CM) anledningar.push("mycket lågt nysnöfall");
    if (rad.totaltSnöfallCm > MISSTÄNKT_HÖGT_SNÖFALL_CM) anledningar.push("ovanligt högt nysnöfall");
  }
  if (rad.maxSnödjupCm !== null) {
    if (rad.maxSnödjupCm < MISSTÄNKT_LÅGT_MAXDJUP_CM) anledningar.push("mycket grunt maxsnödjup");
    if (rad.maxSnödjupCm > MISSTÄNKT_HÖGT_MAXDJUP_CM) anledningar.push("ovanligt djupt maxsnödjup");
  }
  if (rad.saknarNågraVärden) anledningar.push("saknar dagsvärden");
  return anledningar.length > 0 ? anledningar.join(", ") : null;
}

async function main() {
  console.log(`Hämtar snöhistorik för ${RESORTS.length} orter × ${SEASONS.length} säsonger från Open-Meteo (gratis-nivå)...\n`);

  const rader = await fetchAllResortsSnowHistory(RESORTS, {
    onProgress: (resort, i, total) => console.log(`  [${i + 1}/${total}] ${resort.name}`),
  });

  // --- Skriv CSV ---
  const csvRader = [
    toCsvRow(["ort_id", "säsong", "totalt_snöfall_cm", "max_snödjup_cm", "datum_max_snödjup"]),
    ...rader.map((r) =>
      toCsvRow([r.ortId, r.säsong, r.totaltSnöfallCm, r.maxSnödjupCm, r.datumMaxSnödjup])
    ),
  ];
  writeFileSync(CSV_PATH, csvRader.join("\n") + "\n", "utf8");
  console.log(`\n✓ Skrev ${rader.length} rader till ${CSV_PATH}\n`);

  // --- Terminalsammanfattning, en tabell per säsong ---
  for (const season of SEASONS) {
    const säsongsRader = rader
      .filter((r) => r.säsong === season.label)
      .sort((a, b) => (b.totaltSnöfallCm ?? -1) - (a.totaltSnöfallCm ?? -1));

    console.log(`\n=== Säsong ${season.label} ===`);
    console.log(
      "Ort".padEnd(38) + "Nysnö (cm)".padStart(12) + "Maxdjup (cm)".padStart(14) + "  Datum maxdjup   Flagga"
    );
    for (const r of säsongsRader) {
      const flagga = flaggaOrimligtVärde(r);
      console.log(
        r.ortNamn.slice(0, 37).padEnd(38) +
          String(r.totaltSnöfallCm ?? "–").padStart(12) +
          String(r.maxSnödjupCm ?? "–").padStart(14) +
          "  " +
          (r.datumMaxSnödjup ?? "–").padEnd(16) +
          (flagga ? `⚠ ${flagga}` : "")
      );
    }

    const giltiga = säsongsRader.filter((r) => !r.hämtningMisslyckades);
    const snöfallVärden = giltiga.map((r) => r.totaltSnöfallCm!).filter((v) => v !== null);
    const djupVärden = giltiga.map((r) => r.maxSnödjupCm!).filter((v) => v !== null);
    if (snöfallVärden.length > 0) {
      console.log(
        `  Nysnö: min ${Math.min(...snöfallVärden)} / median ${median(snöfallVärden).toFixed(0)} / max ${Math.max(...snöfallVärden)} cm`
      );
    }
    if (djupVärden.length > 0) {
      console.log(
        `  Maxdjup: min ${Math.min(...djupVärden)} / median ${median(djupVärden).toFixed(0)} / max ${Math.max(...djupVärden)} cm`
      );
    }
  }

  // --- Samlad flagg-lista ---
  const flaggade = rader
    .map((r) => ({ r, flagga: flaggaOrimligtVärde(r) }))
    .filter((x) => x.flagga !== null);

  console.log(`\n=== Flaggade rader (${flaggade.length}/${rader.length}) — kolla dessa innan du litar på CSV:n ===`);
  if (flaggade.length === 0) {
    console.log("  Inga rader flaggades som orimliga.");
  } else {
    for (const { r, flagga } of flaggade) {
      console.log(`  ${r.ortNamn} (${r.säsong}): ${flagga}`);
    }
  }
}

main().catch((err) => {
  console.error("Exporten misslyckades:", err);
  process.exitCode = 1;
});
