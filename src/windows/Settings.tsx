// 환경설정 창 (M6, FR-24~28). 테마·글자크기·창크기·자동실행·제목분리·초기화·버전.
// 변경은 즉시 반영(테마는 로컬 미리보기 + settings-changed 이벤트로 타 창 전파)되고
// settings.json 에 저장된다(FR-26). 저장은 과도한 디스크 쓰기를 막기 위해 짧게 디바운스.

import { useEffect, useRef, useState } from "react";
import {
  appVersion,
  defaultSettings,
  getDataDir,
  getSettings,
  openDataFolder,
  saveSettings,
  setAutostart,
  type Settings as AppSettings,
} from "../api";
import { applyTheme } from "../theme";

const FONT_PRESETS: { label: string; size: number }[] = [
  { label: "소", size: 12 },
  { label: "중", size: 14 },
  { label: "대", size: 16 },
];

// 프리셋 테마(배경/글자 색상). 클릭 시 즉시 적용, 이후 수동 조정도 가능. 라벨은 2글자.
// 유사색 순(밝은 배경 → 어두운 배경)으로 정렬해 인접 칩끼리 색이 비슷하게 배치.
const THEME_PRESETS: { label: string; bg: string; fg: string }[] = [
  { label: "선명", bg: "#ffffff", fg: "#1a1a1a" }, // 고대비 화이트 — 표 가독성 최상
  { label: "밝은", bg: "#f6f3ec", fg: "#4b4740" }, // 파스텔 밝은
  { label: "종이", bg: "#f4ecd8", fg: "#3a3226" }, // 세피아 페이퍼 — 눈 편함
  { label: "하늘", bg: "#eef4fb", fg: "#24406b" }, // 라이트 블루 — 산뜻+가독
  { label: "야간", bg: "#0f1115", fg: "#c9d1d9" }, // 딥다크 — 저눈부심 가독
  { label: "태섭", bg: "#121212", fg: "#ffdd00" }, // 블랙+옐로 고대비
  { label: "다크", bg: "#1e1e1e", fg: "#e0e0e0" },
  { label: "초록", bg: "#15241b", fg: "#d6ead8" },
  { label: "보라", bg: "#241a33", fg: "#e9ddff" },
];

export default function Settings() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [dataDir, setDataDir] = useState("");
  const [version, setVersion] = useState("");
  const [error, setError] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    getSettings().then(setSettings).catch((e) => setError(String(e)));
    getDataDir().then(setDataDir).catch(() => {});
    appVersion().then(setVersion).catch(() => {});
  }, []);

  // 로컬 즉시 미리보기 + 디바운스 저장(저장 성공 시 Rust가 settings-changed emit → 타 창 반영)
  const commit = (next: AppSettings) => {
    setSettings(next);
    applyTheme(next);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveSettings(next).catch((e) => setError(String(e)));
    }, 250);
  };

  if (!settings) {
    return (
      <div className="page">
        <h1>환경설정</h1>
        {error ? <div className="banner banner-error">{error}</div> : <p className="empty">불러오는 중…</p>}
      </div>
    );
  }

  const setTheme = (patch: Partial<AppSettings["theme"]>) =>
    commit({ ...settings, theme: { ...settings.theme, ...patch } });

  const setWindow = (patch: Partial<AppSettings["window"]>) =>
    commit({ ...settings, window: { ...settings.window, ...patch } });

  const toggleAutostart = async (enabled: boolean) => {
    try {
      await setAutostart(enabled); // 레지스트리 등록/해제 (FR-27)
      commit({ ...settings, autoStart: enabled });
    } catch (e) {
      setError(String(e));
    }
  };

  const reset = () => {
    // dataPath 는 자동 관리 값 유지 (D-08)
    const next: AppSettings = { ...defaultSettings(), dataPath: settings.dataPath };
    commit(next);
    void setAutostart(false).catch((e) => setError(String(e)));
  };

  return (
    <div className="page settings">
      <h1>환경설정</h1>
      {error && <div className="banner banner-error">{error}</div>}

      {/* 테마 (FR-24 ①②③, FR-25) */}
      <section className="setting-group">
        {/* 제목 우측에 8개 프리셋 칩을 나열해 세로 공간 절약 */}
        <div className="theme-header">
          <div className="setting-label">화면 테마</div>
          <div className="theme-presets">
            {THEME_PRESETS.map((p) => {
              const active =
                settings.theme.backgroundColor.toLowerCase() === p.bg &&
                settings.theme.textColor.toLowerCase() === p.fg;
              return (
                <button
                  key={p.label}
                  className={"theme-chip" + (active ? " active" : "")}
                  style={{ background: p.bg, color: p.fg }}
                  title={`${p.label} 테마 적용`}
                  onClick={() => setTheme({ backgroundColor: p.bg, textColor: p.fg })}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="setting-item">
          <span>배경 색상</span>
          <input
            type="color"
            value={settings.theme.backgroundColor}
            onChange={(e) => setTheme({ backgroundColor: e.target.value })}
          />
        </div>
        <div className="setting-item">
          <span>글자 색상</span>
          <input
            type="color"
            value={settings.theme.textColor}
            onChange={(e) => setTheme({ textColor: e.target.value })}
          />
        </div>
        <div className="setting-item">
          <span>글자 크기</span>
          <div className="inline">
            <input
              type="number"
              min={10}
              max={24}
              value={settings.theme.fontSize}
              onChange={(e) => setTheme({ fontSize: Number(e.target.value) || 14 })}
            />
            <div className="preset-group">
              {FONT_PRESETS.map((p) => (
                <button
                  key={p.size}
                  className={"btn-sm" + (settings.theme.fontSize === p.size ? "" : " ghost")}
                  onClick={() => setTheme({ fontSize: p.size })}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 창 크기 (FR-24 ④) */}
      <section className="setting-group">
        <div className="setting-label">앱 창 크기 (px)</div>
        <div className="setting-item">
          <span>가로</span>
          <input
            type="number"
            min={300}
            max={1200}
            value={settings.window.width}
            onChange={(e) => setWindow({ width: Number(e.target.value) || 360 })}
          />
        </div>
        <div className="setting-item">
          <span>세로</span>
          <input
            type="number"
            min={400}
            max={1600}
            value={settings.window.height}
            onChange={(e) => setWindow({ height: Number(e.target.value) || 720 })}
          />
        </div>
      </section>

      {/* 동작 (FR-24 ⑤⑦) */}
      <section className="setting-group">
        <div className="setting-label">동작</div>
        <label className="setting-item checkbox">
          <span>Windows 시작 시 자동 실행</span>
          <input
            type="checkbox"
            checked={settings.autoStart}
            onChange={(e) => void toggleAutostart(e.target.checked)}
          />
        </label>
        <label className="setting-item checkbox">
          <span>제목 자동 분리 (예: 통합정보망_태양광_과업검토 → 카테고리+제목)</span>
          <input
            type="checkbox"
            checked={settings.titleAutoParse}
            onChange={(e) => commit({ ...settings, titleAutoParse: e.target.checked })}
          />
        </label>
      </section>

      {/* 데이터 저장 폴더 (FR-24 ⑥, D-08) */}
      <section className="setting-group">
        <div className="setting-label">데이터 저장 폴더</div>
        <p className="setting-desc">
          업무 데이터(tasks.json)와 설정은 프로그램이 아래 폴더에서 자동 관리합니다.
        </p>
        {dataDir && <div className="datapath-box">{dataDir}</div>}
        <button className="btn" onClick={() => void openDataFolder()}>
          저장 폴더 열기
        </button>
      </section>

      {/* 초기화 + 버전 (FR-28, NFR-04) */}
      <section className="setting-group">
        <button className="btn" onClick={reset}>
          설정 초기화(기본값 복원)
        </button>
      </section>

      <div className="version">TaskTray v{version || "…"}</div>
    </div>
  );
}
