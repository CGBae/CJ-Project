'use client';

import React, { useState, useEffect, useCallback, FormEvent } from 'react';
import { Settings, User, Zap, MessageCircle, XCircle, Loader2, Edit, Check, AlertTriangle } from 'lucide-react';

// API 통신을 위한 기본 URL
const API_BASE_URL = 'http://localhost:8000'; // 👈 백엔드 라우터의 Prefix와 일치해야 합니다!

// 탭 상태를 위한 타입
type Tab = 'profile' | 'connection' | 'settings' | 'deactivate';

// 사용자 프로필 타입
interface UserProfile {
    id: number;
    name: string | null;
    age: number | null;
    email: string | null;
    role: string;
}

// 연결 요청 타입
interface ConnectionDetail {
    connection_id: number;
    therapist_id: number;
    therapist_name: string;
    status: 'PENDING' | 'ACCEPTED' | 'REJECTED';
}

/**
 * API 요청을 수행하는 범용 헬퍼 함수
 * 모든 API 호출은 이 함수를 통해 토큰을 자동으로 첨부하고 백엔드 라우터에 연결됩니다.
 */
const apiCall = async (endpoint: string, method: string = 'GET', body?: unknown) => {
    const accessToken = localStorage.getItem('accessToken');
    if (!accessToken) {
        // 토큰이 없으면 로그인 페이지로 이동 유도
        throw new Error('인증 토큰이 없습니다. 다시 로그인해 주세요.');
    }

    const headers: HeadersInit = {
        'Authorization': `Bearer ${accessToken}`, // 👈 JWT 토큰 첨부
        'Content-Type': 'application/json',
    };

    const config: RequestInit = {
        method,
        headers,
    };

    // body가 명시적으로 undefined가 아닐 때만 직렬화하여 전송
    if (body !== undefined) {
        config.body = JSON.stringify(body);
    }

    // Exponential Backoff을 포함한 fetch 로직
    const maxRetries = 3;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            const response = await fetch(`${API_BASE_URL}${endpoint}`, config); // 👈 라우터 엔드포인트에 요청
            
            if (response.status === 401) {
                // 토큰 만료 또는 인증 실패
                throw new Error('인증 실패. 세션이 만료되었습니다.');
            }
            if (response.status === 204) {
                return null; // No Content (탈퇴 성공 등)
            }
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || `API 오류: ${response.status}`);
            }

            // 200 OK (내용 있음)
            return response.json();

        } catch (error) {
            lastError = error as Error;
            if (attempt < maxRetries - 1) {
                // 1s, 2s 딜레이
                const delay = Math.pow(2, attempt) * 1000;
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }
    throw lastError; // 최대 재시도 후에도 실패하면 최종 에러 던지기
};


// =================================
// 메인 컴포넌트
// =================================

export default function PatientOptionPage() {
    const [activeTab, setActiveTab] = useState<Tab>('profile');
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [connections, setConnections] = useState<ConnectionDetail[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // 프로필 편집 상태
    const [isEditing, setIsEditing] = useState(false);
    const [editName, setEditName] = useState('');
    const [editAge, setEditAge] = useState('');
    const [isUpdating, setIsUpdating] = useState(false);

    // 계정 탈퇴 모달
    const [showDeactivateModal, setShowDeactivateModal] = useState(false);
    const [isDeactivating, setIsDeactivating] = useState(false);
    
    // --- 데이터 로딩 함수 ---

    const fetchUserProfile = useCallback(async () => {
        // 👈 프로필 조회 (GET /user/profile)
        try {
            const data: UserProfile = await apiCall('/user/profile'); 
            setProfile(data);
            setEditName(data.name || '');
            setEditAge(data.age ? String(data.age) : '');
        } catch (err: any) {
            setError(`프로필 로딩 오류: ${err.message}`);
        }
    }, []);

    const fetchPendingConnections = useCallback(async () => {
        // 👈 연결 요청 목록 조회 (GET /connection/my_requests)
        try {
            const data: ConnectionDetail[] = await apiCall('/connection/my_requests');
            // PENDING 상태인 요청만 필터링
            setConnections(data.filter(c => c.status === 'PENDING'));
        } catch (err: any) {
            setError(`연결 요청 로딩 오류: ${err.message}`);
        }
    }, []);

    // 초기 데이터 로딩
    useEffect(() => {
        const loadData = async () => {
            setIsLoading(true);
            setError(null);
            await Promise.all([fetchUserProfile(), fetchPendingConnections()]);
            setIsLoading(false);
        };
        loadData();
    }, [fetchUserProfile, fetchPendingConnections]);

    // --- 이벤트 핸들러 ---

    // [1] 프로필 업데이트 처리
    const handleProfileUpdate = async () => {
        if (!editName.trim()) {
            setError('이름은 필수 입력 항목입니다.');
            return;
        }

        const ageValue = editAge.trim() ? parseInt(editAge.trim(), 10) : null;
        if (ageValue !== null && (isNaN(ageValue) || ageValue <= 0 || ageValue > 150)) {
            setError('유효하지 않은 나이입니다.');
            return;
        }

        setIsUpdating(true);
        setError(null);

        try {
            const updatePayload = {
                name: editName.trim(),
                age: ageValue,
            };
            
            // 👈 프로필 업데이트 (PUT /user/profile)
            const updatedProfile: UserProfile = await apiCall('/user/profile', 'PUT', updatePayload);
            setProfile(updatedProfile); // 서버로부터 받은 최신 정보로 상태 업데이트
            setEditName(updatedProfile.name || '');
            setEditAge(updatedProfile.age ? String(updatedProfile.age) : '');
            setIsEditing(false); // 성공 시 편집 모드 종료
        } catch (err: any) {
            setError(`프로필 업데이트 오류: ${err.message}`);
        } finally {
            setIsUpdating(false);
        }
    };

    // [2] 연결 요청 응답 처리
    const handleConnectionRespond = async (connectionId: number, responseType: 'accept' | 'reject') => {
        const responseValue = responseType === 'accept' ? 'ACCEPTED' : 'REJECTED';
        
        // UI에서 즉시 해당 요청 제거 (UX 향상)
        setConnections(prev => prev.filter(c => c.connection_id !== connectionId));
        
        try {
            // 👈 연결 응답 (POST /connection/respond)
            await apiCall('/connection/respond', 'POST', {
                connection_id: connectionId,
                response: responseValue,
            });

            // 성공하면 목록을 다시 로드하여 상태 확인
            await fetchPendingConnections();

        } catch (err: any) {
            // 실패 시 사용자에게 알림
            setError(`연결 응답 처리 오류: ${err.message}`);
            // (선택적) 목록을 다시 로드하여 롤백
            await fetchPendingConnections();
        }
    };

    // [3] 계정 탈퇴 처리
    const handleDeactivate = async () => {
        setIsDeactivating(true);
        setError(null);
        try {
            // 👈 계정 탈퇴 (DELETE /user/deactivate)
            // 204 No Content를 반환할 것으로 예상
            await apiCall('/user/deactivate', 'DELETE');

            // 성공 시 처리: 로컬 스토리지 정리 및 로그인 페이지로 리다이렉트
            localStorage.removeItem('accessToken');
            localStorage.removeItem('role'); 
            alert('계정 탈퇴가 완료되었습니다. 이용해 주셔서 감사합니다.');
            window.location.href = '/login'; 

        } catch (err: any) {
            setError(`계정 탈퇴 오류: ${err.message}. 다시 시도해주세요.`);
        } finally {
            setIsDeactivating(false);
            setShowDeactivateModal(false);
        }
    };


    // --- 탭 콘텐츠 렌더링 함수 ---

    const renderProfileTab = () => (
        <div className="space-y-6">
            <h3 className="text-xl font-semibold border-b pb-2 text-gray-700">개인 프로필 정보</h3>
            <div className="p-4 bg-indigo-50 border border-indigo-200 rounded-xl shadow-inner">
                <div className="space-y-3">
                    <ProfileField label="이메일 (ID)" value={profile?.email || 'N/A'} isEditable={false} />
                    <ProfileField 
                        label="이름" 
                        value={isEditing ? 
                            <input 
                                type="text" 
                                value={editName} 
                                onChange={(e) => setEditName(e.target.value)}
                                className="border rounded-md px-2 py-1 w-full max-w-xs focus:ring-indigo-500 focus:border-indigo-500"
                            /> : 
                            profile?.name || 'N/A'}
                        isEditable={isEditing}
                    />
                    <ProfileField 
                        label="나이" 
                        value={isEditing ? 
                            <input 
                                type="number" 
                                value={editAge} 
                                onChange={(e) => setEditAge(e.target.value)}
                                min="1"
                                max="150"
                                className="border rounded-md px-2 py-1 w-24 focus:ring-indigo-500 focus:border-indigo-500"
                            /> : 
                            profile && profile.age !== null ? String(profile.age) : 'N/A'}
                        isEditable={isEditing}
                    />
                    <ProfileField label="역할" value={profile?.role === 'patient' ? '환자' : '상담사'} isEditable={false} />
                    {profile && profile.id && (
                         <ProfileField 
                            label="고유 ID" 
                            value={String(profile.id)}
                            isEditable={false} 
                        />
                    )}
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
                                setEditName(profile?.name || '');
                                setEditAge(profile?.age !== null ? String(profile.age) : '');
                                setError(null);
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
            {error && !isUpdating && <Alert type="error" message={error} />}
        </div>
    );

    const renderConnectionTab = () => (
        <div className="space-y-6">
            <h3 className="text-xl font-semibold border-b pb-2 text-gray-700">상담 연결 요청 ({connections.length}건)</h3>
            
            {connections.length === 0 ? (
                <div className="p-6 text-center bg-white rounded-xl shadow-lg border-2 border-dashed border-gray-300">
                    <MessageCircle className="w-8 h-8 mx-auto text-gray-400 mb-2" />
                    <p className="text-gray-600">현재 대기 중인 상담 연결 요청이 없습니다.</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {connections.map((conn) => (
                        <ConnectionRequestCard 
                            key={conn.connection_id}
                            connection={conn}
                            onRespond={handleConnectionRespond}
                        />
                    ))}
                </div>
            )}
            {error && <Alert type="error" message={error} />}
        </div>
    );

    const renderDeactivateTab = () => (
        <div className="space-y-6">
            <h3 className="text-xl font-semibold border-b pb-2 text-red-600">계정 탈퇴</h3>
            <div className="p-6 bg-red-50 border border-red-200 rounded-xl shadow-inner space-y-4">
                <div className="flex items-start">
                    <AlertTriangle className="w-6 h-6 text-red-500 mr-3 mt-1 flex-shrink-0" />
                    <p className="text-red-700 font-medium">
                        계정을 탈퇴하면 모든 사용자 데이터(상담 기록, 프로필 정보, 생성된 음악 등)가 영구적으로 삭제됩니다. 
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
            {error && <Alert type="error" message={error} />}
        </div>
    );

    // --- 로딩/에러 상태 처리 ---

    if (isLoading) {
        return (
            <div className="flex justify-center items-center min-h-screen bg-gray-50">
                <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
                <p className="ml-3 text-lg text-indigo-600">데이터를 불러오는 중...</p>
            </div>
        );
    }

    if (error && !isLoading && !profile) {
        // 전역 로딩 오류 발생 시 (프로필 로드 실패 등)
        return (
            <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-red-50">
                <AlertTriangle className="w-12 h-12 text-red-600 mb-4" />
                <h2 className="text-2xl font-bold text-red-800 mb-2">데이터 로딩 오류</h2>
                <p className="text-red-700 text-center">{error}</p>
                <button 
                    onClick={() => {
                        localStorage.removeItem('accessToken');
                        window.location.href = '/login';
                    }}
                    className="mt-6 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition"
                >
                    로그인 페이지로 이동
                </button>
            </div>
        );
    }
    
    // --- 최종 렌더링 ---

    return (
        <div className="min-h-screen bg-gray-50 p-4 sm:p-8">
            <div className="max-w-4xl mx-auto bg-white rounded-2xl shadow-2xl p-6 sm:p-10">
                <h1 className="text-3xl font-extrabold text-gray-900 mb-8 border-b pb-3 flex items-center">
                    <Settings className="w-7 h-7 mr-3 text-indigo-600" /> 설정 및 옵션
                </h1>

                {/* 탭 네비게이션 */}
                <div className="flex border-b border-gray-200 mb-8 overflow-x-auto whitespace-nowrap">
                    <TabButton 
                        icon={User} 
                        label="프로필 수정" 
                        tab="profile" 
                        activeTab={activeTab} 
                        onClick={setActiveTab}
                    />
                    <TabButton 
                        icon={Zap} 
                        label="연결 요청" 
                        tab="connection" 
                        activeTab={activeTab} 
                        onClick={setActiveTab}
                        badgeCount={connections.length} // PENDING 상태인 요청만 카운트
                    />
                    <TabButton 
                        icon={Settings} 
                        label="일반 설정" 
                        tab="settings" 
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

                {/* 탭 콘텐츠 */}
                <div className="min-h-[400px]">
                    {activeTab === 'profile' && renderProfileTab()}
                    {activeTab === 'connection' && renderConnectionTab()}
                    {activeTab === 'settings' && <Alert type="info" message="일반 설정 기능은 현재 준비 중입니다." />}
                    {activeTab === 'deactivate' && renderDeactivateTab()}
                </div>
            </div>
        </div>
    );
}

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
    badgeCount?: number;
    className?: string;
}

const TabButton: React.FC<TabButtonProps> = ({ icon: Icon, label, tab, activeTab, onClick, badgeCount = 0, className = '' }) => {
    const isActive = activeTab === tab;
    return (
        <button
            onClick={() => onClick(tab)}
            className={`flex items-center px-4 py-3 text-sm font-medium transition-colors border-b-2 
                ${isActive 
                    ? 'border-indigo-600 text-indigo-600' 
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

// 연결 요청 카드 컴포넌트
interface ConnectionRequestCardProps {
    connection: ConnectionDetail;
    onRespond: (connectionId: number, responseType: 'accept' | 'reject') => void;
}

const ConnectionRequestCard: React.FC<ConnectionRequestCardProps> = ({ connection, onRespond }) => {
    const [isResponding, setIsResponding] = useState(false);

    const handleAction = async (responseType: 'accept' | 'reject') => {
        setIsResponding(true);
        // 응답은 메인 컴포넌트에서 처리
        await onRespond(connection.connection_id, responseType);
        // 메인 컴포넌트에서 목록을 다시 로드하므로 여기서 로딩을 풀 필요는 없음
        // (만약 에러가 발생하면 메인 컴포넌트가 다시 로드하여 카드가 다시 나타날 것)
    };

    return (
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-4 bg-white rounded-xl shadow-lg border border-gray-100 transition hover:shadow-xl">
            <div className="mb-3 sm:mb-0">
                <p className="text-lg font-semibold text-gray-800">{connection.therapist_name} 상담사님의 연결 요청</p>
                <p className="text-sm text-gray-500">요청 상태: <span className="font-medium text-amber-600">대기 중</span></p>
            </div>
            <div className="flex space-x-3 flex-shrink-0">
                <button
                    onClick={() => handleAction('accept')}
                    disabled={isResponding}
                    className="flex items-center px-4 py-2 text-sm font-medium rounded-lg shadow-md text-white bg-blue-600 hover:bg-blue-700 transition disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                    {isResponding ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Check className="w-4 h-4 mr-1" />}
                    수락
                </button>
                <button
                    onClick={() => handleAction('reject')}
                    disabled={isResponding}
                    className="flex items-center px-4 py-2 text-sm font-medium rounded-lg shadow-md text-gray-700 bg-gray-200 hover:bg-gray-300 transition disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                    {isResponding ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <XCircle className="w-4 h-4 mr-1" />}
                    거절
                </button>
            </div>
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
    <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4">
        <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full p-6">
            <h4 className="text-xl font-bold text-gray-900 mb-4 border-b pb-2">{title}</h4>
            <p className="text-gray-600 mb-6">{message}</p>
            <div className="flex justify-end space-x-3">
                <button
                    onClick={onCancel}
                    disabled={isProcessing}
                    className="px-4 py-2 text-sm font-medium rounded-lg text-gray-700 bg-gray-200 hover:bg-gray-300 transition disabled:bg-gray-400"
                >
                    취소
                </button>
                <button
                    onClick={onConfirm}
                    disabled={isProcessing}
                    className="flex items-center px-4 py-2 text-sm font-medium rounded-lg text-white bg-red-600 hover:bg-red-700 transition disabled:bg-red-400"
                >
                    {isProcessing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                    {isProcessing ? '처리 중...' : '확인 및 탈퇴'}
                </button>
            </div>
        </div>
    </div>
);

// 알림 컴포넌트
interface AlertProps {
    type: 'error' | 'info';
    message: string;
}

const Alert: React.FC<AlertProps> = ({ type, message }) => {
    const bgColor = type === 'error' ? 'bg-red-100 border-red-400 text-red-700' : 'bg-blue-100 border-blue-400 text-blue-700';
    const Icon = type === 'error' ? AlertTriangle : MessageCircle;

    return (
        <div className={`p-4 border rounded-xl flex items-start ${bgColor}`} role="alert">
            <Icon className="w-5 h-5 mr-3 flex-shrink-0 mt-0.5" />
            <div>
                <p className="font-bold">{type === 'error' ? '오류' : '정보'}</p>
                <p className="text-sm">{message}</p>
            </div>
        </div>
    );
};

