import { useEffect, useMemo, useRef, useState } from "react";
import EarthScene from "./components/EarthScene";
import type { SceneApi, SceneStatus } from "./components/EarthScene";
import Panel from "./components/Panel";
import type { BuildResult, BuildState, LogLine } from "./components/Panel";
import { buildDeb, sha256Hex } from "./deb/buildDeb";
import type { DebMeta } from "./deb/buildDeb";

interface Toast {
  id: number;
  msg: string;
}

const fmtKiB = (n: number) => (n / 1024).toFixed(1).replace(".", ",") + " KiB";

const Logo = () => (
  <svg width="34" height="34" viewBox="0 0 32 32" aria-hidden>
    <circle cx="16" cy="16" r="9" fill="none" stroke="#5cb8ff" strokeWidth="1.6" />
    <path d="M10.5 13c2.8-2 6.5.6 4.8 3.6s-6 2.4-6.8-.4.2-2 2-3.2z" fill="#59d98c" opacity="0.85" />
    <path d="M17 19.5c1.6-.8 3.8-.2 3.6 1.4s-2.6 2.4-4 1.4-1.2-2 .4-2.8z" fill="#59d98c" opacity="0.7" />
    <ellipse cx="16" cy="16" rx="14" ry="5.1" fill="none" stroke="#e14b5a" strokeWidth="1.3" transform="rotate(-18 16 16)" />
    <circle cx="27.6" cy="11.2" r="1.9" fill="#e14b5a" />
  </svg>
);

const SunDial = ({ deg }: { deg: number }) => {
  const rad = (deg * Math.PI) / 180;
  const sx = 24 + 16.5 * Math.cos(rad);
  const sy = 24 + 16.5 * Math.sin(rad);
  const mx = 24 - 16.5 * Math.cos(rad);
  const my = 24 - 16.5 * Math.sin(rad);
  return (
    <svg width="48" height="48" viewBox="0 0 48 48" aria-hidden>
      <circle cx="24" cy="24" r="16.5" fill="none" stroke="#24365299" strokeWidth="1" strokeDasharray="2 4" />
      <line x1="24" y1="5" x2="24" y2="43" stroke="#24365277" strokeWidth="1" />
      <circle cx={mx} cy={my} r="3" fill="#31435f" />
      <circle cx={sx} cy={sy} r="4.2" fill="#ffb454" />
      <circle cx={sx} cy={sy} r="7" fill="#ffb45433" />
      <circle cx="24" cy="24" r="2" fill="#5cb8ff" />
    </svg>
  );
};

export default function App() {
  const [meta, setMeta] = useState<DebMeta>({
    pkg: "zeme-den-noc",
    version: "1.0.0",
    arch: "all",
    maintainer: "Tvůrce Země <zeme@localhost>",
  });
  const [buildState, setBuildState] = useState<BuildState>("idle");
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [result, setResult] = useState<BuildResult | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [status, setStatus] = useState<SceneStatus>({
    fps: 0,
    texLoaded: 0,
    texTotal: 3,
    texDone: false,
    fallback: false,
    rotation: true,
    sunDeg: 63,
  });
  const [fatal, setFatal] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(() => typeof window === "undefined" || window.innerWidth >= 1024);
  const [clock, setClock] = useState("--:--:--");

  const apiRef = useRef<SceneApi | null>(null);
  const urlRef = useRef<string | null>(null);
  const toastId = useRef(0);

  const toast = (msg: string) => {
    const id = ++toastId.current;
    setToasts((t) => [...t.slice(-3), { id, msg }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2600);
  };

  const copy = async (text: string, label = "Zkopírováno do schránky") => {
    try {
      await navigator.clipboard.writeText(text);
      toast(label);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
        toast(label);
      } catch {
        toast("Kopírování se nepovedlo");
      }
      document.body.removeChild(ta);
    }
  };

  useEffect(() => {
    const t = window.setInterval(() => {
      const d = new Date();
      const p = (n: number) => String(n).padStart(2, "0");
      setClock(`${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`);
    }, 1000);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    return () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, []);

  const errors = useMemo(() => {
    const e: { pkg?: string; version?: string } = {};
    if (!/^[a-z0-9][a-z0-9.+-]*$/.test(meta.pkg)) e.pkg = "malá písmena, číslice, znaky + - .";
    if (!/^[A-Za-z0-9][A-Za-z0-9.+~-]*$/.test(meta.version)) e.version = "neplatné číslo verze";
    return e;
  }, [meta.pkg, meta.version]);

  const handleBuild = async () => {
    if (buildState === "building" || errors.pkg || errors.version) return;
    setBuildState("building");
    setLogs([]);
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
    const safeMeta: DebMeta = {
      ...meta,
      maintainer: meta.maintainer.trim() || "Tvůrce Země <zeme@localhost>",
    };
    try {
      const res = await buildDeb(safeMeta, (text, kind) => {
        setLogs((prev) => [...prev, { text, kind: kind ?? "plain" }]);
      });
      const sha = await sha256Hex(res.bytes);
      const blob = new Blob([res.bytes.buffer as ArrayBuffer], { type: "application/vnd.debian.binary-package" });
      const url = URL.createObjectURL(blob);
      urlRef.current = url;
      setResult({ ...res, sha256: sha, url });
      setBuildState("done");
      toast(`Hotovo: ${res.fileName} (${fmtKiB(res.size)})`);
    } catch (err) {
      setLogs((prev) => [...prev, { text: `✗ chyba: ${err instanceof Error ? err.message : String(err)}`, kind: "plain" }]);
      setBuildState("error");
      toast("Sestavení balíčku selhalo");
    }
  };

  const texLabel = status.texDone
    ? status.fallback
      ? "textury: záložní"
      : "textury: kompletní"
    : `textury ${status.texLoaded}/${status.texTotal}`;

  return (
    <div className="flex h-full flex-col">
      {/* ================= HLAVIČKA ================= */}
      <header className="relative z-20 flex h-14 shrink-0 items-center gap-3 border-b border-line bg-panel px-4">
        <Logo />
        <div className="min-w-0 leading-none">
          <h1 className="font-disp text-[17px] font-bold tracking-wide">
            ZEMĚ <span className="text-crimson2">→</span> <span className="text-cy">.deb</span>
          </h1>
          <p className="mt-1 hidden font-mono text-[10px] tracking-wider text-dim sm:block">
            dpkg-deb v prohlížeči · den a noc · Three.js r160
          </p>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <span className="hidden items-center gap-2 font-mono text-[10.5px] text-mut md:flex">
            <span className={`led ${buildState === "building" ? "led-amb" : ""}`} />
            {buildState === "building" ? "sestavuji" : buildState === "done" ? "balíček hotov" : "připraven"}
          </span>
          <span className="chip hidden sm:inline-flex">
            three <span className="text-cy">r160</span>
          </span>
          <button className="btn btn-ghost px-3 py-1.5 text-[12px] lg:hidden" onClick={() => setPanelOpen((o) => !o)}>
            {panelOpen ? "Skrýt" : "Balíček"}
          </button>
        </div>
      </header>

      {/* ================= TĚLO ================= */}
      <div className="flex min-h-0 flex-1">
        {/* --- plátno se Zemí --- */}
        <main className="relative min-w-0 flex-1 overflow-hidden">
          <EarthScene
            onStatus={setStatus}
            onToast={toast}
            onFatal={setFatal}
            apiRef={apiRef}
          />
          <div className="pointer-events-none absolute inset-0 grid-overlay" />
          <div className="pointer-events-none absolute inset-0 vignette" />

          {/* HUD — horní levý sloupec */}
          <div className="absolute top-3 left-3 z-10 flex flex-col items-start gap-2">
            <div className="flex flex-wrap gap-2">
              <span className="chip">
                <span className={`h-1.5 w-1.5 rounded-full ${status.fps > 0 ? "bg-grn" : "bg-dim"}`} />
                {status.fps > 0 ? `${status.fps} fps` : "…"}
              </span>
              <span className="chip">{texLabel}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <button className="chip" onClick={() => apiRef.current?.setRotation(!status.rotation)}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12a9 9 0 1 1-3-6.7" />
                  <path d="M21 3v6h-6" />
                </svg>
                rotace: {status.rotation ? "zap" : "pauza"}
              </button>
              <button className="chip" onClick={() => apiRef.current?.resetView()}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3.5" />
                  <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
                </svg>
                výchozí pohled
              </button>
            </div>
          </div>

          {/* HUD — sluneční ciferník */}
          <div className="absolute top-3 right-3 z-10 hidden items-center gap-2 sm:flex">
            <div className="text-right">
              <p className="font-mono text-[10px] tracking-wider text-dim uppercase">slunce</p>
              <p className="font-mono text-[12px] text-amb">{Math.round(status.sunDeg)}°</p>
            </div>
            <SunDial deg={status.sunDeg} />
          </div>

          {/* nápověda */}
          <div className="pointer-events-none absolute bottom-3 left-3 z-10 hidden items-center gap-2 font-mono text-[11px] text-mut/80 md:flex">
            táhni — otáčení <span className="text-dim">·</span> kolečko — zoom <span className="text-dim">·</span>
            <span className="kbd">mezerník</span> pauza rotace
          </div>

          {/* podpis scény */}
          <div className="pointer-events-none absolute right-3 bottom-3 z-10 hidden text-right font-mono text-[10px] leading-relaxed text-dim lg:block">
            terminátor · města · atmosféra
            <br />
            sféra 96×96 · ACES filmic
          </div>

          {/* závoj načítání / fatální chyba */}
          <div
            className={`absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-bg/70 backdrop-blur-[3px] transition-opacity duration-700 ${
              !status.texDone || fatal ? "opacity-100" : "pointer-events-none opacity-0"
            }`}
          >
            {fatal ? (
              <p className="max-w-sm px-6 text-center font-mono text-[13px] leading-relaxed text-crimson2">{fatal}</p>
            ) : (
              <>
                <p className="font-disp text-[15px] font-bold tracking-wide text-ink/90">Načítá se Země…</p>
                <div className="h-[3px] w-56 overflow-hidden rounded-full bg-line/60">
                  <div
                    className="stripes-anim h-full rounded-full bg-cy transition-all duration-500"
                    style={{ width: `${Math.max(6, (status.texLoaded / status.texTotal) * 100)}%` }}
                  />
                </div>
                <p className="font-mono text-[10.5px] text-dim">
                  textury {status.texLoaded}/{status.texTotal} · den · noc · mraky
                </p>
              </>
            )}
          </div>
        </main>

        {/* --- pravý panel --- */}
        <Panel
          meta={meta}
          onMeta={setMeta}
          errors={errors}
          buildState={buildState}
          logs={logs}
          onBuild={handleBuild}
          result={result}
          onCopy={copy}
          open={panelOpen}
          onClose={() => setPanelOpen(false)}
        />
      </div>

      {/* ================= STAVOVÁ LIŠTA ================= */}
      <footer className="z-20 flex h-8 shrink-0 items-center gap-4 overflow-hidden border-t border-line bg-panel px-4 font-mono text-[10.5px] text-dim">
        <span className="hidden md:inline">three r160 · WebGL · vlastní day/night shader</span>
        <span className="hidden sm:inline text-line">|</span>
        <span className="truncate">
          {result ? (
            <>
              poslední build: <span className="text-grn">{result.fileName}</span> · {fmtKiB(result.size)}
            </>
          ) : (
            "žádný build — zatím jen obíháme"
          )}
        </span>
        <span className="ml-auto shrink-0 text-mut">
          UTC <span className="text-cy">{clock}</span>
        </span>
      </footer>

      {/* ================= TOASTY ================= */}
      <div className="pointer-events-none fixed bottom-12 left-4 z-50 flex flex-col gap-2">
        {toasts.map((t) => (
          <div key={t.id} className="pop rounded-lg border border-line bg-panel2/95 px-3.5 py-2 font-mono text-[12px] text-ink shadow-[0_8px_30px_-10px_rgba(0,0,0,0.8)] backdrop-blur-sm">
            {t.msg}
          </div>
        ))}
      </div>
    </div>
  );
}
