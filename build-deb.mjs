/**
 * Skript pro vytvoření skutečného .deb souboru pomocí systémových nástrojů
 */
import { writeFileSync, mkdirSync, rmSync, readFileSync } from "fs";
import { execSync } from "child_process";
import { createHash } from "crypto";

// Konfigurace balíčku
const PKG_NAME = "zeme";
const VERSION = "1.0.0";
const ARCH = "all";
const MAINTAINER = "Developer <dev@example.com>";

console.log(`📦 Vytvářím .deb balíček: ${PKG_NAME}_${VERSION}_${ARCH}.deb`);

// Vyčistit předchozí build
const BUILD_DIR = "/tmp/deb-build";
const OUTPUT_DEB = `/workspace/${PKG_NAME}_${VERSION}_${ARCH}.deb`;

try { rmSync(BUILD_DIR, { recursive: true, force: true }); } catch {}
try { rmSync(OUTPUT_DEB, { force: true }); } catch {}

mkdirSync(BUILD_DIR, { recursive: true });

// Struktura adresářů
const OPT_DIR = `${BUILD_DIR}/opt/${PKG_NAME}`;
const CONTROL_DIR = `${BUILD_DIR}/DEBIAN`;
const USR_SHARE_APP = `${BUILD_DIR}/usr/share/applications`;
const USR_SHARE_ICONS = `${BUILD_DIR}/usr/share/icons/hicolor/scalable/apps`;

mkdirSync(OPT_DIR, { recursive: true });
mkdirSync(CONTROL_DIR, { recursive: true });
mkdirSync(USR_SHARE_APP, { recursive: true });
mkdirSync(USR_SHARE_ICONS, { recursive: true });

console.log("📁 Příprava adresářové struktury...");

// Načtení Three.js zdrojů
const THREE_SOURCE_PATH = "/workspace/node_modules/three/build/three.module.js";
const ORBIT_SOURCE_PATH = "/workspace/node_modules/three/examples/jsm/controls/OrbitControls.js";

const threeSource = readFileSync(THREE_SOURCE_PATH, "utf-8");
const orbitSource = readFileSync(ORBIT_SOURCE_PATH, "utf-8");

console.log(`📦 Three.js velikost: ${(threeSource.length / 1024).toFixed(1)} KiB`);
console.log(`📦 OrbitControls velikost: ${(orbitSource.length / 1024).toFixed(1)} KiB`);

// Kompletní HTML aplikace - zkrácená verze
const APP_HTML = `<!DOCTYPE html>
<html lang="cs">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Země — den a noc</title>
  <style>
    html, body { width: 100%; height: 100%; margin: 0; overflow: hidden; background: #000; }
    #earth { position: fixed; inset: 0; cursor: grab; }
    canvas { display: block; width: 100%; height: 100%; }
    #overlay { position: fixed; inset: 0; z-index: 20; background: #000; color: #dfe8f2; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; font: 14px system-ui; }
    #overlay.hidden { opacity: 0; pointer-events: none; }
    #overlay .bar { width: 240px; height: 3px; background: #16202c; border-radius: 2px; overflow: hidden; }
    #overlay .bar i { display: block; height: 100%; width: 0%; background: #4a9eff; transition: width .25s; }
    #hint { position: fixed; left: 14px; bottom: 12px; z-index: 5; color: #7f8fa3; font: 12px system-ui; }
    #toast { position: fixed; left: 50%; bottom: 34px; transform: translateX(-50%); z-index: 15; background: rgba(20,28,38,.88); color: #dfe8f2; border: 1px solid #2a3a4d; border-radius: 8px; padding: 8px 14px; font: 13px system-ui; opacity: 0; transition: opacity .3s; }
    #toast.show { opacity: 1; }
  </style>
</head>
<body>
  <main id="earth"></main>
  <div id="overlay"><div id="overlay-msg">Načítá se Země…</div><div class="bar"><i id="overlay-bar"></i></div></div>
  <div id="hint">Táhni myší — otáčení · kolečko — zoom · mezerník — pauza</div>
  <div id="toast"></div>
  <script>
    window.__earthBoot = setTimeout(() => { if (!window.__earthBooted) { document.getElementById('overlay-msg').textContent = 'Chyba inicializace 3D.'; document.querySelector('#overlay .bar').style.display='none'; } }, 9000);
  </script>
  <script type="importmap">{"imports":{"three":"./vendor/three.module.js","three/addons/":"./vendor/"}}</script>
  <script type="module">
    import * as THREE from 'three';
    import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
    window.__earthBooted = true; clearTimeout(window.__earthBoot);
    const container = document.getElementById('earth');
    const overlay = document.getElementById('overlay');
    const overlayBar = document.getElementById('overlay-bar');
    const toastEl = document.getElementById('toast');
    let toastTimer = null;
    function toast(msg, ms = 2600) { toastEl.textContent = msg; toastEl.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => toastEl.classList.remove('show'), ms); }
    function finishLoading() { overlay.classList.add('hidden'); setTimeout(() => overlay.remove(), 900); }
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 300);
    camera.position.set(0, 0.35, 3.1);
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    container.appendChild(renderer.domElement);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.dampingFactor = 0.05; controls.enablePan = false;
    controls.minDistance = 1.45; controls.maxDistance = 8; controls.autoRotate = true; controls.autoRotateSpeed = 0.25;
    const sunDir = new THREE.Vector3(1, 0.25, 0.4).normalize();
    const sunLight = new THREE.DirectionalLight(0xffffff, 2.0);
    sunLight.position.copy(sunDir).multiplyScalar(10);
    scene.add(sunLight); scene.add(new THREE.AmbientLight(0x33445f, 0.25));
    function makeFallback(kind) { const c = document.createElement('canvas'); c.width = c.height = 4; const ctx = c.getContext('2d'); ctx.fillStyle = kind === 'dayMap' ? '#1c3f6e' : '#020308'; ctx.fillRect(0, 0, 4, 4); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; }
    const earthUniforms = { dayMap: { value: makeFallback('dayMap') }, nightMap: { value: makeFallback('nightMap') }, sunDir: { value: sunDir } };
    const earthMaterial = new THREE.ShaderMaterial({
      uniforms: earthUniforms,
      vertexShader: \`varying vec2 vUv; varying vec3 vNormalW; varying vec3 vPosW; void main() { vUv = uv; vNormalW = normalize(mat3(modelMatrix) * normal); vec4 wp = modelMatrix * vec4(position, 1.0); vPosW = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }\`,
      fragmentShader: \`uniform sampler2D dayMap; uniform sampler2D nightMap; uniform vec3 sunDir; varying vec2 vUv; varying vec3 vNormalW; varying vec3 vPosW; void main() { vec3 n = normalize(vNormalW); vec3 viewDir = normalize(cameraPosition - vPosW); float sd = dot(n, sunDir); vec3 day = texture2D(dayMap, vUv).rgb; vec3 nightTex = texture2D(nightMap, vUv).rgb; float lambert = clamp(sd, 0.0, 1.0); vec3 dayCol = day * (0.16 + 1.05 * pow(lambert, 0.75)); vec3 city = nightTex * vec3(1.0, 0.82, 0.55) * 2.2; vec3 nightCol = city + day * vec3(0.030, 0.045, 0.085); float dayMix = smoothstep(-0.10, 0.25, sd); vec3 color = mix(nightCol, dayCol, dayMix); float tw = exp(-pow(sd / 0.085, 2.0)); color += vec3(1.0, 0.42, 0.16) * tw * 0.22 * day; float fres = pow(1.0 - clamp(dot(viewDir, n), 0.0, 1.0), 2.6); color += vec3(0.18, 0.42, 0.95) * fres * (0.08 + 0.38 * dayMix); gl_FragColor = vec4(color, 1.0); }\`
    });
    const earth = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 96), earthMaterial);
    scene.add(earth);
    const clouds = new THREE.Mesh(new THREE.SphereGeometry(1.012, 96, 64), new THREE.MeshLambertMaterial({ transparent: true, opacity: 0.85, depthWrite: false }));
    clouds.visible = false; clouds.renderOrder = 1; scene.add(clouds);
    const atmosphereMaterial = new THREE.ShaderMaterial({
      uniforms: { sunDir: { value: sunDir } },
      vertexShader: \`varying vec3 vNormalV; varying vec3 vNormalW; void main() { vNormalV = normalize(normalMatrix * normal); vNormalW = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }\`,
      fragmentShader: \`uniform vec3 sunDir; varying vec3 vNormalV; varying vec3 vNormalW; void main() { float rim = clamp(-vNormalV.z, 0.0, 1.0); float intensity = pow(rim, 1.9) * 1.5; float sunFacing = 0.5 + 0.5 * dot(normalize(vNormalW), sunDir); vec3 col = mix(vec3(0.10, 0.28, 0.85), vec3(0.38, 0.62, 1.0), sunFacing); gl_FragColor = vec4(col * intensity * (0.25 + 0.85 * sunFacing), 1.0); }\`,
      side: THREE.BackSide, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false
    });
    const atmosphere = new THREE.Mesh(new THREE.SphereGeometry(1.16, 64, 64), atmosphereMaterial);
    atmosphere.renderOrder = 2; scene.add(atmosphere);
    function makeStars(count, size, brightness) { const pos = new Float32Array(count * 3); const col = new Float32Array(count * 3); const c = new THREE.Color(); for (let i = 0; i < count; i++) { const u = Math.random() * 2 - 1; const phi = Math.random() * Math.PI * 2; const r = 60 + Math.random() * 40; const s = Math.sqrt(1 - u * u); pos[i * 3] = r * s * Math.cos(phi); pos[i * 3 + 1] = r * u; pos[i * 3 + 2] = r * s * Math.sin(phi); const warm = Math.random() < 0.12; c.setHSL(warm ? 0.08 : 0.58 + Math.random() * 0.08, warm ? 0.5 : 0.25, brightness * (0.55 + Math.random() * 0.45)); col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; } const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); return new THREE.Points(g, new THREE.PointsMaterial({ size, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false })); }
    scene.add(makeStars(1400, 1.8, 0.70), makeStars(200, 3.0, 1.00));
    const TEX_BASE = 'https://unpkg.com/three-globe/example/img/';
    const loader = new THREE.TextureLoader(); loader.crossOrigin = 'anonymous';
    let settled = 0, warnedFallback = false, allSettled = false;
    function settle() { settled++; overlayBar.style.width = Math.round((settled / 3) * 100) + '%'; if (settled === 3) { allSettled = true; finishLoading(); } }
    function prepTex(t) { t.anisotropy = renderer.capabilities.getMaxAnisotropy(); t.colorSpace = THREE.SRGBColorSpace; }
    loader.load(TEX_BASE + 'earth-blue-marble.jpg', t => { prepTex(t); earthUniforms.dayMap.value = t; settle(); }, undefined, () => { if (!warnedFallback) { warnedFallback = true; toast('Textury se nepodařilo načíst.', 5000); } settle(); });
    loader.load(TEX_BASE + 'earth-night.jpg', t => { prepTex(t); earthUniforms.nightMap.value = t; settle(); }, undefined, () => settle());
    loader.load(TEX_BASE + 'clouds.png', t => { prepTex(t); clouds.material.map = t; clouds.material.needsUpdate = true; clouds.visible = true; settle(); }, undefined, () => { clouds.visible = false; settle(); });
    setTimeout(() => { if (!allSettled) toast('Textury se načítají dlouho.', 5000); }, 20000);
    function resize() { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight, false); }
    window.addEventListener('resize', resize, { passive: true }); resize();
    window.addEventListener('keydown', e => { if (e.code === 'Space' && !e.repeat) { e.preventDefault(); controls.autoRotate = !controls.autoRotate; toast(controls.autoRotate ? 'Rotace spuštěna' : 'Rotace pozastavena', 1600); } }, { passive: false });
    let running = true;
    document.addEventListener('visibilitychange', () => { running = !document.hidden; }, { passive: true });
    const clock = new THREE.Clock(); let sunAngle = Math.PI * 0.35;
    function loop() { requestAnimationFrame(loop); const dt = Math.min(clock.getDelta(), 0.05); if (!running) return; sunAngle += dt * 0.04; sunDir.set(Math.cos(sunAngle), 0.25, Math.sin(sunAngle)).normalize(); sunLight.position.copy(sunDir).multiplyScalar(10); earth.rotation.y += dt * 0.003; clouds.rotation.y += dt * 0.005; controls.update(); renderer.render(scene, camera); }
    loop();
  </script>
</body>
</html>`;

// 1. index.html
writeFileSync(`${OPT_DIR}/index.html`, APP_HTML);
console.log("  + opt/zeme/index.html");

// 2. vendor/three.module.js
mkdirSync(`${OPT_DIR}/vendor`, { recursive: true });
writeFileSync(`${OPT_DIR}/vendor/three.module.js`, threeSource);
console.log("  + opt/zeme/vendor/three.module.js");

// 3. vendor/controls/OrbitControls.js
mkdirSync(`${OPT_DIR}/vendor/controls`, { recursive: true });
writeFileSync(`${OPT_DIR}/vendor/controls/OrbitControls.js`, orbitSource);
console.log("  + opt/zeme/vendor/controls/OrbitControls.js");

// 4. Spouštěč (launcher script)
const launcherScript = `#!/bin/bash
# Spustit aplikaci v defaultním prohlížeči
xdg-open "file://${OPT_DIR}/index.html" || echo "Otevři soubor: file://${OPT_DIR}/index.html"`;
writeFileSync(`${OPT_DIR}/${PKG_NAME}`, launcherScript, { mode: 0o755 });
console.log(`  + opt/zeme/${PKG_NAME}`);

// 5. Desktop entry
const desktopEntry = `[Desktop Entry]
Name=Země 3D
Comment=Interaktivní 3D Země s cyklusem dne a noci
Exec=${OPT_DIR}/${PKG_NAME}
Icon=${PKG_NAME}
Type=Application
Categories=Education;Science;`;
writeFileSync(`${USR_SHARE_APP}/${PKG_NAME}.desktop`, desktopEntry);
console.log(`  + usr/share/applications/${PKG_NAME}.desktop`);

// 6. Ikona SVG
const iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <circle cx="64" cy="64" r="60" fill="#1c3f6e"/>
  <circle cx="64" cy="64" r="58" fill="none" stroke="#4a9eff" stroke-width="2"/>
  <ellipse cx="40" cy="50" rx="15" ry="12" fill="#2d5a87"/>
  <ellipse cx="80" cy="70" rx="20" ry="16" fill="#2d5a87"/>
  <ellipse cx="60" cy="35" rx="10" ry="8" fill="#2d5a87"/>
  <circle cx="90" cy="40" r="3" fill="#ffd700"/>
  <circle cx="50" cy="80" r="2" fill="#ffd700"/>
  <circle cx="70" cy="90" r="2" fill="#ffd700"/>
</svg>`;
writeFileSync(`${USR_SHARE_ICONS}/${PKG_NAME}.svg`, iconSvg);
console.log(`  + usr/share/icons/hicolor/scalable/apps/${PKG_NAME}.svg`);

// 7. DEBIAN/control
const installedSize = Math.ceil((APP_HTML.length + threeSource.length + orbitSource.length + launcherScript.length + desktopEntry.length + iconSvg.length) / 1024);
const controlFile = `Package: ${PKG_NAME}
Version: ${VERSION}
Section: utils
Priority: optional
Architecture: ${ARCH}
Maintainer: ${MAINTAINER}
Description: Interaktivní 3D Země s cyklusem dne a noci
 Offline 3D vizualizace Země postavená na Three.js.
`;
writeFileSync(`${CONTROL_DIR}/control`, controlFile);
console.log("  + DEBIAN/control");

// 8. DEBIAN/md5sums
const filesToHash = [
  [`opt/${PKG_NAME}/index.html`, `${OPT_DIR}/index.html`],
  [`opt/${PKG_NAME}/vendor/three.module.js`, `${OPT_DIR}/vendor/three.module.js`],
  [`opt/${PKG_NAME}/vendor/controls/OrbitControls.js`, `${OPT_DIR}/vendor/controls/OrbitControls.js`],
  [`opt/${PKG_NAME}/${PKG_NAME}`, `${OPT_DIR}/${PKG_NAME}`],
  [`usr/share/applications/${PKG_NAME}.desktop`, `${USR_SHARE_APP}/${PKG_NAME}.desktop`],
  [`usr/share/icons/hicolor/scalable/apps/${PKG_NAME}.svg`, `${USR_SHARE_ICONS}/${PKG_NAME}.svg`]
];

const md5sums = filesToHash.map(([path, fullPath]) => {
  const data = readFileSync(fullPath);
  const hash = createHash("md5").update(data).digest("hex");
  return `${hash}  ${path}`;
}).join("\n") + "\n";

writeFileSync(`${CONTROL_DIR}/md5sums`, md5sums);
console.log("  + DEBIAN/md5sums");

// 9. DEBIAN/postinst
const postinst = `#!/bin/bash
set -e
echo "✓ ${PKG_NAME} byl úspěšně nainstalován."
echo "  Spusťte příkazem: ${PKG_NAME}"
`;
writeFileSync(`${CONTROL_DIR}/postinst`, postinst, { mode: 0o755 });
console.log("  + DEBIAN/postinst");

// 10. DEBIAN/postrm
const postrm = `#!/bin/bash
set -e
echo "✓ ${PKG_NAME} byl odinstalován."
`;
writeFileSync(`${CONTROL_DIR}/postrm`, postrm, { mode: 0o755 });
console.log("  + DEBIAN/postrm");

console.log("\n🔨 Kompilace .deb balíčku pomocí dpkg-deb...");

// Použijeme dpkg-deb k vytvoření balíčku
try {
  execSync(`dpkg-deb --build --root-owner-group ${BUILD_DIR} ${OUTPUT_DEB}`, { stdio: "inherit" });
  console.log(`\n✅ Hotovo! Balíček byl vytvořen: ${OUTPUT_DEB}`);
  
  // Získat velikost
  const debStats = readFileSync(OUTPUT_DEB);
  console.log(`📊 Velikost: ${(debStats.length / 1024).toFixed(1)} KiB`);
  console.log(`📊 Celková velikost po instalaci: ~${installedSize} KiB`);
  
  // MD5 balíčku
  const debMd5 = createHash("md5").update(debStats).digest("hex");
  console.log(`🔐 MD5: ${debMd5}`);
  
} catch (error) {
  console.error("❌ Chyba při vytváření balíčku:", error.message);
  process.exit(1);
}
