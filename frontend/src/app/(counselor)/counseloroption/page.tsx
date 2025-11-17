'use client';

import React, { useState, FormEvent, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Settings, UserPlus, Loader2, User, XCircle, AlertTriangle, CheckCircle, Info, Search, Link2, Trash2, Edit, Check } from 'lucide-react';

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

// API 통신을 위한 기본 URL
const API_BASE_URL = getApiUrl();

// 탭 상태를 위한 타입
type Tab = 'general' | 'my_profile' | 'deactivate';

interface ValidationErrorDetail {
    loc: (string | number)[];
    msg: string;
    type: string;
}
interface ApiErrorResponse {
    detail: string | ValidationErrorDetail[];
}
interface FoundPatient {
    id: number;
    name: string;
    email: string | null;
    connection_status: 'available' | 'pending' | 'connected_to_self' | 'connected_to_other';
}
interface UserProfile {
    id: number;
    name: string | null;
    age: number | null; 
    email: string | null;
    role: string;
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
        let errorData: ApiErrorResponse | null = null;
        try {
            errorData = await response.json();
        } catch (e) {
            // JSON 파싱 실패 시
        }
        
        let errorMessage = `[${response.status}] ${response.statusText || '서버 통신 오류'}`;
        
        if (errorData && errorData.detail) {
            if (typeof errorData.detail === 'string') {
                errorMessage = errorData.detail;
            } else if (Array.isArray(errorData.detail)) {
                errorMessage = errorData.detail.map(d => `(${d.loc.join(' > ')}) ${d.msg}`).join('\n');
            }
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

    const [showDeactivateModal, setShowDeactivateModal] = useState(false);
    const [isDeactivating, setIsDeactivating] = useState(false);
    const router = useRouter(); 

    // 프로필 수정용 상태
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [isLoadingProfile, setIsLoadingProfile] = useState(true);
    const [isEditing, setIsEditing] = useState(false);
    const [editAge, setEditAge] = useState(''); 
    const [isUpdating, setIsUpdating] = useState(false);

    // 공통 알림 메시지
    const showMessage = (type: 'success' | 'error', message: string) => {
        // ... (기존 showMessage 로직) ...
    };
    
    // 프로필 로딩 로직
    const fetchUserProfile = useCallback(async () => {
        setIsLoadingProfile(true);
        try {
            const data: UserProfile = await apiCall('/auth/me'); 
            setProfile(data);
            setEditAge(data.age ? String(data.age) : '');
        } catch (err: unknown) {
            if (err instanceof Error) {
                // 💡 [수정] showMessage 대신 setError (프로필 탭 내부 알림)
                setError(`프로필 로딩 오류: ${err.message}`);
            }
        } finally {
            setIsLoadingProfile(false);
        }
    }, []); // 👈 의존성 배열 비우기 (set... 함수는 안정적임)

    useEffect(() => {
        if (activeTab === 'my_profile') {
            fetchUserProfile();
        }
    }, [activeTab, fetchUserProfile]);
    
    // 프로필 업데이트 핸들러
    const handleProfileUpdate = async () => {
        const ageValue = editAge.trim() ? parseInt(editAge.trim(), 10) : null;
        if (ageValue !== null && (isNaN(ageValue) || ageValue <= 0 || ageValue > 150)) {
            setError('유효하지 않은 나이입니다.');
            return;
        }
        setIsUpdating(true);
        setError(null);
        try {
            const updatePayload = { age: ageValue }; 
            const updatedProfile: UserProfile = await apiCall('/auth/me', 'PUT', updatePayload);
            setProfile(updatedProfile);
            setEditAge(updatedProfile.age ? String(updatedProfile.age) : '');
            setIsEditing(false);
            // 💡 [수정] showMessage 대신 setSuccess (프로필 탭 내부 알림)
            setSuccess('프로필이 성공적으로 업데이트되었습니다.'); 
        } catch (err: unknown) {
            if (err instanceof Error) {
                setError(`프로필 업데이트 오류: ${err.message}`);
            }
        } finally {
            setIsUpdating(false);
        }
    };

    // 💡 [핵심 수정] 계정 탈퇴 핸들러 (API 경로 수정)
    const handleDeactivate = async () => {
        setIsDeactivating(true);
        setError(null);
        setSuccess(null); 
        
        try {
            // 💡 [수정] /user/deactivate -> /auth/me
            await apiCall('/auth/me', 'DELETE'); 
            
            localStorage.removeItem('accessToken');
            alert('계정 탈퇴가 완료되었습니다. 이용해 주셔서 감사합니다.');
            router.push('/login'); 
        } catch (err: unknown) {
            if (err instanceof Error) {
                // 💡 [수정] showMessage 대신 setError (계정 탈퇴 탭 내부 알림)
                setError(`계정 탈퇴 오류: ${err.message}. 다시 시도해주세요.`);
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
        <div className="space-y-6 max-w-lg mx-auto p-8 bg-white border border-gray-200 rounded-xl shadow-lg">
             <h3 className="text-xl font-semibold border-b pb-2 text-gray-700">상담사 프로필</h3>
             {/* 💡 [추가] 프로필 탭 전용 알림 메시지 */}
             {error && !isUpdating && <Alert type="error" message={error} onClose={() => setError(null)} />}
             {success && <Alert type="success" message={success} onClose={() => setSuccess(null)} />}
             
             {isLoadingProfile ? (
                 <div className="flex justify-center items-center h-40">
                     <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
                 </div>
             ) : profile ? (
                <>
                    <div className="p-4 bg-indigo-50 border border-indigo-200 rounded-xl shadow-inner">
                        <div className="space-y-3">
                            <ProfileField label="이메일 (ID)" value={profile.email || 'N/A'} isEditable={false} />
                            <ProfileField 
                                label="이름" 
                                value={isEditing ? 
                                    <input 
                                        type="text" 
                                        value={profile.name || ''} 
                                        readOnly
                                        disabled
                                        className="border rounded-md px-2 py-1 w-full max-w-xs bg-gray-100 cursor-not-allowed"
                                    /> : 
                                    profile.name || 'N/A'}
                                isEditable={isEditing}
                            />
                            <ProfileField 
                                label="나이" 
                                value={isEditing ? 
                                    <input 
                                        type="number" 
                                        value={editAge} 
                                        onChange={(e) => setEditAge(e.target.value)}
                                        min="1" max="150"
                                        className="border rounded-md px-2 py-1 w-24 focus:ring-indigo-500 focus:border-indigo-500"
                                    /> : 
                                    profile.age ? String(profile.age) : 'N/A'}
                                isEditable={isEditing}
                            />
                            <ProfileField label="역할" value={profile.role === 'therapist' ? '상담사' : '기타'} isEditable={false} />
                            <ProfileField label="고유 ID" value={String(profile.id)} isEditable={false} />
                        </div>
                    </div>

                    <div className="flex justify-end">
                        {isEditing ? (
                            <div className="flex space-x-2">
                                <button
                                    onClick={handleProfileUpdate}
                                    disabled={isUpdating}
                                    className="flex items-center px-4 py-2 bg-green-500 text-white rounded-lg shadow-md hover:bg-green-600 transition disabled:bg-gray-400"
                                >
                                    {isUpdating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-1" />}
                                    저장
                                </button>
                                <button
                                    onClick={() => {
                                        setIsEditing(false);
                                        setEditAge(profile.age ? String(profile.age) : '');
                                        setError(null);
                                        setSuccess(null); // 👈 [추가] 성공 메시지도 닫기
                                    }}
                                    className="px-4 py-2 bg-gray-300 text-gray-800 rounded-lg shadow-md hover:bg-gray-400 transition"
                                >
                                    취소
                                </button>
                            </div>
                        ) : (
                            <button
                                onClick={() => setIsEditing(true)}
                                className="flex items-center px-4 py-2 bg-indigo-500 text-white rounded-lg shadow-md hover:bg-indigo-600 transition"
                            >
                                <Edit className="w-4 h-4 mr-1" />
                                프로필 수정
                            </button>
                        )}
                    </div>
                </>
             ) : (
                 // 💡 [수정] 로딩 실패 시 탭 내부에 에러 표시
                 <Alert type="error" message={error || '프로필을 불러오지 못했습니다.'} />
             )}
        </div>
    );
    
    const renderDeactivateTab = () => (
        <div className="space-y-6 max-w-lg mx-auto p-8 bg-white border border-gray-200 rounded-xl shadow-lg">
             <h3 className="text-xl font-semibold border-b pb-2 text-red-600">계정 탈퇴</h3>
             {/* 💡 [추가] 계정 탈퇴 탭 전용 알림 메시지 */}
             {error && <Alert type="error" message={error} onClose={() => setError(null)} />}

             <div className="p-6 bg-red-50 border border-red-200 rounded-xl shadow-inner space-y-4">
                 <div className="flex items-start">
                     <AlertTriangle className="w-6 h-6 text-red-500 mr-3 mt-1 flex-shrink-0" />
                     <p className="text-red-700 font-medium">
                         계정을 탈퇴하면 모든 사용자 데이터가 영구적으로 삭제됩니다. 
                         탈퇴 후에는 데이터를 복구할 수 없습니다.
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
                        icon={User} 
                        label="내 프로필" 
                        tab="my_profile" 
                        activeTab={activeTab} 
                        onClick={setActiveTab}
                    />
                    <TabButton 
                        icon={Link2} 
                        label="환자 연결 관리" 
                        tab="general" 
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

                {/* 💡 [수정] 글로벌 알림 -> 탭 내부 알림으로 이동
                 {error && <Alert type="error" message={error} onClose={() => setError(null)} />}
                 {success && <Alert type="success" message={success} onClose={() => setSuccess(null)} />}
                */}

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

// === 환자 연결 관리 컴포넌트 ===
interface PatientConnectionManagerProps {
    showGlobalMessage: (type: 'success' | 'error', message: string) => void;
}

const PatientConnectionManager: React.FC<PatientConnectionManagerProps> = ({ showGlobalMessage }) => {
    // 💡 [수정] email -> searchQuery로 이름 변경 (백엔드와 일치)
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
            // 💡 [수정] payload의 key를 'email' -> 'query'로 변경
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

    // 연결 요청 핸들러
    const handleRequestConnection = async () => {
        if (!foundPatient) return;
        setIsLoading(true);
        resetSearchState();

        try {
            const payload = { patient_id: foundPatient.id };
            const result = await apiCall<{ detail: string }>('/therapist/request-connection', 'POST', payload);
            
            showGlobalMessage('success', `환자 '${foundPatient.name}' 님에게 연결 요청을 성공적으로 보냈습니다.`);
            setSearchQuery(''); // 💡 [수정] email -> searchQuery
            
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
                {/* 💡 [수정] 안내 문구 변경 */}
                환자가 가입 시 사용한 **이메일** 또는 환자의 **고유 ID**로 계정을 검색한 후, 연결 요청을 보내주세요.
            </p>

            {/* 1. 환자 검색 폼 */}
            <form onSubmit={handleSearch} className="flex items-end gap-3">
                <div className="flex-grow">
                    {/* 💡 [수정] 라벨, id, value, onChange 모두 searchQuery로 변경 */}
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

            {/* 2. 검색 결과 및 연결 요청 버튼 */}
            {isLoading && !foundPatient && (
                <div className="text-center p-4 text-gray-500">
                    <Loader2 className="w-5 h-5 animate-spin inline-block" />
                </div>
            )}
            {searchSuccess && (
                <Alert type="success" message={searchSuccess} onClose={() => setSearchSuccess(null)} />
            )}
            {searchError && (
                <Alert type="error" message={searchError} onClose={() => setSearchError(null)} />
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
// 보조 컴포넌트
// =================================

// 탭 버튼 컴포넌트
interface TabButtonProps {
    icon: React.ElementType;
    label: string;
    tab: Tab;
    activeTab: Tab;
    onClick: (tab: Tab) => void;
    className?: string;
    badgeCount?: number; 
}

const TabButton: React.FC<TabButtonProps> = ({ icon: Icon, label, tab, activeTab, onClick, className = '', badgeCount = 0 }) => {
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
            {badgeCount > 0 && (
                <span className="ml-2 inline-flex items-center justify-center px-2 py-0.5 text-xs font-bold leading-none text-white bg-red-500 rounded-full">
                    {badgeCount}
                </span>
            )}
        </button>
    );
};

// 프로필 필드 컴포넌트
interface ProfileFieldProps {
    label: string;
    value: React.ReactNode;
    isEditable?: boolean;
}

const ProfileField: React.FC<ProfileFieldProps> = ({ label, value, isEditable = false }) => (
    <div className={`flex flex-col sm:flex-row sm:items-center py-2 border-b last:border-b-0 ${isEditable ? 'bg-white p-2 rounded-lg' : ''}`}>
        <span className="w-32 font-medium text-gray-600 flex-shrink-0">{label}</span>
        <span className="flex-grow text-gray-800 mt-1 sm:mt-0">
            {value}
        </span>
    </div>
);


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