// 테마 적용 (M6, FR-24~26). settings.theme/window 값을 CSS 변수로 주입해 즉시 반영.
// 배경색·글자색·글자크기만 요구사항 항목이며, 파생 색(테두리·비활성·입력배경)은
// color-mix 로 --bg/--fg 에서 자동 파생해 밝은/어두운 배경 모두 자연스럽게 보이도록 한다.

import type { Settings } from "./api";

export function applyTheme(settings: Settings): void {
  const root = document.documentElement;
  const { backgroundColor, textColor, fontSize } = settings.theme;
  root.style.setProperty("--bg", backgroundColor);
  root.style.setProperty("--fg", textColor);
  // 패널 불투명도(메인 창의 .panel 에만 적용됨). 0.4~1.0.
  root.style.setProperty("--panel-opacity", String(settings.opacity ?? 1));
  // 루트 폰트 크기(rem 기준). 컴포넌트들은 rem/em 로 스케일된다.
  root.style.fontSize = `${fontSize}px`;
}
