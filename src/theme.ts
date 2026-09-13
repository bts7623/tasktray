// 테마 적용 (M6, FR-24~26). settings.theme/window 값을 CSS 변수로 주입해 즉시 반영.
// 배경색·글자색·글자크기만 요구사항 항목이며, 파생 색(테두리·비활성·입력배경)은
// color-mix 로 --bg/--fg 에서 자동 파생해 밝은/어두운 배경 모두 자연스럽게 보이도록 한다.

import type { Settings } from "./api";
import { fontStack } from "./fonts";

/** 배경색이 밝은지 판정(달력 아이콘 등 네이티브 위젯 color-scheme 결정용). */
function isLightBg(hex: string): boolean {
  const h = hex.replace("#", "");
  if (h.length < 6) return false;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return 0.299 * r + 0.587 * g + 0.114 * b > 150;
}

/**
 * 테마를 현재 창에 적용한다.
 * @param fontOverride 창별 폰트 크기(px). 지정 시 theme.fontSize 대신 사용(메모·환경설정 창). (D-25)
 */
export function applyTheme(settings: Settings, fontOverride?: number): void {
  const root = document.documentElement;
  const { backgroundColor, textColor, fontSize } = settings.theme;
  root.style.setProperty("--bg", backgroundColor);
  root.style.setProperty("--fg", textColor);
  // 날짜 입력 달력 아이콘 등 네이티브 위젯이 배경/글자색에 맞게 보이도록 color-scheme 설정.
  root.style.setProperty("--calendar-scheme", isLightBg(backgroundColor) ? "light" : "dark");
  // 패널 불투명도(메인 창의 .panel 에만 적용됨). 0.4~1.0.
  root.style.setProperty("--panel-opacity", String(settings.opacity ?? 1));
  // 루트 폰트 크기(rem 기준). 컴포넌트들은 rem/em 로 스케일된다.
  root.style.fontSize = `${fontOverride ?? fontSize}px`;
  // 앱 폰트(종류). settings.fontFamily → 폰트 스택. (D-30)
  root.style.setProperty("--app-font", fontStack(settings.fontFamily));
  // 오늘 할 일 TOP5 강조 배경. 커스텀값 있으면 사용, 없으면 테마 글자색 기반 자동(톤 유지·대비↑). (D-31)
  const top5 = settings.theme.top5Color?.trim();
  root.style.setProperty(
    "--top5-bg",
    top5 ? top5 : "color-mix(in srgb, var(--fg) 18%, var(--bg))",
  );
}

/** hex(base) 에 hex(mix) 를 ratio(0~1) 만큼 섞은 hex 반환. TOP5 자동색 미리보기용. (D-31) */
export function hexMix(base: string, mix: string, ratio: number): string {
  const parse = (h: string): [number, number, number] => {
    const s = h.replace("#", "");
    if (s.length < 6) return [128, 128, 128];
    return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
  };
  const [r1, g1, b1] = parse(base);
  const [r2, g2, b2] = parse(mix);
  const ch = (a: number, b: number) =>
    Math.round(a * (1 - ratio) + b * ratio)
      .toString(16)
      .padStart(2, "0");
  return `#${ch(r1, r2)}${ch(g1, g2)}${ch(b1, b2)}`;
}

/** 창 라벨에 맞는 폰트 크기(px)를 고른다. 메모/환경설정은 별도 값, 그 외는 앱 화면 값. (D-25) */
export function fontSizeForWindow(label: string, settings: Settings): number {
  if (label === "memo") return settings.memoFontSize ?? settings.theme.fontSize;
  if (label === "settings") return settings.settingsFontSize ?? settings.theme.fontSize;
  return settings.theme.fontSize;
}
