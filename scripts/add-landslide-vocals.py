#!/usr/bin/env python3
"""Extract the Voice/Vocals MusicXML part as the rehearsal hum melody."""
import json
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MXL = Path("/home/jjk/Downloads/landslide-fleetwood-mac.mxl")
CHART = ROOT / "public/user-songs/fleetwood-mac-landslide.json"
PC = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}

with zipfile.ZipFile(MXL) as archive:
    name = next(n for n in archive.namelist() if n.endswith(".xml") and not n.startswith("META-INF/"))
    root = ET.fromstring(archive.read(name))
part = next(p for p in root.findall("./part") if p.attrib.get("id") == "P6")
divisions, cursor, absolute, beats, unit = 1, 0.0, 0.0, 4, 4
grouped = {}
for measure in part.findall("measure"):
    start = absolute
    cursor = start
    attrs = measure.find("attributes")
    if attrs is not None:
        divisions = int(attrs.findtext("divisions") or divisions)
        beats = int(attrs.findtext("./time/beats") or beats)
        unit = int(attrs.findtext("./time/beat-type") or unit)
    for child in list(measure):
        if child.tag == "backup":
            cursor -= int(child.findtext("duration") or 0) / divisions
            continue
        if child.tag == "forward":
            cursor += int(child.findtext("duration") or 0) / divisions
            continue
        if child.tag != "note":
            continue
        duration = int(child.findtext("duration") or 0) / divisions
        chord = child.find("chord") is not None
        pitch = child.find("pitch")
        if pitch is not None:
            midi = (int(pitch.findtext("octave") or 4) + 1) * 12 + PC[pitch.findtext("step") or "C"] + int(float(pitch.findtext("alter") or 0))
            key = round(cursor * 960)
            bucket = grouped.setdefault(key, {"midi": [], "duration": duration})
            bucket["midi"].append(midi)
            bucket["duration"] = max(bucket["duration"], duration)
        if not chord:
            cursor += duration
    absolute = max(cursor, start + beats * (4 / unit))

chart = json.loads(CHART.read_text())
bpm = chart["tempoMap"][0]["bpm"]
quarter_ms = 60000 / bpm
events = []
for index, (tick, bucket) in enumerate(sorted(grouped.items())):
    events.append({
        "id": f"landslide-vocal-{index + 1}",
        "timeMs": round(tick / 960 * quarter_ms),
        "durationMs": max(120, round(bucket["duration"] * quarter_ms)),
        "beat": tick / 960,
        "durationBeats": bucket["duration"],
        "strings": [],
        "expected": {"kind": "chord" if len(bucket["midi"]) > 1 else "note", "midi": sorted(set(bucket["midi"])), "toleranceCents": 40, "timingWindowMs": {"early": 140, "late": 180}},
    })
chart["tracks"] = [track for track in chart["tracks"] if track["id"] != "lead-vocal-melody"]
chart["tracks"].insert(0, {"id": "lead-vocal-melody", "name": "Lead vocal melody (hum)", "instrument": "vocals", "clef": "treble", "events": events})
CHART.write_text(json.dumps(chart, indent=2) + "\n")
print(f"Added {len(events)} lead-vocal melody events to Landslide.")
