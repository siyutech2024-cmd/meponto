"use client";

/**
 * Zero-dependency client-side .xlsx reader (first worksheet only).
 *
 * An xlsx file is a ZIP archive; we walk the central directory, inflate the
 * shared-strings and first sheet XML with the browser's native
 * DecompressionStream("deflate-raw"), and assemble rows from cell references.
 * Good enough for Eastwind report exports (plain grids, no merged cells).
 */

const textDecoder = new TextDecoder();

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

type ZipEntry = { name: string; method: number; compressedSize: number; localOffset: number };

function readCentralDirectory(bytes: Uint8Array): ZipEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // Find End Of Central Directory (signature 0x06054b50), search from the end.
  let eocd = -1;
  for (let i = bytes.length - 22; i >= 0; i -= 1) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd === -1) throw new Error("不是有效的 xlsx 文件（找不到 ZIP 目录）");

  const count = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);
  const entries: ZipEntry[] = [];

  for (let i = 0; i < count; i += 1) {
    if (view.getUint32(offset, true) !== 0x02014b50) break;
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = textDecoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
    entries.push({ name, method, compressedSize, localOffset });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

async function readEntry(bytes: Uint8Array, entry: ZipEntry): Promise<string> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const base = entry.localOffset;
  if (view.getUint32(base, true) !== 0x04034b50) throw new Error("ZIP 本地文件头损坏");
  const nameLength = view.getUint16(base + 26, true);
  const extraLength = view.getUint16(base + 28, true);
  const start = base + 30 + nameLength + extraLength;
  const data = bytes.subarray(start, start + entry.compressedSize);
  if (entry.method === 0) return textDecoder.decode(data);
  if (entry.method === 8) return textDecoder.decode(await inflateRaw(data));
  throw new Error(`不支持的压缩方式 ${entry.method}`);
}

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&amp;/g, "&");
}

function parseSharedStrings(xml: string): string[] {
  const strings: string[] = [];
  const items = xml.match(/<si[\s>][\s\S]*?<\/si>/g) ?? [];
  for (const item of items) {
    const texts = item.match(/<t[^>]*>([\s\S]*?)<\/t>/g) ?? [];
    strings.push(texts.map((t) => decodeXml(t.replace(/<t[^>]*>/, "").replace("</t>", ""))).join(""));
  }
  return strings;
}

function columnIndex(ref: string): number {
  let index = 0;
  for (const char of ref) {
    if (char >= "A" && char <= "Z") index = index * 26 + (char.charCodeAt(0) - 64);
    else break;
  }
  return index - 1;
}

/** Returns the first worksheet as a matrix of strings (empty string for blank cells). */
export async function readXlsxRows(buffer: ArrayBuffer): Promise<string[][]> {
  const bytes = new Uint8Array(buffer);
  const entries = readCentralDirectory(bytes);

  const sheetEntry =
    entries.find((entry) => /^xl\/worksheets\/sheet1\.xml$/i.test(entry.name)) ??
    entries.find((entry) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(entry.name));
  if (!sheetEntry) throw new Error("xlsx 中找不到工作表");
  const sharedEntry = entries.find((entry) => /^xl\/sharedStrings\.xml$/i.test(entry.name));

  const shared = sharedEntry ? parseSharedStrings(await readEntry(bytes, sharedEntry)) : [];
  const sheetXml = await readEntry(bytes, sheetEntry);

  const rows: string[][] = [];
  const rowMatches = sheetXml.match(/<row[\s>][\s\S]*?<\/row>/g) ?? [];
  for (const rowXml of rowMatches) {
    const row: string[] = [];
    const cellMatches = rowXml.match(/<c [^>]*\/>|<c [^>]*>[\s\S]*?<\/c>/g) ?? [];
    for (const cellXml of cellMatches) {
      const refMatch = cellXml.match(/r="([A-Z]+)\d+"/);
      const column = refMatch ? columnIndex(refMatch[1]) : row.length;
      const type = (cellXml.match(/t="([^"]+)"/) ?? [])[1] ?? "";
      let value = "";
      if (type === "inlineStr") {
        const texts = cellXml.match(/<t[^>]*>([\s\S]*?)<\/t>/g) ?? [];
        value = texts.map((t) => decodeXml(t.replace(/<t[^>]*>/, "").replace("</t>", ""))).join("");
      } else {
        const vMatch = cellXml.match(/<v>([\s\S]*?)<\/v>/);
        value = vMatch ? decodeXml(vMatch[1]) : "";
        if (type === "s") value = shared[Number(value)] ?? "";
      }
      while (row.length < column) row.push("");
      row[column] = value.trim();
    }
    rows.push(row);
  }
  return rows;
}

/** Map a header row + data rows into objects keyed by header text. */
export function rowsToObjects(rows: string[][]): Array<Record<string, string>> {
  if (rows.length < 2) return [];
  const headers = rows[0].map((header) => header.trim());
  return rows.slice(1).map((row) => {
    const record: Record<string, string> = {};
    headers.forEach((header, index) => {
      if (header) record[header] = (row[index] ?? "").trim();
    });
    return record;
  });
}
