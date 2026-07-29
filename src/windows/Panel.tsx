// 메인 패널 (트레이 좌클릭 시 우측 하단 표시).
// M2: tasks 로드 후 영역별 건수 표시. 저장 위치는 앱이 자동 관리(%APPDATA%\TaskTray, D-08).
// 실제 Task 입력/목록/CRUD 는 M3, flow 처리는 M4.

import { useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { loadTasks, type Task } from "../api";

type Phase = "loading" | "ready" | "error";

export default function Panel() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [warning, setWarning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const bootstrapped = useRef(false);
  const ready = useRef(false);

  // tasks.json 을 다시 읽어 상태에 반영한다. (외부 편집/타 PC 파일 반영: FR-22, DR-02)
  const reloadTasks = async () => {
    try {
      const load = await loadTasks();
      setTasks(load.file.tasks);
      setWarning(load.message ?? null); // 손상 복구 등 알림 (DR-04)
    } catch (e) {
      setError(String(e));
      setPhase("error");
    }
  };

  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;

    (async () => {
      await reloadTasks();
      setPhase("ready");
      ready.current = true;
    })();
  }, []);

  // 패널이 다시 열려(포커스) 표시될 때마다 최신 tasks.json 을 반영한다.
  // 트레이 앱은 창을 숨겼다 보여도 웹뷰가 재시작되지 않으므로, 포커스 시 재로드가 필요하다.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    getCurrentWindow()
      .onFocusChanged(({ payload: focused }) => {
        if (focused && ready.current) void reloadTasks();
      })
      .then((u) => {
        unlisten = u;
      });
    return () => unlisten?.();
  }, []);

  // 기본 화면 집계 대상: 삭제되지 않은 Task (archived 는 기본 화면에서 숨김)
  const visible = tasks.filter((t) => !t.deleted);
  const pinnedCount = visible.filter((t) => t.pinned && t.status === "active").length;
  const activeCount = visible.filter((t) => t.status === "active").length;
  const doneCount = visible.filter((t) => t.status === "done").length;

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

          {/* ① 빠른 입력창 (M3에서 등록 기능 연결) */}
          <div className="quick-input">
            <input type="text" placeholder="업무를 입력하고 Enter (M3 예정)" disabled />
          </div>

          {/* ②~④ 영역별 건수 (실제 목록은 M3/M4) */}
          <section className="section">
            <div className="section-title">오늘 할 일 · {pinnedCount}건</div>
            <div className="empty">목록 표시는 M3에서 구현됩니다.</div>
          </section>
          <section className="section">
            <div className="section-title">진행 중 · {activeCount}건</div>
            <div className="empty">목록 표시는 M3에서 구현됩니다.</div>
          </section>
          <section className="section">
            <div className="section-title">flow 등록 대기 · {doneCount}건</div>
            <div className="empty">목록 표시는 M4에서 구현됩니다.</div>
          </section>
        </>
      )}
    </div>
  );
}
