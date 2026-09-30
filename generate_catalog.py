import json
from pathlib import Path

source = Path(__file__).parent.parent / "workbook-analysis.json"
data = json.loads(source.read_text(encoding="utf-8"))
sheet = next(s for s in data["sheets"] if s["name"] == "Thông tin công đoạn từng model")
rows = {}
for cell in sheet["cells"]:
    address = cell["cell"]
    col = "".join(c for c in address if c.isalpha())
    row = int("".join(c for c in address if c.isdigit()))
    rows.setdefault(row, {})[col] = cell["value"]

catalog = {}
for row_no, row in sorted(rows.items()):
    if row_no == 1 or not row.get("B") or not row.get("E"):
        continue
    model = str(row["B"]).strip()
    catalog.setdefault(model, []).append({
        "name": str(row["E"]).strip(),
        "category": str(row.get("D") or "DÁN & ÉP").strip(),
        "skill25": str(row.get("F") or "").strip(),
        "skill40": str(row.get("G") or "").strip(),
    })

target = Path(__file__).parent / "dist" / "catalog.js"
target.write_text("window.LOB_CATALOG=" + json.dumps(catalog, ensure_ascii=False, separators=(",", ":")) + ";\n", encoding="utf-8")
print(f"Generated {len(catalog)} models and {sum(map(len, catalog.values()))} processes")
