/* יצירת קובץ Excel (.xlsx) ללא ספריות חיצוניות.
   xlsx הוא קובץ ZIP של מסמכי XML; כאן נבנה ZIP ללא דחיסה (stored). */
(function (root) {
  'use strict';

  /* ===== CRC32 ===== */
  var crcTable = (function () {
    var table = new Int32Array(256);
    for (var i = 0; i < 256; i++) {
      var value = i;
      for (var bit = 0; bit < 8; bit++) {
        value = (value & 1) ? (0xEDB88320 ^ (value >>> 1)) : (value >>> 1);
      }
      table[i] = value;
    }
    return table;
  })();

  function crc32(bytes) {
    var crc = -1;
    for (var i = 0; i < bytes.length; i++) {
      crc = (crc >>> 8) ^ crcTable[(crc ^ bytes[i]) & 0xFF];
    }
    return (crc ^ -1) >>> 0;
  }

  var encoder = new TextEncoder();
  function utf8(text) { return encoder.encode(text); }

  /* ===== ZIP (stored) ===== */
  function zip(files) {
    var parts = [], central = [], offset = 0;

    files.forEach(function (file) {
      var nameBytes = utf8(file.name);
      var data = file.data;
      var crc = crc32(data);

      var local = new Uint8Array(30 + nameBytes.length);
      var view = new DataView(local.buffer);
      view.setUint32(0, 0x04034b50, true);
      view.setUint16(4, 20, true);        // version needed
      view.setUint16(6, 0x0800, true);    // שמות קבצים ב-UTF-8
      view.setUint16(8, 0, true);         // ללא דחיסה
      view.setUint16(10, 0, true);        // שעה
      view.setUint16(12, 0x21, true);     // תאריך (1980-01-01)
      view.setUint32(14, crc, true);
      view.setUint32(18, data.length, true);
      view.setUint32(22, data.length, true);
      view.setUint16(26, nameBytes.length, true);
      view.setUint16(28, 0, true);
      local.set(nameBytes, 30);

      parts.push(local, data);

      var entry = new Uint8Array(46 + nameBytes.length);
      var entryView = new DataView(entry.buffer);
      entryView.setUint32(0, 0x02014b50, true);
      entryView.setUint16(4, 20, true);
      entryView.setUint16(6, 20, true);
      entryView.setUint16(8, 0x0800, true);
      entryView.setUint16(10, 0, true);
      entryView.setUint16(12, 0, true);
      entryView.setUint16(14, 0x21, true);
      entryView.setUint32(16, crc, true);
      entryView.setUint32(20, data.length, true);
      entryView.setUint32(24, data.length, true);
      entryView.setUint16(28, nameBytes.length, true);
      entryView.setUint32(42, offset, true);
      entry.set(nameBytes, 46);
      central.push(entry);

      offset += local.length + data.length;
    });

    var centralSize = central.reduce(function (sum, entry) { return sum + entry.length; }, 0);
    var end = new Uint8Array(22);
    var endView = new DataView(end.buffer);
    endView.setUint32(0, 0x06054b50, true);
    endView.setUint16(8, files.length, true);
    endView.setUint16(10, files.length, true);
    endView.setUint32(12, centralSize, true);
    endView.setUint32(16, offset, true);

    var all = parts.concat(central, [end]);
    var total = all.reduce(function (sum, part) { return sum + part.length; }, 0);
    var out = new Uint8Array(total);
    var pos = 0;
    all.forEach(function (part) { out.set(part, pos); pos += part.length; });
    return out;
  }

  /* ===== XML ===== */
  function esc(text) {
    return String(text == null ? '' : text)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/\n/g, '&#10;');
  }

  function colName(index) {
    var name = '';
    var n = index + 1;
    while (n > 0) {
      var rem = (n - 1) % 26;
      name = String.fromCharCode(65 + rem) + name;
      n = Math.floor((n - 1) / 26);
    }
    return name;
  }

  /* מזהי העיצובים הזמינים לתאים (ראו cellXfs להלן) */
  var STYLE = {
    DEFAULT: 0, TITLE: 1, SUBTITLE: 2, HEADER: 3, ROW_HEAD: 4,
    MORNING: 5, MIDDLE: 6, EVENING: 7, PLAIN: 8, CLOSED: 9, TOTAL: 10
  };

  function stylesXml() {
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<fonts count="6">' +
        '<font><sz val="11"/><name val="Arial"/></font>' +
        '<font><b/><sz val="11"/><name val="Arial"/></font>' +
        '<font><b/><sz val="14"/><name val="Arial"/></font>' +
        '<font><i/><sz val="10"/><color rgb="FF667085"/><name val="Arial"/></font>' +
        '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Arial"/></font>' +
        '<font><sz val="10"/><color rgb="FF8A94A6"/><name val="Arial"/></font>' +
      '</fonts>' +
      '<fills count="8">' +
        '<fill><patternFill patternType="none"/></fill>' +
        '<fill><patternFill patternType="gray125"/></fill>' +
        '<fill><patternFill patternType="solid"><fgColor rgb="FF2F5FE0"/><bgColor indexed="64"/></patternFill></fill>' +
        '<fill><patternFill patternType="solid"><fgColor rgb="FFF0F3FA"/><bgColor indexed="64"/></patternFill></fill>' +
        '<fill><patternFill patternType="solid"><fgColor rgb="FFFBEECB"/><bgColor indexed="64"/></patternFill></fill>' +
        '<fill><patternFill patternType="solid"><fgColor rgb="FFD6F0E4"/><bgColor indexed="64"/></patternFill></fill>' +
        '<fill><patternFill patternType="solid"><fgColor rgb="FFDDE5FA"/><bgColor indexed="64"/></patternFill></fill>' +
        '<fill><patternFill patternType="solid"><fgColor rgb="FFF2F3F5"/><bgColor indexed="64"/></patternFill></fill>' +
      '</fills>' +
      '<borders count="2">' +
        '<border><left/><right/><top/><bottom/><diagonal/></border>' +
        '<border>' +
          '<left style="thin"><color rgb="FFD5DBE7"/></left>' +
          '<right style="thin"><color rgb="FFD5DBE7"/></right>' +
          '<top style="thin"><color rgb="FFD5DBE7"/></top>' +
          '<bottom style="thin"><color rgb="FFD5DBE7"/></bottom>' +
          '<diagonal/>' +
        '</border>' +
      '</borders>' +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      '<cellXfs count="11">' +
        '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
        '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
        '<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
        '<xf numFmtId="0" fontId="4" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">' +
          '<alignment horizontal="center" vertical="center" wrapText="1"/></xf>' +
        '<xf numFmtId="0" fontId="1" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">' +
          '<alignment horizontal="right" vertical="center" wrapText="1"/></xf>' +
        '<xf numFmtId="0" fontId="0" fillId="4" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1">' +
          '<alignment horizontal="center" vertical="center" wrapText="1"/></xf>' +
        '<xf numFmtId="0" fontId="0" fillId="5" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1">' +
          '<alignment horizontal="center" vertical="center" wrapText="1"/></xf>' +
        '<xf numFmtId="0" fontId="0" fillId="6" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1">' +
          '<alignment horizontal="center" vertical="center" wrapText="1"/></xf>' +
        '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1">' +
          '<alignment horizontal="center" vertical="center" wrapText="1"/></xf>' +
        '<xf numFmtId="0" fontId="5" fillId="7" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">' +
          '<alignment horizontal="center" vertical="center"/></xf>' +
        '<xf numFmtId="0" fontId="1" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">' +
          '<alignment horizontal="center" vertical="center"/></xf>' +
      '</cellXfs>' +
      '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
      '</styleSheet>';
  }

  function sheetXml(sheet) {
    var xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">';

    xml += '<sheetViews><sheetView rightToLeft="1" workbookViewId="0"';
    xml += sheet.selected ? ' tabSelected="1"' : '';
    xml += '>';
    if (sheet.freeze) {
      var topLeft = colName(sheet.freeze.col) + (sheet.freeze.row + 1);
      xml += '<pane xSplit="' + sheet.freeze.col + '" ySplit="' + sheet.freeze.row +
        '" topLeftCell="' + topLeft + '" activePane="bottomRight" state="frozen"/>';
    }
    xml += '</sheetView></sheetViews>';
    xml += '<sheetFormatPr defaultRowHeight="15"/>';

    if (sheet.cols && sheet.cols.length) {
      xml += '<cols>';
      sheet.cols.forEach(function (width, index) {
        xml += '<col min="' + (index + 1) + '" max="' + (index + 1) + '" width="' + width + '" customWidth="1"/>';
      });
      xml += '</cols>';
    }

    xml += '<sheetData>';
    sheet.rows.forEach(function (row, rowIndex) {
      var cells = row.cells || row;
      xml += '<row r="' + (rowIndex + 1) + '"';
      if (row.height) xml += ' ht="' + row.height + '" customHeight="1"';
      xml += '>';
      cells.forEach(function (cell, colIndex) {
        if (cell == null || cell === '') return;
        var value = typeof cell === 'object' ? cell.v : cell;
        var style = typeof cell === 'object' ? (cell.s || 0) : 0;
        if (value == null || value === '') return;
        var ref = colName(colIndex) + (rowIndex + 1);
        if (typeof value === 'number') {
          xml += '<c r="' + ref + '" s="' + style + '"><v>' + value + '</v></c>';
        } else {
          xml += '<c r="' + ref + '" s="' + style + '" t="inlineStr"><is><t xml:space="preserve">' +
            esc(value) + '</t></is></c>';
        }
      });
      xml += '</row>';
    });
    xml += '</sheetData>';

    if (sheet.merges && sheet.merges.length) {
      xml += '<mergeCells count="' + sheet.merges.length + '">';
      sheet.merges.forEach(function (merge) {
        xml += '<mergeCell ref="' + colName(merge.c1) + (merge.r1 + 1) + ':' +
          colName(merge.c2) + (merge.r2 + 1) + '"/>';
      });
      xml += '</mergeCells>';
    }

    xml += '<pageMargins left="0.3" right="0.3" top="0.5" bottom="0.5" header="0.3" footer="0.3"/>';
    xml += '<pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/>';
    return xml + '</worksheet>';
  }

  /* שם גיליון חוקי: עד 31 תווים, ללא : \ / ? * [ ] */
  function safeSheetName(name, index) {
    var clean = String(name || '').replace(/[:\\\/?*\[\]]/g, ' ').slice(0, 31).trim();
    return clean || ('גיליון ' + (index + 1));
  }

  function build(sheets) {
    var names = sheets.map(function (sheet, index) { return safeSheetName(sheet.name, index); });

    var workbook = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"' +
      ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<sheets>' +
      names.map(function (name, index) {
        return '<sheet name="' + esc(name) + '" sheetId="' + (index + 1) + '" r:id="rId' + (index + 1) + '"/>';
      }).join('') +
      '</sheets></workbook>';

    var workbookRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      sheets.map(function (sheet, index) {
        return '<Relationship Id="rId' + (index + 1) +
          '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet"' +
          ' Target="worksheets/sheet' + (index + 1) + '.xml"/>';
      }).join('') +
      '<Relationship Id="rId' + (sheets.length + 1) +
      '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
      '</Relationships>';

    var contentTypes = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      sheets.map(function (sheet, index) {
        return '<Override PartName="/xl/worksheets/sheet' + (index + 1) +
          '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>';
      }).join('') +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      '</Types>';

    var rootRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
      '</Relationships>';

    var files = [
      { name: '[Content_Types].xml', data: utf8(contentTypes) },
      { name: '_rels/.rels', data: utf8(rootRels) },
      { name: 'xl/workbook.xml', data: utf8(workbook) },
      { name: 'xl/_rels/workbook.xml.rels', data: utf8(workbookRels) },
      { name: 'xl/styles.xml', data: utf8(stylesXml()) }
    ];
    sheets.forEach(function (sheet, index) {
      files.push({ name: 'xl/worksheets/sheet' + (index + 1) + '.xml', data: utf8(sheetXml(sheet)) });
    });

    return zip(files);
  }

  var API = { build: build, STYLE: STYLE, colName: colName };
  root.ShiftXlsx = API;
  if (typeof module !== 'undefined' && module.exports) { module.exports = API; }
})(typeof window !== 'undefined' ? window : globalThis);
