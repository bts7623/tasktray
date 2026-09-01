// 창 크기 ↔ 설정 동기화 (D-28). 사용자가 창 테두리를 드래그해 크기를 바꾸면 설정에 자동 저장하고,
// (환경설정 슬라이더 등으로) 설정이 바뀌면 이 창 크기를 실시간으로 맞춘다. 프로그램적 리사이즈로
// 인한 저장 루프는 허용오차(2px)로 방지한다.

import { getCurrentWindow } from "@tauri-apps/api/window";
import { LogicalSize } from "@tauri-apps/api/dpi";
import { listen } from "@tauri-apps/api/event";
import { getSettings, saveSettings, type Settings } from "../api";

type Size = { width: number; height: number };

export function syncWindowSize(
  read: (s: Settings) => Size,
  write: (s: Settings, size: Size) => Settings,
): () => void {
  const w = getCurrentWindow();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let unResize: (() => void) | undefined;
  let unSettings: (() => void) | undefined;

  const currentLogical = async (): Promise<Size> => {
    const [sz, sf] = await Promise.all([w.innerSize(), w.scaleFactor()]);
    const l = sz.toLogical(sf);
    return { width: Math.round(l.width), height: Math.round(l.height) };
  };

  const saveNow = async () => {
    try {
      const cur = await currentLogical();
      const s = await getSettings();
      const stored = read(s);
      if (Math.abs(stored.width - cur.width) <= 2 && Math.abs(stored.height - cur.height) <= 2) {
        return; // 프로그램적 리사이즈 → 저장 생략(루프 방지)
      }
      await saveSettings(write(s, cur));
    } catch {
      /* 무시 */
    }
  };

  void w
    .onResized(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void saveNow(), 500);
    })
    .then((u) => (unResize = u));

  void listen<Settings>("settings-changed", async (e) => {
    try {
      const target = read(e.payload);
      const cur = await currentLogical();
      if (
        Math.abs(target.width - cur.width) > 2 ||
        Math.abs(target.height - cur.height) > 2
      ) {
        await w.setSize(new LogicalSize(target.width, target.height));
      }
    } catch {
      /* 무시 */
    }
  }).then((u) => (unSettings = u));

  return () => {
    if (timer) clearTimeout(timer);
    unResize?.();
    unSettings?.();
  };
}
