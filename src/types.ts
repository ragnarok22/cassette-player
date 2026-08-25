export type Track = {
  id: string;
  title: string;
  artist: string;
  duration: number;
  spotifyUri?: string;
};

export type Tape = {
  id: string;
  title: string;
  artist: string;
  year: string;
  side: 'A' | 'B';
  label: string;
  accent: string;
  ink: string;
  coverClass: string;
  artworkUrl?: string;
  source: 'demo' | 'spotify';
  spotifyUri?: string;
  tracks: Track[];
};
