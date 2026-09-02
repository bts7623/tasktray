// 앱 폰트 선택지 (D-30). 모두 무료·상업적 사용 가능(OFL 등). 테스트용으로 폭넓게 제공하고,
// 사용자가 추려낸 뒤 최종본은 오프라인 번들로 전환 예정. value 는 settings.fontFamily 에 저장.

export const SYSTEM_FONT = '"Malgun Gothic", "맑은 고딕", system-ui, sans-serif';

export interface FontOption {
  label: string;
  value: string; // "" = 시스템 기본
  stack: string;
}

export const FONT_OPTIONS: FontOption[] = [
  { label: "시스템 기본 (맑은 고딕)", value: "", stack: SYSTEM_FONT },
  { label: "Pretendard", value: "Pretendard", stack: `"Pretendard", ${SYSTEM_FONT}` },
  { label: "본고딕 (Noto Sans KR)", value: "Noto Sans KR", stack: `"Noto Sans KR", ${SYSTEM_FONT}` },
  { label: "나눔고딕", value: "Nanum Gothic", stack: `"Nanum Gothic", ${SYSTEM_FONT}` },
  { label: "Gothic A1", value: "Gothic A1", stack: `"Gothic A1", ${SYSTEM_FONT}` },
  { label: "IBM Plex Sans KR", value: "IBM Plex Sans KR", stack: `"IBM Plex Sans KR", ${SYSTEM_FONT}` },
  { label: "고운돋움", value: "Gowun Dodum", stack: `"Gowun Dodum", ${SYSTEM_FONT}` },
  { label: "나눔명조", value: "Nanum Myeongjo", stack: `"Nanum Myeongjo", serif` },
  { label: "고운바탕", value: "Gowun Batang", stack: `"Gowun Batang", serif` },
  { label: "송명 (Song Myung)", value: "Song Myung", stack: `"Song Myung", serif` },
  { label: "함렛 (Hahmlet)", value: "Hahmlet", stack: `"Hahmlet", serif` },
  { label: "주아 (Jua)", value: "Jua", stack: `"Jua", ${SYSTEM_FONT}` },
  { label: "도현 (Do Hyeon)", value: "Do Hyeon", stack: `"Do Hyeon", ${SYSTEM_FONT}` },
  { label: "검은고딕 (Black Han Sans)", value: "Black Han Sans", stack: `"Black Han Sans", ${SYSTEM_FONT}` },
  { label: "개구 (Gaegu, 손글씨)", value: "Gaegu", stack: `"Gaegu", ${SYSTEM_FONT}` },
  { label: "나눔손글씨 펜", value: "Nanum Pen Script", stack: `"Nanum Pen Script", ${SYSTEM_FONT}` },
];

export function fontStack(value: string | undefined): string {
  return FONT_OPTIONS.find((f) => f.value === (value ?? ""))?.stack ?? SYSTEM_FONT;
}
