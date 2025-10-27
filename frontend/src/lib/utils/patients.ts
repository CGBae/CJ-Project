// /frontend/src/lib/utils/patients.ts
import type { MusicTrack } from './music';

// 1. Patient 인터페이스 (sessionIds 포함)
export interface Patient {
  id: string;
  name: string;
  age: number;
  lastSession: string;
  totalSessions: number;
  avatarUrl?: string;
  generatedMusic: MusicTrack[];
  sessionIds: number[]; // 이 환자가 가진 모든 세션 ID 목록
}

// 2. 이 배열이 DB 역할을 합니다.
const patientsDB: Patient[] = [
  { 
    id: 'p001', 
    name: '김현우 (기존 환자)', 
    age: 28, 
    lastSession: '2025. 10. 18', 
    totalSessions: 1,
    generatedMusic: [
      { id: 't001', title: "'업무 스트레스'를 위한 연주곡", artist: 'AI Composer', prompt: '업무 스트레스', audioUrl: '/placeholder.mp3' },
    ],
    sessionIds: [1001], // 예시: 이 환자는 1001번 상담을 1번 진행함
  },
  { 
    id: 'p002', 
    name: '이수민 (기존 환자)', 
    age: 34, 
    lastSession: '2025. 10. 16', 
    totalSessions: 0,
    avatarUrl: 'https://via.placeholder.com/150/92c952', 
    generatedMusic: [],
    sessionIds: []
  },
  // 3. 우리가 "로그인"했다고 시뮬레이션할 환자 데이터
  {
    id: 'p_user_001',
    name: '홍길동 (로그인한 환자)',
    age: 29,
    lastSession: '2025. 10. 20',
    totalSessions: 0,
    avatarUrl: 'https://via.placeholder.com/150/4ade80',
    generatedMusic: [],
    sessionIds: [], // 👈 처음엔 상담 기록이 없음
  }
];

export const getPatients = (): Patient[] => {
  return patientsDB;
};

export const getPatientById = (id: string): Patient | undefined => {
  return patientsDB.find(p => p.id === id);
};

export const addPatient = (id: string, name: string, age: number): { success: boolean; patient: Patient | null; error?: string } => {
  if (getPatientById(id)) {
      return { success: false, patient: null, error: `환자 ID '${id}'가 이미 존재합니다.` };
  }
  const newPatient: Patient = {
    id, name, age,
    lastSession: new Date().toISOString().split('T')[0].replace(/-/g, '. '),
    totalSessions: 0,
    generatedMusic: [],
    sessionIds: [],
  };
  patientsDB.push(newPatient);
  return { success: true, patient: newPatient };
};

export const linkSessionToPatient = (patientId: string, sessionId: number) => {
    const patient = getPatientById(patientId);
    if (patient && !patient.sessionIds.includes(sessionId)) {
        patient.sessionIds.push(sessionId);
        patient.totalSessions = patient.sessionIds.length;
    }
};

// --- 👇 [핵심] 이 함수가 빠져있었습니다! ---
export const unlinkSessionFromPatient = (patientId: string, sessionId: number) => {
    const patient = getPatientById(patientId);
    if (patient) {
        patient.sessionIds = patient.sessionIds.filter(id => id !== sessionId);
        patient.totalSessions = patient.sessionIds.length;
        console.log(`환자(${patientId})에게서 세션(${sessionId}) 연결 해제 완료.`);
    }
};
// ------------------------------------

export const addMusicToPatient = (patientId: string, track: MusicTrack): void => {
  const patient = getPatientById(patientId);
  if (patient) {
    patient.generatedMusic.push(track);
  }
};