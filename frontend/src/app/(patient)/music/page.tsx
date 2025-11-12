'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
// 💡 1. '가짜 DB' 함수들 제거
// import { getPlaylist, MusicTrack, clearPlaylist } from '@/lib/utils/music';
import { Play, Music, Trash2, ArrowLeft, Volume2, Loader2, Palette } from 'lucide-react';

// 💡 2. 실제 MusicTrackInfo 타입 정의 (dashboard와 동일하게)
interface MusicTrackInfo {
  id: number; // 또는 string
  title: string;
  prompt: string;
  audioUrl: string; // 백엔드가 제공하는 전체 URL (필드명 확인 필요!)
  track_url?: string; // 백엔드 필드명 (선택적)
  artist?: string; // 백엔드에 아티스트 정보가 있다면 추가
  // 필요한 다른 정보
}

const API_URL = process.env.INTERNAL_API_URL;

export default function MusicPlaylistPage() {
    const router = useRouter();
    // 💡 3. 상태 타입을 MusicTrackInfo[]로 변경
    const [playlist, setPlaylist] = useState<MusicTrackInfo[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null); // 에러 상태 추가
    const [currentTrackId, setCurrentTrackId] = useState<number | string | null>(null); // ID 타입에 맞게
    const audioRef = useRef<HTMLAudioElement | null>(null);

    // 💡 4. [핵심 수정] useEffect에서 실제 API 호출
    useEffect(() => {
        // Audio 객체 초기화 (변경 없음)
        if (typeof window !== "undefined" && !audioRef.current) {
            audioRef.current = new Audio();
            // 재생 종료 시 상태 초기화 리스너 추가
            audioRef.current.onended = () => setCurrentTrackId(null);
        }

        const fetchPlaylist = async () => {
            setLoading(true);
            setError(null);
            const token = localStorage.getItem('accessToken');

            if (!token) {
                setError("로그인이 필요합니다. 음악 목록을 보려면 로그인해주세요.");
                setLoading(false);
                // 필요시 로그인 페이지 리다이렉트
                // router.push('/login?next=/music');
                return;
            }

            try {
                // 백엔드 API 호출 (limit 없이 전체 목록 가져오기)
                // 🚨 프록시 사용 시: '/backend-api/music/my'
                const response = await fetch(`${API_URL}/music/my`, { // ⬅️ 백엔드 경로 확인!
                    headers: { 'Authorization': `Bearer ${token}` }
                });

                if (response.status === 401) throw new Error('인증 실패');
                if (!response.ok) throw new Error('음악 목록을 불러오는데 실패했습니다.');

                const musicData: MusicTrackInfo[] = await response.json();
                 // 백엔드 track_url을 audioUrl로 매핑
                const mappedMusicData = musicData.map(track => ({
                    ...track,
                    audioUrl: track.audioUrl || track.track_url || '',
                    artist: track.artist || 'TheraMusic AI' // artist 없으면 기본값
                }));
                setPlaylist(mappedMusicData); // 실제 데이터로 상태 업데이트

            } catch (err) {
                 console.error("Playlist fetch error:", err);
                 const errorMessage = err instanceof Error ? err.message : "음악 로딩 중 오류 발생";
                 setError(errorMessage);
                 if (errorMessage === '인증 실패') {
                     localStorage.removeItem('accessToken');
                     router.push('/login?next=/music');
                 }
            } finally {
                setLoading(false);
            }
        };

        fetchPlaylist();

        // 컴포넌트 언마운트 시 오디오 정리 (변경 없음)
        return () => {
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current.onended = null; // 리스너 제거
                audioRef.current = null;
            }
        };
    }, [router]); // 의존성 배열에 router 추가

    // 💡 5. handlePlay 수정 (currentTrackId 사용)
    const handlePlay = (track: MusicTrackInfo) => {
        const audio = audioRef.current;
        if (!audio) return;

        if (currentTrackId === track.id) {
            audio.pause();
            setCurrentTrackId(null);
        } else {
            audio.pause(); // 다른 곡 재생 전 현재 곡 정지
            audio.src = track.audioUrl;
            audio.load();
            audio.play().catch(error => {
                 console.error("Audio playback failed", error);
                 setError(`음악 재생 실패: ${track.title}`); // 사용자에게 오류 표시
                 setCurrentTrackId(null); // 재생 실패 시 상태 초기화
            });
            setCurrentTrackId(track.id);
            // onended 리스너는 useEffect에서 설정
        }
    };

    // 💡 6. handleClear 함수 주석 처리 (백엔드 API 필요)
    const handleClear = () => {
        alert('전체 삭제 기능은 현재 비활성화되어 있습니다. (백엔드 API 구현 필요)');
        // if (confirm('플레이리스트의 모든 음악을 삭제하시겠습니까?')) {
        //     // ... (오디오 정지 로직) ...
        //     // 🚨 여기에 백엔드 API (DELETE /music/my) 호출 로직 필요
        //     // API 성공 시 setPlaylist([]) 호출
        // }
    };

    if (loading) {
        return ( <div className="flex justify-center items-center h-screen"><Loader2 className="h-8 w-8 animate-spin text-indigo-600" /></div> );
    }

    // 💡 7. 에러 발생 시 UI 추가
    if (error) {
       return (
          <div className="flex flex-col justify-center items-center h-screen text-center p-4">
              <h1 className="text-2xl font-bold mb-4 text-red-600">오류 발생</h1>
              <p className="text-gray-600 mb-6">{error}</p>
              {error.includes("로그인") && (
                   <button onClick={() => router.push('/login')} className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700">
                        로그인 페이지로 이동
                   </button>
              )}
          </div>
       );
    }

    // 💡 8. JSX 렌더링 (playlist 상태 사용, currentTrackId 사용)
    return (
        <div className="max-w-2xl mx-auto p-4 sm:p-6 bg-gray-50 min-h-screen">
            <header className="flex justify-between items-center pb-4 border-b border-gray-200 mb-6">
                 {/* 상담 페이지 경로 확인 */}
                 <button
                    onClick={() => router.push('/counsel')}
                    className="text-indigo-600 hover:text-indigo-800 flex items-center transition-colors text-sm"
                 >
                    <ArrowLeft className="h-4 w-4 mr-1" /> 상담으로 돌아가기
                 </button>
                 <h1 className="text-2xl font-bold text-gray-800 flex items-center">
                    <Volume2 className="h-6 w-6 mr-2 text-indigo-600" /> 나의 AI 음악
                 </h1>
            </header>
            <div className="flex justify-between items-center mb-6 px-1">
                 <p className="text-sm text-gray-600">총 {playlist.length} 곡</p>
                 <div className="flex items-center gap-3">
                    {/* 상담 페이지 경로 확인 */}
                    <button
                        onClick={() => router.push('/counsel')}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500 text-white rounded-md text-xs hover:bg-blue-600 transition-colors shadow-sm font-medium"
                    >
                        <Music className="w-4 h-4" />
                        추가 생성하기
                    </button>
                    {/* 전체 삭제 버튼 (현재 주석 처리된 함수 연결) */}
                    <button
                        onClick={handleClear}
                        disabled={playlist.length === 0}
                        className="text-xs text-red-500 hover:text-red-700 transition-colors flex items-center disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <Trash2 className="h-3 w-3 mr-1"/> 전체 삭제
                    </button>
                 </div>
            </div>

            <section>
                 {playlist.length === 0 ? (
                    <div className="text-center p-10 border-2 border-dashed border-gray-300 rounded-xl mt-8 bg-white">
                        <Music className="h-10 w-10 text-gray-400 mx-auto mb-3" />
                        <p className="text-gray-500">아직 생성된 음악이 없습니다.</p>
                        <p className="text-sm text-gray-400 mt-1">상담을 통해 나만의 음악을 만들어보세요!</p>
                    </div>
                 ) : (
                    <ul className="space-y-3">
                        {/* 최신순 정렬 (백엔드에서 이미 정렬했다면 필요 없음) */}
                        {[...playlist].reverse().map((track, index) => (
                            <li
                                key={track.id}
                                className={`p-4 border rounded-lg transition-all flex items-center justify-between shadow-sm ${
                                    currentTrackId === track.id ? 'bg-indigo-50 border-indigo-300' : 'bg-white hover:bg-gray-50 border-gray-200'
                                }`}
                            >
                                <div className="flex-1 min-w-0 mr-4">
                                    <p className={`font-medium truncate ${currentTrackId === track.id ? 'text-indigo-700' : 'text-gray-900'}`}>
                                        {playlist.length - index}. {track.title || `음악 트랙 #${track.id}`}
                                    </p>
                                    <p className="text-xs text-gray-500 mt-1 truncate">
                                        아티스트: {track.artist || 'TheraMusic AI'} (Prompt: {track.prompt || 'N/A'})
                                    </p>
                                </div>
                                <div className="flex-shrink-0 flex items-center gap-2">
                                    {/* 컬러테라피 버튼 (경로 확인 필요) */}
                                    <button
                                        onClick={() => router.push(`/game/color-therapy?songUrl=${encodeURIComponent(track.audioUrl)}`)}
                                        className="p-3 rounded-full transition-colors shadow-sm bg-teal-500 hover:bg-teal-600 text-white"
                                        aria-label="Color Therapy"
                                    >
                                        <Palette className="h-5 w-5" />
                                    </button>
                                    {/* 재생/일시정지 버튼 */}
                                    <button
                                        onClick={() => handlePlay(track)}
                                        className={`p-3 rounded-full transition-colors shadow-sm ${
                                            currentTrackId === track.id ? 'bg-red-500 hover:bg-red-600' : 'bg-indigo-500 hover:bg-indigo-600'
                                        } text-white`}
                                        aria-label={currentTrackId === track.id ? 'Pause' : 'Play'}
                                    >
                                        {currentTrackId === track.id ? <Volume2 className="h-5 w-5" /> : <Play className="h-5 w-5 fill-white pl-0.5" />}
                                    </button>
                                </div>
                            </li>
                        ))}
                    </ul>
                 )}
            </section>
        </div>
    );
}