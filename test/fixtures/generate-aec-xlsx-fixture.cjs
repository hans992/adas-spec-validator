const ExcelJS = require("exceljs");
const path = require("node:path");

async function main() {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "AEC Spec Validator tests";

  const packageSheet = workbook.addWorksheet("Package");
  packageSheet.addRows([
    ["Specification name", "Riverside Office Building Specification"],
    ["Specification revision", "C"],
    ["Requirement count", 120]
  ]);

  const instructions = workbook.addWorksheet("Instructions", { state: "hidden" });
  instructions.addRow(["This hidden sheet documents the source workbook and must never be auto-selected."]);

  const sheet = workbook.addWorksheet("Requirements");
  sheet.mergeCells("A1:O1");
  sheet.getCell("A1").value = "Riverside Office — architectural and life-safety requirements";
  sheet.getCell("A1").font = { bold: true, size: 14 };
  sheet.addRow([]);
  sheet.addRow([
    "Requirement ID",
    "Requirement Title",
    "Details",
    "Trade",
    "Rule Type",
    "Priority",
    "Room Type",
    "Minimum Value",
    "Maximum Value",
    "Units",
    "Quantity Type",
    "Document",
    "Section",
    "Document Revision",
    "Notes"
  ]);
  sheet.getRow(3).font = { bold: true };
  sheet.views = [{ state: "frozen", ySplit: 3 }];
  sheet.getColumn(15).hidden = true;

  for (let index = 1; index <= 120; index += 1) {
    const id = `AEC-${String(index).padStart(4, "0")}`;
    if (index % 10 === 0) {
      sheet.addRow([
        id,
        `Escape route clause ${index}`,
        "All escape routes shall remain unobstructed.",
        "Life Safety",
        "textual_requirement",
        "critical",
        "corridor",
        "",
        "",
        "",
        "untyped",
        "Riverside Employer Requirements",
        `LS-${index}`,
        "C",
        "Requires deterministic rule configuration"
      ]);
    } else if (index % 2 === 0) {
      sheet.addRow([
        id,
        `Office usable area ${index}`,
        "Office area must remain within the stated range.",
        "Architecture",
        "minimum_room_area",
        index % 6 === 0 ? "critical" : "warning",
        "office",
        index === 2 ? "12,5" : 12 + (index % 3),
        24,
        "m²",
        "area",
        "Riverside Architectural Specification",
        `A-${index}`,
        "C",
        ""
      ]);
    } else {
      const row = sheet.addRow([
        id,
        `Office clear door width ${index}`,
        "Connected office doors must satisfy the clear-width threshold.",
        "Architecture",
        "minimum_door_width_for_room_type",
        "warning",
        "office",
        index === 3 ? "90,0" : 900,
        1200,
        index === 3 ? "cm" : "mm",
        "length",
        "Riverside Architectural Specification",
        `A-${index}`,
        "C",
        ""
      ]);
      if (index === 5) {
        row.getCell(8).value = { formula: "450+450", result: 900 };
      }
    }
    if (index === 60) sheet.addRow([]);
  }

  const problems = workbook.addWorksheet("Problem Cases");
  problems.addRow(["id", "title", "type", "severity", "minimum", "unit"]);
  problems.addRow(["DUP-1", "First duplicate", "minimum_room_area", "warning", 10, "m²"]);
  problems.addRow(["DUP-1", "Second duplicate", "minimum_room_area", "warning", 12, "m²"]);
  problems.addRow(["", "Missing identifier", "room_has_connected_door", "warning", "", ""]);
  const formulaRow = problems.addRow(["FORMULA-1", "Formula without result", "minimum_room_area", "warning", "", "m²"]);
  formulaRow.getCell(5).value = { formula: "5+5" };

  const legacy = workbook.addWorksheet("Legacy archive", { state: "veryHidden" });
  legacy.addRow(["Requirement ID", "Requirement Title"]);
  legacy.addRow(["OLD-1", "Archived requirement"]);

  const output = path.join(__dirname, "aec-building-requirements.xlsx");
  await workbook.xlsx.writeFile(output);
  console.log(`Generated ${output}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
