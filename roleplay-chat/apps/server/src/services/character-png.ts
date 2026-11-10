import { deflateSync } from 'node:zlib';
import type { Character } from '@roleplay/core';
import { buildCharacterCardV2 } from '@roleplay/core';

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const typeBuffer = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

/** Build a minimal 1×1 PNG carrying a SillyTavern V2 card in a `chara` tEXt chunk. */
export function characterCardPng(character: Character, characterBook?: Record<string, unknown>): Buffer {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1, 0);
  ihdr.writeUInt32BE(1, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  // Raw scanline: filter byte + one transparent RGBA pixel.
  const idat = deflateSync(Buffer.from([0, 0, 0, 0, 0]));
  const cardData = buildCharacterCardV2(character);
  if (characterBook) (cardData.data as Record<string, unknown>).character_book = characterBook;
  const card = JSON.stringify(cardData);
  const text = Buffer.from(`chara\0${Buffer.from(card, 'utf8').toString('base64')}`, 'binary');
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('tEXt', text),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
