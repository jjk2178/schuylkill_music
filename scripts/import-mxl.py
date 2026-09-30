#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path


PITCH_CLASS = {
    "C": 0,
    "D": 2,
    "E": 4,
    "F": 5,
    "G": 7,
    "A": 9,
    "B": 11,
}

MAJOR_KEYS_BY_FIFTHS = {
    -7: "Cb",
    -6: "Gb",
    -5: "Db",
    -4: "Ab",
    -3: "Eb",
    -2: "Bb",
    -1: "F",
    0: "C",
    1: "G",
    2: "D",
    3: "A",
    4: "E",
    5: "B",
    6: "F#",
    7: "C#",
}

MINOR_KEYS_BY_FIFTHS = {
    -7: "Abm",
    -6: "Ebm",
    -5: "Bbm",
    -4: "Fm",
    -3: "Cm",
    -2: "Gm",
    -1: "Dm",
    0: "Am",
    1: "Em",
    2: "Bm",
    3: "F#m",
    4: "C#m",
    5: "G#m",
    6: "D#m",
    7: "A#m",
}


def midi_from_pitch(pitch: ET.Element) -> int:
    step = pitch.findtext("step") or "C"
    alter = int(float(pitch.findtext("alter") or 0))
    octave = int(pitch.findtext("octave") or 4)
    return (octave + 1) * 12 + PITCH_CLASS[step] + alter


def key_name(fifths: int, mode: str) -> str:
    if mode.lower() == "minor":
        return MINOR_KEYS_BY_FIFTHS.get(fifths, "Am")
    return MAJOR_KEYS_BY_FIFTHS.get(fifths, "C")


def text_at(root: ET.Element, path: str, fallback: str) -> str:
    value = root.findtext(path)
    return value.strip() if value and value.strip() else fallback


def read_musicxml(mxl_path: Path) -> ET.Element:
    with zipfile.ZipFile(mxl_path) as archive:
        xml_names = [
            name
            for name in archive.namelist()
            if name.endswith(".xml") and not name.startswith("META-INF/")
        ]
        if not xml_names:
            raise ValueError(f"No MusicXML score found in {mxl_path}")
        return ET.fromstring(archive.read(xml_names[0]))


def extract_events(root: ET.Element, max_events: int | None, event_prefix: str) -> tuple[list[dict], int, int, int, list[dict]]:
    parts = root.findall("./part")
    if not parts:
        raise ValueError("MusicXML score has no part")

    score_divisions = 1
    beats = 4
    beat_unit = 4
    bpm = 80
    key_signatures: list[dict] = []
    seen_key_signatures: set[tuple[int, int, str]] = set()
    seen_key_times: set[int] = set()
    grouped: dict[int, dict] = {}

    for part in parts:
        divisions = score_divisions
        absolute_quarters = 0.0

        for measure in part.findall("measure"):
            measure_start = absolute_quarters
            cursor = measure_start
            attrs = measure.find("attributes")
            if attrs is not None:
                divisions = int(attrs.findtext("divisions") or divisions)
                score_divisions = divisions
                beats = int(attrs.findtext("./time/beats") or beats)
                beat_unit = int(attrs.findtext("./time/beat-type") or beat_unit)
                key = attrs.find("key")
                if key is not None:
                    fifths = int(key.findtext("fifths") or 0)
                    mode = key.findtext("mode") or "major"
                    key_tick = round(measure_start * 960)
                    key_signature = (key_tick, fifths, mode)
                    if key_tick not in seen_key_times and key_signature not in seen_key_signatures:
                        seen_key_times.add(key_tick)
                        seen_key_signatures.add(key_signature)
                        key_signatures.append(
                            {
                                "quarter": measure_start,
                                "key": key_name(fifths, mode),
                                "fifths": fifths,
                                "mode": mode,
                            }
                        )

            for direction in measure.findall("direction"):
                sound = direction.find("sound")
                if sound is not None and sound.attrib.get("tempo"):
                    bpm = int(float(sound.attrib["tempo"]))

            measure_length_quarters = beats * (4 / beat_unit)

            for child in list(measure):
                if child.tag == "backup":
                    cursor -= int(child.findtext("duration") or 0) / divisions
                    continue
                if child.tag == "forward":
                    cursor += int(child.findtext("duration") or 0) / divisions
                    continue
                if child.tag != "note":
                    continue

                duration = int(child.findtext("duration") or 0)
                duration_quarters = duration / divisions
                is_chord = child.find("chord") is not None
                start = cursor
                if child.find("rest") is None:
                    pitch = child.find("pitch")
                    if pitch is not None:
                        start_key = round(start * 960)
                        bucket = grouped.setdefault(start_key, {"midi": [], "duration": duration_quarters})
                        bucket["midi"].append(midi_from_pitch(pitch))
                        bucket["duration"] = max(bucket["duration"], duration_quarters)
                if not is_chord:
                    cursor += duration_quarters

            absolute_quarters = max(cursor, measure_start + measure_length_quarters)

    quarter_ms = 60000 / bpm
    if not key_signatures:
        key_signatures.append({"quarter": 0, "key": "C", "fifths": 0, "mode": "major"})
    key_signature_events = [
        {
            "timeMs": round(item["quarter"] * quarter_ms),
            "key": item["key"],
            "fifths": item["fifths"],
            "mode": item["mode"],
        }
        for item in key_signatures
    ]
    events = []
    for index, (start, bucket) in enumerate(sorted(grouped.items())):
        midi = sorted(set(bucket["midi"]))
        if not midi:
            continue
        time_ms = round((start / 960) * quarter_ms)
        duration_ms = max(120, round(bucket["duration"] * quarter_ms))
        events.append(
            {
                "id": f"{event_prefix}-mxl-{index + 1}",
                "timeMs": time_ms,
                "durationMs": duration_ms,
                "strings": [],
                "expected": {
                    "kind": "chord" if len(midi) > 1 else "note",
                    "midi": midi,
                    "toleranceCents": 40,
                    "timingWindowMs": {"early": 140, "late": 180},
                },
            }
        )
        if max_events and len(events) >= max_events:
            break
    return events, bpm, beats, beat_unit, key_signature_events


def update_index(index_path: Path, item: dict) -> None:
    songs = json.loads(index_path.read_text()) if index_path.exists() else []
    songs = [song for song in songs if song.get("id") != item["id"]]
    songs.insert(0, item)
    index_path.write_text(json.dumps(songs, indent=2) + "\n")


def main() -> None:
    parser = argparse.ArgumentParser(description="Import a compressed MusicXML .mxl file as a local chart.")
    parser.add_argument("mxl")
    parser.add_argument("--id", default="cranberries-linger-purchased")
    parser.add_argument("--title", default="Linger")
    parser.add_argument("--artist", default="The Cranberries")
    parser.add_argument("--out", default="public/user-songs/cranberries-linger-purchased.json")
    parser.add_argument("--index", default="public/demo-songs/index.json")
    parser.add_argument("--max-events", type=int, default=160)
    args = parser.parse_args()

    repo_root = Path(__file__).resolve().parents[1]
    root = read_musicxml(Path(args.mxl))
    events, bpm, beats, beat_unit, key_signatures = extract_events(root, args.max_events, args.id)
    if not events:
        raise ValueError("No playable note events found")

    chart = {
        "schemaVersion": 1,
        "title": args.title,
        "artist": args.artist,
        "instrument": "piano",
        "tuning": ["C", "D", "E", "F", "G", "A"],
        "tempoMap": [{"timeMs": 0, "bpm": bpm}],
        "timeSignatures": [{"timeMs": 0, "beats": beats, "beatUnit": beat_unit}],
        "keySignatures": key_signatures,
        "tracks": [
            {
                "id": "piano-reduction",
                "name": "Purchased MusicXML piano source",
                "instrument": "piano",
                "clef": "grand",
                "events": events,
            }
        ],
        "sections": [{"id": "import", "label": "Imported MusicXML", "timeMs": 0}],
        "assets": {
            "license": "Purchased local MusicXML",
        },
    }

    out_path = repo_root / args.out
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(chart, indent=2) + "\n")
    update_index(
        repo_root / args.index,
        {
            "id": args.id,
            "title": args.title,
            "artist": args.artist,
            "instrument": "piano",
            "license": "Purchased local MusicXML",
            "chartUrl": "/" + str(out_path.relative_to(repo_root / "public")),
        },
    )
    print(f"Imported {len(events)} events to {out_path}")


if __name__ == "__main__":
    main()
