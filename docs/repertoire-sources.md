# Encoded repertoire sources

Verified October 3, 2026. Downloaded candidates and provenance (URLs, licenses,
SHA-256 hashes) are in `public/repertoire-sources/manifest.json`.
These source files are staged for musical review; they do not replace the existing
set list charts or appear as finished arrangements in the trainer.

| Candidate                                                                                             | Format                       | License       | Why use it                                                                                         |
| ----------------------------------------------------------------------------------------------------- | ---------------------------- | ------------- | -------------------------------------------------------------------------------------------------- |
| [Silent Night, original voice and guitar](https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=81) | MIDI                         | Public Domain | Improve the existing generated reduction using an encoded source edition. Maintainer: Peter Chubb. |
| [Greensleeves, lute/guitar/vihuela](https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=109)      | MIDI                         | Public Domain | A second source to compare against the existing guitar excerpt. Maintainer: Aaron Fontaine.        |
| [Rule, Britannia!, Thomas Arne](https://fourscoreandmore.org/openscore/lieder/)                       | Compressed MusicXML (`.mxl`) | CC0-1.0       | A voice/piano source candidate for future ensemble practice.                                       |

[OpenScore's catalogue](https://fourscoreandmore.org/openscore/) provides CC0 editions,
with directly downloadable MusicXML from its Lieder catalogue. These are preferable
to scraping arbitrary MIDI sites with unspecified arrangement rights.
[Mutopia](https://www.mutopiaproject.org/) offers MIDI and editable LilyPond sources;
check the license on each edition. For example, Silent Night edition 521 is CC BY-SA
2.0, whereas the downloaded original edition 81 is Public Domain.

[MuseTrainer's MusicXML library](https://github.com/musetrainer/library) is another
candidate catalogue, described as public domain by its maintainer. Verify each
source edition before adding an arrangement; a catalogue description alone does
not establish the rights to every modern arrangement.

No verified open edition was identified for the contemporary set list titles
Linger, Go Your Own Way, drivers license, How Far I'll Go, or Stairway to Heaven.
Keep the existing purchased imports and obtain a licensed source for Stairway.

## Import review

The existing `scripts/import-mxl.py` imports a piano reduction, not separate original
instrument parts. It currently assumes a single tempo/meter, flattens source parts,
and does not preserve ties, pickup measures, repeats, or all MusicXML notation.
Review and improve that importer before using a new source as a finished set list
arrangement. Preserve source voices, meter/tempo changes, rests, pickups and ties;
then compare playback and engraving against the publisher's reference score.

The shared compiler in `src/music/parts.mjs` now drives PDF packets, band score,
and trainer targets. Its derived parts are rehearsal reductions, and should receive
musical review before replacing them with authored instrument parts.

## God Bless America — source search

Searched October 3, 2026 for Irving Berlin's song in MIDI, MusicXML, CC0,
Creative Commons, and Mutopia sources. No verified openly licensed encoded edition
was identified. The open-source search did not supply an arrangement. A later user-supplied MIDI
was imported as described below.

- [Smithsonian sheet-music record](https://www.si.edu/object/god-bless-america%3Anmah_670715):
  the catalog metadata is CC0, but the sheet-music image is explicitly marked
  “Usage Conditions Apply.” The metadata license is not a license to arrange the song.
- [U.S. Copyright Office account](https://www.copyright.gov/history/lore/pdfs/201408%20CLore_August2014.pdf):
  documents the Irving Berlin Music Company and God Bless America Fund's control
  of the song and royalties. The familiar song is not an established public-domain
  edition for this search.
- [Irving Berlin's official song history](https://www.irvingberlin.com/god-bless-america):
  confirms the identity of the familiar song and its revised 1938 version.
- [Downloadable piano MusicXML listing](https://notes.tarakanov.net/download/?file=%2Fu%2Fnotes%2Fmxml_zarybezhnie-avtori%2Fgod-bless-america-berlin.musicxml):
  available for download, but no verified open reuse license was found in the listing.
- [Wikimedia Navy Band recording](https://commons.wikimedia.org/wiki/File:God_Bless_America_-_Navy_Band_-_May_28,_2018.ogg):
  a recording, not an encoded score; its recording-rights label does not establish
  permission to adapt the underlying composition.

Next input: a licensed MIDI/MusicXML or score supplied for arrangement, or an
edition with explicit permission to adapt. Keep the composition and arrangement
licenses separate from metadata and recording licenses. Do not substitute unrelated
older hymns that happen to have similar titles.

### User-supplied MIDI import

The user subsequently supplied `/home/jjk/Downloads/godblessamer.mid` for trumpet.
A copy is saved at `public/user-songs/sources/godblessamer.mid`, with its hash and
track metadata in `godblessamer-provenance.json`. This is a user-supplied source;
no open license is claimed. The embedded sequence credit names Jim Huff.

The source contains an actual `TRUMPETS` section (track 6, zero-based). The
arrangement extracts its upper voice, merging chord members played within 30 ms,
trimming overlaps, and preserving the original concert pitches, tempo, 4/4 meter,
and silent lead-in. It is the source's trumpet part, including rhythmic section
figures, rather than a newly invented melody reduction. Jack is the only assigned
player for this solo practice entry. The band score and other player packets do
not fabricate accompaniment for this entry.

Regenerate the encoded chart with:

```bash
python3 -m pip install -r scripts/requirements-midi.txt
python3 scripts/import-trumpet-midi.py public/user-songs/sources/godblessamer.mid
```

The chart is `public/user-songs/god-bless-america.json`. B♭ written notation is a
whole step above the concert-pitch chart, and microphone scoring uses concert pitch.

### User-provided recorder chart and drivers license score

The files were found in `/home/jjk/Music/` (`/home/music/` was absent). Copies and SHA-256 hashes are retained in `public/user-songs/sources/score-reference-provenance.json`.

The Baroque recorder chart supplies the shared 28-note fingering table, including thumb venting, double holes and bell closure. Browser diagrams and printed recorder parts use this table. C soprano sounds an octave above the written labels; the existing practice pitch mapping has not been changed.

`drivers-license-reference-score.pdf` contains nine pages of melody, piano accompaniment and lyrics. It is retained as the authoritative reference. The complete piano accompaniment is now encoded and validated as described below; the older short reference remains for other instruments. The PDF vocal/violin melody and lyrics are not fully transcribed. No open license is asserted for either supplied PDF.

### User-provided flute chart

`flute-fingering-reference.pdf` is the supplied Basic Flute Fingering Chart by Karen Evans Moratz (Flute For Dummies / Wiley). Its two embedded chart images were extracted losslessly. The shared flute SVG component selects the actual diagram for each MIDI note and rotates it vertically for the annotation lane. This preserves thumb, side and footjoint keys and octave-specific fingerings without guessing missing accidentals. B♭ selects the first illustrated alternative. The original retains the alternate fingerings. Printed packets include an explanation and reference grid. Provenance and the original hash are in `score-reference-provenance.json`.

### Drivers license piano encoded from the supplied PDF

The full piano accompaniment has now been recovered from `drivers-license-reference-score.pdf` using its vector noteheads, stems, beams, flags, rests, staff lines and tie curves. Both piano staves span 70 measures, with a two-quarter pickup, 4/4 meter and quarter-note BPM 72 (3:51.67). The recovery contains 1,216 noteheads, separate overlapping voices and 29 tied continuations. All 140 staff-measure duration checks pass. The source's RH/LH assignment is retained even when right-hand notes fall below middle C. No chord progression is substituted for the PDF piano part.

The two `piano-accompaniment` tracks in `olivia-rodrigo-drivers-license-purchased.json` are used by Scoreboard, trainer, rendered score player and PDF piano parts. The previous short reference track remains for other instruments; the PDF's full violin/vocal melody is not transcribed. The original nine-page PDF and a hash/audit are retained under `public/user-songs/sources/`.

Regenerate using `python3 -m pip install -r scripts/requirements-pdf.txt` then `python3 scripts/import-drivers-pdf.py`. This importer is tailored to the supplied PDF's glyphs and validates expected measures and notehead count before writing.
