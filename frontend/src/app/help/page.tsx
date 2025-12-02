'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  BookOpen,
  User,
  MessageSquare,
  Music,
  Settings,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  ArrowLeft,
  ShieldCheck
} from 'lucide-react';

const faqs = [
  {
    question: "비밀번호를 잊어버렸어요.",
    answer:
      "'내 정보' 하단의 '비밀번호 변경' 에서 비밀번호 인증 후 변경할 수 있습니다."
  },
  {
    question: "환자와 상담사는 어떻게 연결되나요?",
    answer:
      "마이페이지의 '연결 관리'에서 이메일 또는 고유 ID로 요청할 수 있으며, 상대가 수락하면 자동으로 연결됩니다."
  },
  {
    question: "생성된 음악은 어디서 확인할 수 있나요?",
    answer:
      "환자는 '내 음악'에서, 상담사는 '환자 관리 > 음악 치료 기록'에서 확인할 수 있습니다."
  }
];

export default function HelpPage() {
  const router = useRouter();
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(null);
  const [query, setQuery] = useState('');

  const filteredFaqs = faqs.filter(f =>
    (f.question + f.answer).toLowerCase().includes(query.toLowerCase())
  );

  const toggleFaq = (index: number) => {
    setOpenFaqIndex(openFaqIndex === index ? null : index);
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-4xl mx-auto bg-white rounded-2xl shadow-lg overflow-hidden">
        
        {/* Header */}
        <header className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-indigo-50 to-white">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.back()}
              className="flex items-center gap-2 text-slate-600 hover:text-indigo-600 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
              <span className="text-sm">뒤로가기</span>
            </button>

            <h1 className="flex items-center gap-3 text-2xl font-bold text-slate-900">
              <BookOpen className="w-8 h-8 text-indigo-600 p-1 bg-indigo-50 rounded-md" />
              병원 프로그램 사용 설명서
            </h1>
          </div>
        </header>

        {/* Body */}
        <div className="p-6 space-y-12">
          
          {/* 공통 가이드 */}
          <section>
            <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-3">
              <span className="bg-indigo-100 p-2 rounded-md">
                <User className="w-5 h-5 text-indigo-600" />
              </span>
              시작하기 — 환자/상담사 공통 안내
            </h2>

            <div className="grid sm:grid-cols-2 gap-4">
              <article className="p-6 bg-white border rounded-2xl shadow-sm">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center font-semibold">
                    1
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900">회원가입 및 역할 선택</h3>
                    <p className="text-sm text-slate-600 mt-1">
                      가입 후 환자 또는 상담사 역할을 선택하면 화면 구성이 자동으로 달라집니다.
                    </p>
                  </div>
                </div>
              </article>

              <article className="p-6 bg-white border rounded-2xl shadow-sm">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-full bg-sky-50 text-sky-600 flex items-center justify-center font-semibold">
                    2
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900">프로필 & 개인정보</h3>
                    <p className="text-sm text-slate-600 mt-1">
                      기본 정보는 서비스 추천 및 기록 관리에 사용됩니다.
                    </p>
                  </div>
                </div>
              </article>
            </div>
          </section>

          {/* 환자 가이드 */}
          <section>
            <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-3">
              <span className="bg-green-100 p-2 rounded-md">
                <User className="w-5 h-5 text-green-600" />
              </span>
              환자용 가이드
            </h2>

            <div className="grid md:grid-cols-3 gap-4">
              <div className="p-5 bg-white border rounded-xl shadow-sm">
                <h4 className="font-semibold text-slate-900 flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-green-600" /> AI 심리 상담
                </h4>
                <p className="text-sm text-slate-600 mt-2">
                  현재 감정 상태 기반 대화형 상담을 제공합니다.
                </p>
              </div>

              <div className="p-5 bg-white border rounded-xl shadow-sm">
                <h4 className="font-semibold text-slate-900 flex items-center gap-2">
                  <Music className="w-4 h-4 text-green-600" /> 작곡 체험
                </h4>
                <p className="text-sm text-slate-600 mt-2">
                  감정 기반 음악을 생성하고 저장할 수 있습니다.
                </p>
              </div>

              <div className="p-5 bg-white border rounded-xl shadow-sm">
                <h4 className="font-semibold text-slate-900 flex items-center gap-2">
                  <Settings className="w-4 h-4 text-green-600" /> 마이페이지
                </h4>
                <p className="text-sm text-slate-600 mt-2">
                  연결 관리, 개인 정보 확인 등을 할 수 있습니다.
                </p>
              </div>
            </div>
          </section>

          {/* 상담사 가이드 */}
          <section>
            <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-3">
              <span className="bg-blue-100 p-2 rounded-md">
                <ShieldCheck className="w-5 h-5 text-blue-600" />
              </span>
              상담사용 가이드
            </h2>

            <div className="p-6 bg-white border rounded-2xl shadow-sm space-y-4">
              <div className="flex items-start gap-4">
                <div className="w-9 h-9 rounded-full bg-blue-50 text-blue-700 flex items-center justify-center font-semibold">1</div>
                <div>
                  <h3 className="font-semibold text-slate-900">환자 관리</h3>
                  <p className="text-sm text-slate-600 mt-1">
                    환자의 상담 이력과 음악 처방 기록을 확인할 수 있습니다.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="w-9 h-9 rounded-full bg-blue-50 text-blue-700 flex items-center justify-center font-semibold">2</div>
                <div>
                  <h3 className="font-semibold text-slate-900">음악 처방</h3>
                  <p className="text-sm text-slate-600 mt-1">
                    BPM, 악기 등을 조절하여 치료 목적 음악을 생성합니다.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="w-9 h-9 rounded-full bg-blue-50 text-blue-700 flex items-center justify-center font-semibold">3</div>
                <div>
                  <h3 className="font-semibold text-slate-900">상담 메모</h3>
                  <p className="text-sm text-slate-600 mt-1">
                    환자 메모를 기록하고 환자 관리에 활용할 수 있습니다.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* FAQ */}
          <section>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-3">
                <HelpCircle className="w-6 h-6 text-orange-500 bg-orange-50 p-1 rounded-sm" />
                자주 묻는 질문
              </h2>

              <input
                type="text"
                placeholder="FAQ 검색"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="px-3 py-2 border rounded-md text-sm focus:ring-1 focus:ring-indigo-200"
              />
            </div>

            <div className="space-y-3">
              {filteredFaqs.map((faq, index) => (
                <article key={index} className="bg-white border rounded-xl overflow-hidden">
                  <button
                    onClick={() => toggleFaq(index)}
                    className="w-full flex items-center justify-between p-4 text-left hover:bg-slate-50"
                  >
                    <h3 className="font-semibold text-slate-800">{faq.question}</h3>
                    {openFaqIndex === index ? (
                      <ChevronUp className="w-5 h-5 text-slate-400" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-slate-400" />
                    )}
                  </button>

                  {openFaqIndex === index && (
                    <div className="px-4 pb-4 text-sm text-slate-700 bg-slate-50">
                      {faq.answer}
                    </div>
                  )}
                </article>
              ))}
            </div>
          </section>
        </div>

      </div>
    </div>
  );
}
