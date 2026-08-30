/**
 * Minimální zapisovatel tar archivu (formát ustar) —
 * přesně to, co dpkg-deb očekává uvnitř control.tar.gz a data.tar.gz.
 */

export interface TarEntry {
  /** cesta uvnitř archivu, např. "./control" nebo "opt/zeme/index.html"; adresáře končí "/" */
  path: string;
  /** '0' = soubor, '5' = adresář */
  type: "0" | "5";
  /** např. 0o644 / 0o755 */
  mode: number;
  data?: Uint8Array;
}

const enc = new TextEncoder();

function writeStr(view: Uint8Array, offset: number, str: string, len: number): void {
  const b = enc.encode(str);
  view.set(b.subarray(0, Math.min(b.length, len)), offset);
}

/** zapíše číslo jako ASCII oktál, (len-1) číslic + NUL */
function writeOctal(view: Uint8Array, offset: number, value: number, len: number): void {
  const s = value.toString(8).padStart(len - 1, "0");
  for (let i = 0; i < len - 1; i++) view[offset + i] = s.charCodeAt(i);
  view[offset + len - 1] = 0;
}

export function buildTar(entries: TarEntry[], mtime: number): Uint8Array {
  const chunks: Uint8Array[] = [];

  for (const e of entries) {
    const data = e.type === "0" ? (e.data ?? new Uint8Array(0)) : new Uint8Array(0);
    const header = new Uint8Array(512);

    writeStr(header, 0, e.path, 100); // name
    writeOctal(header, 100, e.mode, 8); // mode
    writeOctal(header, 108, 0, 8); // uid
    writeOctal(header, 116, 0, 8); // gid
    writeOctal(header, 124, data.length, 12); // size
    writeOctal(header, 136, mtime, 12); // mtime
    for (let i = 148; i < 156; i++) header[i] = 0x20; // chksum = mezery pro výpočet
    header[156] = e.type === "5" ? 0x35 : 0x30; // typeflag
    writeStr(header, 257, "ustar", 6); // magic (včetně NUL)
    writeStr(header, 263, "00", 2); // version
    writeStr(header, 265, "root", 32); // uname
    writeStr(header, 297, "root", 32); // gname

    let sum = 0;
    for (let i = 0; i < 512; i++) sum += header[i];
    const cs = sum.toString(8).padStart(6, "0");
    for (let i = 0; i < 6; i++) header[148 + i] = cs.charCodeAt(i);
    header[154] = 0;
    header[155] = 0x20;

    chunks.push(header);
    if (data.length > 0) {
      chunks.push(data);
      const pad = (512 - (data.length % 512)) % 512;
      if (pad > 0) chunks.push(new Uint8Array(pad));
    }
  }

  chunks.push(new Uint8Array(1024)); // dva nulové bloky = konec archivu

  let total = 0;
  for (const c of chunks) total += c.length;
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}
