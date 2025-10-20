// 파일 경로: /src/lib/utils/music.ts

// 1. MusicTrack 타입을 두 페이지의 요구사항에 맞게 통합합니다.
export interface MusicTrack {
  id: string;
  title: string;
  artist: string;
  prompt: string; // music 페이지에서 사용
  audioUrl: string; // music 페이지에서 사용
}

// 2. 플레이리스트 데이터를 저장하는 변수 (const로 선언)
const playlist: MusicTrack[] = [];

// 3. 플레이리스트 관리 함수들
export const getPlaylist = (): MusicTrack[] => {
  return playlist;
};

export const addTrackToPlaylist = (track: MusicTrack) => {
  playlist.push(track);
};

export const clearPlaylist = (): MusicTrack[] => {
  playlist.length = 0; // 배열을 비웁니다.
  return playlist;
};