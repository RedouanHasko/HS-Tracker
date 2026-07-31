from __future__ import annotations

import json
import sys
from datetime import date, datetime
from pathlib import Path
from typing import Any

from openpyxl import load_workbook
from openpyxl.utils import get_column_letter
from openpyxl.styles.colors import COLOR_INDEX
from PIL import Image, ImageDraw, ImageFont


def json_value(value: Any) -> Any:
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    return value


def color_hex(color: Any, fallback: str) -> str:
    if color is None:
        return fallback
    if color.type == "rgb" and color.rgb:
        value = color.rgb[-6:]
        return f"#{value}"
    if color.type == "indexed" and color.indexed is not None:
        indexed = int(color.indexed)
        if 0 <= indexed < len(COLOR_INDEX):
            return f"#{COLOR_INDEX[indexed][-6:]}"
    return fallback


def text_color_for(background: str) -> str:
    red, green, blue = (int(background[i : i + 2], 16) for i in (1, 3, 5))
    luminance = 0.299 * red + 0.587 * green + 0.114 * blue
    return "#FFFFFF" if luminance < 120 else "#111827"


def render_sheet(sheet: Any, output_path: Path) -> None:
    max_row = max(1, sheet.max_row)
    max_col = max(1, sheet.max_column)
    base_width = 110
    row_height = 30
    column_widths = []
    for col_idx in range(1, max_col + 1):
        letter = get_column_letter(col_idx)
        configured = sheet.column_dimensions[letter].width or 12
        column_widths.append(max(62, min(240, int(configured * 8))))
    image_width = min(6000, sum(column_widths) + 1)
    image_height = min(12000, max_row * row_height + 1)
    image = Image.new("RGB", (image_width, image_height), "white")
    draw = ImageDraw.Draw(image)
    font = ImageFont.load_default()

    x_offsets = [0]
    for width in column_widths:
        x_offsets.append(x_offsets[-1] + width)

    merged_anchors = {}
    merged_children = set()
    for merged in sheet.merged_cells.ranges:
        anchor = (merged.min_row, merged.min_col)
        merged_anchors[anchor] = merged
        for row_idx in range(merged.min_row, merged.max_row + 1):
            for col_idx in range(merged.min_col, merged.max_col + 1):
                if (row_idx, col_idx) != anchor:
                    merged_children.add((row_idx, col_idx))

    for row_idx in range(1, max_row + 1):
        y1 = (row_idx - 1) * row_height
        y2 = y1 + row_height
        for col_idx in range(1, max_col + 1):
            if (row_idx, col_idx) in merged_children:
                continue
            cell = sheet.cell(row_idx, col_idx)
            merged = merged_anchors.get((row_idx, col_idx))
            end_col = merged.max_col if merged else col_idx
            end_row = merged.max_row if merged else row_idx
            x1 = x_offsets[col_idx - 1]
            x2 = x_offsets[end_col]
            cell_y2 = end_row * row_height
            fill = color_hex(cell.fill.fgColor, "#FFFFFF") if cell.fill.fill_type else "#FFFFFF"
            draw.rectangle((x1, y1, x2, cell_y2), fill=fill, outline="#D1D5DB", width=1)
            value = cell.value
            if value is None:
                continue
            text = str(value).replace("\n", " ")
            max_chars = max(4, int((x2 - x1) / 7))
            if len(text) > max_chars:
                text = text[: max_chars - 1] + "..."
            foreground = color_hex(cell.font.color, text_color_for(fill)) if cell.font.color else text_color_for(fill)
            draw.text((x1 + 4, y1 + 8), text, fill=foreground, font=font)

    image.save(output_path)


def inspect_workbook(path: Path, output_dir: Path) -> dict[str, Any]:
    workbook = load_workbook(path, data_only=False)
    values_workbook = load_workbook(path, data_only=True)
    workbook_result: dict[str, Any] = {
        "path": str(path),
        "sheet_names": workbook.sheetnames,
        "defined_names": [str(item) for item in workbook.defined_names.values()],
        "sheets": [],
    }

    for sheet in workbook.worksheets:
        values_sheet = values_workbook[sheet.title]
        cells = []
        formula_count = 0
        nonempty_count = 0
        for row in sheet.iter_rows():
            for cell in row:
                if cell.value is None:
                    continue
                nonempty_count += 1
                is_formula = isinstance(cell.value, str) and cell.value.startswith("=")
                if is_formula:
                    formula_count += 1
                cells.append(
                    {
                        "coordinate": cell.coordinate,
                        "value": json_value(cell.value),
                        "calculated_value": json_value(values_sheet[cell.coordinate].value),
                        "data_type": cell.data_type,
                        "number_format": cell.number_format,
                        "style_id": cell.style_id,
                        "fill": color_hex(cell.fill.fgColor, "") if cell.fill.fill_type else "",
                        "bold": bool(cell.font.bold),
                        "hidden_row": bool(sheet.row_dimensions[cell.row].hidden),
                        "hidden_column": bool(sheet.column_dimensions[cell.column_letter].hidden),
                    }
                )

        safe_name = "".join(character if character.isalnum() else "_" for character in sheet.title)
        render_path = output_dir / f"{path.stem}__{safe_name}.png"
        render_sheet(sheet, render_path)
        workbook_result["sheets"].append(
            {
                "name": sheet.title,
                "state": sheet.sheet_state,
                "dimensions": sheet.calculate_dimension(),
                "max_row": sheet.max_row,
                "max_column": sheet.max_column,
                "nonempty_cells": nonempty_count,
                "formula_count": formula_count,
                "merged_ranges": [str(item) for item in sheet.merged_cells.ranges],
                "auto_filter": str(sheet.auto_filter.ref or ""),
                "freeze_panes": str(sheet.freeze_panes or ""),
                "print_area": str(sheet.print_area or ""),
                "render_path": str(render_path),
                "cells": cells,
            }
        )
    return workbook_result


def main() -> None:
    if len(sys.argv) < 4:
        raise SystemExit("Usage: inspect_legacy_rentals.py OUTPUT_DIR WORKBOOK...")
    output_dir = Path(sys.argv[1])
    output_dir.mkdir(parents=True, exist_ok=True)
    results = [inspect_workbook(Path(value), output_dir) for value in sys.argv[2:]]
    result_path = output_dir / "workbook_inventory.json"
    result_path.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
    print(result_path)


if __name__ == "__main__":
    main()
