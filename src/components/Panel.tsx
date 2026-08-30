import { useEffect, useRef, useState } from "react";
import type { DebMeta, DebResult, PackagedFile } from "../deb/buildDeb";

export type LogKind = "ok" | "dim" | "cmd" | "plain";
export interface LogLine {
  text: string;
  kind: LogKind;
}
export interface BuildResult extends DebResult {
  sha256: string;
  url: string;
}

export type BuildState = "idle" | "building" | "done" | "error";

interface Props {
  meta: DebMeta;
  onMeta: (m: DebMeta) => void;
  errors: { pkg?: string; version?: string };
  buildState: BuildState;
  logs: LogLine[];
  onBuild: () => void;
  result: BuildResult | null;
  onCopy: (text: string, label?: string) => void;
  open: boolean;
  onClose: () => void;
}

function fmtKiB(n: number): string {
  return (n / 1024).toFixed(1).replace(".", ",") + " KiB";
}

/* ---------- drobné ikony ---------- */
const I = {
  box: (c = "currentColor") => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 8l-9-5-9 5v8l9 5 9-5V8z" />
      <path d="M3.3 8.3L12 13l8.7-4.7" />
      <path d="M12 13v9" />
    </svg>
  ),
  down: (c = "currentColor") => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v12" />
      <path d="M6 10l6 6 6-6" />
      <path d="M4 21h16" />
    </svg>
  ),
  copy: (c = "currentColor") => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15V5a2 2 0 0 1 2-2h10" />
    </svg>
  ),
  file: (c = "currentColor") => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
    </svg>
  ),
  folder: (c = "currentColor") => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
    </svg>
  ),
  check: (c = "currentColor") => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 12.5l5 5L20 6.5" />
    </svg>
  ),
  x: (c = "currentColor") => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.2" strokeLinecap="round">
      <path d="M5 5l14 14M19 5L5 19" />
    </svg>
  ),
};

const Spinner = () => (
  <span className="inline-block h-3.5 w-3.5 rounded-full border-2 border-white/30 border-t-white" style={{ animation: "spinSlow 0.7s linear infinite" }} />
);

/* ---------- řádek příkazu s kopírováním ---------- */
function Cmd({ text, onCopy }: { text: string; onCopy: (t: string, l?: string) => void }) {
  return (
    <div className="group flex items-center gap-2 rounded-lg border border-line bg-[#05080f] px-3 py-2.5 transition-colors hover:border-[#31496f]">
      <span className="shrink-0 font-mono text-[12px] text-grn select-none">$</span>
      <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap font-mono text-[12px] text-ink/90">{text}</code>
      <button
        onClick={() => onCopy(text, "Příkaz zkopírován")}
        className="shrink-0 rounded-md border border-line bg-panel2 p-1.5 text-mut opacity-60 transition-all hover:border-[#3a5580] hover:text-ink group-hover:opacity-100"
        title="Zkopírovat příkaz"
      >
        {I.copy()}
      </button>
    </div>
  );
}

export default function Panel(props: Props) {
  const { meta, onMeta, errors, buildState, logs, onBuild, result, onCopy, open, onClose } = props;
  const [tab, setTab] = useState<"pkg" | "files" | "install">("pkg");
  const [selFile, setSelFile] = useState<string | null>(null);
  const termRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = termRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [logs]);

  useEffect(() => {
    if (result) setSelFile(result.files[0]?.path ?? null);
  }, [result]);

  const building = buildState === "building";
  const selected: PackagedFile | null = result?.files.find((f) => f.path === selFile) ?? null;
  const debName = result ? result.fileName : `${meta.pkg}_${meta.version}_${meta.arch}.deb`;

  return (
    <>
      {open && <div className="fixed inset-0 z-30 bg-black/50 backdrop-blur-[2px] lg:hidden" onClick={onClose} />}
      <aside
        className={`fixed inset-y-0 right-0 z-40 flex w-[min(440px,100vw)] flex-col border-l border-line bg-panel/95 backdrop-blur-md transition-transform duration-300 ease-out lg:static lg:z-auto lg:translate-x-0 lg:bg-panel ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* hlavička panelu */}
        <div className="flex items-center gap-2 border-b border-line px-4 pt-3">
          <nav className="flex flex-1 gap-6">
            <button className={`tab-btn ${tab === "pkg" ? "on" : ""}`} onClick={() => setTab("pkg")}>
              Balíček
            </button>
            <button className={`tab-btn ${tab === "files" ? "on" : ""}`} onClick={() => setTab("files")}>
              Obsah{result ? ` · ${result.files.length}` : ""}
            </button>
            <button className={`tab-btn ${tab === "install" ? "on" : ""}`} onClick={() => setTab("install")}>
              Instalace
            </button>
          </nav>
          <button onClick={onClose} className="mb-2 rounded-md border border-line p-1.5 text-mut transition-colors hover:border-[#3a5580] hover:text-ink lg:hidden" title="Skrýt panel">
            {I.x()}
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5">
          {/* ============ TAB: BALÍČEK ============ */}
          {tab === "pkg" && (
            <div className="flex flex-col gap-6">
              <section className="rev">
                <h2 className="mb-3 font-mono text-[10px] font-medium tracking-[0.22em] text-dim uppercase">Metadata balíčku</h2>
                <div className="grid grid-cols-[1fr_110px] gap-3">
                  <label className="block">
                    <span className="mb-1 block font-mono text-[11px] text-mut">Package</span>
                    <input className={`inp ${errors.pkg ? "err" : ""}`} value={meta.pkg} spellCheck={false} onChange={(e) => onMeta({ ...meta, pkg: e.target.value })} />
                    {errors.pkg && <span className="mt-1 block text-[11px] text-crimson2">{errors.pkg}</span>}
                  </label>
                  <label className="block">
                    <span className="mb-1 block font-mono text-[11px] text-mut">Version</span>
                    <input className={`inp ${errors.version ? "err" : ""}`} value={meta.version} spellCheck={false} onChange={(e) => onMeta({ ...meta, version: e.target.value })} />
                    {errors.version && <span className="mt-1 block text-[11px] text-crimson2">{errors.version}</span>}
                  </label>
                  <label className="block">
                    <span className="mb-1 block font-mono text-[11px] text-mut">Architecture</span>
                    <select className="inp" value={meta.arch} onChange={(e) => onMeta({ ...meta, arch: e.target.value })}>
                      <option value="all">all (doporučeno)</option>
                      <option value="amd64">amd64</option>
                      <option value="arm64">arm64</option>
                      <option value="i386">i386</option>
                    </select>
                  </label>
                  <label className="col-span-2 block">
                    <span className="mb-1 block font-mono text-[11px] text-mut">Maintainer</span>
                    <input className="inp" value={meta.maintainer} spellCheck={false} onChange={(e) => onMeta({ ...meta, maintainer: e.target.value })} />
                  </label>
                </div>
                <p className="mt-3 rounded-lg border border-line bg-inset px-3 py-2 font-mono text-[11px] leading-relaxed text-mut">
                  Výstup: <span className="text-cy">{debName}</span>
                </p>
              </section>

              <section className="rev" style={{ animationDelay: "70ms" }}>
                <button className="btn btn-primary w-full py-3.5 text-[15px]" onClick={onBuild} disabled={building || !!errors.pkg || !!errors.version}>
                  {building ? (
                    <>
                      <Spinner /> Balím do .deb…
                    </>
                  ) : buildState === "done" ? (
                    <>
                      {I.box()} Zabalit znovu
                    </>
                  ) : (
                    <>
                      {I.box()} Zabalit do .deb
                    </>
                  )}
                </button>
              </section>

              <section className="rev" style={{ animationDelay: "140ms" }}>
                <div className="mb-2 flex items-center justify-between">
                  <h2 className="font-mono text-[10px] font-medium tracking-[0.22em] text-dim uppercase">Průběh sestavení</h2>
                  <span className="font-mono text-[10px] text-dim">{logs.length > 0 ? `${logs.length} řádků` : "čeká se"}</span>
                </div>
                <div className="term">
                  <div className="flex items-center gap-1.5 border-b border-line bg-panel2 px-3 py-2">
                    <span className="h-2 w-2 rounded-full bg-[#3d4c63]" />
                    <span className="h-2 w-2 rounded-full bg-[#3d4c63]" />
                    <span className="h-2 w-2 rounded-full bg-[#3d4c63]" />
                    <span className="ml-2 font-mono text-[10.5px] text-dim">dpkg-deb · build.log</span>
                    {building && (
                      <span className="ml-auto font-mono text-[10px] text-amb" style={{ animation: "blink 1s steps(1) infinite" }}>
                        ▍běží
                      </span>
                    )}
                  </div>
                  <div ref={termRef} className="h-44 overflow-y-auto px-3 py-2.5">
                    {logs.length === 0 ? (
                      <p className="font-mono text-[11px] leading-relaxed text-dim">
                        # Zmáčkni „Zabalit do .deb“ — celý balíček
                        <br /># (ar + control.tar.gz + data.tar.gz) vznikne
                        <br /># tady v prohlížeči a půjde rovnou stáhnout.
                      </p>
                    ) : (
                      logs.map((l, i) => (
                        <div
                          key={i}
                          className={`term-line ${
                            l.kind === "ok" ? "text-grn" : l.kind === "cmd" ? "text-cy" : l.kind === "dim" ? "text-mut" : "text-ink/85"
                          }`}
                        >
                          {l.text}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </section>

              {result && buildState === "done" && (
                <section className="pop rounded-xl border border-[#2c4a3a] bg-[#0a1510] p-4">
                  <div className="flex items-center gap-2 text-grn">
                    {I.check()}
                    <span className="font-disp text-[14px] font-bold tracking-wide">Balíček sestaven</span>
                    <span className="ml-auto font-mono text-[11px] text-mut">{fmtKiB(result.size)}</span>
                  </div>
                  <div className="mt-3 flex items-center gap-2 rounded-lg border border-line bg-[#05080f] px-3 py-2.5">
                    {I.box("#59d98c")}
                    <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-ink">{result.fileName}</span>
                  </div>
                  <a href={result.url} download={result.fileName} className="btn btn-primary mt-3 w-full py-3 text-[14px]">
                    {I.down()} Stáhnout {fmtKiB(result.size)}
                  </a>
                  <div className="mt-3 flex flex-col gap-1.5">
                    {[
                      ["sha256", result.sha256],
                      ["md5", result.md5],
                    ].map(([label, val]) => (
                      <button key={label} onClick={() => onCopy(val, `${label} zkopírováno`)} className="group flex items-center gap-2 rounded-md px-1 py-0.5 text-left transition-colors hover:bg-white/[0.04]" title="Klikni pro zkopírování">
                        <span className="w-12 shrink-0 font-mono text-[10px] tracking-wider text-dim uppercase">{label}</span>
                        <span className="min-w-0 flex-1 truncate font-mono text-[10.5px] text-mut group-hover:text-ink">{val}</span>
                        <span className="text-dim opacity-0 transition-opacity group-hover:opacity-100">{I.copy()}</span>
                      </button>
                    ))}
                    <div className="flex items-center gap-2 px-1 pt-1 font-mono text-[10.5px] text-dim">
                      <span>data {fmtKiB(result.dataSize)} → {fmtKiB(result.dataGz)} gzip</span>
                      <span className="text-line">|</span>
                      <span>control {fmtKiB(result.controlSize)} → {fmtKiB(result.controlGz)}</span>
                    </div>
                  </div>
                </section>
              )}
            </div>
          )}

          {/* ============ TAB: OBSAH ============ */}
          {tab === "files" && (
            <div className="flex h-full min-h-[420px] flex-col gap-4">
              {!result ? (
                <div className="rev flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-line px-6 py-14 text-center">
                  <span className="text-dim">{I.folder("#55677e")}</span>
                  <p className="mt-4 font-disp text-[15px] font-bold text-ink/80">Zatím není co prohlížet</p>
                  <p className="mt-1.5 max-w-[260px] font-mono text-[11.5px] leading-relaxed text-mut">
                    Napřed balíček zabal — pak tady uvidíš celý strom data.tar.gz včetně náhledů souborů.
                  </p>
                </div>
              ) : (
                <>
                  <section className="rev">
                    <h2 className="mb-2 font-mono text-[10px] font-medium tracking-[0.22em] text-dim uppercase">data.tar.gz · {result.files.length} souborů</h2>
                    <ul className="overflow-hidden rounded-lg border border-line">
                      {result.files.map((f, i) => (
                        <li key={f.path}>
                          <button
                            onClick={() => setSelFile(f.path)}
                            className={`rev flex w-full items-center gap-2.5 border-l-2 px-3 py-2 text-left transition-colors ${
                              selFile === f.path ? "border-crimson bg-panel2" : "border-transparent bg-inset hover:bg-panel2"
                            } ${i > 0 ? "border-t border-t-line" : ""}`}
                            style={{ animationDelay: `${i * 45}ms` }}
                          >
                            <span className={selFile === f.path ? "text-crimson2" : "text-dim"}>{I.file()}</span>
                            <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-ink/85">{f.path}</span>
                            <span className="shrink-0 font-mono text-[10px] text-dim">{f.mode}</span>
                            <span className="w-16 shrink-0 text-right font-mono text-[10.5px] text-mut">{fmtKiB(f.size)}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </section>
                  {selected && (
                    <section className="rev flex min-h-0 flex-1 flex-col" style={{ animationDelay: "120ms" }}>
                      <div className="flex items-center gap-2 rounded-t-lg border border-b-0 border-line bg-panel2 px-3 py-2">
                        <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-cy">{selected.path}</span>
                        <span className="font-mono text-[10px] text-dim">{fmtKiB(selected.size)}</span>
                        <button onClick={() => onCopy(selected.preview, "Soubor zkopírován")} className="rounded-md border border-line p-1 text-mut transition-colors hover:border-[#3a5580] hover:text-ink" title="Zkopírovat obsah">
                          {I.copy()}
                        </button>
                      </div>
                      <pre className="max-h-72 min-h-0 flex-1 overflow-auto rounded-b-lg border border-line bg-[#05080f] p-3 font-mono text-[10.5px] leading-relaxed whitespace-pre text-ink/75">
                        {selected.preview}
                      </pre>
                    </section>
                  )}
                </>
              )}
            </div>
          )}

          {/* ============ TAB: INSTALACE ============ */}
          {tab === "install" && (
            <div className="flex flex-col gap-5">
              <section className="rev">
                <h2 className="mb-3 font-mono text-[10px] font-medium tracking-[0.22em] text-dim uppercase">Na cílovém stroji</h2>
                <div className="flex flex-col gap-4">
                  {[
                    { n: "1", t: "Nainstaluj balíček", c: `sudo dpkg -i ${debName}` },
                    { n: "2", t: "Spusť aplikaci", c: meta.pkg },
                    { n: "3", t: "Případně odstraň", c: `sudo dpkg -r ${meta.pkg}` },
                  ].map((s, i) => (
                    <div key={s.n} className="rev" style={{ animationDelay: `${i * 80}ms` }}>
                      <div className="mb-1.5 flex items-center gap-2.5">
                        <span className="flex h-5 w-5 items-center justify-center rounded-full border border-crimson/50 bg-crimson/10 font-mono text-[10px] font-bold text-crimson2">{s.n}</span>
                        <span className="font-disp text-[13.5px] font-bold tracking-wide text-ink/90">{s.t}</span>
                      </div>
                      <Cmd text={s.c} onCopy={onCopy} />
                    </div>
                  ))}
                </div>
              </section>

              <section className="rev rounded-xl border border-line bg-inset p-4" style={{ animationDelay: "220ms" }}>
                <h3 className="font-disp text-[13px] font-bold tracking-wide text-ink/90">Co instalace provede</h3>
                <ul className="mt-2.5 flex flex-col gap-2 font-mono text-[11.5px] leading-relaxed text-mut">
                  <li className="flex gap-2"><span className="text-crimson2">→</span> /opt/{meta.pkg}/ — aplikace + Three.js (offline)</li>
                  <li className="flex gap-2"><span className="text-crimson2">→</span> /usr/share/applications/ — položka do nabídky</li>
                  <li className="flex gap-2"><span className="text-crimson2">→</span> /usr/share/icons/ — SVG ikona planety</li>
                  <li className="flex gap-2"><span className="text-crimson2">→</span> postinst/postrm — aktualizace databáze nabídek</li>
                </ul>
                <p className="mt-3 border-t border-line pt-3 font-mono text-[11px] leading-relaxed text-dim">
                  Závislosti: prohlížeč + <span className="text-mut">xdg-utils</span> (dpkg dořeší). Textury terénu se dotahují z internetu; bez něj běží záložní vzhled.
                </p>
              </section>

              <section className="rev" style={{ animationDelay: "290ms" }}>
                <h2 className="mb-2.5 font-mono text-[10px] font-medium tracking-[0.22em] text-dim uppercase">Anatomie .deb souboru</h2>
                <div className="overflow-hidden rounded-xl border border-line">
                  <svg viewBox="0 0 380 132" className="block w-full" role="img" aria-label="Struktura deb souboru">
                    <rect width="380" height="132" fill="#05080f" />
                    <rect x="12" y="12" width="356" height="108" rx="8" fill="none" stroke="#24365255" strokeDasharray="4 4" />
                    <text x="190" y="30" textAnchor="middle" fill="#7e91a8" fontFamily="JetBrains Mono, monospace" fontSize="10">
                      ar archiv — {debName}
                    </text>
                    <g fontFamily="JetBrains Mono, monospace" fontSize="10.5">
                      <rect x="26" y="44" width="100" height="60" rx="6" fill="#0d1524" stroke="#1b2940" />
                      <text x="76" y="68" textAnchor="middle" fill="#5cb8ff">debian-binary</text>
                      <text x="76" y="86" textAnchor="middle" fill="#55677e" fontSize="9">"2.0"</text>
                      <rect x="140" y="44" width="104" height="60" rx="6" fill="#0d1524" stroke="#1b2940" />
                      <text x="192" y="62" textAnchor="middle" fill="#ffb454">control.tar.gz</text>
                      <text x="192" y="80" textAnchor="middle" fill="#55677e" fontSize="9">control · md5sums</text>
                      <text x="192" y="93" textAnchor="middle" fill="#55677e" fontSize="9">postinst · postrm</text>
                      <rect x="258" y="44" width="96" height="60" rx="6" fill="#0d1524" stroke="#e14b5a55" />
                      <text x="306" y="62" textAnchor="middle" fill="#f0636f">data.tar.gz</text>
                      <text x="306" y="80" textAnchor="middle" fill="#55677e" fontSize="9">aplikace + vendor</text>
                      <text x="306" y="93" textAnchor="middle" fill="#55677e" fontSize="9">.desktop · ikona</text>
                    </g>
                  </svg>
                </div>
                <p className="mt-2.5 font-mono text-[11px] leading-relaxed text-dim">
                  Všechny tři části sestaví tato stránka přímo v prohlížeči — nikam se nic nenahrává.
                </p>
              </section>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
