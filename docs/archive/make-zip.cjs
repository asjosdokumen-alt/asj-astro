const fs = require('fs');
const path = require('path');

function walk(dir, base) {
  let results = [];
  for (const f of fs.readdirSync(dir)) {
    const fp = path.join(dir, f);
    const rel = path.join(base, f).split(path.sep).join('/');
    const stat = fs.statSync(fp);
    if (stat.isDirectory()) results = results.concat(walk(fp, rel));
    else results.push({ rel, fp, size: stat.size });
  }
  return results;
}

function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let j = 0; j < 8; j++) c = (c >>> 1) ^ (c & 1 ? 0xEDB88320 : 0);
  }
  return (c ^ 0xFFFFFFFF) >>> 0;
}

const files = walk('dist', '');
const entries = [];
let offset = 0;
const centralDir = [];

for (const file of files) {
  const data = fs.readFileSync(file.fp);
  const name = Buffer.from(file.rel, 'utf8');
  const header = Buffer.alloc(30 + name.length);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(0, 6);
  header.writeUInt16LE(0, 8);
  header.writeUInt16LE(0, 10);
  header.writeUInt16LE(0, 12);
  header.writeUInt32LE(crc32(data), 14);
  header.writeUInt32LE(data.length, 18);
  header.writeUInt32LE(data.length, 22);
  header.writeUInt16LE(name.length, 26);
  header.writeUInt16LE(0, 28);
  name.copy(header, 30);
  entries.push(Buffer.concat([header, data]));

  const cd = Buffer.alloc(46 + name.length);
  cd.writeUInt32LE(0x02014b50, 0);
  cd.writeUInt16LE(20, 4);
  cd.writeUInt16LE(20, 6);
  cd.writeUInt16LE(0, 8);
  cd.writeUInt16LE(0, 10);
  cd.writeUInt16LE(0, 12);
  cd.writeUInt16LE(0, 14);
  cd.writeUInt32LE(crc32(data), 16);
  cd.writeUInt32LE(data.length, 20);
  cd.writeUInt32LE(data.length, 24);
  cd.writeUInt16LE(name.length, 28);
  cd.writeUInt16LE(0, 30);
  cd.writeUInt16LE(0, 32);
  cd.writeUInt16LE(0, 34);
  cd.writeUInt16LE(0, 36);
  cd.writeUInt32LE(0, 38);
  cd.writeUInt32LE(offset, 42);
  name.copy(cd, 46);
  centralDir.push(cd);
  offset += header.length + data.length;
}

const cdOffset = offset;
let cdSize = 0;
for (const cd of centralDir) cdSize += cd.length;
const eocd = Buffer.alloc(22);
eocd.writeUInt32LE(0x06054b50, 0);
eocd.writeUInt16LE(0, 4);
eocd.writeUInt16LE(0, 6);
eocd.writeUInt16LE(files.length, 8);
eocd.writeUInt16LE(files.length, 10);
eocd.writeUInt32LE(cdSize, 12);
eocd.writeUInt32LE(cdOffset, 16);
eocd.writeUInt16LE(0, 20);

const zip = Buffer.concat([...entries, ...centralDir, eocd]);
fs.writeFileSync('deploy.zip', zip);
console.log('Created deploy.zip: ' + zip.length + ' bytes, ' + files.length + ' files');
// Show first 5 paths
files.slice(0,5).forEach(f => console.log('  ' + f.rel));
