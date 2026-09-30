import rehearsalSetData from "./rehearsalSet.json";

export type BandMember = {
  name: string;
  instruments: string[];
  equipment: string[];
};

export type SongRole = {
  player: string;
  instrument: string;
  part: string;
  notes: string;
};

export type RehearsalSong = {
  id: string;
  title: string;
  artist: string;
  status: string;
  roles: SongRole[];
};

export type RehearsalSet = {
  bandMembers: BandMember[];
  sharedEquipment: string[];
  rehearsalSongs: RehearsalSong[];
};

export const rehearsalSet = rehearsalSetData as RehearsalSet;
export const bandMembers = rehearsalSet.bandMembers;
export const sharedEquipment = rehearsalSet.sharedEquipment;
export const rehearsalSongs = rehearsalSet.rehearsalSongs;
