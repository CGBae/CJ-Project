'use client';

import React, { useState, FormEvent, useCallback, useEffect } from 'react';
// 💡 [수정] 사용하지 않는 아이콘(UserPlus, Trash2) 제거, 필요한 아이콘(Link2, Search) 확인
import { Settings, Loader2, User, XCircle, AlertTriangle, CheckCircle, Info, Search, Link2 } from 'lucide-react';

// API 통신을 위한 기본 URL (사용자 확인: prefix 없음)
const API_BASE_URL = 'http://localhost:8000';

// 탭 상태를 위한 타입
type Tab = 'general' | 'my_profile' | 'deactivate';

interface ValidationErrorDetail {
    loc: (string | number)[];
    msg: string;
    type: string;
}

// API 에러 응답 구조
interface ApiErrorResponse {
    detail: string | ValidationErrorDetail[];
}

// 환자 검색 결과 타입
interface FoundPatient {
    id: number;
    name: string;
    email: string | null; // 💡 이메일이 null일 수 있음 (카카오)
    connection_status: 'available' | 'pending' | 'connected_to_self' | 'connected_to_other';
}

/**
 * API 요청을 수행하는 범용 헬퍼 함수
 */
const apiCall = async <T = unknown>(endpoint: string, method: string = 'GET', body?: unknown): Promise<T> => {
    const accessToken = localStorage.getItem('accessToken');
    if (!accessToken) {
        throw new Error('인증 토큰이 없습니다. 다시 로그인해 주세요.');
    }

    const headers: HeadersInit = {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
    };

    const config: RequestInit = {
        method,
        headers,
    };

    if (body) {
        config.body = JSON.stringify(body);
    }

    const response = await fetch(`${API_BASE_URL}${endpoint}`, config);

    if (!response.ok) {
        let errorData: ApiErrorResponse;
        try {
            errorData = await response.json();
        } catch (e) {
            throw new Error(`[${response.status}] 서버 통신 중 오류가 발생했습니다: ${response.statusText}`);
        }
        
        let errorMessage = `[${response.status}] 오류`;
        if (typeof errorData.detail === 'string') {
            errorMessage = errorData.detail;
        } else if (Array.isArray(errorData.detail)) {
            errorMessage = errorData.detail.map(d => `(${d.loc.join(' > ')}) ${d.msg}`).join('\n');
        }
        throw new Error(errorMessage);
    }
    
    if (response.status === 204) {
        return null as T; 
    }

    return response.json() as Promise<T>;
};

// =================================
// 메인 컴포넌트
// =================================

export default function CounselorSettingsPage() {
    const [activeTab, setActiveTab] = useState<Tab>('general');
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    
    // 💡 [수정] 계정 탈퇴 관련 상태 (PatientOptionPage에서 복사)
    const [showDeactivateModal, setShowDeactivateModal] = useState(false);
    const [isDeactivating, setIsDeactivating] = useState(false);

    // 공통 알림 메시지
    const showMessage = (type: 'success' | 'error', message: string) => {
        if (type === 'success') {
            setSuccess(message);
            setError(null);
        } else {
            setError(message);
            setSuccess(null);
        }
        // 5초 후 메시지 자동 숨김 (선택 사항)
        /*
        setTimeout(() => {
            setSuccess(null);
            setError(null);
        }, 5000);
        */
    };
    
    // 💡 [추가] 계정 탈퇴 핸들러 (PatientOptionPage에서 복사)
    const handleDeactivate = async () => {
        setIsDeactivating(true);
        setError(null);
        setSuccess(null); 
        
        try {
            await apiCall('/auth/me', 'DELETE'); // 👈 /auth/me DELETE 호출 (예시)
            localStorage.removeItem('accessToken');
            alert('계정 탈퇴가 완료되었습니다. 이용해 주셔서 감사합니다.');
            window.location.href = '/login'; 
        } catch (err: unknown) {
            if (err instanceof Error) {
                showMessage('error', `계정 탈퇴 오류: ${err.message}. 다시 시도해주세요.`);
            }
        } finally {
            setIsDeactivating(false);
            setShowDeactivateModal(false);
        }
    };

    // --- 탭 콘텐츠 렌더링 함수 ---

    const renderGeneralSettingsTab = () => (
        <PatientConnectionManager showGlobalMessage={showMessage} />
    );

    const renderMyProfileTab = () => (
        // 💡 [수정] Alert 컴포넌트의 props 확인
        <Alert type="info" message="상담사 프로필 수정 기능은 현재 준비 중입니다." onClose={() => {}} />
    );
    
    // 💡 [수정] 계정 탈퇴 탭 렌더링 (PatientOptionPage에서 복사)
    const renderDeactivateTab = () => (
        <div className="space-y-6 max-w-lg mx-auto p-8 bg-white border border-gray-200 rounded-xl shadow-lg">
            <h3 className="text-xl font-semibold border-b pb-2 text-red-600">계정 탈퇴</h3>
            <div className="p-6 bg-red-50 border border-red-200 rounded-xl shadow-inner space-y-4">
                <div className="flex items-start">
                    <AlertTriangle className="w-6 h-6 text-red-500 mr-3 mt-1 flex-shrink-0" />
                    <p className="text-red-700 font-medium">
                        계정을 탈퇴하면 모든 사용자 데이터(프로필 정보, 환자 연결 기록 등)가 영구적으로 삭제됩니다. 
                        탈퇴 후에는 데이터를 복구할 수 없습니다. 신중하게 결정해 주세요.
                    </p>
                </div>
                <button
                    onClick={() => setShowDeactivateModal(true)}
                    className="w-full flex justify-center items-center px-4 py-3 text-sm font-medium rounded-lg shadow-md text-white bg-red-600 hover:bg-red-700 transition disabled:bg-gray-400"
                >
                    <XCircle className="w-5 h-5 mr-2" />
                    계정 영구 탈퇴하기
                </button>
            </div>

            {showDeactivateModal && (
                <ConfirmationModal
                    title="계정 탈퇴 확인"
                    message="정말로 계정을 영구적으로 탈퇴하시겠습니까? 이 작업은 되돌릴 수 없습니다."
                    onConfirm={handleDeactivate}
                    onCancel={() => setShowDeactivateModal(false)}
                    isProcessing={isDeactivating}
                />
            )}
        </div>
    );

    return (
        <div className="min-h-screen bg-gray-50 p-4 sm:p-8">
            <div className="max-w-4xl mx-auto bg-white rounded-2xl shadow-2xl p-6 sm:p-10">
                <h1 className="text-3xl font-extrabold text-gray-900 mb-8 border-b pb-3 flex items-center">
                    <Settings className="w-7 h-7 mr-3 text-blue-600" /> 상담사 설정
                </h1>

                {/* 탭 네비게이션 */}
                <div className="flex border-b border-gray-200 mb-8 overflow-x-auto whitespace-nowrap">
                    <TabButton 
                        icon={Settings}
                        label="환자 연결 관리" // 💡 라벨 변경
                        tab="general" 
                        activeTab={activeTab} 
                        onClick={setActiveTab}
                    />
                    <TabButton 
                        icon={User} 
                        label="내 프로필" 
                        tab="my_profile" 
                        activeTab={activeTab} 
                        onClick={setActiveTab}
                    />
                    <TabButton 
                        icon={XCircle} 
                        label="계정 탈퇴" 
                        tab="deactivate" 
                        activeTab={activeTab} 
                        onClick={setActiveTab}
                        className="text-red-600 hover:text-red-700"
                    />
                </div>

                {/* 글로벌 알림 메시지 */}
                {error && <Alert type="error" message={error} onClose={() => setError(null)} />}
                {success && <Alert type="success" message={success} onClose={() => setSuccess(null)} />}

                {/* 탭 콘텐츠 */}
                <div className="min-h-[400px] mt-6">
                    {activeTab === 'general' && renderGeneralSettingsTab()}
                    {activeTab === 'my_profile' && renderMyProfileTab()}
                    {activeTab === 'deactivate' && renderDeactivateTab()}
                </div>
            </div>
        </div>
    );
}

// --- 💡 [핵심 수정] 환자 연결 관리 컴포넌트 ---
interface PatientConnectionManagerProps {
    showGlobalMessage: (type: 'success' | 'error', message: string) => void;
}

const PatientConnectionManager: React.FC<PatientConnectionManagerProps> = ({ showGlobalMessage }) => {
    // 💡 1. 'email' -> 'searchQuery'로 state 이름 변경
    const [searchQuery, setSearchQuery] = useState(''); 
    const [foundPatient, setFoundPatient] = useState<FoundPatient | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [searchError, setSearchError] = useState<string | null>(null);
    const [searchSuccess, setSearchSuccess] = useState<string | null>(null);

    // 컴포넌트 내부 메시지 초기화
    const resetSearchState = () => {
        setFoundPatient(null);
        setSearchError(null);
        setSearchSuccess(null);
    };

    // 환자 검색 핸들러
    const handleSearch = async (e: FormEvent) => {
        e.preventDefault();
        resetSearchState();
        setIsLoading(true);

        try {
            // 💡 2. payload의 key를 'email' -> 'query'로 변경
            const payload = { query: searchQuery }; 
            const result = await apiCall<FoundPatient>('/therapist/find-patient', 'POST', payload);
            
            setFoundPatient(result);
            if(result.connection_status === 'available') {
                setSearchSuccess(`환자 '${result.name}' (${result.email || 'ID:'+result.id}) 님을 찾았습니다. 연결 요청을 보낼 수 있습니다.`);
            } else {
                let infoMessage = `환자 '${result.name}' (${result.email || 'ID:'+result.id}) 님을 찾았습니다. `;
                if (result.connection_status === 'pending') infoMessage += "이미 연결 요청이 전송되어 대기 중입니다.";
                if (result.connection_status === 'connected_to_self') infoMessage += "이미 담당 환자로 등록되어 있습니다.";
                if (result.connection_status === 'connected_to_other') infoMessage += "이미 다른 상담사와 연결되어 있습니다.";
                setSearchError(infoMessage);
            }

        } catch (err: unknown) { 
            if (err instanceof Error) {
                setSearchError(`검색 실패: ${err.message}`);
            } else {
                setSearchError('알 수 없는 오류가 발생했습니다.');
            }
        } finally {
            setIsLoading(false);
        }
    };

    // 연결 요청 핸들러 (변경 없음)
    const handleRequestConnection = async () => {
        if (!foundPatient) return;
        setIsLoading(true);
        resetSearchState();

        try {
            const payload = { patient_id: foundPatient.id };
            const result = await apiCall<{ detail: string }>('/therapist/request-connection', 'POST', payload);
            
            showGlobalMessage('success', `환자 '${foundPatient.name}' 님에게 연결 요청을 성공적으로 보냈습니다.`);
            setSearchQuery(''); // 💡 3. 'email' -> 'searchQuery'로 변경
            
        } catch (err: unknown) { 
             if (err instanceof Error) {
                showGlobalMessage('error', `연결 요청 실패: ${err.message}`);
            } else {
                showGlobalMessage('error', '알 수 없는 오류가 발생했습니다.');
            }
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="space-y-6 max-w-lg mx-auto p-8 bg-white border border-gray-200 rounded-xl shadow-lg">
            <h3 className="text-xl font-semibold border-b pb-2 text-gray-700">담당 환자 연결</h3>
            
            <p className="text-sm text-gray-500">
                {/* 💡 4. 안내 문구 수정 */}
                환자가 가입 시 사용한 **이메일** 또는 환자의 **고유 ID**로 계정을 검색한 후, 연결 요청을 보내주세요.
            </p>

            {/* 1. 환자 검색 폼 */}
            <form onSubmit={handleSearch} className="flex items-end gap-3">
                <div className="flex-grow">
                    {/* 💡 5. 라벨 및 ID 수정 */}
                    <label htmlFor="searchQuery" className="block text-sm font-medium text-gray-700 mb-1">환자 이메일 또는 고유 ID</label>
                    <input
                        type="text" // 👈 email -> text
                        id="searchQuery"
                        value={searchQuery}
                        onChange={(e) => {
                            setSearchQuery(e.target.value);
                            resetSearchState(); 
                        }}
                        required
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                    />
                </div>
                <button
                    type="submit"
                    disabled={isLoading || !searchQuery.trim()} // 👈 email.trim() -> searchQuery.trim()
                    className="px-4 py-2 h-10 flex justify-center items-center text-sm font-medium rounded-lg shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 transition-colors"
                >
                    {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5" />}
                </button>
            </form>

            {/* 2. 검색 결과 및 연결 요청 버튼 (변경 없음) */}
            {isLoading && !foundPatient && (
                <div className="text-center p-4 text-gray-500">
                    <Loader2 className="w-5 h-5 animate-spin inline-block" />
                </div>
            )}
            {searchSuccess && (
                <Alert type="success" message={searchSuccess} />
            )}
            {searchError && (
                <Alert type="error" message={searchError} />
            )}
            {foundPatient && foundPatient.connection_status === 'available' && (
                <button
                    type="button"
                    onClick={handleRequestConnection}
                    disabled={isLoading}
                    className="w-full flex justify-center items-center px-4 py-3 text-sm font-medium rounded-lg shadow-sm text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 transition-colors"
                >
                    {isLoading ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <Link2 className="w-5 h-5 mr-2" />}
                    {isLoading ? '요청 중...' : `'${foundPatient.name}' 님에게 연결 요청하기`}
                </button>
            )}
        </div>
    );
};


// =================================
// 보조 컴포넌트 (변경 없음)
// =================================

// 탭 버튼 컴포넌트
interface TabButtonProps {
    icon: React.ElementType;
    label: string;
    tab: Tab;
    activeTab: Tab;
    onClick: (tab: Tab) => void;
    className?: string;
}

const TabButton: React.FC<TabButtonProps> = ({ icon: Icon, label, tab, activeTab, onClick, className = '' }) => {
    const isActive = activeTab === tab;
    return (
        <button
            onClick={() => onClick(tab)}
            className={`flex items-center px-4 py-3 text-sm font-medium transition-colors border-b-2 
                ${isActive 
                    ? 'border-blue-600 text-blue-600' 
                    : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}
                ${className}`}
        >
            <Icon className="w-5 h-5 mr-2" />
            {label}
        </button>
    );
};

// 알림 컴포넌트
interface AlertProps {
    type: 'error' | 'info' | 'success';
    message: string | null;
    onClose?: () => void;
}

const Alert: React.FC<AlertProps> = ({ type, message, onClose }) => {
    if (!message) return null;

    let bgColor, Icon;
    switch (type) {
        case 'error':
            bgColor = 'bg-red-100 border-red-400 text-red-700';
            Icon = AlertTriangle;
            break;
        case 'success':
            bgColor = 'bg-green-100 border-green-400 text-green-700';
            Icon = CheckCircle;
            break;
        case 'info':
        default:
            bgColor = 'bg-blue-100 border-blue-400 text-blue-700';
            Icon = Info; 
            break;
    }

    return (
        <div className={`p-4 border rounded-xl flex items-start ${bgColor} relative mb-6`} role="alert">
            <Icon className="w-5 h-5 mr-3 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
                <p className="font-bold">{type === 'error' ? '오류' : type === 'success' ? '성공' : '정보'}</p>
                <p className="text-sm">{message}</p>
            </div>
            {onClose && (
                <button onClick={onClose} className="absolute top-2 right-2 p-1 rounded-full hover:bg-black hover:bg-opacity-10">
                    <XCircle className="w-4 h-4" />
                </button>
            )}
        </div>
    );
};

// 확인 모달 컴포넌트
interface ConfirmationModalProps {
    title: string;
    message: string;
    onConfirm: () => void;
    onCancel: () => void;
    isProcessing: boolean;
}

const ConfirmationModal: React.FC<ConfirmationModalProps> = ({ title, message, onConfirm, onCancel, isProcessing }) => (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex justify-center items-center z-50 p-4">
        <div className="bg-white rounded-xl shadow-2xl p-6 sm:p-8 max-w-md w-full animate-in zoom-in-90 duration-200">
            <div className="flex items-start">
                <div className="mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-red-100 sm:mx-0 sm:h-10 sm:w-10">
                    <AlertTriangle className="h-6 w-6 text-red-600" aria-hidden="true" />
                </div>
                <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left">
                    <h3 className="text-lg leading-6 font-bold text-gray-900" id="modal-title">
                        {title}
                    </h3>
                    <div className="mt-2">
                        <p className="text-sm text-gray-600">
                            {message}
                        </p>
                    </div>
                </div>
            </div>
            <div className="mt-6 flex flex-col sm:flex-row-reverse sm:gap-3 gap-2">
                <button
                    onClick={onConfirm}
                    disabled={isProcessing}
                    className="w-full sm:w-auto flex justify-center items-center px-4 py-2 text-sm font-medium rounded-lg text-white bg-red-600 hover:bg-red-700 transition disabled:bg-red-400"
                >
                    {isProcessing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                    {isProcessing ? '처리 중...' : '확인 및 탈퇴'}
                </button>
                <button
                    onClick={onCancel}
                    disabled={isProcessing}
                    className="w-full sm:w-auto px-4 py-2 text-sm font-medium rounded-lg text-gray-700 bg-gray-200 hover:bg-gray-300 transition disabled:opacity-50"
                >
                    취소
                </button>
            </div>
        </div>
    </div>
);