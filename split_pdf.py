#!/usr/bin/env python3
"""Split a PDF into one or more files by page numbers (1-based, inclusive).

Requires: pip install pypdf

Examples:
    # Three output files: pages 1-5, 6-10, 11-end
    python scripts/split_pdf.py report.pdf --ranges 1-5 6-10 11-

    # Single page range to a named file
    python scripts/split_pdf.py report.pdf --ranges 3-7 -o chapter2.pdf

    # Split every 10 pages (1-10, 11-20, ...)
    python scripts/split_pdf.py report.pdf --every 10

    # Write all parts to a folder
    python scripts/split_pdf.py report.pdf --ranges 1-5 6-10 --output-dir ./parts
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

try:
    from pypdf import PdfReader, PdfWriter
except ImportError:
    print("Missing dependency. Install with: pip install pypdf", file=sys.stderr)
    sys.exit(1)

RANGE_RE = re.compile(r"^(\d+)(?:-(\d*))?$")


def parse_range(spec: str, page_count: int) -> tuple[int, int]:
    """Parse a 1-based range like '3', '3-7', or '11-' into (start, end) inclusive."""
    spec = spec.strip()
    match = RANGE_RE.match(spec)
    if not match:
        raise ValueError(f"Invalid range {spec!r}. Use forms like 5, 3-7, or 11-.")

    start = int(match.group(1))
    end_str = match.group(2)
    end = page_count if end_str == "" else int(end_str) if end_str else start

    if start < 1 or end < 1:
        raise ValueError(f"Page numbers must be >= 1 (got {spec!r}).")
    if start > end:
        raise ValueError(f"Start page must be <= end page (got {spec!r}).")
    if start > page_count:
        raise ValueError(f"Range {spec!r} starts after last page ({page_count}).")

    end = min(end, page_count)
    return start, end


def ranges_from_every(page_count: int, chunk_size: int) -> list[tuple[int, int]]:
    if chunk_size < 1:
        raise ValueError("--every must be >= 1.")
    ranges: list[tuple[int, int]] = []
    start = 1
    while start <= page_count:
        end = min(start + chunk_size - 1, page_count)
        ranges.append((start, end))
        start = end + 1
    return ranges


def write_range(
    reader: PdfReader,
    start: int,
    end: int,
    output_path: Path,
) -> None:
    writer = PdfWriter()
    for page_num in range(start, end + 1):
        writer.add_page(reader.pages[page_num - 1])
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("wb") as f:
        writer.write(f)


def default_part_name(input_path: Path, start: int, end: int) -> str:
    stem = input_path.stem
    if start == end:
        return f"{stem}_page_{start}.pdf"
    return f"{stem}_pages_{start}-{end}.pdf"


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Split a PDF by page numbers (1-based, inclusive)."
    )
    parser.add_argument("input", type=Path, help="Path to the source PDF")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument(
        "--ranges",
        nargs="+",
        metavar="RANGE",
        help="Page ranges, e.g. 1-5 6-10 11- (11- means through last page)",
    )
    group.add_argument(
        "--every",
        type=int,
        metavar="N",
        help="Split into chunks of N pages each",
    )
    parser.add_argument(
        "-o",
        "--output",
        type=Path,
        help="Output file (only when a single --ranges value is given)",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        help="Directory for output files (default: same folder as input)",
    )
    return parser


def main() -> int:
    args = build_parser().parse_args()
    input_path: Path = args.input

    if not input_path.is_file():
        print(f"Input file not found: {input_path}", file=sys.stderr)
        return 1

    reader = PdfReader(str(input_path))
    page_count = len(reader.pages)
    if page_count == 0:
        print(f"PDF has no pages: {input_path}", file=sys.stderr)
        return 1

    if args.ranges:
        try:
            parsed_ranges = [parse_range(spec, page_count) for spec in args.ranges]
        except ValueError as exc:
            print(exc, file=sys.stderr)
            return 1
    else:
        try:
            parsed_ranges = ranges_from_every(page_count, args.every)
        except ValueError as exc:
            print(exc, file=sys.stderr)
            return 1

    if args.output and len(parsed_ranges) != 1:
        print("-o/--output only works with a single range.", file=sys.stderr)
        return 1

    output_dir = args.output_dir or input_path.parent

    print(f"Source: {input_path} ({page_count} pages)")

    for start, end in parsed_ranges:
        if args.output and len(parsed_ranges) == 1:
            out_path = args.output
        else:
            out_path = output_dir / default_part_name(input_path, start, end)

        write_range(reader, start, end, out_path)
        print(f"  Wrote pages {start}-{end} -> {out_path}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
