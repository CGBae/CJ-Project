export {};

declare global {
  interface KakaoAuth {
    login?: (options?: { scope?: string; success?: (res: unknown) => void; fail?: (err: unknown) => void }) => void;
    logout?: (callback?: (res: unknown) => void) => void;
    getStatus?: (callback?: (res: unknown) => void) => void;
  }

  interface KakaoAPI {
    request: (params: { url: string; data?: unknown; success?: (res: unknown) => void; fail?: (err: unknown) => void }) => void;
  }

  interface KakaoStatic {
    init(appKey: string): void;
    isInitialized(): boolean;
    cleanup?(): void;
    Auth?: KakaoAuth;
    API?: KakaoAPI;
  }

  interface Window {
    Kakao?: KakaoStatic; // Kakao SDK 타입을 정의
  }
}