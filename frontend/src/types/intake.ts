// /frontend/src/types/intake.ts

// ===============================================
// 1. 공통: 장르 목록
// ===============================================
export const MUSIC_GENRE_OPTIONS = [
  "클래식",
  "재즈",
  "발라드",
  "팝",
  "락",
  "힙합",
  "R&B",
  "EDM",
  "뉴에이지",
  "로파이(Lo-fi)",
];

// ===============================================
// 2. A. 환자용 Intake Data Type (API 전송용)
// 💡 [수정] 백엔드 schemas.py의 PatientIntake와 구조를 일치시킵니다.
// ===============================================

// 2-1. 세부 타입 정의
interface VasData {
    anxiety: number;
    depression: number; // 👈 백엔드 prompt_from_guideline.py가 'depression' 키를 사용
    pain: number;
}
interface PrefsData {
    genres: string[]; // 👈 백엔드 prompt_from_guideline.py가 'genres' 키를 사용
    contraindications: string[]; // 👈 백엔드 prompt_from_guideline.py가 'contraindications' 키를 사용
    lyrics_allowed: boolean; // 👈 백엔드 prompt_from_guideline.py가 'lyrics_allowed' 키를 사용
}
interface GoalData {
    text: string;
}

interface DialogMessage {
    role: string;
    content: string;
}
// 2-2. PatientIntake (API Payload 타입)
// 💡 (이것이 intake/patient/page.tsx가 import할 'PatientIntake'입니다)
export interface PatientIntake {
    vas: VasData;
    prefs: PrefsData;
    goal: GoalData;
    dialog: DialogMessage[]; // (환자 접수 시에는 항상 빈 배열 []로 전송)
}

// ===============================================
// 3. A-2. 환자용 폼(Form) 상태 타입
// (이것이 intake/patient/page.tsx가 import할 'PatientIntakeFormData'입니다)
// (기존 PatientIntakeData의 이름을 변경)
// ===============================================
export interface PatientIntakeFormData {
  // VAS (0~10점 척도)
  currentAnxietyLevel: number; 
  currentMoodLevel: number;    
  currentPainLevel: number;    
  
  // 음악 선호도
  preferredMusicGenres: string[]; 
  dislikedMusicGenres: string[]; 

  vocalsAllowed: boolean;
}

export const initialPatientIntakeData: PatientIntakeFormData = {
    currentAnxietyLevel: 5, 
    currentMoodLevel: 5, 
    currentPainLevel: 5, // 👈 [수정] 0 -> 5 (기존 코드와 동일하게)
    preferredMusicGenres: [], 
    dislikedMusicGenres: [],
    vocalsAllowed: false,
};


// ===============================================
// 3. B. 상담가용 Intake Data Type (작곡 심화 요소 포함)
// ===============================================
export interface CounselorIntakeData extends PatientIntakeFormData {
  // 음악 생성 파라미터
  musicKeyPreference: 'Major' | 'Minor' | 'Neutral';
  musicDuration: number;              // 음악 길이 (초)
  mainInstrument: string;             // 주요 악기 (Piano, Strings 등)
  
  rhythmComplexity: 'Simple' | 'Medium' | 'Complex' | 'Neutral'; // 리듬 복잡도
  harmonicDissonance: 'None' | 'Low' | 'Medium' | 'Neutral'; // 불협화음 사용 수준
  melodyContour: 'Ascending' | 'Descending' | 'Wavy' | 'Flat' | 'Neutral'; // 선율 윤곽
  textureDensity: 'Sparse' | 'Medium' | 'Dense' | 'Neutral'; // 음악적 밀도
  targetBPM: number | 'Neutral'; // 목표 BPM (직접 지정)

  // 상담가 메모
  compositionalNotes: string; // 작곡 엔진에 전달할 구체적인 지침 메모
}

export const initialCounselorIntakeData: CounselorIntakeData = {
    // 환자용 기본값 상속
    ...initialPatientIntakeData,
    
    // 작곡 요소 기본값
    musicKeyPreference: 'Neutral',
    musicDuration: 210, 
    mainInstrument: 'Piano',
    
    rhythmComplexity: 'Simple',
    harmonicDissonance: 'None',
    melodyContour: 'Descending',
    textureDensity: 'Sparse',
    targetBPM: 80,
    
    compositionalNotes: '',
};