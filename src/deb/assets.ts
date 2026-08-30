/**
 * Obsah souborů, které putují do .deb balíčku.
 * APP_HTML je kompletní samostatná aplikace Země — importmap ukazuje na
 * ./vendor/, kam přibalujeme zdroje Three.js (balíček tedy běží offline).
 */

export interface DebMeta {
  pkg: string;
  version: string;
  arch: string;
  maintainer: string;
}

// ---------------------------------------------------------------------------
// Vestavěná aplikace (opt/<pkg>/index.html)
// ---------------------------------------------------------------------------
export const APP_HTML = `<!DOCTYPE html>
<html lang="cs">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="theme-color" content="#000000">
  <meta name="description" content="Interaktivní 3D Země — cyklus dne a noci, města na noční straně, atmosféra, hvězdy (Three.js)">
  <title>Země — den a noc</title>
  <style>
    html, body {
      width: 100%;
      height: 100%;
      margin: 0;
      overflow: hidden;
      background: #000;
    }

    #earth {
      position: fixed;
      inset: 0;
      cursor: grab;
    }

    #earth:active {
      cursor: grabbing;
    }

    canvas {
      display: block;
      width: 100%;
      height: 100%;
    }

    /* Načítací overlay — zmizí, až jsou textury hotové */
    #overlay {
      position: fixed;
      inset: 0;
      z-index: 20;
      background: #000;
      color: #dfe8f2;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 14px;
      font: 14px/1.5 system-ui, sans-serif;
      transition: opacity .7s ease;
    }
    #overlay.hidden { opacity: 0; pointer-events: none; }
    #overlay .bar {
      width: 240px;
      height: 3px;
      background: #16202c;
      border-radius: 2px;
      overflow: hidden;
    }
    #overlay .bar i {
      display: block;
      height: 100%;
      width: 0%;
      background: #4a9eff;
      transition: width .25s ease;
    }
    #overlay .err { color: #ff7d6b; max-width: 440px; text-align: center; padding: 0 16px; }

    /* Jemná nápověda v rohu */
    #hint {
      position: fixed;
      left: 14px;
      bottom: 12px;
      z-index: 5;
      color: #7f8fa3;
      font: 12px/1.4 system-ui, sans-serif;
      opacity: .75;
      pointer-events: none;
      user-select: none;
    }

    /* Toast s hláškou */
    #toast {
      position: fixed;
      left: 50%;
      bottom: 34px;
      transform: translateX(-50%);
      z-index: 15;
      background: rgba(20, 28, 38, .88);
      color: #dfe8f2;
      border: 1px solid #2a3a4d;
      border-radius: 8px;
      padding: 8px 14px;
      font: 13px system-ui, sans-serif;
      opacity: 0;
      transition: opacity .3s ease;
      pointer-events: none;
      white-space: nowrap;
    }
    #toast.show { opacity: 1; }
  </style>
</head>
<body>
  <main id="earth" aria-label="Interaktivní 3D planeta Země"></main>

  <div id="overlay">
    <div id="overlay-msg">Načítá se Země…</div>
    <div class="bar"><i id="overlay-bar"></i></div>
  </div>
  <div id="hint">Táhni myší — otáčení · kolečko — zoom · mezerník — pauza rotace</div>
  <div id="toast" role="status"></div>

  <script>
    // Watchdog: kdyby se 3D scéna z jakéhokoli důvodu nerozjela, dáme uživateli vědět.
    window.__earthBoot = setTimeout(function () {
      if (!window.__earthBooted) {
        var m = document.getElementById('overlay-msg');
        var b = document.querySelector('#overlay .bar');
        if (m) {
          m.textContent = 'Nepodařilo se inicializovat 3D scénu. Zkontroluj, že prohlížeč podporuje WebGL, a obnov stránku.';
          m.classList.add('err');
        }
        if (b) b.style.display = 'none';
      }
    }, 9000);
  </script>

  <script type="importmap">
  {
    "imports": {
      "three": "./vendor/three.module.js",
      "three/addons/": "./vendor/"
    }
  }
  </script>

  <script type="module">
    import * as THREE from 'three';
    import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

    // Modul běží — zruš boot watchdog
    window.__earthBooted = true;
    clearTimeout(window.__earthBoot);

    // ---------- DOM ----------
    const container = document.getElementById('earth');
    const overlay = document.getElementById('overlay');
    const overlayMsg = document.getElementById('overlay-msg');
    const overlayBar = document.getElementById('overlay-bar');
    const toastEl = document.getElementById('toast');

    let toastTimer = null;
    function toast(msg, ms = 2600) {
      toastEl.textContent = msg;
      toastEl.classList.add('show');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => toastEl.classList.remove('show'), ms);
    }

    function setOverlayError(text) {
      overlayMsg.textContent = text;
      overlayMsg.classList.add('err');
      document.querySelector('#overlay .bar').style.display = 'none';
    }

    function finishLoading() {
      overlay.classList.add('hidden');
      setTimeout(() => overlay.remove(), 900);
    }

    // ---------- renderer / scéna / kamera ----------
    let renderer;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 300);
    camera.position.set(0, 0.35, 3.1);

    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    } catch (e) {
      setOverlayError('WebGL není v tomto prohlížeči dostupné.');
      throw e;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.enablePan = false;
    controls.minDistance = 1.45;
    controls.maxDistance = 8;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.25;

    // ---------- Slunce ----------
    // sunDir sdílíme jako uniform shaderu i pozici DirectionalLight (pro mraky).
    const sunDir = new THREE.Vector3(1, 0.25, 0.4).normalize();
    const sunLight = new THREE.DirectionalLight(0xffffff, 2.0);
    sunLight.position.copy(sunDir).multiplyScalar(10);
    scene.add(sunLight);
    scene.add(new THREE.AmbientLight(0x33445f, 0.25)); // jen kvůli mrakům v noci

    // ---------- Záložní textury (když se obrázky z internetu nenačtou) ----------
    function makeFallback(kind) {
      const c = document.createElement('canvas');
      c.width = c.height = 4;
      const ctx = c.getContext('2d');
      ctx.fillStyle = kind === 'dayMap' ? '#1c3f6e' : '#020308';
      ctx.fillRect(0, 0, 4, 4);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    }

    // ---------- Země: vlastní day/night shader ----------
    const earthUniforms = {
      dayMap:   { value: makeFallback('dayMap') },
      nightMap: { value: makeFallback('nightMap') },
      sunDir:   { value: sunDir },
    };

    const earthMaterial = new THREE.ShaderMaterial({
      uniforms: earthUniforms,
      vertexShader: /* glsl */\`
        varying vec2 vUv;
        varying vec3 vNormalW;
        varying vec3 vPosW;
        void main() {
          vUv = uv;
          vNormalW = normalize(mat3(modelMatrix) * normal);
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vPosW = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      \`,
      fragmentShader: /* glsl */\`
        uniform sampler2D dayMap;
        uniform sampler2D nightMap;
        uniform vec3 sunDir;
        varying vec2 vUv;
        varying vec3 vNormalW;
        varying vec3 vPosW;

        void main() {
          vec3 n = normalize(vNormalW);
          vec3 viewDir = normalize(cameraPosition - vPosW);
          float sd = dot(n, sunDir);

          vec3 day = texture2D(dayMap, vUv).rgb;
          vec3 nightTex = texture2D(nightMap, vUv).rgb;

          // Den: jemné lambertovské stínování
          float lambert = clamp(sd, 0.0, 1.0);
          vec3 dayCol = day * (0.16 + 1.05 * pow(lambert, 0.75));

          // Noc: města v teplé barvě + velmi slabé modré ambientní světlo
          vec3 city = nightTex * vec3(1.0, 0.82, 0.55) * 2.2;
          vec3 nightCol = city + day * vec3(0.030, 0.045, 0.085);

          // Mix dne a noci přes terminátor
          float dayMix = smoothstep(-0.10, 0.25, sd);
          vec3 color = mix(nightCol, dayCol, dayMix);

          // Oranžový pás soumraku kolem terminátoru
          float tw = exp(-pow(sd / 0.085, 2.0));
          color += vec3(1.0, 0.42, 0.16) * tw * 0.22 * day;

          // Fresnel: modrý nádech vzduchu na okraji disku
          float fres = pow(1.0 - clamp(dot(viewDir, n), 0.0, 1.0), 2.6);
          color += vec3(0.18, 0.42, 0.95) * fres * (0.08 + 0.38 * dayMix);

          gl_FragColor = vec4(color, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      \`,
    });

    // 96×96 segmentů bohatě stačí (původních 256×256 = 131k trojúhelníků zbytečně)
    const earth = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 96), earthMaterial);
    scene.add(earth);

    // ---------- Mraky ----------
    const clouds = new THREE.Mesh(
      new THREE.SphereGeometry(1.012, 96, 64),
      new THREE.MeshLambertMaterial({ transparent: true, opacity: 0.85, depthWrite: false })
    );
    clouds.visible = false; // zobrazí se, až se načte textura
    clouds.renderOrder = 1;
    scene.add(clouds);

    // ---------- Atmosféra: Fresnelova záře na okraji (BackSide trik) ----------
    const atmosphereMaterial = new THREE.ShaderMaterial({
      uniforms: { sunDir: { value: sunDir } },
      vertexShader: /* glsl */\`
        varying vec3 vNormalV;
        varying vec3 vNormalW;
        void main() {
          vNormalV = normalize(normalMatrix * normal);
          vNormalW = normalize(mat3(modelMatrix) * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      \`,
      fragmentShader: /* glsl */\`
        uniform vec3 sunDir;
        varying vec3 vNormalV;
        varying vec3 vNormalW;
        void main() {
          // 1 hluboko za planetou (u okraje Země), 0 na vnějším siluetě
          float rim = clamp(-vNormalV.z, 0.0, 1.0);
          float intensity = pow(rim, 1.9) * 1.5;

          // Denní strana — straně Slunce září víc
          float sunFacing = 0.5 + 0.5 * dot(normalize(vNormalW), sunDir);
          vec3 col = mix(vec3(0.10, 0.28, 0.85), vec3(0.38, 0.62, 1.0), sunFacing);

          gl_FragColor = vec4(col * intensity * (0.25 + 0.85 * sunFacing), 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      \`,
      side: THREE.BackSide,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const atmosphere = new THREE.Mesh(new THREE.SphereGeometry(1.16, 64, 64), atmosphereMaterial);
    atmosphere.renderOrder = 2;
    scene.add(atmosphere);

    // ---------- Hvězdy (proceduální, offline-safe) ----------
    function makeStars(count, size, brightness) {
      const pos = new Float32Array(count * 3);
      const col = new Float32Array(count * 3);
      const c = new THREE.Color();
      for (let i = 0; i < count; i++) {
        // rovnoměrné rozprostření na sférické slupce
        const u = Math.random() * 2 - 1;
        const phi = Math.random() * Math.PI * 2;
        const r = 60 + Math.random() * 40;
        const s = Math.sqrt(1 - u * u);
        pos[i * 3]     = r * s * Math.cos(phi);
        pos[i * 3 + 1] = r * u;
        pos[i * 3 + 2] = r * s * Math.sin(phi);
        // většina modrobílá, ~12 % teplých
        const warm = Math.random() < 0.12;
        c.setHSL(warm ? 0.08 : 0.58 + Math.random() * 0.08, warm ? 0.5 : 0.25,
                 brightness * (0.55 + Math.random() * 0.45));
        col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      const m = new THREE.PointsMaterial({
        size, sizeAttenuation: false, vertexColors: true,
        transparent: true, opacity: 0.9, depthWrite: false,
      });
      return new THREE.Points(g, m);
    }
    const starsDim    = makeStars(1400, 1.8, 0.70);
    const starsBright = makeStars(200,  3.0, 1.00);
    scene.add(starsDim, starsBright);

    // ---------- Načtení textur s progress barem a fallbackem ----------
    const TEX_BASE = 'https://unpkg.com/three-globe/example/img/';
    const loader = new THREE.TextureLoader();
    loader.crossOrigin = 'anonymous';

    const TEX_TOTAL = 3; // den, noc, mraky
    let settled = 0;
    let warnedFallback = false;
    let allSettled = false;

    function settle() {
      settled++;
      overlayBar.style.width = Math.round((settled / TEX_TOTAL) * 100) + '%';
      if (settled === TEX_TOTAL) {
        allSettled = true;
        finishLoading();
      }
    }

    function prepTex(t) {
      t.anisotropy = renderer.capabilities.getMaxAnisotropy();
      t.colorSpace = THREE.SRGBColorSpace;
    }

    function loadEarthTex(key, url) {
      loader.load(
        url,
        (t) => { prepTex(t); earthUniforms[key].value = t; settle(); },
        undefined,
        () => {
          // fallback už je přiřazen — jen upozorníme
          if (!warnedFallback) {
            warnedFallback = true;
            toast('Textury se nepodařilo načíst — běží záložní vzhled.', 5000);
          }
          settle();
        }
      );
    }
    loadEarthTex('dayMap', TEX_BASE + 'earth-blue-marble.jpg');
    loadEarthTex('nightMap', TEX_BASE + 'earth-night.jpg');

    loader.load(
      TEX_BASE + 'clouds.png',
      (t) => {
        prepTex(t);
        clouds.material.map = t;
        clouds.material.needsUpdate = true;
        clouds.visible = true;
        settle();
      },
      undefined,
      () => { clouds.visible = false; settle(); } // bez mraků to neurazí
    );

    // Pomalé načítání — jemně upozorníme, scéna mezitím běží na fallbacku
    setTimeout(() => {
      if (!allSettled) toast('Textury se načítají dlouho — mezitím běží záložní vzhled.', 5000);
    }, 20000);

    // ---------- Resize ----------
    function resize() {
      const w = window.innerWidth;
      const h = window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
    }
    window.addEventListener('resize', resize, { passive: true });
    resize();

    // ---------- Ovládání ----------
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault();
        controls.autoRotate = !controls.autoRotate;
        toast(controls.autoRotate ? 'Rotace spuštěna' : 'Rotace pozastavena', 1600);
      }
    }, { passive: false });

    // Pauza renderu, když je tab skrytý — šetří baterii
    let running = true;
    document.addEventListener('visibilitychange', () => { running = !document.hidden; }, { passive: true });

    // ---------- Smyčka ----------
    const clock = new THREE.Clock();
    let sunAngle = Math.PI * 0.35;

    function loop() {
      requestAnimationFrame(loop);
      const dt = Math.min(clock.getDelta(), 0.05); // po návratu do tabu žádný skok
      if (!running) return;

      // Cyklus dne a noci (~2,6 min na oběh)
      sunAngle += dt * 0.04;
      sunDir.set(Math.cos(sunAngle), 0.25, Math.sin(sunAngle)).normalize();
      sunLight.position.copy(sunDir).multiplyScalar(10);

      // Země se pomalu točí, mraky o chlup rychleji (drift)
      earth.rotation.y += dt * 0.003;
      clouds.rotation.y += dt * 0.005;
      starsDim.rotation.y += dt * 0.0006;
      starsBright.rotation.y += dt * 0.0006;

      controls.update();
      renderer.render(scene, camera);
    }
    loop();
  </script>
</body>
</html>
`;

// ---------------------------------------------------------------------------
// Spouštěč (opt/<pkg>/<pkg>, 0755)
// ---------------------------------------------------------------------------
export function launcherScript(pkg: string): string {
  return `#!/bin/sh
# Spouštěč aplikace ${pkg} (nainstalováno do /opt/${pkg})
APP_DIR="/opt/${pkg}"
URL="file://$APP_DIR/index.html"

for opener in xdg-open sensible-browser gnome-open kde-open; do
  if command -v "$opener" >/dev/null 2>&1; then
    exec "$opener" "$URL"
  fi
done

echo "${pkg}: nebyl nalezen žádný prohlížeč." >&2
echo "Nainstaluj xdg-utils nebo spusť: \$BROWSER '$APP_DIR/index.html'" >&2
exit 1
`;
}

// ---------------------------------------------------------------------------
// Položka do nabídky aplikací (usr/share/applications/<pkg>.desktop)
// ---------------------------------------------------------------------------
export function desktopEntry(pkg: string): string {
  return `[Desktop Entry]
Type=Application
Version=1.0
Name=Země — den a noc
Name[en]=Earth — Day & Night
GenericName=Interaktivní 3D planeta
Comment=Interaktivní 3D Země s cyklem dne a noci, nočními městy a atmosférou (Three.js)
Comment[en]=Interactive 3D Earth with day/night cycle, city lights and atmosphere (Three.js)
Exec=/opt/${pkg}/${pkg}
Icon=${pkg}
Terminal=false
Categories=Education;Science;Geography;
Keywords=Země;planeta;3D;Three.js;den;noc;
StartupNotify=false
`;
}

// ---------------------------------------------------------------------------
// SVG ikona (usr/share/icons/hicolor/scalable/apps/<pkg>.svg)
// ---------------------------------------------------------------------------
export function iconSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  <defs>
    <radialGradient id="ocean" cx="38%" cy="35%" r="80%">
      <stop offset="0%" stop-color="#2e7cd6"/>
      <stop offset="100%" stop-color="#0d2f63"/>
    </radialGradient>
    <linearGradient id="night" x1="0" y1="0" x2="1" y2="0">
      <stop offset="52%" stop-color="#04101f" stop-opacity="0"/>
      <stop offset="100%" stop-color="#04101f" stop-opacity="0.93"/>
    </linearGradient>
  </defs>
  <circle cx="32" cy="32" r="26" fill="url(#ocean)"/>
  <path d="M17 21c5-4 11-3 13 1s-3 6-7 7-8 4-9-1 0-5 3-7z" fill="#3fa46a"/>
  <path d="M35 38c4-2 10-1 10 3s-5 7-10 6-6-7 0-9z" fill="#3fa46a"/>
  <path d="M21 44c2-2 5-2 6 0s-1 4-3 4-4-2-3-4z" fill="#3fa46a"/>
  <circle cx="32" cy="32" r="26" fill="url(#night)"/>
  <circle cx="46" cy="25" r="0.9" fill="#ffd27d"/>
  <circle cx="50" cy="33" r="0.9" fill="#ffd27d"/>
  <circle cx="45" cy="41" r="0.9" fill="#ffd27d"/>
  <circle cx="32" cy="32" r="26" fill="none" stroke="#7cc4ff" stroke-opacity="0.55" stroke-width="1.6"/>
  <ellipse cx="32" cy="32" rx="30" ry="11" fill="none" stroke="#e14b5a" stroke-width="1.5" transform="rotate(-20 32 32)"/>
  <circle cx="52" cy="15" r="2.4" fill="#e14b5a"/>
</svg>
`;
}

// ---------------------------------------------------------------------------
// Členové control.tar.gz
// ---------------------------------------------------------------------------
export function controlFile(meta: DebMeta, installedKiB: number): string {
  return `Package: ${meta.pkg}
Version: ${meta.version}
Architecture: ${meta.arch}
Maintainer: ${meta.maintainer}
Installed-Size: ${installedKiB}
Depends: xdg-utils | sensible-utils
Section: web
Priority: optional
Description: Interaktivní 3D Země — cyklus dne a noci (Three.js)
 Samostatná webová aplikace zabalená jako Debian balíček. Po instalaci
 se spouští příkazem \`${meta.pkg}\` nebo z nabídky aplikací.
 .
 Obsahuje 3D scénu planety Země s cyklem dne a noci, svítícími městy
 na noční straně, atmosférou a hvězdami. Three.js je vložen přímo
 v balíčku — aplikace běží i bez připojení k internetu.
`;
}

export function postinstScript(pkg: string): string {
  return `#!/bin/sh
set -e

chmod 0755 /opt/${pkg}/${pkg} 2>/dev/null || true

if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database -q /usr/share/applications 2>/dev/null || true
fi

#echo "${pkg}: nainstalováno — spusť příkazem '${pkg}'."
exit 0
`;
}

export function postrmScript(): string {
  return `#!/bin/sh
set -e

if [ "$1" = "remove" ] || [ "$1" = "purge" ]; then
  if command -v update-desktop-database >/dev/null 2>&1; then
    update-desktop-database -q /usr/share/applications 2>/dev/null || true
  fi
fi

exit 0
`;
}
