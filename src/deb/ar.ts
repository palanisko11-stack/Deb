/**
 * Zapisovatel ar archivu — .deb soubor je ar archiv se třemi členy:
 *   debian-binary, control.tar.gz, data.tar.gz
 */

export interface ArMember {
  name: string; // např. "debian-binary" (přidáme koncové "/")
  data: Uint8Array;
}

function field(s: string, len: number, out: Uint8Array, offset: number): void {
  for (let i = 0; i < len; i++) out[offset + i] = 0x20;
  for (let i = 0; i < Math.min(s.length, len); i++) out[offset + i] = s.charCodeAt(i);
}

export function buildAr(members: ArMember[], mtime: number): Uint8Array {
  const parts: Uint8Array[] = [];

  const magic = new Uint8Array(8);
  const m = "!<arch>\n";
  for (let i = 0; i < 8; i++) magic[i] = m.charCodeAt(i);
  parts.push(magic);

  for (const mem of members) {
    const name = mem.name.endsWith("/") ? mem.name : mem.name + "/";
    const header = new Uint8Array(60);
    field(name, 16, header, 0);
    field(String(mtime), 12, header, 16);
    field("0", 6, header, 28); // uid
    field("0", 6, header, 34); // gid
    field("100644", 8, header, 40); // mode
    field(String(mem.data.length), 10, header, 48); // size
    header[58] = 0x60;
    header[59] = 0x0a;
    parts.push(header);
    parts.push(mem.data);
    if (mem.data.length % 2 === 1) parts.push(new Uint8Array([0x0a])); // ar zarovnává na sudý počet bajtů
  }

  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}
