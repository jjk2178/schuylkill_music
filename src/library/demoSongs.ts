import { parseChart, type Chart, type Instrument } from "../charts/schema";

export type DemoSongIndexItem = {
  id: string;
  title: string;
  artist: string;
  instrument: Instrument;
  license: string;
  chartUrl: string;
  sourcePageUrl?: string;
};

export async function loadDemoSongIndex(): Promise<DemoSongIndexItem[]> {
  const response = await fetch("/demo-songs/index.json");
  if (!response.ok) throw new Error("Unable to load demo song index.");
  return response.json();
}

export async function loadDemoSong(chartUrl: string): Promise<Chart> {
  const response = await fetch(chartUrl);
  if (!response.ok) throw new Error(`Unable to load demo song ${chartUrl}.`);
  return parseChart(await response.json());
}
