// /frontend/src/lib/utils/music.ts

// 1. MusicTrack 타입을 명확하게 정의합니다.
export interface MusicTrack {
  id: string;
  title: string;
  artist: string;
  prompt: string;
  audioUrl: string;
}

// 2. 이 배열이 공용 플레이리스트(메모리 DB) 역할을 합니다.
const playlist: MusicTrack[] = [];

/**
 * 공용 플레이리스트의 모든 음악을 반환합니다.
 */
export const getPlaylist = (): MusicTrack[] => {
  return playlist;
};

/**
 * 공용 플레이리스트에 음악 트랙을 추가합니다.
 * (app/counsel/page.tsx, app/compose/page.tsx에서 사용)
 */
export const addTrackToPlaylist = (track: MusicTrack) => {
  playlist.push(track);
  console.log("공용 플레이리스트에 추가됨:", track);
};

/**
 * 공용 플레이리스트를 비웁니다.
 */
export const clearPlaylist = (): MusicTrack[] => {
  playlist.length = 0; // 배열 비우기
  return playlist;
};