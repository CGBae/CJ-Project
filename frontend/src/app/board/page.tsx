'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { 
    MessageCircle, Plus, Loader2, Music, User, Calendar, ShieldCheck, Trash2, 
    Search, Heart, Eye, Tag
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

// 1. 음악 트랙 타입
interface MusicTrack {
    id: number;
    title: string;
    created_at: string;
}

interface BoardTrack {
    id: number;
    title: string;
    audioUrl?: string;
}

// 2. 게시글 타입 (좋아요, 조회수, 태그 포함)
interface BoardPost {
    id: number;
    title: string;
    content: string;
    author_name: string;
    author_role: string; 
    author_id: number;
    created_at: string;
    comments_count: number;
    track?: BoardTrack | null;
    
    // 💡 [추가] 새 기능 필드
    views: number;
    tags: string[];
    like_count: number;
    is_liked: boolean;
}

// 💡 3. [핵심] API 응답 처리를 위한 유니온 타입 (any 대체용)
interface RawMusicData {
    id?: number;
    music_id?: number;
    title?: string;
    music_title?: string;
    created_at: string;
}

// 4. 로직을 내부 컴포넌트로 분리 (Suspense 적용)
function BoardListContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { user, isAuthed } = useAuth();
    
    const [posts, setPosts] = useState<BoardPost[]>([]);
    const [myMusic, setMyMusic] = useState<MusicTrack[]>([]);
    const [loading, setLoading] = useState(true);
    
    const [viewMode, setViewMode] = useState<'all' | 'my'>('all');

    // 검색 상태
    const [searchTerm, setSearchTerm] = useState('');

    // 작성 폼 상태
    const [showWriteForm, setShowWriteForm] = useState(false);
    const [newTitle, setNewTitle] = useState('');
    const [newContent, setNewContent] = useState('');
    const [newTags, setNewTags] = useState(''); // 💡 태그 입력
    const [selectedTrackId, setSelectedTrackId] = useState<number | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // URL 파라미터 처리 (공유하기 등)
    useEffect(() => {
        const writeMode = searchParams.get('write');
        const trackId = searchParams.get('trackId');
        const trackTitle = searchParams.get('title');

        if (writeMode === 'true') {
            setShowWriteForm(true);
            if (trackId) setSelectedTrackId(Number(trackId));
            if (trackTitle) {
                setNewTitle(`[음악 공유] ${decodeURIComponent(trackTitle)}`);
                setNewContent('이 환자를 위한 맞춤형 음악을 공유합니다. 함께 들어보세요!');
            }
        }
    }, [searchParams]);

    // 게시글 목록 가져오기 (검색 기능 포함)
    const fetchPosts = async () => {
        setLoading(true);
        try {
            let endpoint = `${API_URL}/board/`;
            
            // '내 글 보기' 모드일 때
            if (viewMode === 'my') endpoint = `${API_URL}/board/my`;

            // 💡 쿼리 파라미터 구성 (검색어)
            const params = new URLSearchParams();
            if (searchTerm) params.append('keyword', searchTerm);
            
            const urlWithParams = `${endpoint}?${params.toString()}`;

            const headers: HeadersInit = {};
            const token = localStorage.getItem('accessToken');
            
            if (token) headers['Authorization'] = `Bearer ${token}`;
            else if (viewMode === 'my') {
                 alert("로그인이 필요합니다.");
                 setViewMode('all'); 
                 return; 
            }

            const res = await fetch(urlWithParams, { headers });
            if (res.ok) {
                const data: BoardPost[] = await res.json();
                setPosts(data);
            }
        } catch (e) { 
            console.error("게시글 로딩 오류:", e); 
        } finally {
            setLoading(false);
        }
    };

    // 내 음악 목록 가져오기
    const fetchMyMusic = async () => {
        const token = localStorage.getItem('accessToken');
        if (!token) return;
        try {
            const endpoint = user?.role === 'therapist' ? `${API_URL}/therapist/music-list` : `${API_URL}/music/my`;
            const res = await fetch(endpoint, { 
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            if (res.ok) {
                // 💡 [수정] any 제거하고 RawMusicData[]로 타입 단언
                const data = await res.json() as RawMusicData[];
                
                const formattedData: MusicTrack[] = data.map((m) => ({
                    id: m.music_id ?? m.id ?? 0,
                    title: m.music_title ?? m.title ?? '제목 없음',
                    created_at: m.created_at
                }));
                setMyMusic(formattedData);
            }
        } catch (e) {}
    };

    // 뷰모드가 바뀌면 재로딩
    useEffect(() => {
        fetchPosts();
        if (isAuthed) fetchMyMusic();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [viewMode, isAuthed, user]);

    // 검색 핸들러 (엔터키 또는 버튼 클릭)
    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        fetchPosts();
    };

    const handleCreatePost = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newTitle.trim() || !newContent.trim()) return;
        
        setIsSubmitting(true);
        const token = localStorage.getItem('accessToken');
        if (!token) { alert("로그인이 필요합니다."); router.push('/login'); return; }

        // 💡 태그 문자열을 배열로 변환 (#, 쉼표 구분)
        const tagsArray = newTags
            .split(/[,#\s]+/) // 쉼표, 샵, 공백으로 분리
            .map(t => t.trim())
            .filter(t => t.length > 0);

        const payload = {
            title: newTitle,
            content: newContent,
            track_id: selectedTrackId ? selectedTrackId : null,
            tags: tagsArray // 💡 태그 전송
        };

        try {
            const res = await fetch(`${API_URL}/board/`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json', 
                    'Authorization': `Bearer ${token}` 
                },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                setShowWriteForm(false);
                setNewTitle(''); 
                setNewContent(''); 
                setNewTags('');
                setSelectedTrackId(null);
                fetchPosts(); 
            } else {
                alert("게시글 작성 실패");
            }
        } catch (e) { 
            console.error(e); 
        } finally { 
            setIsSubmitting(false); 
        }
    };

    const handleDeletePost = async (e: React.MouseEvent, postId: number) => {
        e.stopPropagation();
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
                fetchPosts();
            } else {
                alert("삭제 권한이 없거나 오류가 발생했습니다.");
            }
        } catch (e) { console.error(e); }
    };

    return (
        <div className="max-w-4xl mx-auto p-6 min-h-screen bg-gray-50">
            {/* 상단 헤더 및 검색창 */}
            <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
                <h1 className="text-2xl font-bold text-gray-900 flex items-center">
                    <MessageCircle className="w-8 h-8 mr-2 text-indigo-600"/> 치유 커뮤니티
                </h1>
                
                {/* 💡 검색창 */}
                <form onSubmit={handleSearch} className="relative w-full md:w-72">
                    <input 
                        type="text" 
                        placeholder="제목, 내용으로 검색..." 
                        value={searchTerm} 
                        onChange={e => setSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border rounded-full focus:ring-2 focus:ring-indigo-500 outline-none shadow-sm"
                    />
                    <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2"/>
                </form>
            </div>

            <div className="flex justify-between mb-6">
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

            {/* 글쓰기 폼 */}
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
                            rows={5} placeholder="마음속 이야기를 나누어보세요..." 
                            value={newContent} onChange={e => setNewContent(e.target.value)}
                            className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                        />
                        
                        {/* 💡 태그 입력란 */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">태그 (선택)</label>
                            <input 
                                type="text" 
                                placeholder="예: #우울 #힐링 #불면증 (쉼표나 공백으로 구분)" 
                                value={newTags} 
                                onChange={e => setNewTags(e.target.value)}
                                className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">🎵 내 음악 공유하기 (선택)</label>
                            <select 
                                className="w-full p-2 border rounded-lg text-sm"
                                onChange={(e) => setSelectedTrackId(Number(e.target.value) || null)}
                            >
                                <option value="">공유 안 함</option>
                                {myMusic.map(m => (
                                    <option key={m.id} value={m.id}>{m.title} ({new Date(m.created_at).toLocaleDateString()})</option>
                                ))}
                            </select>
                        </div>

                        <div className="flex justify-end gap-2 pt-2">
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
                            {/* 작성자 본인일 경우 삭제 버튼 표시 */}
                            {user && user.id === post.author_id && (
                                <button 
                                    onClick={(e) => handleDeletePost(e, post.id)}
                                    className="absolute top-4 right-4 p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full opacity-0 group-hover:opacity-100 transition-all"
                                    title="게시글 삭제"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            )}

                            <div className="flex justify-between items-start pr-8">
                                <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                                        {post.track && (
                                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-indigo-100 text-indigo-800">
                                                <Music className="w-3 h-3 mr-1"/>음악
                                            </span>
                                        )}
                                        {/* 💡 태그 표시 */}
                                        {post.tags && post.tags.map((tag, idx) => (
                                            <span key={idx} className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">
                                                <Tag className="w-3 h-3 mr-1"/>{tag}
                                            </span>
                                        ))}
                                    </div>

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
                                        
                                        {/* 💡 통계 아이콘 (조회수, 좋아요, 댓글) */}
                                        <span className="flex items-center"><Eye className="w-3 h-3 mr-1"/> {post.views}</span>
                                        <span className="flex items-center text-pink-500"><Heart className={`w-3 h-3 mr-1 ${post.is_liked ? 'fill-current' : ''}`}/> {post.like_count}</span>
                                        <span className="flex items-center text-blue-500"><MessageCircle className="w-3 h-3 mr-1"/> {post.comments_count}</span>
                                    </div>
                                </div>
                                
                                {post.track && (
                                    <div className="hidden sm:flex items-center justify-center w-12 h-12 bg-indigo-50 rounded-full text-indigo-600 flex-shrink-0 ml-4">
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

export default function BoardListPage() {
    return (
        <Suspense fallback={<div className="flex justify-center items-center min-h-screen"><Loader2 className="w-8 h-8 animate-spin text-indigo-600"/></div>}>
            <BoardListContent />
        </Suspense>
    );
}