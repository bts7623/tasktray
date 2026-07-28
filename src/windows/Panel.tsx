// 메인 패널 (트레이 좌클릭 시 우측 하단 표시).
// M2: 최초 실행 시 저장 폴더 지정(D-05) + tasks 로드 후 영역별 건수 표시.
// 실제 Task 입력/목록/CRUD 는 M3, flow 처리는 M4.

import { useEffect, useRef, useState } from "react";
import {
  chooseDataFolder,
  getSettings,
  initData,
  loadTasks,
  type Settings,
  type Task,
} from "../api";

type Phase = "loading" | "ready" | "error";

export default function Panel() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [settings, setSettings] = useState<Settings | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [warning, setWarning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // React StrictMode(개발 모드)의 이펙트 2회 실행으로 폴더 다이얼로그가 중복 열리는 것 방지
  const bootstrapped = useRef(false);

  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;

    (async () => {
      try {
        let s = await getSettings();

        // 최초 실행: 저장 폴더가 없으면 즉시 폴더 선택 다이얼로그, 취소 시 기본 경로 (D-05)
        if (!s.dataPath) {
          const picked = await chooseDataFolder();
          s = await initData(picked); // picked 가 null 이면 기본 경로 사용
        }
        setSettings(s);

        const load = await loadTasks();
        setTasks(load.file.tasks);
        if (load.message) setWarning(load.message); // 손상 복구 등 알림 (DR-04)
        setPhase("ready");
      } catch (e) {
        setError(String(e));
        setPhase("error");
      }
    })();
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

          {/* 저장 경로 표시(검증용) */}
          {settings?.dataPath && (
            <div className="datapath" title={settings.dataPath}>
              저장 위치: {settings.dataPath}
            </div>
          )}

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
