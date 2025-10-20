// // components/ChatInterface.tsx

// 'use client';
// import React, { useState, useRef, useEffect, FormEvent } from 'react';

// // 메시지 객체에 대한 타입을 명시적으로 정의합니다.
// interface ChatMessage {
//     id: string;
//     role: 'user' | 'assistant' | 'system'; // 'system' 역할은 서버에서 처리합니다.
//     content: string;
// }

// export default function ChatInterface() {
//     // 챗 기록과 입력 값을 직접 관리합니다.
//     const [messages, setMessages] = useState<ChatMessage[]>([]);
//     const [input, setInput] = useState('');
//     const [isLoading, setIsLoading] = useState(false);
//     const messagesEndRef = useRef<HTMLDivElement>(null);

//     // 스크롤 자동 이동
//     useEffect(() => {
//         messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
//     }, [messages]);

//     const handleSubmit = async (e: FormEvent) => {
//         e.preventDefault();
//         const userText = input.trim();
//         if (isLoading || !userText) return;

//         // 1. 사용자 메시지를 생성하여 UI에 즉시 추가
//         const userMessage: ChatMessage = { id: Date.now().toString(), role: 'user', content: userText };
//         const newMessages = [...messages, userMessage];
//         setMessages(newMessages);
//         setInput('');
//         setIsLoading(true);

//         try {
//             // 2. 서버 API 라우트로 POST 요청
//             const response = await fetch('/api/chat/counsel', {
//                 method: 'POST',
//                 headers: { 'Content-Type': 'application/json' },
//                 // 대화 기록 전체를 서버에 보내 컨텍스트를 유지
//                 body: JSON.stringify({ messages: newMessages }),
//             });

//             if (!response.ok || !response.body) {
//                 const errorData = await response.json();
//                 throw new Error(errorData.error || "서버 응답 오류");
//             }

//             // 3. 응답 스트림 수동 처리 (실시간 타이핑 효과)
//             const reader = response.body.getReader();
//             const decoder = new TextDecoder();
//             let fullResponse = '';
//             const assistantMessageId = Date.now().toString() + '-ai';

//             // AI 메시지 객체를 배열에 미리 추가하여 UI에 빈 상태로 띄웁니다.
//             setMessages(currentMsgs => [
//                 ...currentMsgs, 
//                 { id: assistantMessageId, role: 'assistant', content: '' }
//             ]);

//             // 스트림을 읽으며 UI 실시간 업데이트
//             while (true) {
//                 const { done, value } = await reader.read();
//                 if (done) break;

//                 const chunk = decoder.decode(value, { stream: true });
//                 fullResponse += chunk;
                
//                 // 4. 메시지 내용을 실시간으로 업데이트
//                 setMessages(currentMsgs => {
//                     // ID를 기준으로 방금 추가한 AI 메시지를 찾아 내용을 갱신합니다.
//                     const existingIndex = currentMsgs.findIndex(m => m.id === assistantMessageId);
//                     if (existingIndex > -1) {
//                         const updatedMsgs = [...currentMsgs];
//                         updatedMsgs[existingIndex] = { ...updatedMsgs[existingIndex], content: fullResponse };
//                         return updatedMsgs;
//                     }
//                     return currentMsgs;
//                 });
//             }

//         } catch (error) {
//             console.error('Chat API Error:', error);
//             alert(`챗봇 통신 중 오류 발생: ${error instanceof Error ? error.message : '알 수 없는 오류'}`);
//         } finally {
//             setIsLoading(false);
//         }
//     };

//     return (
//         <div className="flex flex-col h-[70vh] bg-white border border-gray-200 rounded-xl shadow-lg">
//             {/* 챗 메시지 영역 */}
//             <div className="flex-1 p-6 overflow-y-auto space-y-4">
//                 {messages.map((m) => (
//                     // role이 'system'인 메시지는 표시하지 않습니다.
//                     m.role !== 'system' && (
//                         <div
//                             key={m.id}
//                             className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
//                         >
//                             <div
//                                 className={`max-w-xs md:max-w-md lg:max-w-lg p-3 rounded-lg shadow-md ${
//                                     m.role === 'user'
//                                         ? 'bg-blue-500 text-white'
//                                         : 'bg-gray-100 text-gray-800'
//                                 }`}
//                             >
//                                 <div className="font-semibold mb-1 text-xs">
//                                     {m.role === 'user' ? '나' : 'TheraMusic AI'}
//                                 </div>
//                                 {/* 줄바꿈이 적용되도록 pre-wrap 스타일 적용 */}
//                                 <div style={{ whiteSpace: 'pre-wrap' }}>
//                                     {m.content}
//                                 </div>
//                             </div>
//                         </div>
//                     )
//                 ))}
//                 <div ref={messagesEndRef} />
//             </div>

//             {/* 입력 폼 영역 */}
//             <form onSubmit={handleSubmit} className="p-4 border-t border-gray-200 bg-gray-50">
//                 <div className="flex gap-3">
//                     <input
//                         className="flex-1 p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
//                         value={input}
//                         placeholder={isLoading ? 'AI가 답변을 생성 중입니다...' : '메시지를 입력하세요...'}
//                         onChange={(e) => setInput(e.target.value)}
//                         disabled={isLoading}
//                         required
//                     />
//                     <button
//                         type="submit"
//                         className={`px-6 py-3 rounded-lg font-semibold transition ${
//                             isLoading 
//                                 ? 'bg-gray-400 text-white cursor-not-allowed' 
//                                 : 'bg-blue-600 text-white hover:bg-blue-700'
//                         }`}
//                         disabled={isLoading}
//                     >
//                         {isLoading ? '전송 중' : '전송'}
//                     </button>
//                 </div>
//             </form>
//         </div>
//     );
// }