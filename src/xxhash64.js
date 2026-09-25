// XXH64, independently implemented from the public algorithm specification.
const MASK = (1n << 64n) - 1n;
const P1 = 0x9e3779b185ebca87n;
const P2 = 0xc2b2ae3d27d4eb4fn;
const P3 = 0x165667b19e3779f9n;
const P4 = 0x85ebca77c2b2ae63n;
const P5 = 0x27d4eb2f165667c5n;
const u64 = (value) => value & MASK;
const rotate = (value, bits) => u64((value << bits) | (value >> (64n - bits)));

function round(accumulator, word) {
  return u64(rotate(u64(accumulator + u64(word * P2)), 31n) * P1);
}

function merge(accumulator, lane) {
  return u64(u64(accumulator ^ round(0n, lane)) * P1 + P4);
}

export function xxhash64(bytes, seed = 0n) {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let index = 0;
  let hash;
  if (data.byteLength >= 32) {
    let a = u64(seed + P1 + P2);
    let b = u64(seed + P2);
    let c = u64(seed);
    let d = u64(seed - P1);
    const limit = data.byteLength - 32;
    while (index <= limit) {
      a = round(a, view.getBigUint64(index, true)); index += 8;
      b = round(b, view.getBigUint64(index, true)); index += 8;
      c = round(c, view.getBigUint64(index, true)); index += 8;
      d = round(d, view.getBigUint64(index, true)); index += 8;
    }
    hash = u64(rotate(a, 1n) + rotate(b, 7n) + rotate(c, 12n) + rotate(d, 18n));
    hash = merge(merge(merge(merge(hash, a), b), c), d);
  } else {
    hash = u64(seed + P5);
  }
  hash = u64(hash + BigInt(data.byteLength));
  while (index + 8 <= data.byteLength) {
    hash = u64(rotate(hash ^ round(0n, view.getBigUint64(index, true)), 27n) * P1 + P4);
    index += 8;
  }
  if (index + 4 <= data.byteLength) {
    hash = u64(rotate(hash ^ u64(BigInt(view.getUint32(index, true)) * P1), 23n) * P2 + P3);
    index += 4;
  }
  while (index < data.byteLength) {
    hash = u64(rotate(hash ^ u64(BigInt(data[index]) * P5), 11n) * P1);
    index++;
  }
  hash ^= hash >> 33n;
  hash = u64(hash * P2);
  hash ^= hash >> 29n;
  hash = u64(hash * P3);
  hash ^= hash >> 32n;
  return u64(hash);
}
