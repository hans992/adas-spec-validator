const { writeFileSync } = require("node:fs");
const path = require("node:path");
const { PDFDocument, StandardFonts } = require("pdf-lib");

async function main() {
  const doc = await PDFDocument.create();
  doc.setTitle("Riverside Office Building PDF Specification");
  doc.setAuthor("AEC Spec Validator fixtures");
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([595.28, 841.89]);

  page.drawText("1 Architectural requirements", { x: 50, y: 780, size: 16, font });
  page.drawText("1.1 Office rooms shall provide at least 12 m2 of usable floor area.", {
    x: 50, y: 750, size: 11, font
  });
  page.drawText("1.2 Doors must provide a clear width of 0.85 m.", { x: 50, y: 730, size: 11, font });
  page.drawText("Fluchtwege muss jederzeit frei bleiben und darf nicht verstellt werden.", {
    x: 50, y: 700, size: 11, font
  });
  page.drawText("Element", { x: 50, y: 650, size: 11, font });
  page.drawText("Requirement", { x: 250, y: 650, size: 11, font });
  page.drawText("Corridor", { x: 50, y: 630, size: 11, font });
  page.drawText("Corridors shall remain free of storage.", { x: 250, y: 630, size: 11, font });

  // Second page intentionally has almost no digital text (scanned-page stand-in).
  doc.addPage([595.28, 841.89]);

  const bytes = await doc.save();
  const out = path.join(__dirname, "aec-building-requirements.pdf");
  writeFileSync(out, bytes);
  console.log(`Wrote ${out} (${bytes.length} bytes)`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
