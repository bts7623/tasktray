// 테마 적용 (M6, FR-24~26). settings.theme/window 값을 CSS 변수로 주입해 즉시 반영.
// 배경색·글자색·글자크기만 요구사항 항목이며, 파생 색(테두리·비활성·입력배경)은
// color-mix 로 --bg/--fg 에서 자동 파생해 밝은/어두운 배경 모두 자연스럽게 보이도록 한다.

import type { Settings } from "./api";

/** 배경색이 밝은지 판정(달력 아이콘 등 네이티브 위젯 color-scheme 결정용). */
function isLightBg(hex: string): boolean {
  const h = hex.replace("#", "");
  if (h.length < 6) return false;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return 0.299 * r + 0.587 * g + 0.114 * b > 150;
}

export function applyTheme(settings: Settings): void {
  const root = document.documentElement;
  const { backgroundColor, textColor, fontSize } = settings.theme;
  root.style.setProperty("--bg", backgroundColor);
  root.style.setProperty("--fg", textColor);
  // 날짜 입력 달력 아이콘 등 네이티브 위젯이 배경/글자색에 맞게 보이도록 color-scheme 설정.
  root.style.setProperty("--calendar-scheme", isLightBg(backgroundColor) ? "light" : "dark");
  // 패널 불투명도(메인 창의 .panel 에만 적용됨). 0.4~1.0.
  root.style.setProperty("--panel-opacity", String(settings.opacity ?? 1));
  // 루트 폰트 크기(rem 기준). 컴포넌트들은 rem/em 로 스케일된다.
  root.style.fontSize = `${fontSize}px`;
}
