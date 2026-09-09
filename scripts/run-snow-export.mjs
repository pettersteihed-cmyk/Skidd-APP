// Bootstrap: bygger scripts/exportSnowHistory.ts (+ dess TS-importer) med esbuild
// (redan en transitiv devDependency via Vite, ingen ny paketinstallation krävs) och kör
// resultatet i Node. Behövs eftersom projektet inte har ts-node/tsx installerat.
import esbuild from "esbuild";
import { tmpdir } from "node:os";
import path from "node:path";
import { writeFile, unlink } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const entry = path.resolve(import.meta.dirname, "exportSnowHistory.ts");
const outfile = path.join(tmpdir(), `snow-export-${Date.now()}.mjs`);

const result = await esbuild.build({
  entryPoints: [entry],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node18",
  write: false,
  // src/data/resorts.ts läser normalt `import.meta.env.VITE_MAPBOX_TOKEN` (ett Vite-only
  // globalt objekt). Det finns inte i vanlig Node, så vi ersätter uttrycket vid byggtid
  // — vi bryr oss inte om Mapbox-token i det här skriptet, bara om RESORTS-arrayen.
  define: { "import.meta.env.VITE_MAPBOX_TOKEN": '""' },
});

await writeFile(outfile, result.outputFiles[0].text, "utf8");
try {
  process.env.SNOW_EXPORT_PROJECT_ROOT = path.resolve(import.meta.dirname, "..");
  await import(pathToFileURL(outfile).href);
} finally {
  await unlink(outfile).catch(() => {});
}
