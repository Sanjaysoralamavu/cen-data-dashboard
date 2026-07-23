const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const csvPath = path.join(projectRoot, "resources", "cen_response_collaboratory_from_json.csv");
const outputPath = path.join(projectRoot, "src", "data", "responses.json");

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        field += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(field);
      field = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      continue;
    }

    field += char;
  }

  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

function clean(value) {
  const text = String(value ?? "").trim();
  if (text.endsWith(".0") && /^\d+\.0$/.test(text)) {
    return text.slice(0, -2);
  }
  return text;
}

function main() {
  if (!fs.existsSync(csvPath)) {
    throw new Error(`CSV source not found: ${csvPath}`);
  }

  const csvText = fs.readFileSync(csvPath, "utf8").replace(/^\uFEFF/, "");
  const rows = parseCsv(csvText).filter((row) => row.some((cell) => clean(cell)));

  if (!rows.length) {
    throw new Error("CSV source has no usable rows.");
  }

  const headers = rows[0].map(clean);
  const records = [];

  for (const raw of rows.slice(1)) {
    const record = {};
    headers.forEach((header, index) => {
      record[header] = clean(raw[index] ?? "");
    });

    if (!record["Response ID"]) {
      continue;
    }

    records.push(record);
  }

  const payload = {
    source: csvPath,
    sheet: "CSV",
    rowCount: records.length,
    headers,
    records,
  };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

  console.log(
    JSON.stringify(
      {
        source: csvPath,
        output: outputPath,
        headers: headers.length,
        records: records.length,
      },
      null,
      2,
    ),
  );
}

main();
