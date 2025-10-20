// 파일 경로: /src/lib/utils/patients.ts
import type { MusicTrack } from './music'; // music.ts의 타입을 가져옵니다.

// 1. 환자 정보 타입을 정의합니다 (모든 페이지에서 이 타입을 사용).
export interface Patient {
  id: string; // patientId 대신 id 사용 (간결성)
  name: string; // patientName 대신 name 사용 (간결성)
  age: number;
  lastSession: string;
  totalSessions: number;
  avatarUrl?: string;
  generatedMusic: MusicTrack[]; // 생성된 음악 목록을 여기에 포함
}

// 2. 이 배열이 DB 역할을 합니다. (초기 가짜 데이터 포함)
const patientsDB: Patient[] = [
  {
    id: 'p001',
    name: '김현우 (기존 환자)',
    age: 28,
    lastSession: '2025. 10. 18',
    totalSessions: 12,
    generatedMusic: [
      { id: 't001', title: "'업무 스트레스'를 위한 연주곡", artist: 'AI Composer', prompt: '업무 스트레스', audioUrl: '/placeholder.mp3' },
      { id: 't002', title: "'고요한 밤'을 위한 연주곡", artist: 'AI Composer', prompt: '고요한 밤', audioUrl: '/placeholder.mp3' },
    ]
  },
  {
    id: 'p002',
    name: '이수민 (기존 환자)',
    age: 34,
    lastSession: '2025. 10. 16',
    totalSessions: 8,
    generatedMusic: [
      { id: 't003', title: "'아침 산책'을 위한 연주곡", artist: 'AI Composer', prompt: '아침 산책', audioUrl: '/placeholder.mp3' },
    ]
  },
   {
    id: 'p003',
    name: '박지영 (기존 환자)',
    age: 22,
    lastSession: '2025. 10. 19',
    totalSessions: 5,
    generatedMusic: [] // 음악 없음
  },
];

/**
 * 모든 환자 목록을 반환합니다.
 */
export const getPatients = (): Patient[] => {
  console.log("모든 환자 목록 조회:", patientsDB);
  return patientsDB;
};

/**
 * 주어진 ID와 일치하는 환자 정보를 반환합니다.
 * @param id 찾을 환자의 ID
 * @returns 찾은 환자 정보 또는 undefined
 */
export const getPatientById = (id: string): Patient | undefined => {
  const patient = patientsDB.find(p => p.id === id);
  console.log(`ID(${id})로 환자 조회:`, patient);
  return patient;
};

/**
 * 새로운 환자를 DB에 추가하고 추가된 환자 정보를 반환합니다.
 * @param name 새 환자의 이름
 * @param age 새 환자의 나이
 * @returns 추가된 환자 정보 객체
 */
export const addPatient = (name: string, age: number): Patient => {
  const newPatient: Patient = {
    id: `p${Date.now()}`, // 고유한 ID 생성 (간단 버전)
    name,
    age,
    lastSession: new Date().toISOString().split('T')[0].replace(/-/g, '. '), // 오늘 날짜
    totalSessions: 1, // 첫 세션
    generatedMusic: [], // 처음에는 음악 없음
  };
  patientsDB.push(newPatient);
  console.log("새 환자 추가됨:", newPatient);
  return newPatient;
};

/**
 * 특정 환자에게 생성된 음악 트랙을 추가합니다.
 * @param patientId 음악을 추가할 환자의 ID
 * @param track 추가할 음악 트랙 객체
 */
export const addMusicToPatient = (patientId: string, track: MusicTrack): void => {
  const patient = getPatientById(patientId);
  if (patient) {
    patient.generatedMusic.push(track);
    console.log(`환자(${patientId})에게 음악 추가됨:`, track);
    console.log(`현재 ${patient.name}의 음악 목록:`, patient.generatedMusic);
  } else {
    console.error(`환자(${patientId})를 찾을 수 없어 음악을 추가하지 못했습니다.`);
  }
};