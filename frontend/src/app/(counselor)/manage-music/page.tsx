'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { 
    Music, Play, Pause, User, Share2, Search, Loader2, AlertTriangle, FileAudio 
} from 'lucide-react';
import { useAuth } from '@/lib/contexts/AuthContext';

function getApiUrl() {
  // 1순위: 내부 통신용 (docker 네트워크 안에서 backend 이름으로 호출)
  if (process.env.INTERNAL_API_URL) {
    return process.env.INTERNAL_API_URL;
  }

  // 2순위: 공개용 API URL (빌드 시점에라도 이건 거의 항상 들어있음)
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL;
  }

  // 3순위: 최후 fallback - 도커 네트워크 기준으로 backend 서비스 직접 호출
  return 'http://backend:8000';
}

const API_URL = getApiUrl();

interface MusicTrack {
    music_id: number;
    music_title: string;
    patient_id: number;
    patient_name: string;
    created_at: string;
    initiator_type: string;
    session_id: number;
}

export default function CounselorMusicPage() {
    const router = useRouter();
    const { isAuthed } = useAuth();
    
    const [tracks, setTracks] = useState<MusicTrack[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    
    // 오디오 플레이어 상태
    const [currentTrackId, setCurrentTrackId] = useState<number | null>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    

    useEffect(() => {
        if (typeof window !== "undefined" && !audioRef.current) {
            const audio = new Audio();
            audio.onended = () => setCurrentTrackId(null);
            audioRef.current = audio;
        }

        const fetchMusic = async () => {
            const token = localStorage.getItem('accessToken');
            if (!token) return;
            
            try {
                const res = await fetch(`${API_URL}/therapist/music-list`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (!res.ok) throw new Error('음악 목록을 불러오지 못했습니다.');
                const data = await res.json();
                setTracks(data);
            } catch (err) {
                setError('데이터 로딩 중 오류가 발생했습니다.');
            } finally {
                setLoading(false);
            }
        };

        if (isAuthed) fetchMusic();
    }, [isAuthed]);

    const handlePlay = async (trackId: number, sessionId: number) => {
        if (!audioRef.current) return;

        if (currentTrackId === trackId) {
            audioRef.current.pause();
            setCurrentTrackId(null);
            return;
        }

        try {
            const token = localStorage.getItem('accessToken');
            const res = await fetch(`${API_URL}/music/track/${trackId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) throw new Error();

            const data = await res.json();

            let audioSrc = data.audioUrl ?? data.audio_url;

            if (!audioSrc) throw new Error("오디오 URL 없음");

            if (!audioSrc.startsWith("http")) {
                audioSrc = `${API_URL}${audioSrc}`;
            }

            audioRef.current.src = audioSrc;

            await audioRef.current.play();
            setCurrentTrackId(trackId);
        } catch (e) {
            alert("음악을 재생할 수 없습니다.");
        }
    };

    // 💡 [핵심] 게시판 공유 핸들러
    const handleShare = (track: MusicTrack) => {
        if (confirm(`'${track.patient_name}'님의 음악을 커뮤니티에 공유하시겠습니까?`)) {
            // 게시판 페이지로 이동하며 쿼리 파라미터 전달
            router.push(`/board?write=true&trackId=${track.music_id}&title=${encodeURIComponent(track.music_title)}`);
        }
    };

    const filteredTracks = tracks.filter(t => 
        t.patient_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.music_title.toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (loading) return <div className="flex justify-center items-center h-screen"><Loader2 className="w-8 h-8 animate-spin text-indigo-600"/></div>;

    return (
        <div className="max-w-5xl mx-auto p-6 min-h-screen bg-gray-50">
            <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
                <h1 className="text-2xl font-bold text-gray-900 flex items-center">
                    <FileAudio className="w-8 h-8 mr-2 text-indigo-600"/>
                    환자 음악 관리
                </h1>
                <div className="relative w-full md:w-64">
                    <input 
                        type="text" 
                        placeholder="환자 이름 또는 곡 제목 검색..." 
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                    <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left text-gray-500">
                        <thead className="text-xs text-gray-700 uppercase bg-gray-50">
                            <tr>
                                <th className="px-6 py-3">곡 정보</th>
                                <th className="px-6 py-3">환자명</th>
                                <th className="px-6 py-3">생성일</th>
                                <th className="px-6 py-3">유형</th>
                                <th className="px-6 py-3 text-center">관리</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredTracks.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-10 text-center text-gray-500">
                                        데이터가 없습니다.
                                    </td>
                                </tr>
                            ) : (
                                filteredTracks.map((track) => (
                                    <tr key={track.music_id} className="bg-white border-b hover:bg-gray-50 transition">
                                        <td className="px-6 py-4 font-medium text-gray-900 flex items-center gap-3">
                                            <button 
                                                onClick={() => handlePlay(track.music_id, track.session_id)}
                                                className={`p-2 rounded-full ${currentTrackId === track.music_id ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                                            >
                                                {currentTrackId === track.music_id ? <Pause className="w-4 h-4"/> : <Play className="w-4 h-4 ml-0.5"/>}
                                            </button>
                                            {track.music_title}
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center">
                                                <User className="w-4 h-4 mr-1 text-gray-400"/>
                                                {track.patient_name}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            {new Date(track.created_at).toLocaleDateString()}
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                                track.initiator_type === 'therapist' 
                                                ? 'bg-purple-100 text-purple-700' 
                                                : 'bg-green-100 text-green-700'
                                            }`}>
                                                {track.initiator_type === 'therapist' ? '처방됨' : '자가진행'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <button 
                                                onClick={() => handleShare(track)}
                                                className="text-indigo-600 hover:text-indigo-900 font-medium flex items-center justify-center gap-1 mx-auto"
                                            >
                                                <Share2 className="w-4 h-4"/> 공유
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}