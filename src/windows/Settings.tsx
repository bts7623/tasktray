// 환경설정 창 (M6, FR-24~28). 테마·글자크기·창크기·자동실행·제목분리·초기화·버전.
// 변경은 즉시 반영(테마는 로컬 미리보기 + settings-changed 이벤트로 타 창 전파)되고
// settings.json 에 저장된다(FR-26). 저장은 과도한 디스크 쓰기를 막기 위해 짧게 디바운스.

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { LogicalSize } from "@tauri-apps/api/dpi";
import { listen } from "@tauri-apps/api/event";
import {
  appVersion,
  defaultSettings,
  getDataDir,
  getSettings,
  openDataFolder,
  openFeedback,
  saveSettings,
  setAutostart,
  setShortcut,
  type Settings as AppSettings,
} from "../api";
import { applyTheme, autoTop5Color } from "../theme";
import { FONT_OPTIONS } from "../fonts";
import { checkForUpdate } from "../updater";
import SyncSettings from "../components/SyncSettings";
import FeedbackForm from "../feedback/FeedbackForm";

/** 단축키 한 줄(라벨 + 현재값 + 변경). 캡처 상태는 행마다 독립. (D-27) */
function ShortcutRow({
  label,
  value,
  kind,
  onChange,
}: {
  label: string;
  value: string;
  kind: "panel" | "settings" | "memo";
  onChange: (acc: string) => void;
}) {
  const [capturing, setCapturing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const onKey = (e: KeyboardEvent) => {
    e.preventDefault();
    if (e.key === "Escape") {
      setCapturing(false);
      return;
    }
    const acc = toAccelerator(e);
    if (!acc) return; // 수식키 단독 등 — 계속 대기
    void (async () => {
      try {
        await setShortcut(kind, acc); // 등록 성공해야 저장
        onChange(acc);
        setErr(null);
        setCapturing(false);
      } catch (er) {
        setErr(String(er));
      }
    })();
  };
  return (
    <div className="shortcut-row">
      <div className="setting-item">
        <span>{label}</span>
        <div className="inline">
          {capturing ? (
            <input
              className="shortcut-capture"
              readOnly
              value="키 조합을 누르세요…"
              autoFocus
              onKeyDown={onKey}
              onBlur={() => setCapturing(false)}
            />
          ) : (
            <code className="shortcut-view">{value}</code>
          )}
          <button
            className="btn-sm"
            onClick={() => {
              setErr(null);
              setCapturing((v) => !v);
            }}
          >
            {capturing ? "취소" : "변경"}
          </button>
        </div>
      </div>
      {err && <div className="setting-error">{err}</div>}
    </div>
  );
}

/** KeyboardEvent → Tauri 액셀러레이터 문자열. 수식키 없거나 수식키 단독이면 null. */
function toAccelerator(e: KeyboardEvent): string | null {
  const mods: string[] = [];
  if (e.ctrlKey) mods.push("Ctrl");
  if (e.altKey) mods.push("Alt");
  if (e.shiftKey) mods.push("Shift");
  if (e.metaKey) mods.push("Super");
  let key = e.key;
  if (["Control", "Alt", "Shift", "Meta", "Dead"].includes(key)) return null;
  if (key === " ") key = "Space";
  else if (key.length === 1) key = key.toUpperCase();
  else if (key.startsWith("Arrow")) key = key.slice(5);
  if (mods.length === 0) return null; // 수식키 최소 1개 필수
  return [...mods, key].join("+");
}

/** 슬라이더 + 숫자 입력(양방향) 한 줄. 가로/세로를 슬라이더로 직관적으로, 숫자로 정밀하게. (D-28) */
function SizeControl({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: { width: number; height: number };
  min: { w: number; h: number };
  max: { w: number; h: number };
  onChange: (patch: Partial<{ width: number; height: number }>) => void;
}) {
  return (
    <div className="size-row">
      <span className="size-label">{label}</span>
      <div className="size-dim">
        <span className="size-dim-label">가로</span>
        <input
          type="range"
          min={min.w}
          max={max.w}
          step={10}
          value={value.width}
          onChange={(e) => onChange({ width: Number(e.target.value) })}
        />
        <input
          className="size-num"
          type="number"
          min={min.w}
          max={max.w}
          value={value.width}
          onChange={(e) => onChange({ width: Number(e.target.value) || min.w })}
        />
      </div>
      <div className="size-dim">
        <span className="size-dim-label">세로</span>
        <input
          type="range"
          min={min.h}
          max={max.h}
          step={10}
          value={value.height}
          onChange={(e) => onChange({ height: Number(e.target.value) })}
        />
        <input
          className="size-num"
          type="number"
          min={min.h}
          max={max.h}
          value={value.height}
          onChange={(e) => onChange({ height: Number(e.target.value) || min.h })}
        />
      </div>
    </div>
  );
}

// 메모 비밀번호 재입력 주기 옵션 (분). 0=매번, -1=앱 종료할 때까지. (D-28)
const MEMO_LOCK_OPTIONS: { label: string; value: number }[] = [
  { label: "매번", value: 0 },
  { label: "5분", value: 5 },
  { label: "15분", value: 15 },
  { label: "30분", value: 30 },
  { label: "1시간", value: 60 },
  { label: "앱 종료할 때까지", value: -1 },
];

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
  const settingsRef = useRef<AppSettings | null>(null);
  settingsRef.current = settings;

  // 이 창(환경설정)의 크기를 설정값에 맞춘다. (D-27)
  const applySettingsSize = (s: AppSettings) => {
    getCurrentWindow()
      .setSize(new LogicalSize(s.settingsSize.width, s.settingsSize.height))
      .catch(() => {});
  };

  useEffect(() => {
    getSettings()
      .then((s) => {
        setSettings(s);
        applySettingsSize(s);
      })
      .catch((e) => setError(String(e)));
    getDataDir().then(setDataDir).catch(() => {});
    appVersion().then(setVersion).catch(() => {});
  }, []);

  // 다른 창(메인 패널·메모)이나 이 창의 크기 변경이 저장되면 표시 값도 즉시 갱신. (D-28)
  useEffect(() => {
    let un: (() => void) | undefined;
    void listen<AppSettings>("settings-changed", (e) => {
      setSettings(e.payload);
      applyTheme(e.payload, e.payload.settingsFontSize);
    }).then((u) => (un = u));
    return () => un?.();
  }, []);

  // 로컬 즉시 미리보기 + 디바운스 저장(저장 성공 시 Rust가 settings-changed emit → 타 창 반영)
  // 이 창(환경설정)은 자기 폰트 크기(settingsFontSize)로 미리보기한다. (D-25)
  const commit = (next: AppSettings) => {
    setSettings(next);
    applyTheme(next, next.settingsFontSize);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveSettings(next).catch((e) => setError(String(e)));
    }, 250);
  };

  // 환경설정 창을 테두리로 드래그해 크기를 바꾸면 슬라이더 값 갱신 + 자동 저장. (D-28)
  useEffect(() => {
    const w = getCurrentWindow();
    let timer: ReturnType<typeof setTimeout> | null = null;
    let un: (() => void) | undefined;
    const save = async () => {
      try {
        if (await w.isMinimized()) return; // 최소화 상태의 0×0 저장 방지
        const [sz, sf] = await Promise.all([w.innerSize(), w.scaleFactor()]);
        const l = sz.toLogical(sf);
        const width = Math.round(l.width);
        const height = Math.round(l.height);
        if (width < 100 || height < 100) return; // 비정상 크기 저장 방지
        const cur = settingsRef.current;
        if (!cur) return;
        if (
          Math.abs(cur.settingsSize.width - width) <= 2 &&
          Math.abs(cur.settingsSize.height - height) <= 2
        ) {
          return; // 프로그램적 리사이즈 → 저장 생략(루프 방지)
        }
        commit({ ...cur, settingsSize: { ...cur.settingsSize, width, height } });
      } catch {
        /* 무시 */
      }
    };
    void w
      .onResized(() => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => void save(), 400);
      })
      .then((u) => (un = u));
    return () => {
      if (timer) clearTimeout(timer);
      un?.();
    };
  }, []);

  // 환경설정 창을 옮기면 위치를 저장 → 다시 열 때 같은 자리에서 뜬다. (D-28)
  useEffect(() => {
    const w = getCurrentWindow();
    let timer: ReturnType<typeof setTimeout> | null = null;
    let un: (() => void) | undefined;
    const save = async () => {
      try {
        if (await w.isMinimized()) return; // 최소화 시 -32000 좌표 저장 방지
        const pos = await w.outerPosition(); // 물리 좌표
        if (pos.x <= -30000 || pos.y <= -30000) return; // 최소화 sentinel 방지
        const cur = settingsRef.current;
        if (!cur) return;
        if (cur.settingsSize.x === pos.x && cur.settingsSize.y === pos.y) return;
        commit({ ...cur, settingsSize: { ...cur.settingsSize, x: pos.x, y: pos.y } });
      } catch {
        /* 무시 */
      }
    };
    void w
      .onMoved(() => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => void save(), 400);
      })
      .then((u) => (un = u));
    return () => {
      if (timer) clearTimeout(timer);
      un?.();
    };
  }, []);

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

  const setMemo = (patch: Partial<AppSettings["memo"]>) =>
    commit({ ...settings, memo: { ...settings.memo, ...patch } });

  const setSettingsSize = (patch: Partial<AppSettings["settingsSize"]>) => {
    const next = { ...settings, settingsSize: { ...settings.settingsSize, ...patch } };
    commit(next);
    applySettingsSize(next); // 이 창에 즉시 반영
  };

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
    applySettingsSize(next);
    void setAutostart(false).catch((e) => setError(String(e)));
    // 단축키 3종 모두 기본값으로 재등록
    void setShortcut("panel", next.shortcut).catch((e) => setError(String(e)));
    void setShortcut("settings", next.shortcutSettings).catch((e) => setError(String(e)));
    void setShortcut("memo", next.shortcutMemo).catch((e) => setError(String(e)));
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

        {/* 색상: 배경·글자·TOP5 를 한 줄에 나란히 비교하며 설정 (D-31) */}
        <div className="setting-item">
          <span>색상</span>
          <div className="color-row">
            <label className="color-field">
              <input
                type="color"
                value={settings.theme.backgroundColor}
                onChange={(e) => setTheme({ backgroundColor: e.target.value })}
              />
              <span>배경</span>
            </label>
            <label className="color-field">
              <input
                type="color"
                value={settings.theme.textColor}
                onChange={(e) => setTheme({ textColor: e.target.value })}
              />
              <span>글자</span>
            </label>
            <label className="color-field">
              <input
                type="color"
                value={
                  settings.theme.top5Color ||
                  autoTop5Color(settings.theme.backgroundColor, settings.theme.textColor)
                }
                onChange={(e) => setTheme({ top5Color: e.target.value })}
              />
              <span>TOP5</span>
            </label>
            <button
              type="button"
              className="btn-sm ghost color-reset"
              title="배경·글자·TOP5 색상을 기본값으로 초기화"
              onClick={() => {
                const d = defaultSettings().theme;
                setTheme({
                  backgroundColor: d.backgroundColor,
                  textColor: d.textColor,
                  top5Color: "",
                });
              }}
            >
              초기화
            </button>
          </div>
        </div>
        {/* 폰트 종류 (D-30) */}
        <div className="setting-item">
          <span>폰트</span>
          <select
            className="setting-select"
            value={settings.fontFamily}
            style={{ fontFamily: FONT_OPTIONS.find((f) => f.value === settings.fontFamily)?.stack }}
            onChange={(e) => commit({ ...settings, fontFamily: e.target.value })}
          >
            {FONT_OPTIONS.map((f) => (
              <option key={f.value} value={f.value} style={{ fontFamily: f.stack }}>
                {f.label}
              </option>
            ))}
          </select>
        </div>
        <div className="setting-item">
          <span>화면 글자 크기</span>
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
        {/* 메모·환경설정 글자 크기는 각각 별도(D-25) */}
        <div className="setting-item">
          <span>메모 글자 크기</span>
          <div className="inline">
            <input
              type="number"
              min={10}
              max={28}
              value={settings.memoFontSize}
              onChange={(e) => commit({ ...settings, memoFontSize: Number(e.target.value) || 14 })}
            />
            <div className="preset-group">
              {FONT_PRESETS.map((p) => (
                <button
                  key={p.size}
                  className={"btn-sm" + (settings.memoFontSize === p.size ? "" : " ghost")}
                  onClick={() => commit({ ...settings, memoFontSize: p.size })}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="setting-item">
          <span>환경설정 글자 크기</span>
          <div className="inline">
            <input
              type="number"
              min={10}
              max={24}
              value={settings.settingsFontSize}
              onChange={(e) =>
                commit({ ...settings, settingsFontSize: Number(e.target.value) || 14 })
              }
            />
            <div className="preset-group">
              {FONT_PRESETS.map((p) => (
                <button
                  key={p.size}
                  className={"btn-sm" + (settings.settingsFontSize === p.size ? "" : " ghost")}
                  onClick={() => commit({ ...settings, settingsFontSize: p.size })}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 화면·메모·환경설정 크기 (FR-24 ④, D-24/D-28). 슬라이더 + 숫자(양방향·실시간) */}
      <section className="setting-group">
        <div className="setting-label">창 크기 (px)</div>
        <p className="setting-desc">
          슬라이더나 숫자로 조절할 수 있고, 환경설정·메모 창은 테두리를 드래그해도 자동 저장됩니다.
        </p>
        <div className="size-grid">
          <SizeControl
            label="화면 크기"
            value={settings.window}
            min={{ w: 300, h: 400 }}
            max={{ w: 1200, h: 1600 }}
            onChange={setWindow}
          />
          <SizeControl
            label="메모 크기"
            value={settings.memo}
            min={{ w: 240, h: 240 }}
            max={{ w: 1200, h: 1600 }}
            onChange={setMemo}
          />
          <SizeControl
            label="환경설정 크기"
            value={settings.settingsSize}
            min={{ w: 300, h: 300 }}
            max={{ w: 1400, h: 1600 }}
            onChange={setSettingsSize}
          />
        </div>
      </section>

      {/* 글로벌 단축키 (사용자 확장, D-27). 동작 영역 위로 이동 + 항목별 3줄 */}
      <section className="setting-group">
        <div className="setting-label">글로벌 단축키</div>
        <ShortcutRow
          label="패널 열기/닫기"
          value={settings.shortcut}
          kind="panel"
          onChange={(acc) => commit({ ...settings, shortcut: acc })}
        />
        <ShortcutRow
          label="환경설정 열기"
          value={settings.shortcutSettings}
          kind="settings"
          onChange={(acc) => commit({ ...settings, shortcutSettings: acc })}
        />
        <ShortcutRow
          label="메모 열기"
          value={settings.shortcutMemo}
          kind="memo"
          onChange={(acc) => commit({ ...settings, shortcutMemo: acc })}
        />
        <p className="setting-desc">
          Ctrl·Alt·Shift·Win 중 하나 이상 + 키 조합. 다른 프로그램이나 다른 항목이 이미 쓰는 조합이면
          등록되지 않고 알림이 표시됩니다. (충돌 시 어떤 프로그램인지 이름까지는 확인 불가)
        </p>
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
        {/* 메모 비밀번호 재입력 주기 (D-28) */}
        <div className="setting-item">
          <span>메모 비밀번호 재입력 주기</span>
          <select
            className="setting-select"
            value={settings.memoLockMinutes}
            onChange={(e) => commit({ ...settings, memoLockMinutes: Number(e.target.value) })}
          >
            {MEMO_LOCK_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
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

      {/* 클라우드 동기화 (D-22) */}
      <SyncSettings />

      {/* 사용자 피드백 (D-23) */}
      <FeedbackForm
        platform="desktop"
        appVersion={version || null}
        onOpenAdmin={() => void openFeedback()}
      />

      {/* 업데이트 (D-30) */}
      <section className="setting-group">
        <div className="setting-label">업데이트</div>
        <label className="setting-item checkbox">
          <span>시작 시 자동으로 업데이트 확인</span>
          <input
            type="checkbox"
            checked={settings.updateOnStartup}
            onChange={(e) => commit({ ...settings, updateOnStartup: e.target.checked })}
          />
        </label>
        <button className="btn" onClick={() => void checkForUpdate(true)}>
          지금 업데이트 확인
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
