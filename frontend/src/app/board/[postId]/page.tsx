'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft, MessageCircle, Send, User, Calendar, Music, Play, Pause } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// 💡 1. 구체적인 타입 정의 (any 제거)
interface Comment {
    id: number;
    content: string;
    author_name: string;
    created_at: string;
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
    created_at: string;
    comments_count: number;
    track?: MusicTrack | null;
    comments: Comment[];
}

export default function PostDetailPage() {
    const router = useRouter();
    const params = useParams();
    const postId = params.postId;
    
    // 💡 2. useState에 제네릭 타입 적용
    const [post, setPost] = useState<BoardPostDetail | null>(null);
    const [comment, setComment] = useState('');
    const [loading, setLoading] = useState(true);
    const [isPlaying, setIsPlaying] = useState(false);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    const fetchPost = async () => {
        try {
            const res = await fetch(`${API_URL}/board/${postId}`);
            if(res.ok) {
                const data: BoardPostDetail = await res.json();
                setPost(data);
            }
        } catch(e) { 
            console.error(e); 
        } finally { 
            setLoading(false); 
        }
    };

    useEffect(() => { fetchPost(); }, [postId]);

    const handleCommentSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if(!comment.trim()) return;
        
        const token = localStorage.getItem('accessToken');
        if(!token) { alert("로그인이 필요합니다."); router.push('/login'); return; }

        try {
            const res = await fetch(`${API_URL}/board/${postId}/comments`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ content: comment })
            });
            if(res.ok) {
                setComment('');
                fetchPost(); // 새로고침
            }
        } catch(e) { console.error(e); }
    };

    const toggleAudio = () => {
        if(!audioRef.current) return;
        if(isPlaying) audioRef.current.pause();
        else audioRef.current.play();
        setIsPlaying(!isPlaying);
    };

    if(loading) return <div className="text-center py-20">로딩 중...</div>;
    if(!post) return <div className="text-center py-20">게시글을 찾을 수 없습니다.</div>;

    return (
        <div className="max-w-4xl mx-auto p-6 min-h-screen bg-gray-50">
            <button onClick={() => router.back()} className="flex items-center text-gray-500 hover:text-indigo-600 mb-6">
                <ArrowLeft className="w-4 h-4 mr-1"/> 목록으로
            </button>

            <article className="bg-white p-8 rounded-2xl shadow-sm border border-gray-200 mb-8">
                <h1 className="text-2xl font-bold text-gray-900 mb-4">{post.title}</h1>
                <div className="flex items-center gap-4 text-sm text-gray-500 mb-6 pb-6 border-b border-gray-100">
                    <span className="flex items-center"><User className="w-4 h-4 mr-1"/> {post.author_name}</span>
                    <span className="flex items-center"><Calendar className="w-4 h-4 mr-1"/> {new Date(post.created_at).toLocaleString()}</span>
                </div>
                
                <div className="prose max-w-none text-gray-700 mb-8 whitespace-pre-wrap">
                    {post.content}
                </div>

                {/* 음악 플레이어 */}
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
                        <audio ref={audioRef} src={post.track.audioUrl} onEnded={()=>setIsPlaying(false)} className="hidden"/>
                    </div>
                )}
            </article>

            {/* 댓글 섹션 */}
            <section className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
                <h3 className="font-bold text-lg mb-4 flex items-center">
                    <MessageCircle className="w-5 h-5 mr-2"/> 댓글 ({post.comments_count})
                </h3>
                
                <div className="space-y-4 mb-6">
                    {/* 💡 3. any 제거 (타입 추론 활용) */}
                    {post.comments.map((c) => (
                        <div key={c.id} className="p-4 bg-gray-50 rounded-xl">
                            <div className="flex justify-between items-center mb-2">
                                <span className="font-bold text-sm text-gray-800">{c.author_name}</span>
                                <span className="text-xs text-gray-400">{new Date(c.created_at).toLocaleDateString()}</span>
                            </div>
                            <p className="text-gray-700 text-sm">{c.content}</p>
                        </div>
                    ))}
                </div>

                <form onSubmit={handleCommentSubmit} className="relative">
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