'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft, MessageCircle, Send, User, Calendar, Music, Play, Pause, ShieldCheck, Loader2, Trash2 } from 'lucide-react';
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
    id: number;
    content: string;
    author_name: string;
    author_role: string;
    created_at: string;
    author_id: number;
}

interface MusicTrack {
    id: number;
    title: string;
    audioUrl: string;
}

interface BoardPostDetail {
    id: number;
    title: string;
    content: string;
    author_name: string;
    author_role: string; 
    author_id: number;
    created_at: string;
    comments_count: number;
    track?: MusicTrack | null;
    comments: Comment[];
}

const AuthorBadge = ({ name, role }: { name: string, role: string }) => (
    <span className="flex items-center">
        {role === 'therapist' 
            ? <span className="flex items-center text-green-600 font-bold bg-green-50 px-2 py-0.5 rounded-full text-xs mr-2 border border-green-100"><ShieldCheck className="w-3 h-3 mr-1"/>상담사</span>
            : <User className="w-4 h-4 mr-1 text-gray-400"/>
        }
        <span className={role === 'therapist' ? 'font-medium text-gray-900' : 'text-gray-600'}>{name}</span>
    </span>
);

export default function PostDetailPage() {
    const router = useRouter();
    const params = useParams();
    const postId = params?.postId as string;
    const { user } = useAuth(); // 💡 현재 로그인 유저 정보
    
    const [post, setPost] = useState<BoardPostDetail | null>(null);
    const [comment, setComment] = useState('');
    const [loading, setLoading] = useState(true);
    const [isPlaying, setIsPlaying] = useState(false);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    const fetchPost = async () => {
        try {
            const res = await fetch(`${API_URL}/board/${postId}`);
            if (res.ok) {
                const data: BoardPostDetail = await res.json();
                setPost(data);
            }
        } catch (e) { 
            console.error(e); 
        } finally { 
            setLoading(false); 
        }
    };

    useEffect(() => { 
        if(postId) fetchPost(); 
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [postId]);

    // 댓글 작성
    const handleSubmitComment = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!comment.trim()) return;
        
        const token = localStorage.getItem('accessToken');
        if (!token) { alert("로그인이 필요합니다."); return router.push('/login'); }

        try {
            const res = await fetch(`${API_URL}/board/${postId}/comments`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ content: comment })
            });
            if (res.ok) { 
                setComment(''); 
                fetchPost(); 
            }
        } catch (e) { console.error(e); }
    };

    // 💡 [추가] 게시글 삭제
    const handleDeletePost = async () => {
        if (!window.confirm("정말 이 게시글을 삭제하시겠습니까?")) return;
        const token = localStorage.getItem('accessToken');
        if (!token) return;

        try {
            const res = await fetch(`${API_URL}/board/${postId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                alert("게시글이 삭제되었습니다.");
                router.push('/board'); // 목록으로 이동
            } else {
                alert("삭제 권한이 없거나 오류가 발생했습니다.");
            }
        } catch (e) { console.error(e); }
    };

    // 💡 [추가] 댓글 삭제
    const handleDeleteComment = async (commentId: number) => {
        if (!window.confirm("댓글을 삭제하시겠습니까?")) return;
        const token = localStorage.getItem('accessToken');
        if (!token) return;

        try {
            const res = await fetch(`${API_URL}/board/comments/${commentId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                fetchPost(); // 새로고침
            } else {
                alert("삭제 권한이 없습니다.");
            }
        } catch (e) { console.error(e); }
    };

    const toggleAudio = () => {
        if (!audioRef.current) return;
        if (isPlaying) audioRef.current.pause();
        else audioRef.current.play();
        setIsPlaying(!isPlaying);
    };

    if (loading) return <div className="text-center py-20"><Loader2 className="w-8 h-8 animate-spin mx-auto text-indigo-600"/></div>;
    if (!post) return <div className="text-center py-20">게시글을 찾을 수 없습니다.</div>;

    return (
        <div className="max-w-4xl mx-auto p-6 min-h-screen bg-gray-50">
            <button onClick={() => router.back()} className="flex items-center text-gray-500 hover:text-indigo-600 mb-6 transition-colors">
                <ArrowLeft className="w-4 h-4 mr-1"/> 목록으로
            </button>

            <article className="bg-white p-8 rounded-2xl shadow-sm border border-gray-200 mb-8 relative">
                {/* 💡 게시글 삭제 버튼 (본인일 때만 표시) */}
                {user && user.id === post.author_id && (
                    <button 
                        onClick={handleDeletePost}
                        className="absolute top-8 right-8 text-gray-400 hover:text-red-500 transition-colors"
                        title="게시글 삭제"
                    >
                        <Trash2 className="w-5 h-5"/>
                    </button>
                )}

                <h1 className="text-2xl font-bold text-gray-900 mb-4 pr-10">{post.title}</h1>
                <div className="flex items-center justify-between text-sm text-gray-500 mb-6 pb-6 border-b border-gray-100">
                    <AuthorBadge name={post.author_name} role={post.author_role} />
                    <span className="flex items-center"><Calendar className="w-4 h-4 mr-1"/> {new Date(post.created_at).toLocaleString()}</span>
                </div>
                
                <div className="prose max-w-none text-gray-700 mb-8 whitespace-pre-wrap leading-relaxed">
                    {post.content}
                </div>

                {post.track && (
                    <div className="bg-indigo-50 p-4 rounded-xl flex items-center justify-between border border-indigo-100">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-indigo-600 rounded-full flex items-center justify-center text-white">
                                <Music className="w-5 h-5"/>
                            </div>
                            <div>
                                <p className="font-bold text-indigo-900 text-sm">{post.track.title}</p>
                                <p className="text-xs text-indigo-600">공유된 음악 트랙</p>
                            </div>
                        </div>
                        <button onClick={toggleAudio} className="p-2 bg-white rounded-full shadow-sm hover:bg-gray-50 text-indigo-600">
                            {isPlaying ? <Pause className="w-5 h-5"/> : <Play className="w-5 h-5 ml-0.5"/>}
                        </button>
                        <audio ref={audioRef} src={post.track.audioUrl} onEnded={() => setIsPlaying(false)} className="hidden"/>
                    </div>
                )}
            </article>

            {/* 댓글 섹션 */}
            <section className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
                <h3 className="font-bold text-lg mb-4 flex items-center text-gray-800">
                    <MessageCircle className="w-5 h-5 mr-2 text-indigo-500"/> 댓글 ({post.comments_count})
                </h3>
                
                <div className="space-y-4 mb-6">
                    {post.comments.map((c) => (
                        <div key={c.id} className={`p-4 rounded-xl relative group ${c.author_role === 'therapist' ? 'bg-green-50 border border-green-100' : 'bg-gray-50'}`}>
                            <div className="flex justify-between items-center mb-2">
                                <AuthorBadge name={c.author_name} role={c.author_role} />
                                <span className="text-xs text-gray-400">{new Date(c.created_at).toLocaleDateString()}</span>
                            </div>
                            <p className="text-gray-700 text-sm pr-6">{c.content}</p>
                            
                            {/* 💡 댓글 삭제 버튼 (본인일 때만 표시) */}
                            {user && user.id === c.author_id && (
                                <button 
                                    onClick={() => handleDeleteComment(c.id)}
                                    className="absolute top-4 right-4 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                                    title="댓글 삭제"
                                >
                                    <Trash2 className="w-4 h-4"/>
                                </button>
                            )}
                        </div>
                    ))}
                </div>

                <form onSubmit={handleSubmitComment} className="relative">
                    <input 
                        type="text" 
                        placeholder="따뜻한 댓글을 남겨주세요..." 
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        className="w-full p-4 pr-12 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                    />
                    <button type="submit" className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-indigo-600 hover:bg-indigo-50 rounded-full">
                        <Send className="w-5 h-5"/>
                    </button>
                </form>
            </section>
        </div>
    );
}