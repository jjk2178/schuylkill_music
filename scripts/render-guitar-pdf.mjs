// Render the ingested arrangements (public/arrangements/*.json) to combined
// guitar notation and print each to PDF with headless Chromium.
//
//   node scripts/render-guitar-pdf.mjs [dir]
//
// Writes, next to each <id>.json:
//   <id>.guitar.html   the combined notation (chord diagrams + tab + lyrics)
//   <id>.guitar.pdf    the printed sheet
//
// Honours CHROME_PATH (default: chromium) and CHROME_NO_SANDBOX=1, matching
// scripts/build-packets.mjs.

import { readdir, readFile, writeFile, mkdir, copyFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildSync } from "esbuild";

import { parseArrangement } from "../src/arrangement/schema.mjs";
import { renderArrangementHtml } from "../src/arrangement/html.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const dir = process.argv[2] || join(repoRoot, "public", "arrangements");
const chromePath = process.env.CHROME_PATH || "chromium";
// Snap-packaged Chromium is confined to $HOME (and refuses hidden dot-dirs), so
// stage HTML + PDF in a plain $HOME directory it can always read and write.
const stagingDir =
  process.env.GUITAR_PDF_STAGING || join(homedir(), "guitar-pdf-build");

// Bundle VexChords and a draw script that renders each `.chord-box` from its
// pre-computed vexChordData payload.
function chordScript() {
  const library = buildSync({
    stdin: { contents: 'export { draw } from "vexchords";', resolveDir: repoRoot },
    bundle: true,
    write: false,
    format: "iife",
    globalName: "vexchords",
    minify: true,
  }).outputFiles[0].text;
  return (
    `<script>${library}</script><script>` +
    `document.querySelectorAll('.chord-box').forEach(host => {` +
    `  const chord = JSON.parse(host.dataset.chord);` +
    `  vexchords.draw(host, chord, {width:54,height:66,showTuning:false,defaultColor:'#333',bgColor:'transparent'});` +
    `});</script>`
  );
}

function printPdf(htmlPath, pdfPath) {
  execFileSync(
    chromePath,
    [
      "--headless",
      "--disable-gpu",
      ...(process.env.CHROME_NO_SANDBOX === "1" ? ["--no-sandbox"] : []),
      "--run-all-compositor-stages-before-draw",
      "--virtual-time-budget=4000",
      "--no-pdf-header-footer",
      `--print-to-pdf=${pdfPath}`,
      pathToFileURL(htmlPath).href,
    ],
    { stdio: "ignore" },
  );
}

async function main() {
  const files = (await readdir(dir)).filter((f) => f.endsWith(".json"));
  if (!files.length) {
    console.error(`No arrangements in ${dir}. Run: npm run songs:import`);
    process.exit(1);
  }
  const script = chordScript();
  await mkdir(stagingDir, { recursive: true });
  for (const file of files.sort()) {
    const id = file.replace(/\.json$/, "");
    const arr = parseArrangement(JSON.parse(await readFile(join(dir, file), "utf8")));
    const partNames = [];
    // One PDF per part (Guitar 1, Guitar 2, Bass) so each player gets their sheet.
    for (let t = 0; t < arr.tracks.length; t++) {
      const trackId = arr.tracks[t].id;
      const html = renderArrangementHtml(arr, { chordScript: script, trackIndex: t });
      const htmlPath = join(dir, `${id}.${trackId}.html`); // canonical, web-viewable
      await writeFile(htmlPath, html);

      const stageHtml = join(stagingDir, `${id}.${trackId}.html`);
      const stagePdf = join(stagingDir, `${id}.${trackId}.pdf`);
      await writeFile(stageHtml, html);
      printPdf(stageHtml, stagePdf);

      const pdfPath = join(dir, `${id}.${trackId}.pdf`);
      const ok = existsSync(stagePdf);
      if (ok) await copyFile(stagePdf, pdfPath);
      partNames.push(`${arr.tracks[t].name}${ok ? "" : "(FAILED)"}`);
    }
    console.log(`✓ ${id.padEnd(24)} ${partNames.join(", ")}`);
  }
  await rm(stagingDir, { recursive: true, force: true });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
