import json
import re
import unicodedata
from collections import defaultdict
from difflib import SequenceMatcher
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SOURCE = ROOT.parent / "workbook-analysis.json"
OUTPUT = ROOT / "dist" / "catalog.js"


def normalize(value):
    text = unicodedata.normalize("NFKD", str(value or ""))
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    return re.sub(r"[^A-Z0-9]+", " ", text.upper()).strip()


def address(cell):
    match = re.fullmatch(r"([A-Z]+)(\d+)", cell)
    if not match:
        return 0, 0
    col = 0
    for ch in match.group(1):
        col = col * 26 + ord(ch) - 64
    return col, int(match.group(2))


book = json.loads(SOURCE.read_text(encoding="utf-8"))
sheets = {sheet["name"]: sheet for sheet in book["sheets"]}
master = sheets["Thông tin công đoạn từng model"]
rows = defaultdict(dict)
for cell in master["cells"]:
    col, row = address(cell["cell"])
    rows[row][col] = cell.get("value")

catalog = defaultdict(list)
for row in sorted(rows):
    values = rows[row]
    model = str(values.get(2) or "").strip()
    process = str(values.get(5) or "").strip()
    if not model or not process or model == "Model / phiên bản":
        continue
    catalog[model].append({
        "name": process,
        "category": str(values.get(4) or "DÁN & ÉP").strip(),
        "skill25": str(values.get(6) or "").strip(),
        "skill40": str(values.get(7) or "").strip(),
    })

layout_sheets = [s for s in book["sheets"] if normalize(s["name"]).startswith("LAYOUT")]


def best_sheet(model):
    target = normalize(model).replace("BLOCK", " BLOCK ")
    best = None
    best_score = 0
    for sheet in layout_sheets:
        candidate = normalize(sheet["name"]).replace("LAYOUT", "").strip()
        score = SequenceMatcher(None, target, candidate).ratio()
        if normalize(model).replace(" ", "") in candidate.replace(" ", ""):
            score += 0.6
        if ("BLOCK 3" in target) == ("BLOCK 3" in candidate):
            score += 0.2
        else:
            score -= 0.25
        if score > best_score:
            best, best_score = sheet, score
    return best if best_score >= 0.72 else None


def score_name(process, value):
    a, b = normalize(process), normalize(value)
    if not a or not b or len(b) < 3:
        return 0
    if a == b:
        return 2
    if len(a) >= 8 and (a in b or b in a):
        return 1.35 + min(len(a), len(b)) / max(len(a), len(b)) * 0.25
    return SequenceMatcher(None, a, b).ratio()


positions = {}
matched_total = 0
for model, processes in catalog.items():
    sheet = best_sheet(model)
    if not sheet:
        continue
    candidates = []
    cell_map = {}
    for cell in sheet["cells"]:
        col, row = address(cell["cell"])
        value = cell.get("value")
        cell_map[(col, row)] = value
        if isinstance(value, str) and len(normalize(value)) >= 3:
            candidates.append((col, row, value))
    found = []
    used = set()
    for index, process in enumerate(processes):
        ranked = sorted(((score_name(process["name"], value), col, row, value) for col, row, value in candidates if (col, row) not in used), reverse=True)
        if not ranked or ranked[0][0] < 0.69:
            continue
        score, col, row, value = ranked[0]
        used.add((col, row))
        time_value = 0
        station_no = cell_map.get((col, row - 1))
        try:
            station_no = int(float(station_no))
        except (TypeError, ValueError):
            station_no = 0
        for delta in (1, 2, -1):
            raw = cell_map.get((col, row + delta))
            if isinstance(raw, (int, float)) and 0 < raw < 1000:
                time_value = round(float(raw), 2)
                break
        found.append({"index": index, "col": col, "row": row, "time": time_value, "stt": station_no, "score": round(score, 2)})
    if not found:
        continue
    row_order = {row: lane for lane, row in enumerate(sorted({item["row"] for item in found}))}
    by_lane = defaultdict(list)
    for item in found:
        by_lane[row_order[item["row"]]].append(item)
    output = []
    for lane, items in by_lane.items():
        for sequence, item in enumerate(sorted(items, key=lambda x: x["col"])):
            output.append({
                "index": item["index"],
                "name": processes[item["index"]]["name"],
                "stt": item["stt"],
                "x": sequence * 78,
                "y": 60 + lane * 94,
                "time": item["time"],
            })
    positions[model] = {"sheet": sheet["name"], "matched": len(output), "items": output}
    matched_total += len(output)

payload = (
    "window.LOB_CATALOG=" + json.dumps(catalog, ensure_ascii=False, separators=(",", ":")) + ";\n"
    "window.LOB_POSITIONS=" + json.dumps(positions, ensure_ascii=False, separators=(",", ":")) + ";\n"
)
OUTPUT.write_text(payload, encoding="utf-8")
print(f"Generated {len(catalog)} models, {sum(map(len, catalog.values()))} processes; matched {matched_total} positions across {len(positions)} layouts")
