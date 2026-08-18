// 메인 패널 (트레이 좌클릭). M3: Task 등록/수정/삭제/완료/Pin + 3영역 목록·정렬 (FR-01~12).
// M4: done → flow 등록완료/제외 → archived 숨김 + 즉시 실행취소 스낵바 (FR-10/11, §3.2).
// 저장 위치는 앱 자동 관리(D-08). archived 상시 종료취소·로우데이터·리포트는 M5.

import { useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { LogicalSize } from "@tauri-apps/api/dpi";
import { listen } from "@tauri-apps/api/event";
import {
  getSettings,
  loadTasks,
  openHelp,
  openSettings,
  saveSettings,
  saveTasks,
  setPanelPinned,
  type Settings,
  type Task,
} from "../api";
import {
  activeTasks,
  archiveTask,
  collectCategories,
  createTask,
  doneTasks,
  nowKst,
  pinnedTasks,
  replaceTask,
  resolveTitleCategory,
  restoreToDone,
  touch,
} from "../tasks";
import QuickInput from "../components/QuickInput";
import TaskRow from "../components/TaskRow";
import Snackbar from "../components/Snackbar";
import { supabaseConfigured } from "../supabase";
import { syncNow } from "../sync/sync";
import { currentUserId } from "../sync/session";

type Phase = "loading" | "ready" | "error";

export default function Panel() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [schemaVersion, setSchemaVersion] = useState(1);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Task | null>(null);
  // flow 처리 직후 실행취소용 스낵바 상태 (D-12). undo 는 직전 done 상태로 복원.
  const [undoInfo, setUndoInfo] = useState<{ prev: Task; message: string } | null>(null);
  // 영역 접기/펼치기 (UI-05)
  const [collapsed, setCollapsed] = useState({ pin: false, active: false, done: false });

  const bootstrapped = useRef(false);
  const ready = useRef(false);

  // 설정의 창 크기를 메인 패널(자기 자신)에 적용 (FR-24 창 크기 즉시 반영)
  const applySize = (s: Settings) => {
    getCurrentWindow()
      .setSize(new LogicalSize(s.window.width, s.window.height))
      .catch(() => {});
  };

  const reload = async () => {
    try {
      const load = await loadTasks();
      setTasks(load.file.tasks);
      setSchemaVersion(load.file.schemaVersion);
      setWarning(load.message ?? null);
    } catch (e) {
      setError(String(e));
      setPhase("error");
    }
  };

  // 자동 동기화(로그인 시): 원격과 병합 후 로컬 재로드. 로컬 우선이라 실패해도 앱은 정상.
  const syncing = useRef(false);
  const autoSync = async () => {
    if (syncing.current || !supabaseConfigured) return;
    const uid = await currentUserId();
    if (!uid) return;
    syncing.current = true;
    try {
      await syncNow(uid);
      await reload();
    } catch {
      /* 오프라인 등 — 무시(로컬 유지) */
    } finally {
      syncing.current = false;
    }
  };
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleSync = () => {
    if (syncTimer.current) clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(() => void autoSync(), 2500);
  };

  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;
    (async () => {
      try {
        const s = await getSettings();
        setSettings(s);
        applySize(s);
      } catch {
        /* 설정 로드 실패 시 기본 동작 유지 */
      }
      await reload();
      setPhase("ready");
      ready.current = true;
      void autoSync(); // 시작 시 1회
    })();
  }, []);

  // 주기적 자동 동기화(15초) — 다른 기기(폰) 변경을 반영
  useEffect(() => {
    const iv = setInterval(() => void autoSync(), 15000);
    return () => clearInterval(iv);
  }, []);

  // 설정 변경 즉시 반영: 창 크기 리사이즈 + titleAutoParse 등 갱신 (FR-26)
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen<Settings>("settings-changed", (e) => {
      setSettings(e.payload);
      applySize(e.payload);
    }).then((u) => (unlisten = u));
    return () => unlisten?.();
  }, []);

  // 패널이 다시 열릴(포커스) 때 최신 tasks.json 반영 + 설정(제목 자동분리) 갱신
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    getCurrentWindow()
      .onFocusChanged(({ payload: focused }) => {
        if (focused && ready.current) {
          void reload();
          void autoSync(); // 패널 열 때 최신화
          getSettings().then(setSettings).catch(() => {});
        }
      })
      .then((u) => (unlisten = u));
    return () => unlisten?.();
  }, []);

  // 변경분을 상태에 반영하고 즉시 저장 (DR-02) + 잠시 후 자동 동기화(원격 반영)
  const commit = (next: Task[]) => {
    setTasks(next);
    saveTasks({ schemaVersion, tasks: next }).catch((e) => setError(String(e)));
    scheduleSync();
  };

  const addTask = (rawTitle: string, rawCategory: string | null, dueDate: string | null) => {
    const { title, category } = resolveTitleCategory(
      rawTitle,
      rawCategory,
      settings?.titleAutoParse ?? false,
    );
    if (title === "") return;
    commit([...tasks, createTask(title, category, dueDate)]);
  };

  const toggleComplete = (task: Task) => {
    const updated: Task =
      task.status === "active"
        ? touch({ ...task, status: "done", completedAt: nowKst() }) // 완료 (FR-09)
        : touch({ ...task, status: "active", completedAt: null }); // 완료 취소 (FR-11)
    commit(replaceTask(tasks, updated));
  };

  const togglePin = (task: Task) => {
    commit(replaceTask(tasks, touch({ ...task, pinned: !task.pinned }))); // FR-08
  };

  const editTask = (
    task: Task,
    patch: { title: string; category: string | null; dueDate: string | null },
  ) => {
    commit(replaceTask(tasks, touch({ ...task, ...patch }))); // FR-05
  };

  const confirmDelete = () => {
    if (!pendingDelete) return;
    // soft delete (FR-06): deleted=true, deletedAt 기록
    commit(
      replaceTask(tasks, touch({ ...pendingDelete, deleted: true, deletedAt: nowKst() })),
    );
    setPendingDelete(null);
  };

  // flow 처리(등록완료/제외): done → archived, 기본 화면에서 숨김 (FR-10)
  const processFlow = (task: Task, flow: "registered" | "excluded") => {
    commit(replaceTask(tasks, archiveTask(task, flow)));
    setUndoInfo({
      prev: task, // 복원용 직전 done 스냅샷
      message: flow === "registered" ? "flow 등록 완료로 종료됨" : "실적 제외로 종료됨",
    });
  };

  // 스낵바 실행취소: archived → done 복원 (FR-11, D-12)
  const undoArchive = () => {
    if (!undoInfo) return;
    commit(replaceTask(tasks, restoreToDone(undoInfo.prev)));
    setUndoInfo(null);
  };

  const pinned = pinnedTasks(tasks);
  const active = activeTasks(tasks);
  const done = doneTasks(tasks);
  const categories = collectCategories(tasks);

  // 카테고리 대분류 색 변경 → 같은 대분류 전부 반영, 디바운스 저장
  const catColorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onCategoryColor = (major: string, hex: string) => {
    if (!settings) return;
    const next: Settings = {
      ...settings,
      categoryColors: { ...settings.categoryColors, [major]: hex },
    };
    setSettings(next);
    if (catColorTimer.current) clearTimeout(catColorTimer.current);
    catColorTimer.current = setTimeout(() => {
      saveSettings(next).catch((e) => setError(String(e)));
    }, 250);
  };

  const rowProps = {
    onToggleComplete: toggleComplete,
    onTogglePin: togglePin,
    onEdit: editTask,
    onDelete: (t: Task) => setPendingDelete(t),
    onFlow: processFlow,
    categoryColors: settings?.categoryColors ?? {},
    onCategoryColor,
  };

  const toggleSection = (key: keyof typeof collapsed) =>
    setCollapsed((c) => ({ ...c, [key]: !c[key] }));

  // 압정(항상 위 고정) 토글 — 켜면 바깥 클릭해도 패널이 사라지지 않는다.
  const panelPinned = settings?.alwaysOnTop ?? false;
  const togglePinPanel = async () => {
    if (!settings) return;
    const next: Settings = { ...settings, alwaysOnTop: !settings.alwaysOnTop };
    try {
      await setPanelPinned(next.alwaysOnTop);
      setSettings(next);
      await saveSettings(next);
    } catch (e) {
      setError(String(e));
    }
  };

  // 투명도 슬라이더 (헤더, 압정 좌측). 30~100%. 즉시 반영 + 디바운스 저장.
  const opacityPct = Math.round((settings?.opacity ?? 1) * 100);
  const opacityTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onOpacity = (pct: number) => {
    const op = pct / 100;
    document.documentElement.style.setProperty("--panel-opacity", String(op)); // 즉시 미리보기
    if (!settings) return;
    const next: Settings = { ...settings, opacity: op };
    setSettings(next);
    if (opacityTimer.current) clearTimeout(opacityTimer.current);
    opacityTimer.current = setTimeout(() => {
      saveSettings(next).catch((e) => setError(String(e)));
    }, 250);
  };

  return (
    <div className="panel">
      {/* 헤더를 잡고 드래그하면 창을 이동(멀티모니터 포함). data-tauri-drag-region = 네이티브 드래그 */}
      <header className="panel-head" data-tauri-drag-region>
        <span
          className="panel-title"
          onClick={() => void openHelp()}
          title="사용 설명서 열기"
        >
          TaskTray
        </span>
        {/* 순서: 투명도 > 환경설정 > 팝업 고정 */}
        <div className="head-tools">
          <input
            className="opacity-slider"
            type="range"
            min={30}
            max={100}
            value={opacityPct}
            title={`창 투명도 (${opacityPct}%)`}
            onChange={(e) => onOpacity(Number(e.target.value))}
          />
          <button className="gear-btn" onClick={() => void openSettings()} title="환경설정">
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
          <button
            className={"pin-btn" + (panelPinned ? " on" : "")}
            onClick={() => void togglePinPanel()}
            title={panelPinned ? "고정 해제 (바깥 클릭 시 닫힘)" : "항상 위 고정 (바깥 클릭해도 유지)"}
          >
            📌
          </button>
        </div>
      </header>

      {/* 헤더 아래 내용만 투명도 적용(헤더의 슬라이더·압정은 항상 또렷하게 유지) */}
      <div className="panel-content">
        {phase === "loading" && <div className="empty">불러오는 중…</div>}

        {phase === "error" && (
          <div className="banner banner-error">
            데이터를 불러오지 못했습니다.
            <div className="banner-sub">{error}</div>
          </div>
        )}

        {phase === "ready" && (
          <>
            {warning && <div className="banner banner-warn">{warning}</div>}
            {error && <div className="banner banner-error">{error}</div>}

            <QuickInput
              categories={categories}
              titleAutoParse={settings?.titleAutoParse ?? false}
              onAdd={addTask}
            />

            <div className="lists">
            {/* ② 오늘 할 일(Pin): 최상단 음영 (D-11) */}
            <section className="section pin-section">
              <div className="section-title" onClick={() => toggleSection("pin")}>
                <span className="caret">{collapsed.pin ? "▸" : "▾"}</span>
                오늘 할 일 · {pinned.length}건
              </div>
              {!collapsed.pin &&
                (pinned.length === 0 ? (
                  <div className="empty">별표(★)로 오늘 할 일을 지정하세요.</div>
                ) : (
                  pinned.map((t) => <TaskRow key={t.id} task={t} {...rowProps} />)
                ))}
            </section>

            {/* ③ 진행 중 */}
            <section className="section">
              <div className="section-title" onClick={() => toggleSection("active")}>
                <span className="caret">{collapsed.active ? "▸" : "▾"}</span>
                진행 중 · {active.length}건
              </div>
              {!collapsed.active &&
                (active.length === 0 ? (
                  <div className="empty">진행 중인 업무가 없습니다.</div>
                ) : (
                  active.map((t) => <TaskRow key={t.id} task={t} {...rowProps} />)
                ))}
            </section>

            {/* ④ flow 등록 대기(done) */}
            <section className="section">
              <div className="section-title" onClick={() => toggleSection("done")}>
                <span className="caret">{collapsed.done ? "▸" : "▾"}</span>
                flow 등록 대기 · {done.length}건
              </div>
              {!collapsed.done &&
                (done.length === 0 ? (
                  <div className="empty">완료 후 flow 등록 대기 목록이 여기 표시됩니다.</div>
                ) : (
                  done.map((t) => <TaskRow key={t.id} task={t} {...rowProps} />)
                ))}
            </section>
          </div>
          </>
        )}
      </div>

      {/* flow 처리 직후 실행취소 스낵바 (FR-11, D-12) */}
      {undoInfo && (
        <Snackbar
          message={undoInfo.message}
          onUndo={undoArchive}
          onDismiss={() => setUndoInfo(null)}
        />
      )}

      {/* 삭제 확인 (FR-06). 네이티브 다이얼로그 대신 패널 내부 오버레이로 포커스 유지 */}
      {pendingDelete && (
        <div className="overlay" onClick={() => setPendingDelete(null)}>
          <div className="confirm" onClick={(e) => e.stopPropagation()}>
            <div className="confirm-msg">
              이 업무를 삭제할까요?
              <div className="confirm-title">“{pendingDelete.title}”</div>
            </div>
            <div className="confirm-actions">
              <button className="btn danger" onClick={confirmDelete}>삭제</button>
              <button className="btn ghost" onClick={() => setPendingDelete(null)}>취소</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
