/**
 * Minimal, dependency-free XLSX (Excel) export.
 *
 * A .xlsx is a ZIP archive of OOXML parts. The diary / TA exports also build
 * a simple grid, which we write here as a single worksheet using inline
 * strings and a STORE-method ZIP (reusing docx.ts' writer) — no spreadsheet
 * library required, works fully offline in the Capacitor shell.
 */

import { makeZip } from "./docx";

export type XlsxCell = string | number | { v: string | number; bold?: boolean };
/** 0-indexed inclusive merge: [row1, col1, row2, col2] */
export type XlsxMerge = [number, number, number, number];

export type XlsxSheet = {
  rows: XlsxCell[][];
  merges?: XlsxMerge[];
  colWidths?: number[];
};

const NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const R_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const PKG_NS = "http://schemas.openxmlformats.org/package/2006/content-types";
const REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships";

function colLetter(i: number): string {
  let s = "";
  let n = i + 1;
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function cellXml(ref: string, cell: XlsxCell): string {
  const bold = typeof cell === "object" && cell.bold;
  const style = bold ? ' s="1"' : "";
  if (typeof cell === "object" && typeof cell.v === "number") {
    return `<c r="${ref}"${style}><v>${cell.v}</v></c>`;
  }
  if (typeof cell === "number") {
    return `<c r="${ref}"${style}><v>${cell}</v></c>`;
  }
  const text = typeof cell === "object" ? String(cell.v) : cell;
  return `<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">${esc(text)}</t></is></c>`;
}

/** Build a single-sheet .xlsx as a STORE-method ZIP of OOXML parts. */
export function buildXlsx(sheet: XlsxSheet): Uint8Array {
  const { rows, merges = [], colWidths = [] } = sheet;

  const cols =
    colWidths.length > 0
      ? `<cols>${colWidths
          .map(
            (w, i) =>
              `<col min="${i + 1}" max="${i + 1}" width="${Math.max(Number(w) || 8, 4)}" customWidth="1"/>`
          )
          .join("")}</cols>`
      : "";

  const sheetData = rows
    .map(
      (row, ri) =>
        `<row r="${ri + 1}">${row
          .map((c, ci) => cellXml(`${colLetter(ci)}${ri + 1}`, c))
          .join("")}</row>`
    )
    .join("");

  const mergeXml =
    merges.length > 0
      ? `<mergeCells count="${merges.length}">${merges
          .map(
            ([r1, c1, r2, c2]) =>
              `<mergeCell ref="${colLetter(c1)}${r1 + 1}:${colLetter(c2)}${r2 + 1}"/>`
          )
          .join("")}</mergeCells>`
      : "";

  const worksheetXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    `<worksheet xmlns="${NS}">` +
    cols +
    `<sheetData>${sheetData}</sheetData>` +
    mergeXml +
    `</worksheet>`;

  const contentTypes =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    `<Types xmlns="${PKG_NS}">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
    `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
    `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
    `</Types>`;

  const rels =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    `<Relationships xmlns="${REL_NS}">` +
    `<Relationship Id="rId1" Type="${R_NS}/officeDocument" Target="xl/workbook.xml"/>` +
    `</Relationships>`;

  const workbookXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    `<workbook xmlns="${NS}" xmlns:r="${R_NS}">` +
    `<sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets>` +
    `</workbook>`;

  const workbookRels =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    `<Relationships xmlns="${REL_NS}">` +
    `<Relationship Id="rId1" Type="${R_NS}/worksheet" Target="worksheets/sheet1.xml"/>` +
    `<Relationship Id="rId2" Type="${R_NS}/styles" Target="styles.xml"/>` +
    `</Relationships>`;

  // Style 0 = default; style 1 = bold. Enough for the export grids.
  const stylesXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    `<styleSheet xmlns="${NS}">` +
    `<fonts count="2">` +
    `<font><sz val="10"/><name val="Calibri"/></font>` +
    `<font><b/><sz val="10"/><name val="Calibri"/></font>` +
    `</fonts>` +
    `<fills count="2">` +
    `<fill><patternFill patternType="none"/></fill>` +
    `<fill><patternFill patternType="gray125"/></fill>` +
    `</fills>` +
    `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>` +
    `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
    `<cellXfs count="2">` +
    `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +
    `<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>` +
    `</cellXfs>` +
    `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>` +
    `</styleSheet>`;

  return makeZip([
    { name: "[Content_Types].xml", data: contentTypes },
    { name: "_rels/.rels", data: rels },
    { name: "xl/workbook.xml", data: workbookXml },
    { name: "xl/_rels/workbook.xml.rels", data: workbookRels },
    { name: "xl/worksheets/sheet1.xml", data: worksheetXml },
    { name: "xl/styles.xml", data: stylesXml },
  ]);
}

/** Base64 of the built .xlsx (used by native save/share). */
export function xlsxToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}
