import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export interface SceneStatus {
  fps: number;
  texLoaded: number;
  texTotal: number;
  texDone: boolean;
  fallback: boolean;
  rotation: boolean;
  sunDeg: number;
}

export interface SceneApi {
  resetView: () => void;
  setRotation: (on: boolean) => void;
}

interface Props {
  onStatus: (s: SceneStatus) => void;
  onToast: (msg: string) => void;
  onFatal: (msg: string) => void;
  apiRef: React.MutableRefObject<SceneApi | null>;
}

export default function EarthScene({ onStatus, onToast, onFatal, apiRef }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const cbRef = useRef({ onStatus, onToast, onFatal });
  cbRef.current = { onStatus, onToast, onFatal };

  useEffect(() => {
    const container = hostRef.current;
    if (!container) return;

    // ---------- renderer / scéna / kamera ----------
    let renderer: THREE.WebGLRenderer;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 300);
    camera.position.set(0, 0.35, 3.1);

    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    } catch {
      cbRef.current.onFatal("WebGL není v tomto prohlížeči dostupné — scénu nelze spustit.");
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x020409, 1);
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

    // ---------- stav pro reporting ----------
    const status: SceneStatus = {
      fps: 0,
      texLoaded: 0,
      texTotal: 3,
      texDone: false,
      fallback: false,
      rotation: true,
      sunDeg: 63,
    };
    const push = () => cbRef.current.onStatus({ ...status });

    // ---------- Slunce ----------
    const sunDir = new THREE.Vector3(1, 0.25, 0.4).normalize();
    const sunLight = new THREE.DirectionalLight(0xffffff, 2.0);
    sunLight.position.copy(sunDir).multiplyScalar(10);
    scene.add(sunLight);
    scene.add(new THREE.AmbientLight(0x33445f, 0.25));

    // ---------- Záložní textury ----------
    const makeFallback = (kind: "dayMap" | "nightMap") => {
      const c = document.createElement("canvas");
      c.width = c.height = 4;
      const ctx = c.getContext("2d")!;
      ctx.fillStyle = kind === "dayMap" ? "#1c3f6e" : "#020308";
      ctx.fillRect(0, 0, 4, 4);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    };

    // ---------- Země: day/night shader ----------
    const earthUniforms: {
      dayMap: { value: THREE.Texture };
      nightMap: { value: THREE.Texture };
      sunDir: { value: THREE.Vector3 };
    } = {
      dayMap: { value: makeFallback("dayMap") },
      nightMap: { value: makeFallback("nightMap") },
      sunDir: { value: sunDir },
    };

    const earthMaterial = new THREE.ShaderMaterial({
      uniforms: earthUniforms,
      vertexShader: /* glsl */ `
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
      `,
      fragmentShader: /* glsl */ `
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

          float lambert = clamp(sd, 0.0, 1.0);
          vec3 dayCol = day * (0.16 + 1.05 * pow(lambert, 0.75));

          vec3 city = nightTex * vec3(1.0, 0.82, 0.55) * 2.2;
          vec3 nightCol = city + day * vec3(0.030, 0.045, 0.085);

          float dayMix = smoothstep(-0.10, 0.25, sd);
          vec3 color = mix(nightCol, dayCol, dayMix);

          float tw = exp(-pow(sd / 0.085, 2.0));
          color += vec3(1.0, 0.42, 0.16) * tw * 0.22 * day;

          float fres = pow(1.0 - clamp(dot(viewDir, n), 0.0, 1.0), 2.6);
          color += vec3(0.18, 0.42, 0.95) * fres * (0.08 + 0.38 * dayMix);

          gl_FragColor = vec4(color, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    });

    const earth = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 96), earthMaterial);
    scene.add(earth);

    // ---------- Mraky ----------
    const cloudMat = new THREE.MeshLambertMaterial({ transparent: true, opacity: 0.85, depthWrite: false });
    const clouds = new THREE.Mesh(new THREE.SphereGeometry(1.012, 96, 64), cloudMat);
    clouds.visible = false;
    clouds.renderOrder = 1;
    scene.add(clouds);

    // ---------- Atmosféra ----------
    const atmosphereMaterial = new THREE.ShaderMaterial({
      uniforms: { sunDir: { value: sunDir } },
      vertexShader: /* glsl */ `
        varying vec3 vNormalV;
        varying vec3 vNormalW;
        void main() {
          vNormalV = normalize(normalMatrix * normal);
          vNormalW = normalize(mat3(modelMatrix) * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 sunDir;
        varying vec3 vNormalV;
        varying vec3 vNormalW;
        void main() {
          float rim = clamp(-vNormalV.z, 0.0, 1.0);
          float intensity = pow(rim, 1.9) * 1.5;
          float sunFacing = 0.5 + 0.5 * dot(normalize(vNormalW), sunDir);
          vec3 col = mix(vec3(0.10, 0.28, 0.85), vec3(0.38, 0.62, 1.0), sunFacing);
          gl_FragColor = vec4(col * intensity * (0.25 + 0.85 * sunFacing), 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
      side: THREE.BackSide,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const atmosphere = new THREE.Mesh(new THREE.SphereGeometry(1.16, 64, 64), atmosphereMaterial);
    atmosphere.renderOrder = 2;
    scene.add(atmosphere);

    // ---------- Hvězdy ----------
    const makeStars = (count: number, size: number, brightness: number) => {
      const pos = new Float32Array(count * 3);
      const col = new Float32Array(count * 3);
      const c = new THREE.Color();
      for (let i = 0; i < count; i++) {
        const u = Math.random() * 2 - 1;
        const phi = Math.random() * Math.PI * 2;
        const r = 60 + Math.random() * 40;
        const s = Math.sqrt(1 - u * u);
        pos[i * 3] = r * s * Math.cos(phi);
        pos[i * 3 + 1] = r * u;
        pos[i * 3 + 2] = r * s * Math.sin(phi);
        const warm = Math.random() < 0.12;
        c.setHSL(warm ? 0.08 : 0.58 + Math.random() * 0.08, warm ? 0.5 : 0.25, brightness * (0.55 + Math.random() * 0.45));
        col[i * 3] = c.r;
        col[i * 3 + 1] = c.g;
        col[i * 3 + 2] = c.b;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      g.setAttribute("color", new THREE.BufferAttribute(col, 3));
      const m = new THREE.PointsMaterial({
        size,
        sizeAttenuation: false,
        vertexColors: true,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
      });
      return new THREE.Points(g, m);
    };
    const starsDim = makeStars(1400, 1.8, 0.7);
    const starsBright = makeStars(200, 3.0, 1.0);
    scene.add(starsDim, starsBright);

    // ---------- Textury ----------
    const TEX_BASE = "https://unpkg.com/three-globe/example/img/";
    const loader = new THREE.TextureLoader();
    loader.crossOrigin = "anonymous";

    let warnedFallback = false;
    const settle = () => {
      status.texLoaded += 1;
      if (status.texLoaded >= status.texTotal) status.texDone = true;
      push();
    };
    const prepTex = (t: THREE.Texture) => {
      t.anisotropy = renderer.capabilities.getMaxAnisotropy();
      t.colorSpace = THREE.SRGBColorSpace;
    };
    const loadEarthTex = (key: "dayMap" | "nightMap", url: string) => {
      loader.load(
        url,
        (t) => {
          prepTex(t);
          earthUniforms[key].value = t;
          settle();
        },
        undefined,
        () => {
          status.fallback = true;
          if (!warnedFallback) {
            warnedFallback = true;
            cbRef.current.onToast("Textury se nepodařilo načíst — běží záložní vzhled.");
          }
          settle();
        }
      );
    };
    loadEarthTex("dayMap", TEX_BASE + "earth-blue-marble.jpg");
    loadEarthTex("nightMap", TEX_BASE + "earth-night.jpg");
    loader.load(
      TEX_BASE + "clouds.png",
      (t) => {
        prepTex(t);
        cloudMat.map = t;
        cloudMat.needsUpdate = true;
        clouds.visible = true;
        settle();
      },
      undefined,
      () => {
        status.fallback = true;
        clouds.visible = false;
        settle();
      }
    );

    const slowTimer = window.setTimeout(() => {
      if (!status.texDone) cbRef.current.onToast("Textury se načítají dlouho — scéna běží na záložní vzhled.");
    }, 20000);

    // ---------- Resize ----------
    const resize = () => {
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
    };
    window.addEventListener("resize", resize, { passive: true });
    resize();

    // ---------- Klávesnice: mezerník ----------
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space" && !e.repeat) {
        const target = e.target as HTMLElement | null;
        if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.tagName === "BUTTON")) return;
        e.preventDefault();
        controls.autoRotate = !controls.autoRotate;
        status.rotation = controls.autoRotate;
        push();
        cbRef.current.onToast(controls.autoRotate ? "Rotace spuštěna" : "Rotace pozastavena");
      }
    };
    window.addEventListener("keydown", onKey, { passive: false });

    // ---------- API ----------
    apiRef.current = {
      resetView: () => {
        camera.position.set(0, 0.35, 3.1);
        controls.target.set(0, 0, 0);
        controls.update();
        cbRef.current.onToast("Pohled vrácen na výchozí pozici");
      },
      setRotation: (on: boolean) => {
        controls.autoRotate = on;
        status.rotation = on;
        push();
        cbRef.current.onToast(on ? "Rotace spuštěna" : "Rotace pozastavena");
      },
    };

    // ---------- Smyčka ----------
    let running = true;
    const onVis = () => {
      running = !document.hidden;
    };
    document.addEventListener("visibilitychange", onVis, { passive: true });

    const clock = new THREE.Clock();
    let sunAngle = Math.PI * 0.35;
    let raf = 0;
    let frames = 0;
    let fpsTime = 0;
    let statTime = 0;

    const loop = () => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(clock.getDelta(), 0.05);
      if (!running) return;

      sunAngle += dt * 0.04;
      sunDir.set(Math.cos(sunAngle), 0.25, Math.sin(sunAngle)).normalize();
      sunLight.position.copy(sunDir).multiplyScalar(10);

      earth.rotation.y += dt * 0.003;
      clouds.rotation.y += dt * 0.005;
      starsDim.rotation.y += dt * 0.0006;
      starsBright.rotation.y += dt * 0.0006;

      controls.update();
      renderer.render(scene, camera);

      frames++;
      fpsTime += dt;
      statTime += dt;
      if (fpsTime >= 0.5) {
        status.fps = Math.round(frames / fpsTime);
        frames = 0;
        fpsTime = 0;
      }
      if (statTime >= 0.4) {
        status.sunDeg = ((sunAngle * 180) / Math.PI) % 360;
        statTime = 0;
        push();
      }
    };
    loop();
    push();

    // ---------- Cleanup ----------
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(slowTimer);
      window.removeEventListener("resize", resize);
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("visibilitychange", onVis);
      apiRef.current = null;
      controls.dispose();
      scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else if (mat) mat.dispose();
      });
      renderer.dispose();
      if (renderer.domElement.parentElement === container) container.removeChild(renderer.domElement);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={hostRef} className="absolute inset-0 [&_canvas]:block [&_canvas]:h-full [&_canvas]:w-full cursor-grab active:cursor-grabbing" />;
}
