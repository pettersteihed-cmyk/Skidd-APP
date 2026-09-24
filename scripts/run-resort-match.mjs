// Kör matchResorts() (src/utils/resortMatch.ts) mot handskrivna testfall, utan att starta appen.
// Bygger modulen med esbuild (redan en transitiv devDependency via Vite) och kör den i Node,
// samma mönster som run-snow-export.mjs.
//
//   npm run match -- scripts/match-examples/nyborjare-kort-transfer.json   (en fil)
//   npm run match -- scripts/match-examples                                 (alla .json i mappen)
//   npm run match -- '{"filter":{"tagResa":true},"weights":{"transfer":2}}' (JSON direkt)
//
// Ett testfall är { filter, weights?, expect? }. expect är valfritt:
//   { "top3": [id, ...], "relaxed": [{ filter, from, to }, ...], "underfilled": bool, "blockedBy": [...],
//     "viaLattning": [id, ...] }   (viaLattning = de i top3 som bara kom med efter lättning)
// Angivna expect-fält jämförs mot resultatet; vid avvikelse avslutas skriptet med felkod 1.
import esbuild from "esbuild";
import { tmpdir } from "node:os";
import path from "node:path";
import { readFile, readdir, stat, writeFile, unlink } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";

const root = path.resolve(import.meta.dirname, "..");
const outfile = path.join(tmpdir(), `resort-match-${Date.now()}.mjs`);

const result = await esbuild.build({
  entryPoints: [path.join(root, "src/utils/resortMatch.ts")],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node18",
  write: false,
  alias: { "@": path.join(root, "src") },
  // resorts.ts läser import.meta.env.VITE_MAPBOX_TOKEN, som bara finns i Vite.
  define: { "import.meta.env.VITE_MAPBOX_TOKEN": '""' },
  logLevel: "error",
});
await writeFile(outfile, result.outputFiles[0].text, "utf8");

async function lasFall(arg) {
  if (arg.trim().startsWith("{")) return [{ namn: "(inline)", fall: JSON.parse(arg) }];
  const p = path.resolve(arg);
  if ((await stat(p)).isDirectory()) {
    const filer = (await readdir(p)).filter((f) => f.endsWith(".json")).sort();
    return Promise.all(filer.map(async (f) => ({ namn: f, fall: JSON.parse(await readFile(path.join(p, f), "utf8")) })));
  }
  return [{ namn: path.basename(p), fall: JSON.parse(await readFile(p, "utf8")) }];
}

const fmt = (n) => n.toFixed(3);
const visaVarde = (v) => (v === null ? "(borttaget)" : JSON.stringify(v));

let fel = 0;
try {
  const { matchResorts } = await import(pathToFileURL(outfile).href);
  const args = process.argv.slice(2);
  if (!args.length) throw new Error("Ange en JSON-fil, en mapp eller JSON direkt.");
  const allaFall = (await Promise.all(args.map(lasFall))).flat();

  for (const { namn, fall } of allaFall) {
    console.log(`\n=== ${namn}`);
    console.log(`filter:  ${JSON.stringify(fall.filter ?? {})}`);
    console.log(`weights: ${JSON.stringify(fall.weights ?? {})}`);
    const res = matchResorts(fall.filter ?? {}, fall.weights ?? {});

    console.log("\n  #  ort                    score  offpist pistKm transfer pris   nivå  transfer  km   pris");
    res.results.forEach((r, i) => {
      const d = r.delpoang;
      const rs = r.resort;
      console.log(
        `  ${i + 1}  ${(rs.id + (r.viaLattning ? " *" : "")).padEnd(21)}  ${fmt(r.score)}  ${fmt(d.offpist)}   ${fmt(d.pistKm)}  ${fmt(d.transfer)}   ${fmt(d.pris)}  ` +
        `${rs.offpistNivaMin}–${rs.offpistNivaMax}  ${String(Math.min(rs.transferMin, ...(rs.additionalAirports ?? []).map((a) => a.transferMin))).padStart(4)} min ${String(rs.pisteKm).padStart(4)}  ${rs.price}`,
      );
    });
    if (res.results.some((r) => r.viaLattning)) console.log("\n  * = kom med via lättning (klarade inte originalfiltret)");
    console.log(`\n  lättat:      ${res.relaxed.length ? res.relaxed.map((r) => `${r.filter} ${visaVarde(r.from)} → ${visaVarde(r.to)}`).join("; ") : "inget"}`);
    console.log(`  underfilled: ${res.underfilled}${res.blockedBy.length ? `  (blockerat av: ${res.blockedBy.join(", ")})` : ""}`);

    if (fall.expect) {
      const faktiskt = {
        top3: res.results.map((r) => r.resort.id),
        relaxed: res.relaxed,
        underfilled: res.underfilled,
        blockedBy: res.blockedBy,
        viaLattning: res.results.filter((r) => r.viaLattning).map((r) => r.resort.id),
      };
      const avvik = Object.keys(fall.expect).filter((k) => !isDeepStrictEqual(fall.expect[k], faktiskt[k]));
      if (avvik.length) {
        fel++;
        console.log("  EXPECT: AVVIKER");
        for (const k of avvik) console.log(`    ${k}: förväntat ${JSON.stringify(fall.expect[k])}, fick ${JSON.stringify(faktiskt[k])}`);
      } else {
        console.log(`  EXPECT: OK (${Object.keys(fall.expect).join(", ")})`);
      }
    }
  }
  console.log(`\n${allaFall.length} fall körda, ${fel} avvikelser.`);
} finally {
  await unlink(outfile).catch(() => {});
}
process.exitCode = fel ? 1 : 0;
