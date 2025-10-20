// /frontend/src/types/intake.ts

// ===============================================
// 1. 공통: 장르 목록
// ===============================================
export const MUSIC_GENRE_OPTIONS = [
    '피아노', 
    '클래식', 
    '자연의 소리', 
    '명상', 
    '재즈', 
    '팝',
    '록',
    '힙합',
];

// ===============================================
// 2. A. 환자용 Intake Data Type
// ===============================================
export interface PatientIntakeData {
  // VAS (0~10점 척도)
  currentAnxietyLevel: number; 
  currentMoodLevel: number;    
  currentPainLevel: number;    
  
  // 음악 선호도
  preferredMusicGenres: string[]; 
  dislikedMusicGenres: string[]; 
}

export const initialPatientIntakeData: PatientIntakeData = {
    currentAnxietyLevel: 5, 
    currentMoodLevel: 5, 
    currentPainLevel: 5, 
    preferredMusicGenres: [], 
    dislikedMusicGenres: [],
};


// ===============================================
// 3. B. 상담가용 Intake Data Type (작곡 심화 요소 포함)
// ===============================================
export interface CounselorIntakeData extends PatientIntakeData {
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