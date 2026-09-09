// Bootstrap: bygger scripts/appendResortSnowHistory.ts (+ dess TS-importer) med esbuild
// (redan en transitiv devDependency via Vite, ingen ny paketinstallation krävs) och kör
// resultatet i Node. Se run-snow-export.mjs (samma mönster, för hela batch-exporten) —
// duplicerat hellre än en gemensam abstraktion, eftersom det bara är 25 rader vardera.
import esbuild from "esbuild";
import { tmpdir } from "node:os";
import path from "node:path";
import { writeFile, unlink } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const entry = path.resolve(import.meta.dirname, "appendResortSnowHistory.ts");
const outfile = path.join(tmpdir(), `snow-append-${Date.now()}.mjs`);

const result = await esbuild.build({
  entryPoints: [entry],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node18",
  write: false,
  define: { "import.meta.env.VITE_MAPBOX_TOKEN": '""' },
});

await writeFile(outfile, result.outputFiles[0].text, "utf8");
try {
  process.env.SNOW_EXPORT_PROJECT_ROOT = path.resolve(import.meta.dirname, "..");
  await import(pathToFileURL(outfile).href);
} finally {
  await unlink(outfile).catch(() => {});
}
