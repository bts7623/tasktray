// 실행 환경 감지. Tauri(데스크톱) 안에서는 __TAURI_INTERNALS__ 가 주입된다.
// 웹(브라우저/PWA)에서는 false → Supabase 로 직접 동작한다.

export const isTauri =
  typeof window !== "undefined" &&
  ("__TAURI_INTERNALS__" in window || "__TAURI__" in window);
