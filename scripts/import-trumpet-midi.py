#!/usr/bin/env python3
"""Extract a named MIDI section's upper voice. Requires mido (see requirements-midi.txt)."""
import argparse
import bisect
import hashlib
import json
from pathlib import Path
import mido


def import_trumpet(path, track_name, song_id, title, artist):
    midi = mido.MidiFile(path)
    if midi.type == 2 or midi.ticks_per_beat <= 0:
        raise ValueError('Only synchronous PPQ MIDI files are supported')
    timed_tracks = []
    metadata = []
    for track in midi.tracks:
        tick = 0
        timed = []
        for message in track:
            tick += message.time
            timed.append((tick, message))
            if message.type in ('set_tempo', 'time_signature', 'key_signature'):
                metadata.append((tick, message))
        timed_tracks.append(timed)
    matches = [i for i, track in enumerate(midi.tracks) if track.name.casefold() == track_name.casefold()]
    if len(matches) != 1:
        raise ValueError(f'Expected one {track_name!r} track; found {matches}')
    track_index = matches[0]
    tempo_by_tick = {0: 500000}
    for tick, message in metadata:
        if message.type == 'set_tempo':
            tempo_by_tick[tick] = message.tempo
    tempos = sorted(tempo_by_tick.items())
    ticks = [tick for tick, _ in tempos]
    accumulated = [0.0]
    for i in range(1, len(tempos)):
        accumulated.append(accumulated[-1] + (ticks[i] - ticks[i-1]) * tempos[i-1][1] / midi.ticks_per_beat / 1000)
    def milliseconds(tick):
        i = bisect.bisect_right(ticks, tick) - 1
        return round(accumulated[i] + (tick-ticks[i]) * tempos[i][1] / midi.ticks_per_beat / 1000)
    active = {}
    notes = []
    for tick, message in timed_tracks[track_index]:
        if message.type not in ('note_on', 'note_off') or message.channel == 9:
            continue
        key = (message.channel, message.note)
        if message.type == 'note_on' and message.velocity > 0:
            active.setdefault(key, []).append(tick)
        elif active.get(key):
            start = active[key].pop(0)
            if tick > start:
                notes.append({'start': start, 'end': tick, 'pitch': message.note})
    if any(active.values()):
        raise ValueError('Selected track contains notes without note-off events')
    notes.sort(key=lambda note: (note['start'], note['pitch']))
    groups = []
    # Merge humanized chord attacks within 30 ms, keeping later re-attacks.
    for note in notes:
        if groups and milliseconds(note['start']) - milliseconds(groups[-1][0]['start']) <= 30:
            groups[-1].append(note)
        else:
            groups.append([note])
    melody = [max(group, key=lambda note: (note['pitch'], note['end'])) for group in groups]
    if not melody:
        raise ValueError('No pitched notes in selected track')
    events = []
    for i, note in enumerate(melody):
        end = min(note['end'], melody[i+1]['start']) if i+1 < len(melody) else note['end']
        events.append({'id': f'{song_id}-{i+1}', 'label': 'trumpet upper voice', 'timeMs': milliseconds(note['start']), 'durationMs': max(1, milliseconds(end)-milliseconds(note['start'])), 'strings': [], 'expected': {'kind': 'note', 'midi': [note['pitch']], 'scoring': 'pitch', 'toleranceCents': 40, 'timingWindowMs': {'early': 140, 'late': 180}}})
    meters = {0: {'timeMs': 0, 'beats': 4, 'beatUnit': 4}}
    keys = {0: {'timeMs': 0, 'key': 'C', 'fifths': 0, 'mode': 'major'}}
    major = ['Cb','Gb','Db','Ab','Eb','Bb','F','C','G','D','A','E','B','F#','C#']
    minor = ['Ab','Eb','Bb','F','C','G','D','A','E','B','F#','C#','G#','D#','A#']
    for tick, message in metadata:
        time = milliseconds(tick)
        if message.type == 'time_signature':
            meters[tick] = {'timeMs': time, 'beats': message.numerator, 'beatUnit': message.denominator}
        elif message.type == 'key_signature':
            is_minor = message.key.endswith('m')
            name = message.key.rstrip('m')
            fifths = (minor if is_minor else major).index(name)-7
            keys[tick] = {'timeMs': time, 'key': message.key, 'fifths': fifths, 'mode': 'minor' if is_minor else 'major'}
    source_url = '/user-songs/sources/' + path.name
    chart = {'schemaVersion': 1, 'title': title, 'artist': artist, 'instrument': 'trumpet', 'tuning': ['E2','A2','D3','G3','B3','E4'], 'tempoMap': [{'timeMs': milliseconds(tick), 'bpm': 60000000/tempo} for tick, tempo in tempos], 'timeSignatures': [value for _,value in sorted(meters.items())], 'keySignatures': [value for _,value in sorted(keys.items())], 'tracks': [{'id': 'trumpet-upper-voice', 'name': f'{track_name} — upper voice', 'instrument': 'trumpet', 'clef': 'treble', 'events': events}], 'sections': [{'id': 'trumpet-entry', 'label': 'Trumpet entry', 'timeMs': events[0]['timeMs']}], 'assets': {'sourceUrl': source_url, 'license': 'User-supplied MIDI; open license not established'}}
    provenance = {'sourceFile': path.name, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest(), 'sourceTrack': track_index, 'sourceTrackName': track_name, 'sourceNoteCount': len(notes), 'arrangedNoteCount': len(events), 'sourceTicksPerQuarter': midi.ticks_per_beat, 'sourceTrackNames': [track.name for track in midi.tracks], 'adaptation': 'Upper voice of the named TRUMPETS section; chord attacks within 30 ms grouped; overlapping durations trimmed; original concert pitches, tempo, meter, and silent lead-in retained.', 'license': chart['assets']['license']}
    return chart, provenance


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('input', type=Path)
    parser.add_argument('--track', default='TRUMPETS')
    parser.add_argument('--id', default='god-bless-america')
    parser.add_argument('--title', default='God Bless America')
    parser.add_argument('--artist', default='Irving Berlin')
    parser.add_argument('--out', type=Path, default=Path('public/user-songs/god-bless-america.json'))
    args = parser.parse_args()
    chart, provenance = import_trumpet(args.input, args.track, args.id, args.title, args.artist)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(chart, indent=2)+'\n')
    args.input.with_name(args.input.stem+'-provenance.json').write_text(json.dumps(provenance, indent=2)+'\n')
    print(f"Imported {provenance['arrangedNoteCount']} trumpet notes from track {provenance['sourceTrack']} ({args.track})")


if __name__ == '__main__':
    main()
