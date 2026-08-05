const fs = require("node:fs");
const path = require("node:path");
const JSZip = require("jszip");

function documentXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    <w:p>
      <w:pPr><w:pStyle w:val="Heading1"/></w:pPr>
      <w:r><w:t>1 Architectural requirements</w:t></w:r>
    </w:p>
    <w:p>
      <w:pPr>
        <w:numPr>
          <w:ilvl w:val="0"/>
          <w:numId w:val="1"/>
        </w:numPr>
      </w:pPr>
      <w:r><w:t>Office rooms shall provide at least 12 m² of usable floor area.</w:t></w:r>
    </w:p>
    <w:p>
      <w:pPr>
        <w:numPr>
          <w:ilvl w:val="0"/>
          <w:numId w:val="1"/>
        </w:numPr>
      </w:pPr>
      <w:r><w:t>Doors must provide a clear width of 0.85 m.</w:t></w:r>
      <w:r>
        <w:hyperlink r:id="rIdLink">
          <w:r><w:t> See reference.</w:t></w:r>
        </w:hyperlink>
      </w:r>
      <w:r><w:footnoteReference w:id="1"/></w:r>
    </w:p>
    <w:p>
      <w:pPr><w:pStyle w:val="Heading2"/></w:pPr>
      <w:r><w:t>1.1 German clauses</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>Fluchtwege müssen jederzeit frei bleiben und dürfen nicht verstellt werden.</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>This paragraph was </w:t></w:r>
      <w:ins w:author="Reviewer" w:date="2026-01-01T00:00:00Z">
        <w:r><w:t>inserted by track changes and shall be flagged</w:t></w:r>
      </w:ins>
      <w:del w:author="Reviewer" w:date="2026-01-01T00:00:00Z">
        <w:r><w:delText>deleted obsolete shall clause</w:delText></w:r>
      </w:del>
      <w:r><w:t>.</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>Split candidate: First sentence stays here. Second sentence becomes another requirement.</w:t></w:r>
    </w:p>
    <w:tbl>
      <w:tr>
        <w:tc><w:p><w:r><w:t>Element</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>Requirement</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:p><w:r><w:t>Corridor</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>Corridors shall remain free of storage.</w:t></w:r></w:p></w:tc>
      </w:tr>
    </w:tbl>
    <w:p>
      <w:r>
        <w:drawing>
          <w:txbxContent>
            <w:p><w:r><w:t>Text inside a text box must not be silently imported.</w:t></w:r></w:p>
          </w:txbxContent>
        </w:drawing>
      </w:r>
      <w:r><w:object/></w:r>
    </w:p>
    <w:sectPr/>
  </w:body>
</w:document>`;
}

function numberingXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:abstractNum w:abstractNumId="0">
    <w:lvl w:ilvl="0"><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/></w:lvl>
    <w:lvl w:ilvl="1"><w:numFmt w:val="decimal"/><w:lvlText w:val="%1.%2"/></w:lvl>
  </w:abstractNum>
  <w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>
</w:numbering>`;
}

function contentTypes() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
</Types>`;
}

function rels() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
</Relationships>`;
}

function documentRels() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rIdNumbering" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>
  <Relationship Id="rIdLink" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://example.invalid/spec" TargetMode="External"/>
</Relationships>`;
}

function coreXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"
  xmlns:dc="http://purl.org/dc/elements/1.1/"
  xmlns:dcterms="http://purl.org/dc/terms/"
  xmlns:dcmitype="http://purl.org/dc/dcmitype/"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>Riverside Office Building DOCX Specification</dc:title>
  <dc:creator>AEC Spec Validator fixtures</dc:creator>
  <dc:subject>Architecture</dc:subject>
  <dcterms:created xsi:type="dcterms:W3CDTF">2026-08-05T00:00:00Z</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">2026-08-05T00:00:00Z</dcterms:modified>
</cp:coreProperties>`;
}

async function main() {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", contentTypes());
  zip.folder("_rels").file(".rels", rels());
  zip.folder("word").file("document.xml", documentXml());
  zip.folder("word").file("numbering.xml", numberingXml());
  zip.folder("word").folder("_rels").file("document.xml.rels", documentRels());
  zip.folder("docProps").file("core.xml", coreXml());
  const buffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  const out = path.join(__dirname, "aec-building-requirements.docx");
  fs.writeFileSync(out, buffer);
  console.log(`Wrote ${out} (${buffer.length} bytes)`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
