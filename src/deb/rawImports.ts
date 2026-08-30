/**
 * Zdrojové kódy Three.js načtené jako text — vložíme je přímo do data.tar.gz,
 * aby nainstalovaný balíček běžel zcela offline (žádné CDN).
 */
import threeSource from "../../node_modules/three/build/three.module.js?raw";
import orbitSource from "../../node_modules/three/examples/jsm/controls/OrbitControls.js?raw";

export const THREE_SOURCE: string = threeSource;
export const ORBIT_SOURCE: string = orbitSource;
