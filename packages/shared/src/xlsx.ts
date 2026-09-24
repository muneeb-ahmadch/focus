import { inflateRawSync } from 'node:zlib';
import type { Cells } from './ingest';

// Minimal zero-dependency .xlsx reader: an .xlsx is a ZIP of XML parts. We parse the ZIP
// central directory ourselves, inflate the two parts we need (sharedStrings + sheet1), and
// scan their XML for rows and cells. Enough for the flat question-bank sheets; not a
// general OOXML implementation (no ZIP64, no styles, no formulas).

const EOCD_SIG = 0x06054b50;
const CDIR_SIG = 0x02014b50;
const LOCAL_SIG = 0x04034b50;

function readZipEntries(buf: Buffer): Map<string, Buffer> {
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i -= 1) {
    if (buf.readUInt32LE(i) === EOCD_SIG) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('not a valid .xlsx (no ZIP end-of-central-directory record)');

  const count = buf.readUInt16LE(eocd + 10);
  const entries = new Map<string, Buffer>();
  let p = buf.readUInt32LE(eocd + 16);

  for (let i = 0; i < count; i += 1) {
    if (buf.readUInt32LE(p) !== CDIR_SIG) throw new Error('corrupt ZIP central directory');
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);

    if (buf.readUInt32LE(localOffset) !== LOCAL_SIG) throw new Error(`corrupt ZIP entry: ${name}`);
    const dataStart =
      localOffset + 30 + buf.readUInt16LE(localOffset + 26) + buf.readUInt16LE(localOffset + 28);
    const comp = buf.subarray(dataStart, dataStart + compSize);
    entries.set(name, method === 0 ? Buffer.from(comp) : inflateRawSync(comp));

    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

function decodeEntities(s: string): string {
  return s.replace(/&(#x?[0-9a-fA-F]+|amp|lt|gt|quot|apos);/g, (match, ent: string) => {
    switch (ent) {
      case 'amp':
        return '&';
      case 'lt':
        return '<';
      case 'gt':
        return '>';
      case 'quot':
        return '"';
      case 'apos':
        return "'";
      default:
        return ent[0] === '#'
          ? String.fromCodePoint(
              ent[1] === 'x' ? parseInt(ent.slice(2), 16) : parseInt(ent.slice(1), 10),
            )
          : match;
    }
  });
}

function joinText(fragment: string): string {
  const re = /<t[^>]*>([\s\S]*?)<\/t>/g;
  let text = '';
  let m: RegExpExecArray | null;
  while ((m = re.exec(fragment))) text += m[1];
  return decodeEntities(text);
}

function parseSharedStrings(xml: string): string[] {
  const out: string[] = [];
  const re = /<si\/>|<si>([\s\S]*?)<\/si>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) out.push(m[1] === undefined ? '' : joinText(m[1]));
  return out;
}

function parseSheet(xml: string, shared: string[]): Cells[] {
  const rows: Cells[] = [];
  const rowRe = /<row[^>]*\/>|<row[^>]*>([\s\S]*?)<\/row>/g;
  let rm: RegExpExecArray | null;
  while ((rm = rowRe.exec(xml))) {
    const cells: Cells = {};
    const body = rm[1];
    if (body) {
      const cellRe = /<c\s([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
      let cm: RegExpExecArray | null;
      while ((cm = cellRe.exec(body))) {
        const inner = cm[2];
        if (inner === undefined) continue;
        const col = /r="([A-Z]+)\d+"/.exec(cm[1]);
        if (!col) continue;
        const type = /t="([^"]+)"/.exec(cm[1])?.[1];
        if (type === 's') {
          const v = /<v>([\s\S]*?)<\/v>/.exec(inner);
          if (v) cells[col[1]] = shared[Number(v[1])];
        } else if (type === 'inlineStr') {
          cells[col[1]] = joinText(inner);
        } else {
          const v = /<v>([\s\S]*?)<\/v>/.exec(inner);
          if (v) cells[col[1]] = decodeEntities(v[1]);
        }
      }
    }
    rows.push(cells);
  }
  return rows;
}

// Read sheet1 of an .xlsx as an array of column-letter-keyed rows, in document order
// (row 0 = title, row 1 = header for the source sheets).
export function readXlsxSheet1(buf: Buffer): Cells[] {
  const entries = readZipEntries(buf);
  const sheet = entries.get('xl/worksheets/sheet1.xml');
  if (!sheet) throw new Error('xl/worksheets/sheet1.xml not found in workbook');
  const sharedXml = entries.get('xl/sharedStrings.xml');
  const shared = sharedXml ? parseSharedStrings(sharedXml.toString('utf8')) : [];
  return parseSheet(sheet.toString('utf8'), shared);
}
