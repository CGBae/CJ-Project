'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
    MessageCircle, Plus, Loader2, Music, User, Calendar
} from 'lucide-react';
import { useAuth } from '@/lib/contexts/AuthContext';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// 💡 1. 타입 정의 (any 대신 구체적인 타입사용)
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
    created_at: string;
    comments_count: number;
    track?: {
        id: number;
        title: string;
        audioUrl: string;
    };
}

export default function BoardListPage() {
    const router = useRouter();
    const { isAuthed } = useAuth();
    
    // 💡 2. 구체적인 타입 지정
    const [posts, setPosts] = useState<BoardPost[]>([]);
    const [myMusic, setMyMusic] = useState<MusicTrack[]>([]);
    const [loading, setLoading] = useState(true);
    
    // 작성 폼 상태
    const [showWriteForm, setShowWriteForm] = useState(false);
    const [newTitle, setNewTitle] = useState('');
    const [newContent, setNewContent] = useState('');
    const [selectedTrackId, setSelectedTrackId] = useState<number | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const fetchPosts = async () => {
        try {
            const res = await fetch(`${API_URL}/board/`);
            if(res.ok) setPosts(await res.json());
        } catch(e) { console.error(e); }
    };

    const fetchMyMusic = async () => {
        const token = localStorage.getItem('accessToken');
        if(!token) return;
        try {
            const res = await fetch(`${API_URL}/music/my`, { headers: { 'Authorization': `Bearer ${token}` }});
            if(res.ok) setMyMusic(await res.json());
        } catch(e) {}
    };

    useEffect(() => {
        Promise.all([fetchPosts(), fetchMyMusic()]).finally(() => setLoading(false));
    }, []);

    const handleCreatePost = async (e: React.FormEvent) => {
        e.preventDefault();
        if(!newTitle.trim() || !newContent.trim()) return;
        
        setIsSubmitting(true);
        const token = localStorage.getItem('accessToken');
        if(!token) { alert("로그인이 필요합니다."); router.push('/login'); return; }

        try {
            const res = await fetch(`${API_URL}/board/`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ title: newTitle, content: newContent, track_id: selectedTrackId })
            });
            if(res.ok) {
                setShowWriteForm(false);
                setNewTitle(''); setNewContent(''); setSelectedTrackId(null);
                fetchPosts(); // 목록 갱신
            } else {
                alert("게시글 작성 실패");
            }
        } catch(e) { console.error(e); } 
        finally { setIsSubmitting(false); }
    };

    return (
        <div className="max-w-4xl mx-auto p-6 min-h-screen bg-gray-50">
            <div className="flex justify-between items-center mb-8">
                <h1 className="text-2xl font-bold text-gray-900 flex items-center">
                    <MessageCircle className="w-8 h-8 mr-2 text-indigo-600"/> 치유 커뮤니티
                </h1>
                <button 
                    onClick={() => setShowWriteForm(!showWriteForm)}
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition shadow-sm font-medium"
                >
                    <Plus className="w-5 h-5"/> 글쓰기
                </button>
            </div>

            {/* 글쓰기 폼 */}
            {showWriteForm && (
                <div className="bg-white p-6 rounded-xl shadow-md mb-8 border border-gray-200 animate-in slide-in-from-top-2">
                    <h3 className="font-bold text-lg mb-4">새 게시글 작성</h3>
                    <form onSubmit={handleCreatePost} className="space-y-4">
                        <input 
                            type="text" placeholder="제목을 입력하세요" 
                            value={newTitle} onChange={e=>setNewTitle(e.target.value)}
                            className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                        />
                        <textarea 
                            rows={5} placeholder="내용을 입력하세요" 
                            value={newContent} onChange={e=>setNewContent(e.target.value)}
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
                            <button type="button" onClick={()=>setShowWriteForm(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">취소</button>
                            <button type="submit" disabled={isSubmitting} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-gray-400">
                                {isSubmitting ? '등록 중...' : '등록하기'}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* 게시글 목록 */}
            {loading ? <div className="text-center py-10"><Loader2 className="w-8 h-8 animate-spin mx-auto text-indigo-600"/></div> : (
                <div className="space-y-4">
                    {posts.length === 0 && <p className="text-center text-gray-500 py-10">아직 게시글이 없습니다.</p>}
                    {posts.map(post => (
                        <div 
                            key={post.id} 
                            onClick={() => router.push(`/board/${post.id}`)}
                            className="bg-white p-5 rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition cursor-pointer"
                        >
                            <div className="flex justify-between items-start">
                                <div>
                                    <h3 className="font-bold text-lg text-gray-800 mb-1">{post.title}</h3>
                                    <p className="text-gray-600 text-sm line-clamp-2 mb-3">{post.content}</p>
                                    <div className="flex items-center gap-4 text-xs text-gray-500">
                                        <span className="flex items-center"><User className="w-3 h-3 mr-1"/> {post.author_name}</span>
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