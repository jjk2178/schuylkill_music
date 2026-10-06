import importlib.util
from pathlib import Path
import tempfile
import unittest
import mido

spec = importlib.util.spec_from_file_location('trumpet_import', Path(__file__).with_name('import-trumpet-midi.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class TrumpetMidiImportTest(unittest.TestCase):
    def test_chord_humanization_and_duration_crossing_tempo_change(self):
        midi = mido.MidiFile(type=1, ticks_per_beat=120)
        conductor = mido.MidiTrack([
            mido.MetaMessage('set_tempo', tempo=500000),
            mido.MetaMessage('time_signature', numerator=4, denominator=4),
            mido.MetaMessage('key_signature', key='C'),
            mido.MetaMessage('set_tempo', tempo=1000000, time=120),
        ])
        trumpet = mido.MidiTrack([
            mido.MetaMessage('track_name', name='TRUMPETS'),
            mido.Message('note_on', note=64, velocity=80, time=60),
            mido.Message('note_on', note=60, velocity=80, time=3),
            mido.Message('note_off', note=60, time=57),
            mido.Message('note_off', note=64, time=60),
            mido.Message('note_on', note=67, velocity=80, time=60),
            mido.Message('note_off', note=67, time=120),
        ])
        midi.tracks.extend([conductor, trumpet])
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp)/'test.mid'
            midi.save(path)
            chart, provenance = module.import_trumpet(path, 'TRUMPETS', 'test', 'Test', 'Test')
        events = chart['tracks'][0]['events']
        self.assertEqual([(e['timeMs'],e['durationMs'],e['expected']['midi']) for e in events], [(250,750,[64]),(1500,1000,[67])])
        self.assertEqual(chart['tempoMap'], [{'timeMs':0,'bpm':120},{'timeMs':500,'bpm':60}])
        self.assertEqual(provenance['sourceNoteCount'], 3)
        self.assertEqual(provenance['arrangedNoteCount'], 2)

    def test_supplied_file_has_the_named_trumpet_section(self):
        path = Path(__file__).resolve().parents[1]/'public/user-songs/sources/godblessamer.mid'
        chart, provenance = module.import_trumpet(path, 'TRUMPETS', 'god-bless-america', 'God Bless America', 'Irving Berlin')
        self.assertEqual(provenance['sourceTrack'], 6)
        self.assertEqual(provenance['sourceNoteCount'], 243)
        self.assertEqual(provenance['arrangedNoteCount'], 119)
        self.assertTrue(all(len(e['expected']['midi']) == 1 for e in chart['tracks'][0]['events']))


if __name__ == '__main__':
    unittest.main()
