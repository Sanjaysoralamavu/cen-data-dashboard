import json
import os
from datetime import date, datetime

import openpyxl


SOURCE = "/Users/sanjaysdev/Downloads/CEN Survey Response to collaboratory.xlsx"
OUTPUT = "/Users/sanjaysdev/Documents/New project/outputs/cen-response-viewer/src/data/responses.json"


def clean(value):
    if value is None:
        return ""
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    text = str(value).strip()
    if text.endswith(".0") and text[:-2].isdigit():
        return text[:-2]
    return text


def main():
    workbook = openpyxl.load_workbook(SOURCE, read_only=True, data_only=True)
    sheet = workbook.active
    rows = [
        tuple(clean(cell) for cell in row)
        for row in sheet.iter_rows(values_only=True)
        if any(clean(cell) for cell in row)
    ]
    if not rows:
        raise RuntimeError("Workbook has no usable rows.")

    headers = list(rows[0])
    records = []
    for raw in rows[1:]:
        record = {}
        for index, header in enumerate(headers):
            record[header] = raw[index] if index < len(raw) else ""
        response_id = clean(record.get("Response ID"))
        if not response_id:
            continue
        record["Response ID"] = response_id
        records.append(record)

    payload = {
        "source": SOURCE,
        "sheet": sheet.title,
        "rowCount": len(records),
        "headers": headers,
        "records": records,
    }
    os.makedirs(os.path.dirname(OUTPUT), exist_ok=True)
    with open(OUTPUT, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)
    print(json.dumps({"output": OUTPUT, "records": len(records)}, indent=2))


if __name__ == "__main__":
    main()
