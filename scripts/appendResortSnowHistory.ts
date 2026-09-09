/**
 * Hämtar snöhistorik för EN enskild ort (som ännu inte finns i src/data/resorts.ts, eller
 * som av annan anledning inte ska köras via hela snow:export-batchen) och lägger till
 * resultatet som nya rader i snohistorik_export.csv, utan att röra befintliga rader.
 *
 * ⚠️ Använder Open-Meteos GRATIS-nivå — se header-kommentaren i fetchSnowHistory.ts.
 * Kör med: npm run snow:append-resort
 *
 * RESORT_TO_APPEND nedan är just nu hårdkodad till La Clusaz. Byt värdena (och kör om) för
 * att lägga till en annan ort på samma sätt.
 */
import { fetchResortSnowHistory, toCsvRow, type ResortInput } from "./fetchSnowHistory.ts";
import { readFileSync, appendFileSync, existsSync } from "node:fs";
import path from "node:path";

// Se motsvarande OBS-kommentar i exportSnowHistory.ts — samma anledning (bundlas av
// scripts/run-append-resort.mjs till en tempfil innan körning).
const PROJECT_ROOT = process.env.SNOW_EXPORT_PROJECT_ROOT ?? process.cwd();
const CSV_PATH = path.join(PROJECT_ROOT, "snohistorik_export.csv");

const RESORT_TO_APPEND: ResortInput = {
  name: "La Clusaz",
  lat: 45.905,
  lng: 6.424,
};

async function main() {
  console.log(`Hämtar snöhistorik för ${RESORT_TO_APPEND.name} från Open-Meteo (gratis-nivå)...\n`);

  const rader = await fetchResortSnowHistory(RESORT_TO_APPEND);
  const ortId = rader[0].ortId;

  // Skydd mot att råka lägga till samma ort två gånger om skriptet körs om.
  if (existsSync(CSV_PATH)) {
    const befintligtInnehåll = readFileSync(CSV_PATH, "utf8");
    if (befintligtInnehåll.split("\n").some((rad) => rad.startsWith(`${ortId},`))) {
      console.error(
        `✗ Avbryter: "${ortId}" finns redan i ${CSV_PATH}. Ta bort de gamla raderna manuellt ` +
          `först om du vill hämta om och skriva in dem på nytt.`
      );
      process.exitCode = 1;
      return;
    }
  }

  console.log("Ort".padEnd(12) + "Säsong".padEnd(12) + "Nysnö (cm)".padStart(12) + "Maxdjup (cm)".padStart(14) + "  Datum maxdjup");
  for (const r of rader) {
    console.log(
      r.ortId.padEnd(12) +
        r.säsong.padEnd(12) +
        String(r.totaltSnöfallCm ?? "–").padStart(12) +
        String(r.maxSnödjupCm ?? "–").padStart(14) +
        "  " +
        (r.datumMaxSnödjup ?? "–") +
        (r.saknarNågraVärden ? "  ⚠ saknar dagsvärden" : "") +
        (r.hämtningMisslyckades ? "  ⚠ hämtning misslyckades" : "")
    );
  }

  const csvRader = rader.map((r) =>
    toCsvRow([r.ortId, r.säsong, r.totaltSnöfallCm, r.maxSnödjupCm, r.datumMaxSnödjup])
  );
  appendFileSync(CSV_PATH, csvRader.join("\n") + "\n", "utf8");
  console.log(`\n✓ La till ${rader.length} rader i ${CSV_PATH}`);
}

main().catch((err) => {
  console.error("Hämtningen misslyckades:", err);
  process.exitCode = 1;
});
