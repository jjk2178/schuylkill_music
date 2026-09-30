#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
from dataclasses import dataclass
from pathlib import Path
from textwrap import wrap


PAGE_WIDTH = 612
PAGE_HEIGHT = 792
MARGIN = 54
BODY_SIZE = 10
SMALL_SIZE = 8
TITLE_SIZE = 22
HEADING_SIZE = 14
SONG_ROWS_PER_PAGE = 28


def slugify(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")


def pdf_escape(value: str) -> str:
    return value.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


@dataclass
class TextRun:
    x: int
    y: int
    text: str
    font: str = "F1"
    size: int = BODY_SIZE


class PacketDocument:
    def __init__(self, title: str):
        self.title = title
        self.pages: list[list[TextRun]] = []
        self.current: list[TextRun] = []
        self.y = PAGE_HEIGHT - MARGIN
        self.page_number = 0
        self.new_page()

    def new_page(self) -> None:
        if self.current:
            self._footer()
            self.pages.append(self.current)
        self.page_number += 1
        self.current = []
        self.y = PAGE_HEIGHT - MARGIN
        self.text(self.title, MARGIN, self.y, "F2", 9)
        self.y -= 28

    def finish(self) -> list[list[TextRun]]:
        self._footer()
        self.pages.append(self.current)
        return self.pages

    def _footer(self) -> None:
        self.current.append(TextRun(MARGIN, 28, f"{self.title} - page {self.page_number}", "F1", SMALL_SIZE))

    def ensure_space(self, needed: int) -> None:
        if self.y - needed < MARGIN:
            self.new_page()

    def text(self, value: str, x: int, y: int, font: str = "F1", size: int = BODY_SIZE) -> None:
        self.current.append(TextRun(x, y, value, font, size))

    def title_line(self, value: str, subtitle: str | None = None) -> None:
        self.ensure_space(72)
        self.text(value, MARGIN, self.y, "F2", TITLE_SIZE)
        self.y -= 20
        if subtitle:
            self.text(subtitle, MARGIN, self.y, "F1", BODY_SIZE)
            self.y -= 16
        self.y -= 12

    def section(self, value: str) -> None:
        self.ensure_space(38)
        self.y -= 8
        self.text(value.upper(), MARGIN, self.y, "F2", HEADING_SIZE)
        self.y -= 18

    def paragraph(self, value: str, indent: int = 0, size: int = BODY_SIZE) -> None:
        max_chars = max(28, int((PAGE_WIDTH - MARGIN * 2 - indent) / (size * 0.52)))
        for line in wrap(value, max_chars):
            self.ensure_space(14)
            self.text(line, MARGIN + indent, self.y, "F1", size)
            self.y -= size + 4

    def bullet(self, value: str, indent: int = 0, size: int = BODY_SIZE) -> None:
        lines = wrap(value, max(28, int((PAGE_WIDTH - MARGIN * 2 - indent - 12) / (size * 0.52))))
        for index, line in enumerate(lines):
            self.ensure_space(14)
            prefix = "- " if index == 0 else "  "
            self.text(prefix + line, MARGIN + indent, self.y, "F1", size)
            self.y -= size + 4

    def role_block(self, player: str, part: str, notes: str) -> None:
        self.ensure_space(46)
        self.text(player, MARGIN, self.y, "F2", BODY_SIZE)
        self.text(part, MARGIN + 116, self.y, "F2", BODY_SIZE)
        self.y -= 14
        self.paragraph(notes, indent=18, size=SMALL_SIZE)


def make_pdf(path: Path, pages: list[list[TextRun]]) -> None:
    objects: list[bytes] = []

    def add_object(data: bytes) -> int:
        objects.append(data)
        return len(objects)

    catalog_id = add_object(b"<< /Type /Catalog /Pages 2 0 R >>")
    pages_id = add_object(b"")
    font_regular_id = add_object(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
    font_bold_id = add_object(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>")
    page_ids: list[int] = []

    for page in pages:
        content_lines = ["BT"]
        for run in page:
            content_lines.append(f"/{run.font} {run.size} Tf")
            content_lines.append(f"1 0 0 1 {run.x} {run.y} Tm ({pdf_escape(run.text)}) Tj")
        content_lines.append("ET")
        content = "\n".join(content_lines).encode("latin-1", "replace")
        content_id = add_object(b"<< /Length %d >>\nstream\n" % len(content) + content + b"\nendstream")
        page_id = add_object(
            (
                f"<< /Type /Page /Parent {pages_id} 0 R /MediaBox [0 0 {PAGE_WIDTH} {PAGE_HEIGHT}] "
                f"/Resources << /Font << /F1 {font_regular_id} 0 R /F2 {font_bold_id} 0 R >> >> "
                f"/Contents {content_id} 0 R >>"
            ).encode("latin-1")
        )
        page_ids.append(page_id)

    kids = " ".join(f"{page_id} 0 R" for page_id in page_ids)
    objects[pages_id - 1] = f"<< /Type /Pages /Kids [{kids}] /Count {len(page_ids)} >>".encode("latin-1")
    objects[catalog_id - 1] = b"<< /Type /Catalog /Pages 2 0 R >>"

    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("wb") as handle:
        handle.write(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
        offsets = [0]
        for index, obj in enumerate(objects, start=1):
            offsets.append(handle.tell())
            handle.write(f"{index} 0 obj\n".encode("ascii"))
            handle.write(obj)
            handle.write(b"\nendobj\n")
        xref = handle.tell()
        handle.write(f"xref\n0 {len(objects) + 1}\n".encode("ascii"))
        handle.write(b"0000000000 65535 f \n")
        for offset in offsets[1:]:
            handle.write(f"{offset:010d} 00000 n \n".encode("ascii"))
        handle.write(
            (
                f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\n"
                f"startxref\n{xref}\n%%EOF\n"
            ).encode("ascii")
        )


def build_master_packet(data: dict) -> list[list[TextRun]]:
    doc = PacketDocument("Scoreboard master packet")
    songs = data["rehearsalSongs"]
    members = data["bandMembers"]
    doc.title_line("Master Set List", "Scoreboard rehearsal packet")
    doc.section("Set order")
    for index, song in enumerate(songs, start=1):
        doc.bullet(f"{index}. {song['title']} - {song['artist']} ({song['status']})")

    doc.section("Band roster")
    for member in members:
        doc.bullet(f"{member['name']}: {', '.join(member['instruments'])}")

    for song in songs:
        doc.section(f"{song['title']} - roles")
        for role in song["roles"]:
            doc.role_block(role["player"], role["part"], role["notes"])

    doc.section("Shared equipment manifest")
    for item in data["sharedEquipment"]:
        doc.bullet(item)

    doc.section("Player equipment checklist")
    for member in members:
        doc.bullet(f"{member['name']}: {', '.join(member['equipment'])}")
    return doc.finish()


def midi_name(midi: int) -> str:
    names = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"]
    return f"{names[midi % 12]}{midi // 12 - 1}"


def seconds_label(time_ms: int) -> str:
    seconds = round(time_ms / 1000)
    return f"{seconds // 60}:{seconds % 60:02d}"


def load_song_index(repo_root: Path) -> dict[str, dict]:
    index_path = repo_root / "public" / "demo-songs" / "index.json"
    songs = json.loads(index_path.read_text()) if index_path.exists() else []
    return {song["title"].lower(): song for song in songs}


def load_chart_for_song(repo_root: Path, song: dict, song_index: dict[str, dict]) -> dict | None:
    index_item = song_index.get(song["title"].lower())
    if not index_item:
        return None
    chart_url = index_item.get("chartUrl", "")
    if not chart_url:
        return None
    chart_path = repo_root / "public" / chart_url.lstrip("/")
    if not chart_path.exists():
        return None
    return json.loads(chart_path.read_text())


def transpose_into_range(midi: int, low: int, high: int) -> int:
    note = midi
    while note < low:
        note += 12
    while note > high:
        note -= 12
    return note


def chart_events(chart: dict | None) -> list[dict]:
    if not chart:
        return []
    tracks = chart.get("tracks", [])
    if not tracks:
        return []
    return tracks[0].get("events", [])


def event_midi(event: dict) -> list[int]:
    return sorted(set(event.get("expected", {}).get("midi", [])))


def master_rows(events: list[dict]) -> list[str]:
    rows: list[str] = []
    last_bucket = -1
    for event in events:
        midi = event_midi(event)
        if not midi:
            continue
        bucket = event["timeMs"] // 6000
        if bucket == last_bucket:
            continue
        last_bucket = bucket
        low = midi_name(transpose_into_range(midi[0], 36, 59))
        high = midi_name(transpose_into_range(midi[-1], 60, 84))
        rows.append(f"{seconds_label(event['timeMs'])}  Master cue: bass {low}, top {high}")
    return rows


def player_rows(member_name: str, events: list[dict]) -> list[str]:
    rows: list[str] = []
    for index, event in enumerate(events):
        midi = event_midi(event)
        if not midi:
            continue
        low = midi[0]
        high = midi[-1]
        time = seconds_label(event["timeMs"])

        if member_name == "Jack":
            if index % 4 == 0:
                rows.append(f"{time}  Trumpet accent {midi_name(transpose_into_range(high, 58, 82))}; guitar hands to Laura/Michael")
            else:
                rows.append(f"{time}  Lead guitar tab cue {midi_name(transpose_into_range(high, 52, 76))}")
        elif member_name == "Laura":
            if index % 3 == 0:
                rows.append(f"{time}  Flute/hook cue {midi_name(transpose_into_range(high, 60, 84))}")
            else:
                rows.append(f"{time}  Rhythm guitar bed {midi_name(transpose_into_range(low, 45, 69))}")
        elif member_name == "Michael":
            if index % 4 == 0:
                rows.append(f"{time}  Backup guitar covers Jack: {midi_name(transpose_into_range(high, 45, 69))}")
            elif index % 4 == 2:
                rows.append(f"{time}  Recorder cue {midi_name(transpose_into_range(high, 60, 79))}")
        elif member_name == "Bobby":
            if index % 2 == 0 or len(midi) > 1:
                rows.append(f"{time}  Bass root {midi_name(transpose_into_range(low, 28, 52))}")
        elif member_name == "Nana":
            names = " ".join(midi_name(transpose_into_range(note, 48, 81)) for note in midi[:4])
            rows.append(f"{time}  Keys/grand staff cue {names}")
        elif member_name == "Pops":
            hits = ["hat"]
            if index % 2 == 0 or len(midi) > 1:
                hits.append("kick")
            if index % 4 == 2 or event.get("durationMs", 0) >= 700:
                hits.append("snare")
            if index % 8 == 0:
                hits.append("crash")
            rows.append(f"{time}  Drums: {', '.join(hits)}")
        elif member_name == "Xinnia":
            if index % 2 == 0:
                rows.append(f"{time}  Lead vocal pitch cue {midi_name(transpose_into_range(high, 55, 76))}")
        elif member_name == "Tara":
            if index % 8 == 4:
                rows.append(f"{time}  Harmony cue {midi_name(transpose_into_range(high - 3, 52, 72))}")
    return rows


def add_part_pages(doc: PacketDocument, repo_root: Path, data: dict, member: dict) -> None:
    song_index = load_song_index(repo_root)
    for set_index, song in enumerate(data["rehearsalSongs"], start=1):
        chart = load_chart_for_song(repo_root, song, song_index)
        events = chart_events(chart)
        master = master_rows(events)
        player = player_rows(member["name"], events)
        role = next((role for role in song["roles"] if role["player"] == member["name"]), None)

        if not events:
            doc.new_page()
            doc.title_line(f"{set_index}. {song['title']}", f"{song['artist']} - {member['name']}")
            doc.section("Master")
            doc.paragraph("No imported chart is available yet. Use the role notes until a licensed MusicXML source is added.")
            if role:
                doc.section("Your part")
                doc.role_block(member["name"], role["part"], role["notes"])
            continue

        chunks = max(1, (max(len(master), len(player)) + SONG_ROWS_PER_PAGE - 1) // SONG_ROWS_PER_PAGE)
        for page_index in range(chunks):
            start = page_index * SONG_ROWS_PER_PAGE
            end = start + SONG_ROWS_PER_PAGE
            doc.new_page()
            suffix = f"part {page_index + 1}" if chunks > 1 else "part"
            doc.title_line(f"{set_index}. {song['title']} - {suffix}", f"{song['artist']} - {member['name']}")
            if role and page_index == 0:
                doc.role_block(member["name"], role["part"], role["notes"])
                doc.y -= 6
            doc.section("Master cues")
            for row in master[start:end]:
                doc.bullet(row, size=SMALL_SIZE)
            doc.section(f"{member['name']} part")
            page_rows = player[start:end]
            if page_rows:
                for row in page_rows:
                    doc.bullet(row, size=SMALL_SIZE)
            else:
                doc.paragraph("Tacit or support-only for this page range.", size=SMALL_SIZE)


def build_player_packet(data: dict, member: dict, repo_root: Path) -> list[list[TextRun]]:
    doc = PacketDocument(f"{member['name']} player packet")
    doc.title_line(f"{member['name']} Packet", "Roles, set list, and equipment")
    doc.section("Your instruments")
    for instrument in member["instruments"]:
        doc.bullet(instrument)

    doc.section("Your songs")
    for index, song in enumerate(data["rehearsalSongs"], start=1):
        role = next((role for role in song["roles"] if role["player"] == member["name"]), None)
        if not role:
            continue
        doc.ensure_space(70)
        doc.text(f"{index}. {song['title']}", MARGIN, doc.y, "F2", HEADING_SIZE)
        doc.text(song["artist"], MARGIN + 220, doc.y, "F1", BODY_SIZE)
        doc.y -= 18
        doc.role_block(member["name"], role["part"], role["notes"])
        doc.paragraph(f"Chart status: {song['status']}", indent=18, size=SMALL_SIZE)
        doc.y -= 8

    doc.section("Personal equipment manifest")
    for item in member["equipment"]:
        doc.bullet(item)

    doc.section("Shared rehearsal equipment")
    for item in data["sharedEquipment"]:
        doc.bullet(item)
    add_part_pages(doc, repo_root, data, member)
    return doc.finish()


def main() -> None:
    parser = argparse.ArgumentParser(description="Build Scoreboard rehearsal PDF packets.")
    parser.add_argument("--data", default="src/band/rehearsalSet.json")
    parser.add_argument("--out", default="output/pdf")
    args = parser.parse_args()

    repo_root = Path(__file__).resolve().parents[1]
    data_path = repo_root / args.data
    output_dir = repo_root / args.out
    with data_path.open() as handle:
        data = json.load(handle)

    make_pdf(output_dir / "master-setlist-and-equipment.pdf", build_master_packet(data))
    for member in data["bandMembers"]:
        make_pdf(output_dir / f"{slugify(member['name'])}-player-packet.pdf", build_player_packet(data, member, repo_root))

    print(f"Wrote {len(data['bandMembers']) + 1} PDFs to {output_dir}")


if __name__ == "__main__":
    main()
