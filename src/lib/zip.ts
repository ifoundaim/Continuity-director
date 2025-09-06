// Minimal ZIP creator (STORE only, no compression).
// Files are added in-memory and a Buffer is returned.
import crypto from "crypto";

type FileEntry = { path: string; data: Buffer; dosTime: number; crc32: number };

function crc32(buf: Buffer): number {
  // fast table-based CRC32
  const table: number[] = (crc32 as any)._t || ((crc32 as any)._t = (() => {
    const t: number[] = [];
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })());
  let c = 0 ^ -1;
  for (let i = 0; i < buf.length; i++) c = (c >>> 8) ^ table[(c ^ buf[i]) & 0xFF];
  return (c ^ -1) >>> 0;
}

function toDosTime(date = new Date()): number {
  const dt = new Date(date);
  const year = dt.getUTCFullYear();
  const dosDate =
    ((year - 1980) << 9) |
    ((dt.getUTCMonth() + 1) << 5) |
    dt.getUTCDate();
  const dosTime =
    (dt.getUTCHours() << 11) |
    (dt.getUTCMinutes() << 5) |
    (Math.floor(dt.getUTCSeconds() / 2));
  return (dosDate << 16) | dosTime;
}

export class ZipBuilder {
  private files: FileEntry[] = [];

  addFile(relPath: string, data: Buffer) {
    const clean = relPath.replace(/^\/+/, "");
    const dosTime = toDosTime();
    this.files.push({ path: clean, data, dosTime, crc32: crc32(data) });
  }

  build(): Buffer {
    const localParts: Buffer[] = [];
    const centralParts: Buffer[] = [];
    let offset = 0;

    for (const f of this.files) {
      const nameBuf = Buffer.from(f.path, "utf8");
      const localHeader = Buffer.alloc(30);
      localHeader.writeUInt32LE(0x04034b50, 0); // local file header sig
      localHeader.writeUInt16LE(20, 4);         // version needed
      localHeader.writeUInt16LE(0, 6);          // flags
      localHeader.writeUInt16LE(0, 8);          // method 0 (store)
      localHeader.writeUInt32LE(f.dosTime, 10); // time+date
      localHeader.writeUInt32LE(f.crc32, 14);   // CRC32
      localHeader.writeUInt32LE(f.data.length, 18); // comp size
      localHeader.writeUInt32LE(f.data.length, 22); // uncomp size
      localHeader.writeUInt16LE(nameBuf.length, 26); // name len
      localHeader.writeUInt16LE(0, 28);              // extra len

      localParts.push(localHeader, nameBuf, f.data);
      const localSize = localHeader.length + nameBuf.length + f.data.length;

      const central = Buffer.alloc(46);
      central.writeUInt32LE(0x02014b50, 0); // central dir header
      central.writeUInt16LE(20, 4);         // version made by
      central.writeUInt16LE(20, 6);         // version needed
      central.writeUInt16LE(0, 8);          // flags
      central.writeUInt16LE(0, 10);         // method
      central.writeUInt32LE(f.dosTime, 12); // time+date
      central.writeUInt32LE(f.crc32, 16);
      central.writeUInt32LE(f.data.length, 20);
      central.writeUInt32LE(f.data.length, 24);
      central.writeUInt16LE(nameBuf.length, 28);
      central.writeUInt16LE(0, 30); // extra
      central.writeUInt16LE(0, 32); // comment
      central.writeUInt16LE(0, 34); // disk number
      central.writeUInt16LE(0, 36); // internal attrs
      central.writeUInt32LE(0, 38); // external attrs
      central.writeUInt32LE(offset, 42); // local header offset

      centralParts.push(central, nameBuf);
      offset += localSize;
    }

    const centralSize = centralParts.reduce((n, b) => n + b.length, 0);
    const localSize = localParts.reduce((n, b) => n + b.length, 0);

    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0); // end of central dir
    end.writeUInt16LE(0, 4);          // disk
    end.writeUInt16LE(0, 6);          // start disk
    end.writeUInt16LE(this.files.length, 8);
    end.writeUInt16LE(this.files.length, 10);
    end.writeUInt32LE(centralSize, 12);
    end.writeUInt32LE(localSize, 16);
    end.writeUInt16LE(0, 20);         // comment len

    return Buffer.concat([...localParts, ...centralParts, end]);
  }
}


