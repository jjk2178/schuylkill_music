import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { instrumentKey } from "../src/music/parts.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const data = JSON.parse(
  readFileSync(join(root, "src/band/rehearsalSet.json"), "utf8"),
);
const output = join(resolve(root, process.env.PDF_OUTPUT_DIR ?? "output/pdf"), "setlists");
const htmlDir = join(output, "html");
mkdirSync(htmlDir, { recursive: true });
const chrome =
  process.env.CHROME_PATH ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const escape = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
const instruments = [
  "guitar",
  "bass",
  "piano",
  "drums",
  "vocals",
  "trumpet",
  "flute",
  "recorder",
];
for (const instrument of instruments) {
  const label = instrument[0].toUpperCase() + instrument.slice(1);
  const songs = data.rehearsalSongs.flatMap((song, index) => {
    const roles = song.roles.filter((role) => {
      const key = instrumentKey(role.instrument);
      return key === instrument;
    });
    return roles.length ? [{ song, roles, position: index + 1 }] : [];
  });
  const rows = songs
    .map(
      ({ song, roles, position }) =>
        `<tr><td class="order">${position}</td><td><strong>${escape(song.title)}</strong><div class="artist">${escape(song.artist)}</div><div class="status">${escape(song.status)}</div></td><td>${roles.map((role) => `<div class="role"><strong>${escape(role.player)} · ${escape(role.part)}</strong><div>${escape(role.notes)}</div></div>`).join("")}</td></tr>`,
    )
    .join("");
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${label} Set List</title><style>
    @page { size: letter; margin: 0.5in; }
    body { font-family: Arial, sans-serif; color: #17202a; font-size: 10px; }
    h1 { font-size: 27px; margin: 0 0 5px; }
    header { border-bottom: 2px solid #17202a; padding-bottom: 12px; margin-bottom: 15px; }
    header p { margin: 3px 0; font-size: 11px; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    th { text-align: left; padding: 7px; background: #e9edf0; font-size: 10px; }
    td { padding: 9px 7px; vertical-align: top; border-bottom: 1px solid #bfc7cc; line-height: 1.35; }
    tr { break-inside: avoid; } .order { font-size: 16px; font-weight: bold; }
    .artist { margin-top: 3px; } .status { color: #59626a; margin-top: 4px; font-size: 9px; }
    .role + .role { margin-top: 7px; } .role div { margin-top: 3px; }
    footer { margin-top: 14px; font-size: 9px; color: #59626a; }
  </style></head><body><header><h1>${label} Set List</h1><p>Schuylkill Music · ${songs.length} assigned songs</p><p>Numbers follow the full rehearsal set order.${instrument === "trumpet" ? " B♭ trumpet: notation is written a whole step above concert pitch." : ""}</p></header><table><colgroup><col style="width:6%"><col style="width:40%"><col style="width:54%"></colgroup><thead><tr><th>#</th><th>Song</th><th>Player / part / rehearsal notes</th></tr></thead><tbody>${rows}</tbody></table><footer>Source: saved rehearsal set assignments. See the instrument packet for notation.</footer></body></html>`;
  const htmlPath = join(htmlDir, `${instrument}-setlist.html`);
  const pdfPath = join(output, `${instrument}-setlist.pdf`);
  writeFileSync(htmlPath, html);
  execFileSync(
    chrome,
    [
      "--headless",
      "--disable-gpu",
      ...(process.env.CHROME_NO_SANDBOX === "1" ? ["--no-sandbox"] : []),
      "--no-pdf-header-footer",
      `--print-to-pdf=${pdfPath}`,
      pathToFileURL(htmlPath).href,
    ],
    { stdio: "ignore" },
  );
  console.log(`${label}: ${songs.length} songs → ${pdfPath}`);
}
