/**
 * Sestavení skutečného .deb balíčku v prohlížeči:
 *   data.tar.gz  (aplikace + Three.js + spouštěč + .desktop + ikona)
 *   control.tar.gz (control, md5sums, postinst, postrm)
 *   → ar archiv = výsledný .deb
 */
import { buildTar } from "./tar";
import type { TarEntry } from "./tar";
import { buildAr } from "./ar";
import { md5Hex } from "./md5";
import {
  APP_HTML,
  launcherScript,
  desktopEntry,
  iconSvg,
  controlFile,
  postinstScript,
  postrmScript,
} from "./assets";
import type { DebMeta } from "./assets";
import { THREE_SOURCE, ORBIT_SOURCE } from "./rawImports";

export type { DebMeta };

export interface PackagedFile {
  path: string; // cesta bez úvodního "./"
  size: number;
  mode: string;
  preview: string;
}

export interface DebResult {
  fileName: string;
  bytes: Uint8Array;
  size: number;
  md5: string;
  installedKiB: number;
  files: PackagedFile[];
  controlSize: number;
  dataSize: number;
  controlGz: number;
  dataGz: number;
}

export type LogFn = (line: string, kind?: "ok" | "dim" | "cmd") => void;

const enc = new TextEncoder();
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function gzip(data: Uint8Array): Promise<Uint8Array> {
  const CS = (globalThis as unknown as { CompressionStream?: new (f: string) => GenericTransformStream })
    .CompressionStream;
  if (!CS) return Promise.reject(new Error("CompressionStream není v prohlížeči dostupné."));
  const stream = new Blob([data.buffer as ArrayBuffer]).stream().pipeThrough(new CS("gzip"));
  return new Response(stream).arrayBuffer().then((b) => new Uint8Array(b));
}

function fmtKiB(n: number): string {
  return (n / 1024).toFixed(1).replace(".", ",") + " KiB";
}

/** všechny adresáře (vč. kořene "./") pro zadané cesty souborů */
function collectDirs(paths: string[]): string[] {
  const dirs = new Set<string>(["./"]);
  for (const p of paths) {
    const parts = p.split("/");
    parts.pop();
    let cur = "";
    for (const part of parts) {
      cur += part + "/";
      dirs.add(cur);
    }
  }
  return Array.from(dirs).sort();
}

export async function buildDeb(meta: DebMeta, log: LogFn): Promise<DebResult> {
  const mtime = Math.floor(Date.now() / 1000);
  const opt = `opt/${meta.pkg}`;

  log(`$ dpkg-deb --build --root-owner-group ${meta.pkg}`, "cmd");
  await sleep(320);
  log("  připravuji obsah balíčku…", "dim");

  // ---- soubory do data.tar.gz ----
  const dataFiles: { path: string; mode: number; text: string }[] = [
    { path: `${opt}/index.html`, mode: 0o644, text: APP_HTML },
    { path: `${opt}/vendor/three.module.js`, mode: 0o644, text: THREE_SOURCE },
    { path: `${opt}/vendor/controls/OrbitControls.js`, mode: 0o644, text: ORBIT_SOURCE },
    { path: `${opt}/${meta.pkg}`, mode: 0o755, text: launcherScript(meta.pkg) },
    { path: `usr/share/applications/${meta.pkg}.desktop`, mode: 0o644, text: desktopEntry(meta.pkg) },
    { path: `usr/share/icons/hicolor/scalable/apps/${meta.pkg}.svg`, mode: 0o644, text: iconSvg() },
  ];

  const encoded = dataFiles.map((f) => ({ ...f, data: enc.encode(f.text) }));
  const rawTotal = encoded.reduce((s, f) => s + f.data.length, 0);
  const installedKiB = Math.ceil(rawTotal / 1024);

  await sleep(300);
  for (const f of encoded) {
    log(`  + ${f.path}  (${fmtKiB(f.data.length)})`);
  }
  log(`  celkem po rozbalení: ${fmtKiB(rawTotal)}`, "dim");

  await sleep(280);
  log("  počítám kontrolní součty (md5sums)…", "dim");
  const md5sums = encoded.map((f) => `${md5Hex(f.data)}  ${f.path}`).join("\n") + "\n";
  await sleep(260);

  // ---- control.tar.gz ----
  const controlText = controlFile(meta, installedKiB);
  const controlFiles = [
    { path: "control", mode: 0o644, data: enc.encode(controlText) },
    { path: "md5sums", mode: 0o644, data: enc.encode(md5sums) },
    { path: "postinst", mode: 0o755, data: enc.encode(postinstScript(meta.pkg)) },
    { path: "postrm", mode: 0o755, data: enc.encode(postrmScript()) },
  ];

  log("  komprimuji control.tar.gz…", "dim");
  const controlEntries: TarEntry[] = [
    ...collectDirs(controlFiles.map((c) => c.path)).map<TarEntry>((d) => ({ path: "./" + d.replace(/^\.\//, ""), type: "5", mode: 0o755 })),
    ...controlFiles.map<TarEntry>((c) => ({ path: "./" + c.path, type: "0", mode: c.mode, data: c.data })),
  ];
  const controlTar = buildTar(controlEntries, mtime);
  const controlGzArr = await gzip(controlTar);
  await sleep(300);
  log(`    control.tar.gz: ${fmtKiB(controlTar.length)} → ${fmtKiB(controlGzArr.length)}`);

  // ---- data.tar.gz ----
  log("  komprimuji data.tar.gz (gzip)…", "dim");
  const dataEntries: TarEntry[] = [
    ...collectDirs(encoded.map((f) => f.path)).map<TarEntry>((d) => ({ path: "./" + d.replace(/^\.\//, ""), type: "5", mode: 0o755 })),
    ...encoded.map<TarEntry>((f) => ({ path: "./" + f.path, type: "0", mode: f.mode, data: f.data })),
  ];
  const dataTar = buildTar(dataEntries, mtime);
  const dataGzArr = await gzip(dataTar);
  await sleep(340);
  log(`    data.tar.gz: ${fmtKiB(dataTar.length)} → ${fmtKiB(dataGzArr.length)}`);

  // ---- ar ----
  log("  skládám ar archiv: debian-binary · control.tar.gz · data.tar.gz", "dim");
  const debianBinary = enc.encode("2.0\n");
  const ar = buildAr(
    [
      { name: "debian-binary", data: debianBinary },
      { name: "control.tar.gz", data: controlGzArr },
      { name: "data.tar.gz", data: dataGzArr },
    ],
    mtime
  );
  await sleep(320);

  const fileName = `${meta.pkg}_${meta.version}_${meta.arch}.deb`;
  log(`✓ hotovo: ${fileName} (${fmtKiB(ar.length)})`, "ok");

  return {
    fileName,
    bytes: ar,
    size: ar.length,
    md5: md5Hex(ar),
    installedKiB,
    files: encoded.map((f) => ({
      path: f.path,
      size: f.data.length,
      mode: "0" + f.mode.toString(8),
      preview:
        f.text.length > 9000
          ? f.text.slice(0, 9000) + `\n\n… (zobrazeno prvních 9 000 z ${f.text.length} znaků)`
          : f.text,
    })),
    controlSize: controlTar.length,
    dataSize: dataTar.length,
    controlGz: controlGzArr.length,
    dataGz: dataGzArr.length,
  };
}

export async function sha256Hex(data: Uint8Array): Promise<string> {
  if (!globalThis.crypto?.subtle) return "(sha256 není v tomto kontextu dostupné)";
  const digest = await crypto.subtle.digest("SHA-256", data.buffer as ArrayBuffer);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}
