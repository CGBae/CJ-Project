'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
    MessageCircle, Plus, Loader2, Music, User, Calendar, ShieldCheck, Trash2,
    Search, Heart, Eye, Tag, PenLine, SlidersHorizontal, ArrowLeft, Filter
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

// 2. 게시글 타입
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
    views: number;
    tags: string[];
    like_count: number;
    is_liked: boolean;
}

// 3. API 응답 처리를 위한 유니온 타입 정의
interface RawMusicData {
    id?: number;
    music_id?: number;
    title?: string;
    music_title?: string;
    created_at: string;
}

// 정렬 옵션 타입 정의
type SortOption = 'latest' | 'views' | 'likes' | 'comments';

function BoardListContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { user, isAuthed } = useAuth();

    const [posts, setPosts] = useState<BoardPost[]>([]);
    const [myMusic, setMyMusic] = useState<MusicTrack[]>([]);
    const [loading, setLoading] = useState(true);

    const [viewMode, setViewMode] = useState<'all' | 'my'>('all');

    // 정렬 및 필터 상태
    const [sortBy, setSortBy] = useState<SortOption>('latest');
    const [filterMusic, setFilterMusic] = useState(false);

    // 검색 상태
    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');

    // 작성 폼 상태
    const [showWriteForm, setShowWriteForm] = useState(false);
    const [newTitle, setNewTitle] = useState('');
    const [newContent, setNewContent] = useState('');
    const [newTags, setNewTags] = useState(''); // 태그 입력
    const [selectedTrackId, setSelectedTrackId] = useState<number | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // 검색어 디바운스
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(searchTerm);
        }, 500);
        return () => clearTimeout(timer);
    }, [searchTerm]);

    // URL 파라미터 처리
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

    // 게시글 목록 가져오기
    const fetchPosts = async () => {
        setLoading(true);
        try {
            const baseEndpoint = viewMode === 'my' ? `${API_URL}/board/my` : `${API_URL}/board/`;
            const url = new URL(baseEndpoint);

            // 검색어
            if (debouncedSearch) url.searchParams.append('keyword', debouncedSearch);

            // 정렬 및 필터 (전체 모드일 때만 적용 - 내 글 보기는 보통 최신순 고정)
            url.searchParams.append('sort_by', sortBy);

            if (filterMusic) {
                url.searchParams.append('has_music', 'true');
            }

            const headers: HeadersInit = {};
            const token = localStorage.getItem('accessToken');

            if (token) headers['Authorization'] = `Bearer ${token}`;
            else if (viewMode === 'my') {
                alert("로그인이 필요합니다.");
                setViewMode('all');
                return;
            }

            const res = await fetch(url.toString(), { headers });
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
                const data = await res.json() as RawMusicData[];
                const formattedData: MusicTrack[] = data.map((m) => ({
                    id: m.music_id ?? m.id ?? 0,
                    title: m.music_title ?? m.title ?? '제목 없음',
                    created_at: m.created_at
                }));
                setMyMusic(formattedData);
            }
        } catch (e) { }
    };

    // 상태 변경 시 데이터 재로딩
    useEffect(() => {
        fetchPosts();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [viewMode, debouncedSearch, sortBy, filterMusic]);

    useEffect(() => {
        if (isAuthed) fetchMyMusic();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isAuthed, user]);

    const handleCreatePost = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newTitle.trim() || !newContent.trim()) return;

        setIsSubmitting(true);
        const token = localStorage.getItem('accessToken');
        if (!token) { alert("로그인이 필요합니다."); router.push('/login'); return; }

        const tagsArray = newTags.split(/[,#\s]+/).map(t => t.trim()).filter(t => t.length > 0);

        const payload = {
            title: newTitle,
            content: newContent,
            track_id: selectedTrackId ? selectedTrackId : null,
            tags: tagsArray
        };

        try {
            const res = await fetch(`${API_URL}/board/`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                setShowWriteForm(false);
                setNewTitle(''); setNewContent(''); setNewTags(''); setSelectedTrackId(null);
                fetchPosts();
            } else {
                alert("게시글 작성 실패");
            }
        } catch (e) { console.error(e); }
        finally { setIsSubmitting(false); }
    };

    const handleDeletePost = async (e: React.MouseEvent, postId: number) => {
        e.stopPropagation();
        if (!window.confirm("정말 이 게시글을 삭제하시겠습니까?")) return;
        const token = localStorage.getItem('accessToken');
        if (!token) return;

        try {
            const res = await fetch(`${API_URL}/board/${postId}`, {
                method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                alert("삭제되었습니다.");
                fetchPosts();
            }
        } catch (e) { console.error(e); }
    };

    // --- 렌더링: 작성 폼 ---
    if (showWriteForm) {
        return (
            <div className="max-w-3xl mx-auto p-6 min-h-screen bg-gray-50">
                <div className="mb-6 flex items-center">
                    <button onClick={() => setShowWriteForm(false)} className="flex items-center text-gray-500 hover:text-indigo-600 transition-colors font-medium">
                        <ArrowLeft className="w-5 h-5 mr-2" /> 목록으로 돌아가기
                    </button>
                </div>

                <div className="bg-white p-8 rounded-2xl shadow-lg border border-gray-200 animate-in slide-in-from-bottom-4 duration-300">
                    <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center border-b pb-4">
                        <PenLine className="w-6 h-6 mr-2 text-indigo-600" /> 새 이야기 작성
                    </h2>

                    <form onSubmit={handleCreatePost} className="space-y-6">
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2">제목</label>
                            <input
                                type="text" placeholder="제목을 입력해주세요"
                                value={newTitle} onChange={e => setNewTitle(e.target.value)}
                                className="w-full p-4 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none bg-gray-50 focus:bg-white transition-all"
                                required
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2">내용</label>
                            <textarea
                                rows={10} placeholder="마음속 이야기를 자유롭게 나누어보세요..."
                                value={newContent} onChange={e => setNewContent(e.target.value)}
                                className="w-full p-4 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none bg-gray-50 focus:bg-white transition-all resize-none"
                                required
                            />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">태그 (선택)</label>
                                <div className="relative">
                                    <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                    <input
                                        type="text" placeholder="예: #우울 #힐링 #불면증"
                                        value={newTags} onChange={e => setNewTags(e.target.value)}
                                        className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">음악 공유 (선택)</label>
                                <div className="relative">
                                    <Music className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                    <select
                                        className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm appearance-none bg-white"
                                        onChange={(e) => setSelectedTrackId(Number(e.target.value) || null)}
                                        value={selectedTrackId || ''}
                                    >
                                        <option value="">선택 안 함</option>
                                        {myMusic.map(m => (
                                            <option key={m.id} value={m.id}>{m.title} ({new Date(m.created_at).toLocaleDateString()})</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        </div>

                        <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                            <button type="button" onClick={() => setShowWriteForm(false)} className="px-6 py-3 text-gray-600 hover:bg-gray-100 rounded-xl font-medium transition-colors">취소</button>
                            <button type="submit" disabled={isSubmitting} className="px-8 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 disabled:bg-gray-300 transition-all shadow-md hover:shadow-lg flex items-center">
                                {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : "등록하기"}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        );
    }

    // --- 렌더링: 목록 화면 ---
    return (
        <div className="max-w-5xl mx-auto p-4 sm:p-8 min-h-screen bg-gray-50">

            {/* 헤더 섹션 */}
            <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-6">
                <div className="text-center md:text-left">
                    <h1 className="text-3xl font-extrabold text-gray-900 flex items-center justify-center md:justify-start mb-2">
                        <MessageCircle className="w-8 h-8 mr-3 text-indigo-600" />
                        치유 커뮤니티
                    </h1>
                    <p className="text-gray-500 text-sm">서로의 이야기를 듣고 음악으로 위로를 전하세요.</p>
                </div>

                <div className="w-full md:w-auto">
                    <div className="relative w-full md:w-80 shadow-sm">
                        <input
                            type="text" placeholder="관심있는 키워드 검색..."
                            value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                            className="w-full pl-11 pr-4 py-3 border border-gray-200 rounded-full focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none bg-white transition-all"
                        />
                        <Search className="w-5 h-5 text-gray-400 absolute left-4 top-1/2 -translate-y-1/2" />
                    </div>
                </div>
            </div>

            {/* 컨트롤 바 (탭, 필터, 글쓰기) */}
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-200 mb-6 flex flex-col md:flex-row justify-between items-center gap-4">

                {/* 탭 */}
                <div className="flex bg-gray-100 p-1 rounded-xl w-full md:w-auto">
                    <button
                        onClick={() => setViewMode('all')}
                        className={`flex-1 md:flex-none px-6 py-2 rounded-lg text-sm font-medium transition-all ${viewMode === 'all' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
                    >
                        전체 글
                    </button>
                    <button
                        onClick={() => setViewMode('my')}
                        className={`flex-1 md:flex-none px-6 py-2 rounded-lg text-sm font-medium transition-all ${viewMode === 'my' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
                    >
                        내가 쓴 글
                    </button>
                </div>

                <div className="flex items-center gap-3 w-full md:w-auto justify-end">
                    <>
                        <button
                            onClick={() => setFilterMusic(!filterMusic)}
                            className={`flex items-center px-4 py-2 rounded-lg text-sm font-medium border transition-all ${filterMusic ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                        >
                            <Music className={`w-4 h-4 mr-2 ${filterMusic ? 'text-indigo-600' : 'text-gray-400'}`} />
                            음악 포함
                        </button>

                        <div className="relative">
                            <select
                                value={sortBy}
                                onChange={(e) => setSortBy(e.target.value as SortOption)}
                                className="appearance-none pl-4 pr-10 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 focus:ring-2 focus:ring-indigo-500 outline-none bg-white cursor-pointer hover:border-gray-300 transition-colors"
                            >
                                <option value="latest">최신순</option>
                                <option value="views">조회순</option>
                                <option value="likes">좋아요순</option>
                                <option value="comments">댓글순</option>
                            </select>
                            <SlidersHorizontal className="w-4 h-4 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                        </div>
                    </>

                    <button
                        onClick={() => setShowWriteForm(true)}
                        className="flex items-center gap-2 px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-all shadow-md hover:shadow-lg font-semibold text-sm ml-2"
                    >
                        <Plus className="w-4 h-4" /> 글쓰기
                    </button>
                </div>
            </div>

            {/* 게시글 목록 */}
            {loading ? (
                <div className="py-20 flex flex-col items-center justify-center text-gray-400">
                    <Loader2 className="w-10 h-10 animate-spin mb-3" />
                    <p>이야기를 불러오는 중입니다...</p>
                </div>
            ) : (
                <div className="grid gap-4">
                    {posts.length === 0 ? (
                        <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-gray-300">
                            <p className="text-gray-500 text-lg">아직 등록된 게시글이 없습니다.</p>
                            <p className="text-gray-400 text-sm mt-2">첫 번째 이야기를 들려주세요!</p>
                        </div>
                    ) : (
                        posts.map(post => (
                            <div
                                key={post.id}
                                onClick={() => router.push(`/board/${post.id}`)}
                                className="group bg-white p-6 rounded-2xl shadow-sm border border-gray-200 hover:shadow-md hover:border-indigo-200 transition-all cursor-pointer relative"
                            >
                                {user && user.id === post.author_id && (
                                    <button
                                        onClick={(e) => handleDeletePost(e, post.id)}
                                        className="absolute top-5 right-5 p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-full transition-all opacity-0 group-hover:opacity-100 z-10"
                                        title="삭제"
                                    >
                                        <Trash2 className="w-5 h-5" />
                                    </button>
                                )}

                                <div className="flex flex-col md:flex-row gap-6 md:items-start">
                                    <div className="flex-1">
                                        <div className="flex flex-wrap items-center gap-2 mb-3">
                                            {post.track && (
                                                <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold bg-indigo-50 text-indigo-600 border border-indigo-100">
                                                    <Music className="w-3 h-3 mr-1" /> 음악
                                                </span>
                                            )}
                                            {post.tags && post.tags.map((tag, idx) => (
                                                <span key={idx} className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-gray-100 text-gray-600 border border-gray-200">
                                                    #{tag}
                                                </span>
                                            ))}
                                        </div>

                                        <h3 className="text-xl font-bold text-gray-900 mb-2 group-hover:text-indigo-700 transition-colors line-clamp-1">
                                            {post.title}
                                        </h3>
                                        <p className="text-gray-600 text-sm line-clamp-2 mb-4 leading-relaxed h-10">
                                            {post.content}
                                        </p>

                                        <div className="flex items-center justify-between pt-4 border-t border-gray-100">
                                            <div className="flex items-center gap-3 text-xs text-gray-500 font-medium">
                                                <span className="flex items-center">
                                                    {post.author_role === 'therapist'
                                                        ? <span className="flex items-center text-green-700 bg-green-50 px-2 py-0.5 rounded-full"><ShieldCheck className="w-3 h-3 mr-1" />상담사</span>
                                                        : <span className="flex items-center"><User className="w-3 h-3 mr-1" />{post.author_name}</span>}
                                                </span>
                                                <span className="text-gray-300">|</span>
                                                <span>{new Date(post.created_at).toLocaleDateString()}</span>
                                            </div>

                                            <div className="flex items-center gap-4 text-xs font-medium text-gray-500">
                                                <span className="flex items-center hover:text-gray-700" title="조회수">
                                                    <Eye className="w-4 h-4 mr-1" /> {post.views}
                                                </span>
                                                <span className={`flex items-center ${post.is_liked ? 'text-pink-500' : 'text-gray-500'}`} title="좋아요">
                                                    <Heart className={`w-4 h-4 mr-1 ${post.is_liked ? 'fill-current' : ''}`} /> {post.like_count}
                                                </span>
                                                <span className="flex items-center hover:text-blue-600" title="댓글">
                                                    <MessageCircle className="w-4 h-4 mr-1" /> {post.comments_count}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* 썸네일 (음악 아이콘) */}
                                    {post.track && (
                                        <div className="hidden md:flex items-center justify-center w-20 h-20 bg-gradient-to-br from-indigo-50 to-purple-50 rounded-2xl border border-indigo-100 text-indigo-400 flex-shrink-0 shadow-sm group-hover:scale-105 transition-transform">
                                            <Music className="w-10 h-10 opacity-50" />
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            )}
        </div>
    );
}

export default function BoardListPage() {
    return (
        <Suspense fallback={<div className="flex justify-center items-center min-h-screen"><Loader2 className="w-10 h-10 animate-spin text-indigo-600" /></div>}>
            <BoardListContent />
        </Suspense>
    );
}