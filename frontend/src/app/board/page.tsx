'use client';
import { Suspense } from "react";
import React, { useState, useEffect } from 'react';
import { useRouter, useSearchParams} from 'next/navigation';
import { 
    MessageCircle, Plus, Loader2, Music, User, Calendar, ShieldCheck, 
    Trash2
} from 'lucide-react';
import { useAuth } from '@/lib/contexts/AuthContext';

export default function BoardListPage() {
  return (
    <Suspense fallback={<div />}>
      <BoardListPageContent />
    </Suspense>
  );
}

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
    id: number;
    title: string;
    created_at: string;
}

interface BoardPost {
    id: number;
    title: string;
    content: string;
    author_name: string;
    author_role: string; 
    author_id: number;
    created_at: string;
    comments_count: number;
    track?: {
        id: number;
        title: string;
        audioUrl?: string;
    } | null;
}

interface RawMusicData {
    id?: number;          // /music/my 에서 사용
    music_id?: number;    // /therapist/music-list 에서 사용
    title?: string;       // /music/my 에서 사용
    music_title?: string; // /therapist/music-list 에서 사용
    created_at: string;
}
function BoardListPageContent() {
    const router = useRouter();
    const searchParams = useSearchParams()
    const { user, isAuthed } = useAuth();
    
    const [posts, setPosts] = useState<BoardPost[]>([]);
    const [myMusic, setMyMusic] = useState<MusicTrack[]>([]);
    const [loading, setLoading] = useState(true);
    
    // 💡 [추가] 탭 상태 ('all' | 'my')
    const [viewMode, setViewMode] = useState<'all' | 'my'>('all');

    const [showWriteForm, setShowWriteForm] = useState(false);
    const [newTitle, setNewTitle] = useState('');
    const [newContent, setNewContent] = useState('');
    const [selectedTrackId, setSelectedTrackId] = useState<number | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        const writeMode = searchParams.get('write');
        const trackId = searchParams.get('trackId');
        const trackTitle = searchParams.get('title');

        if (writeMode === 'true') {
            setShowWriteForm(true);
            if (trackId) {
                setSelectedTrackId(Number(trackId));
                // (음악 목록을 아직 못 불러왔어도 ID는 세팅해둠)
            }
            if (trackTitle) {
                setNewTitle(`[음악 공유] ${decodeURIComponent(trackTitle)}`);
                setNewContent('이 환자를 위한 맞춤형 음악을 공유합니다. 함께 들어보세요!');
            }
        }
    }, [searchParams]);

    const fetchPosts = async (mode: 'all' | 'my') => {
        setLoading(true);
        try {
            const endpoint = mode === 'my' ? `${API_URL}/board/my` : `${API_URL}/board/`;
            const headers: HeadersInit = {};
            const token = localStorage.getItem('accessToken');
            if (token) headers['Authorization'] = `Bearer ${token}`;
            
            const res = await fetch(endpoint, { headers });
            if (res.ok) setPosts(await res.json());
        } catch (e) {} finally { setLoading(false); }
    };

    const fetchMyMusic = async () => {
        const token = localStorage.getItem('accessToken');
        if (!token) return;
        try {
            // 상담사는 전체 환자 음악 목록, 환자는 내 음악 목록
            const endpoint = user?.role === 'therapist' ? `${API_URL}/therapist/music-list` : `${API_URL}/music/my`;
            const res = await fetch(endpoint, { headers: { 'Authorization': `Bearer ${token}` }});
            
             if (res.ok) {
                // 💡 [수정] 응답 데이터를 RawMusicData[] 타입으로 단언하여 any 제거
                const data = await res.json() as RawMusicData[];
                
                const formattedData: MusicTrack[] = data.map((m) => ({
                    // 두 API의 필드 중 존재하는 값을 사용 (둘 다 없으면 기본값 0/제목없음 처리)
                    id: m.music_id ?? m.id ?? 0,
                    title: m.music_title ?? m.title ?? '제목 없음',
                    created_at: m.created_at
                }));
                setMyMusic(formattedData);
            }
        } catch(e) {}
    };

    // 💡 viewMode가 바뀔 때마다 fetch 실행
    useEffect(() => {
        fetchPosts(viewMode);
        if (isAuthed) fetchMyMusic();
    }, [viewMode, isAuthed]);

    const handleCreatePost = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newTitle.trim() || !newContent.trim()) return;
        
        setIsSubmitting(true);
        const token = localStorage.getItem('accessToken');
        if (!token) { alert("로그인이 필요합니다."); router.push('/login'); return; }

        try {
            const res = await fetch(`${API_URL}/board/`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json', 
                    'Authorization': `Bearer ${token}` 
                },
                body: JSON.stringify({ 
                    title: newTitle, 
                    content: newContent, 
                    track_id: selectedTrackId 
                })
            });

            if (res.ok) {
                setShowWriteForm(false);
                setNewTitle(''); setNewContent(''); setSelectedTrackId(null);
                fetchPosts(viewMode); // 현재 모드로 새로고침
            } else {
                alert("게시글 작성 실패");
            }
        } catch (e) { console.error(e); } 
        finally { setIsSubmitting(false); }
    };

    // 💡 [추가] 게시글 삭제 핸들러
    const handleDeletePost = async (e: React.MouseEvent, postId: number) => {
        e.stopPropagation(); // 카드 클릭 방지
        if (!window.confirm("정말 이 게시글을 삭제하시겠습니까?")) return;
        
        const token = localStorage.getItem('accessToken');
        if (!token) return;

        try {
            const res = await fetch(`${API_URL}/board/${postId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                alert("삭제되었습니다.");
                fetchPosts(viewMode); // 목록 새로고침
            } else {
                alert("삭제 권한이 없거나 오류가 발생했습니다.");
            }
        } catch (e) { console.error(e); }
    };

    return (
        <div className="max-w-4xl mx-auto p-6 min-h-screen bg-gray-50">
            <div className="flex flex-col sm:flex-row justify-between items-center mb-8 gap-4">
                <h1 className="text-2xl font-bold text-gray-900 flex items-center">
                    <MessageCircle className="w-8 h-8 mr-2 text-indigo-600"/> 치유 커뮤니티
                </h1>
                <div className="flex gap-2">
                    {/* 💡 탭 버튼 */}
                    <div className="flex bg-gray-200 p-1 rounded-lg">
                        <button 
                            onClick={() => setViewMode('all')}
                            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${viewMode === 'all' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
                        >
                            전체 글
                        </button>
                        <button 
                            onClick={() => setViewMode('my')}
                            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${viewMode === 'my' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
                        >
                            내가 쓴 글
                        </button>
                    </div>
                    <button 
                        onClick={() => setShowWriteForm(!showWriteForm)}
                        className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition shadow-sm font-medium text-sm"
                    >
                        <Plus className="w-4 h-4"/> 글쓰기
                    </button>
                </div>
            </div>

            {/* 글쓰기 폼 (변경 없음) */}
            {showWriteForm && (
                <div className="bg-white p-6 rounded-xl shadow-md mb-8 border border-gray-200 animate-in slide-in-from-top-2">
                    <h3 className="font-bold text-lg mb-4">새 게시글 작성</h3>
                    <form onSubmit={handleCreatePost} className="space-y-4">
                        <input 
                            type="text" placeholder="제목을 입력하세요" 
                            value={newTitle} onChange={e => setNewTitle(e.target.value)}
                            className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                        />
                        <textarea 
                            rows={5} placeholder="내용을 입력하세요" 
                            value={newContent} onChange={e => setNewContent(e.target.value)}
                            className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                        />
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">🎵 내 음악 공유하기 (선택)</label>
                            <select 
                                className="w-full p-2 border rounded-lg"
                                onChange={(e) => setSelectedTrackId(Number(e.target.value) || null)}
                            >
                                <option value="">공유 안 함</option>
                                {myMusic.map(m => (
                                    <option key={m.id} value={m.id}>{m.title} ({new Date(m.created_at).toLocaleDateString()})</option>
                                ))}
                            </select>
                        </div>
                        <div className="flex justify-end gap-2">
                            <button type="button" onClick={() => setShowWriteForm(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">취소</button>
                            <button type="submit" disabled={isSubmitting} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-gray-400">
                                {isSubmitting ? '등록 중...' : '등록하기'}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* 게시글 목록 */}
            {loading ? (
                <div className="text-center py-10"><Loader2 className="w-8 h-8 animate-spin mx-auto text-indigo-600"/></div>
            ) : (
                <div className="space-y-4">
                    {posts.length === 0 && <p className="text-center text-gray-500 py-10">{viewMode === 'my' ? '작성한 글이 없습니다.' : '아직 게시글이 없습니다.'}</p>}
                    {posts.map(post => (
                        <div 
                            key={post.id} 
                            onClick={() => router.push(`/board/${post.id}`)}
                            className="bg-white p-5 rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition cursor-pointer relative group"
                        >
                            {/* 💡 [추가] 작성자 본인일 경우 삭제 버튼 표시 */}
                            {user && user.id === post.author_id && (
                                <button 
                                    onClick={(e) => handleDeletePost(e, post.id)}
                                    className="absolute top-4 right-4 p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full opacity-0 group-hover:opacity-100 transition-all"
                                    title="게시글 삭제"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            )}

                            <div className="flex justify-between items-start pr-8"> {/* 삭제 버튼 공간 확보 */}
                                <div>
                                    <h3 className="font-bold text-lg text-gray-800 mb-1">{post.title}</h3>
                                    <p className="text-gray-600 text-sm line-clamp-2 mb-3">{post.content}</p>
                                    <div className="flex items-center gap-4 text-xs text-gray-500">
                                        <span className="flex items-center">
                                            {post.author_role === 'therapist' 
                                                ? <span className="flex items-center text-green-600 font-bold mr-1"><ShieldCheck className="w-3 h-3 mr-1"/>상담사</span> 
                                                : <User className="w-3 h-3 mr-1"/>}
                                            {post.author_name}
                                        </span>
                                        <span className="flex items-center"><Calendar className="w-3 h-3 mr-1"/> {new Date(post.created_at).toLocaleDateString()}</span>
                                        <span className="flex items-center"><MessageCircle className="w-3 h-3 mr-1"/> 댓글 {post.comments_count}</span>
                                    </div>
                                </div>
                                {post.track && (
                                    <div className="hidden sm:flex items-center justify-center w-12 h-12 bg-indigo-50 rounded-full text-indigo-600 flex-shrink-0">
                                        <Music className="w-6 h-6"/>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}