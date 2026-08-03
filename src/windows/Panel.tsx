// 메인 패널 (트레이 좌클릭). M3: Task 등록/수정/삭제/완료/Pin + 3영역 목록·정렬 (FR-01~12).
// M4: done → flow 등록완료/제외 → archived 숨김 + 즉시 실행취소 스낵바 (FR-10/11, §3.2).
// 저장 위치는 앱 자동 관리(D-08). archived 상시 종료취소·로우데이터·리포트는 M5.

import { useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  getSettings,
  loadTasks,
  saveTasks,
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
} from "../tasks";
import QuickInput from "../components/QuickInput";
import TaskRow from "../components/TaskRow";
import Snackbar from "../components/Snackbar";

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

  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;
    (async () => {
      try {
        setSettings(await getSettings());
      } catch {
        /* 설정 로드 실패 시 기본 동작 유지 */
      }
      await reload();
      setPhase("ready");
      ready.current = true;
    })();
  }, []);

  // 패널이 다시 열릴(포커스) 때 최신 tasks.json 반영 + 설정(제목 자동분리) 갱신
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    getCurrentWindow()
      .onFocusChanged(({ payload: focused }) => {
        if (focused && ready.current) {
          void reload();
          getSettings().then(setSettings).catch(() => {});
        }
      })
      .then((u) => (unlisten = u));
    return () => unlisten?.();
  }, []);

  // 변경분을 상태에 반영하고 즉시 저장 (DR-02)
  const commit = (next: Task[]) => {
    setTasks(next);
    saveTasks({ schemaVersion, tasks: next }).catch((e) => setError(String(e)));
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
        ? { ...task, status: "done", completedAt: nowKst() } // 완료 (FR-09)
        : { ...task, status: "active", completedAt: null }; // 완료 취소 (FR-11)
    commit(replaceTask(tasks, updated));
  };

  const togglePin = (task: Task) => {
    commit(replaceTask(tasks, { ...task, pinned: !task.pinned })); // FR-08
  };

  const editTask = (
    task: Task,
    patch: { title: string; category: string | null; dueDate: string | null },
  ) => {
    commit(replaceTask(tasks, { ...task, ...patch })); // FR-05
  };

  const confirmDelete = () => {
    if (!pendingDelete) return;
    // soft delete (FR-06): deleted=true, deletedAt 기록
    commit(
      replaceTask(tasks, { ...pendingDelete, deleted: true, deletedAt: nowKst() }),
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

  const rowProps = {
    onToggleComplete: toggleComplete,
    onTogglePin: togglePin,
    onEdit: editTask,
    onDelete: (t: Task) => setPendingDelete(t),
    onFlow: processFlow,
  };

  const toggleSection = (key: keyof typeof collapsed) =>
    setCollapsed((c) => ({ ...c, [key]: !c[key] }));

  return (
    <div className="panel">
      <header className="panel-head">
        <span className="panel-title">TaskTray</span>
      </header>

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
