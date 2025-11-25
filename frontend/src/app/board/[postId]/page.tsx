'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { 
    ArrowLeft, MessageCircle, Send, User, Calendar, Music, Play, Pause, 
    ShieldCheck, Trash2, Loader2, Heart, Eye, Tag 
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
interface Comment {
    id: number; content: string; author_name: string; author_role: string;
    created_at: string; author_id: number;
}
interface MusicTrack { id: number; title: string; audioUrl: string; }
interface BoardPostDetail {
    id: number; title: string; content: string; author_name: string; author_role: string;
    author_id: number; created_at: string; comments_count: number;
    track?: MusicTrack | null; comments: Comment[];
    views: number; tags: string[]; like_count: number; is_liked: boolean;
}

const AuthorBadge = ({ name, role, date }: { name: string, role: string, date: string }) => (
    <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold ${
            role === 'therapist' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
        }`}>
            {role === 'therapist' ? <ShieldCheck className="w-5 h-5"/> : <User className="w-5 h-5"/>}
        </div>
        <div>
            <div className="flex items-center gap-2">
                <span className={`font-semibold ${role === 'therapist' ? 'text-gray-900' : 'text-gray-800'}`}>{name}</span>
                {role === 'therapist' && <span className="px-2 py-0.5 bg-green-100 text-green-700 text-[10px] font-bold rounded-full">상담사</span>}
            </div>
            <p className="text-xs text-gray-400">{date}</p>
        </div>
    </div>
);

export default function PostDetailPage() {
    const router = useRouter();
    const params = useParams();
    const postId = params?.postId as string;
    const { user } = useAuth();
    
    const [post, setPost] = useState<BoardPostDetail | null>(null);
    const [comment, setComment] = useState('');
    const [loading, setLoading] = useState(true);
    const [isPlaying, setIsPlaying] = useState(false);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    const fetchPost = async () => {
        try {
            const token = localStorage.getItem('accessToken');
            const headers: HeadersInit = token ? { 'Authorization': `Bearer ${token}` } : {};
            const res = await fetch(`${API_URL}/board/${postId}`, { headers });
            if (res.ok) setPost(await res.json());
            else { alert("글을 찾을 수 없습니다."); router.push('/board'); }
        } catch (e) {} finally { setLoading(false); }
    };

    useEffect(() => { if(postId) fetchPost(); }, [postId]);

    const handleToggleLike = async () => {
        if (!post) return;
        const token = localStorage.getItem('accessToken');
        if (!token) { alert("로그인이 필요합니다."); return; }

        const prevPost = { ...post };
        setPost(prev => prev ? ({ ...prev, is_liked: !prev.is_liked, like_count: prev.is_liked ? prev.like_count - 1 : prev.like_count + 1 }) : null);

        try {
            const res = await fetch(`${API_URL}/board/${postId}/like`, {
                method: 'POST', headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) throw new Error();
        } catch (e) { setPost(prevPost); alert("실패했습니다."); }
    };

    const handleSubmitComment = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!comment.trim()) return;
        const token = localStorage.getItem('accessToken');
        if (!token) { alert("로그인이 필요합니다."); return router.push('/login'); }

        try {
            const res = await fetch(`${API_URL}/board/${postId}/comments`, {
                method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ content: comment })
            });
            if (res.ok) { setComment(''); fetchPost(); }
        } catch (e) {}
    };

    const handleDeletePost = async () => {
        if (!window.confirm("삭제하시겠습니까?")) return;
        const token = localStorage.getItem('accessToken');
        try {
            const res = await fetch(`${API_URL}/board/${postId}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
            if (res.ok) { alert("삭제되었습니다."); router.push('/board'); }
        } catch (e) {}
    };

    const handleDeleteComment = async (commentId: number) => {
        if (!window.confirm("삭제하시겠습니까?")) return;
        const token = localStorage.getItem('accessToken');
        try {
            const res = await fetch(`${API_URL}/board/comments/${commentId}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
            if (res.ok) fetchPost();
        } catch (e) {}
    };

    const toggleAudio = () => {
        if (!audioRef.current) return;
        if (isPlaying) audioRef.current.pause(); else audioRef.current.play();
        setIsPlaying(!isPlaying);
    };

    if (loading) return <div className="flex justify-center items-center min-h-screen"><Loader2 className="w-10 h-10 animate-spin text-indigo-600"/></div>;
    if (!post) return null;

    return (
        <div className="max-w-4xl mx-auto p-6 min-h-screen bg-gray-50">
            <button onClick={() => router.back()} className="group flex items-center text-gray-500 hover:text-indigo-600 mb-6 transition-colors font-medium">
                <ArrowLeft className="w-5 h-5 mr-2 group-hover:-translate-x-1 transition-transform"/> 목록으로 돌아가기
            </button>

            <div className="bg-white rounded-3xl shadow-sm border border-gray-200 overflow-hidden mb-8">
                {/* 헤더 */}
                <div className="p-8 border-b border-gray-100 bg-white relative">
                    {user && user.id === post.author_id && (
                        <button onClick={handleDeletePost} className="absolute top-8 right-8 p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-all" title="삭제">
                            <Trash2 className="w-5 h-5"/>
                        </button>
                    )}
                    
                    <div className="flex flex-wrap gap-2 mb-4">
                        {post.tags?.map((tag, idx) => (
                            <span key={idx} className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-100">
                                <Tag className="w-3 h-3 mr-1.5"/>{tag}
                            </span>
                        ))}
                    </div>
                    
                    <h1 className="text-3xl font-bold text-gray-900 mb-6 leading-tight">{post.title}</h1>
                    
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <AuthorBadge name={post.author_name} role={post.author_role} date={new Date(post.created_at).toLocaleString()} />
                        <div className="flex items-center gap-4 text-sm text-gray-500">
                            <div className="flex items-center bg-gray-100 px-3 py-1.5 rounded-full">
                                <Eye className="w-4 h-4 mr-1.5"/> {post.views}
                            </div>
                            <div className="flex items-center bg-pink-50 text-pink-600 px-3 py-1.5 rounded-full">
                                <Heart className="w-4 h-4 mr-1.5 fill-current"/> {post.like_count}
                            </div>
                        </div>
                    </div>
                </div>

                {/* 본문 */}
                <div className="p-8">
                    <div className="prose max-w-none text-gray-800 text-lg leading-relaxed whitespace-pre-wrap mb-10">
                        {post.content}
                    </div>

                    {/* 음악 플레이어 카드 */}
                    {post.track && (
                        <div className="bg-gradient-to-r from-indigo-50 to-purple-50 p-5 rounded-2xl border border-indigo-100 flex items-center justify-between shadow-sm">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-sm text-indigo-600">
                                    <Music className="w-6 h-6"/>
                                </div>
                                <div>
                                    <p className="text-xs text-indigo-500 font-bold uppercase tracking-wider mb-0.5">Shared Music</p>
                                    <p className="font-bold text-gray-900">{post.track.title}</p>
                                </div>
                            </div>
                            <button onClick={toggleAudio} className="w-12 h-12 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full flex items-center justify-center shadow-md transition-all transform hover:scale-105">
                                {isPlaying ? <Pause className="w-5 h-5"/> : <Play className="w-5 h-5 ml-1"/>}
                            </button>
                            <audio ref={audioRef} src={post.track.audioUrl} onEnded={() => setIsPlaying(false)} className="hidden"/>
                        </div>
                    )}
                </div>

                {/* 하단 액션 바 */}
                <div className="px-8 py-6 bg-gray-50 border-t border-gray-100 flex justify-center">
                    <button 
                        onClick={handleToggleLike}
                        className={`flex items-center gap-2 px-8 py-3 rounded-full border-2 transition-all font-bold text-sm ${
                            post.is_liked 
                                ? 'bg-pink-50 border-pink-500 text-white shadow-md transform scale-105' 
                                : 'bg-white border-gray-300 text-gray-600 hover:border-pink-300 hover:text-pink-500'
                        }`}
                    >
                        <Heart className={`w-5 h-5 ${post.is_liked ? 'fill-current' : ''}`} />
                        {post.is_liked ? '공감해요' : '공감하기'}
                    </button>
                </div>
            </div>

            {/* 댓글 섹션 */}
            <div className="max-w-3xl mx-auto">
                <h3 className="font-bold text-xl mb-6 flex items-center text-gray-800">
                    <MessageCircle className="w-6 h-6 mr-2 text-indigo-600"/> 댓글 <span className="ml-2 text-indigo-600">{post.comments_count}</span>
                </h3>
                
                {/* 댓글 입력창 */}
                <form onSubmit={handleSubmitComment} className="mb-10 relative">
                    <textarea 
                        rows={3}
                        placeholder="따뜻한 응원과 위로의 댓글을 남겨주세요..." 
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        className="w-full p-4 pr-14 bg-white border border-gray-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all shadow-sm resize-none"
                    />
                    <button type="submit" className="absolute bottom-3 right-3 p-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition-colors shadow-sm">
                        <Send className="w-5 h-5"/>
                    </button>
                </form>

                {/* 댓글 목록 */}
                <div className="space-y-6">
                    {post.comments.map((c) => (
                        <div key={c.id} className="flex gap-4 group">
                            <div className={`w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center text-sm font-bold ${
                                c.author_role === 'therapist' ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'
                            }`}>
                                {c.author_role === 'therapist' ? <ShieldCheck className="w-5 h-5"/> : c.author_name[0]}
                            </div>
                            <div className={`flex-1 p-4 rounded-2xl rounded-tl-none relative ${
                                c.author_role === 'therapist' ? 'bg-green-50' : 'bg-white border border-gray-100 shadow-sm'
                            }`}>
                                <div className="flex justify-between items-center mb-2">
                                    <div className="flex items-center gap-2">
                                        <span className={`text-sm font-bold ${c.author_role === 'therapist' ? 'text-green-800' : 'text-gray-900'}`}>
                                            {c.author_name}
                                        </span>
                                        {c.author_role === 'therapist' && <span className="text-[10px] bg-green-200 text-green-800 px-1.5 py-0.5 rounded font-bold">상담사</span>}
                                    </div>
                                    <span className="text-xs text-gray-400">{new Date(c.created_at).toLocaleDateString()}</span>
                                </div>
                                <p className="text-gray-700 text-sm leading-relaxed">{c.content}</p>

                                {user && user.id === c.author_id && (
                                    <button 
                                        onClick={() => handleDeleteComment(c.id)}
                                        className="absolute top-3 right-3 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                                        title="댓글 삭제"
                                    >
                                        <Trash2 className="w-4 h-4"/>
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}