// 웹/PWA 진입점 (모바일·브라우저). 데스크톱의 트레이 패널 대신 전체화면 반응형 화면.
// 로그인(Supabase) 게이트 → 데이터는 클라우드에서 직접 읽고 쓴다.

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase, supabaseConfigured } from "../supabase";
import { cloudLoad, cloudUpsert } from "./cloud";
import {
  activeTasks,
  archiveTask,
  collectCategories,
  createTask,
  doneTasks,
  pinnedTasks,
  replaceTask,
  resolveTitleCategory,
  restoreToDone,
  touch,
} from "../tasks";
import type { Task } from "../api";
import QuickInput from "../components/QuickInput";
import TaskRow from "../components/TaskRow";
import Snackbar from "../components/Snackbar";
import FeedbackForm from "../feedback/FeedbackForm";
import FeedbackAdmin from "../feedback/FeedbackAdmin";
import { APP_VERSION } from "../version";

export default function WebApp() {
  const [session, setSession] = useState<Session | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (!supabase) {
      setChecking(false);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setChecking(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!supabaseConfigured) {
    return (
      <div className="webapp center">
        <div className="web-card">
          <h1>TaskTray</h1>
          <p className="empty">서버 설정(VITE_SUPABASE_*)이 없습니다. 배포 환경변수를 확인하세요.</p>
        </div>
      </div>
    );
  }
  if (checking) return <div className="webapp center">불러오는 중…</div>;
  if (!session) return <Login />;
  return <Board session={session} />;
}

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!supabase) return;
    setError(null);
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="webapp center">
      <div className="web-card">
        <h1>TaskTray</h1>
        <p className="empty">로그인</p>
        <input
          type="email"
          placeholder="이메일"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          type="password"
          placeholder="비밀번호"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void submit();
          }}
        />
        <button className="btn primary" onClick={() => void submit()} disabled={busy}>
          {busy ? "로그인 중…" : "로그인"}
        </button>
        {error && <div className="sync-msg err">{error}</div>}
      </div>
    </div>
  );
}

const CAT_COLORS_KEY = "categoryColors";
function loadCatColors(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(CAT_COLORS_KEY) || "{}");
  } catch {
    return {};
  }
}

function Board({ session }: { session: Session }) {
  const userId = session.user.id;
  const [tasks, setTasks] = useState<Task[]>([]);
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Task | null>(null);
  const [undoInfo, setUndoInfo] = useState<{ prev: Task; message: string } | null>(null);
  const [collapsed, setCollapsed] = useState({ pin: false, active: false, done: false });
  const [categoryColors, setCategoryColors] = useState<Record<string, string>>(loadCatColors());
  const [showFeedback, setShowFeedback] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);

  // silent=true 면 실패해도 화면을 깨지 않음(백그라운드 자동 갱신용)
  const reload = async (silent = false) => {
    try {
      setTasks(await cloudLoad());
      setPhase("ready");
    } catch (e) {
      if (!silent) {
        setError(String(e));
        setPhase("error");
      }
    }
  };
  useEffect(() => {
    void reload();
  }, []);

  // 자동 갱신: 짧은 주기 폴링 + 앱 복귀 시 즉시(iOS PWA 포함) + Supabase Realtime.
  useEffect(() => {
    const refresh = () => void reload(true);
    // 8초 주기(무조건). iOS 는 백그라운드에서 타이머가 멈추므로 아래 복귀 이벤트로 보강.
    const iv = setInterval(refresh, 8000);
    // 앱/탭 복귀 시 즉시 갱신 — iOS 홈화면 PWA 는 pageshow 가 특히 잘 뜬다.
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", refresh);
    window.addEventListener("pageshow", refresh);

    let channel: ReturnType<NonNullable<typeof supabase>["channel"]> | undefined;
    if (supabase) {
      channel = supabase
        .channel("tasks-changes")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "tasks" },
          () => void reload(true),
        )
        .subscribe();
    }
    return () => {
      clearInterval(iv);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("pageshow", refresh);
      if (channel && supabase) void supabase.removeChannel(channel);
    };
  }, []);

  // 낙관적 반영 + 클라우드 저장
  const push = (updated: Task, next: Task[]) => {
    setTasks(next);
    cloudUpsert(updated, userId).catch((e) => setError(String(e)));
  };

  const addTask = (rawTitle: string, rawCategory: string | null, dueDate: string | null) => {
    const { title, category } = resolveTitleCategory(rawTitle, rawCategory, false);
    if (title === "") return;
    const t = createTask(title, category, dueDate);
    push(t, [...tasks, t]);
  };
  const toggleComplete = (task: Task) => {
    const u =
      task.status === "active"
        ? touch({ ...task, status: "done", completedAt: nowIso() })
        : touch({ ...task, status: "active", completedAt: null });
    push(u, replaceTask(tasks, u));
  };
  const togglePin = (task: Task) => {
    const u = touch({ ...task, pinned: !task.pinned });
    push(u, replaceTask(tasks, u));
  };
  const editTask = (
    task: Task,
    patch: { title: string; category: string | null; dueDate: string | null },
  ) => {
    const u = touch({ ...task, ...patch });
    push(u, replaceTask(tasks, u));
  };
  const confirmDelete = () => {
    if (!pendingDelete) return;
    const u = touch({ ...pendingDelete, deleted: true, deletedAt: nowIso() });
    push(u, replaceTask(tasks, u));
    setPendingDelete(null);
  };
  const processFlow = (task: Task, flow: "registered" | "excluded") => {
    const u = archiveTask(task, flow);
    push(u, replaceTask(tasks, u));
    setUndoInfo({ prev: task, message: flow === "registered" ? "flow 등록 완료로 종료됨" : "실적 제외로 종료됨" });
  };
  const undoArchive = () => {
    if (!undoInfo) return;
    const u = restoreToDone(undoInfo.prev);
    push(u, replaceTask(tasks, u));
    setUndoInfo(null);
  };
  const onCategoryColor = (major: string, hex: string) => {
    const next = { ...categoryColors, [major]: hex };
    setCategoryColors(next);
    localStorage.setItem(CAT_COLORS_KEY, JSON.stringify(next));
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
    categoryColors,
    onCategoryColor,
  };
  const toggleSection = (k: keyof typeof collapsed) =>
    setCollapsed((c) => ({ ...c, [k]: !c[k] }));

  return (
    <div className="webapp">
      <header className="web-head">
        <span className="panel-title">TaskTray</span>
        <div className="inline">
          <button className="btn-sm ghost" onClick={() => setShowFeedback(true)}>
            피드백
          </button>
          <button className="btn-sm ghost" onClick={() => void supabase?.auth.signOut()}>
            로그아웃
          </button>
        </div>
      </header>

      <div className="web-body">
        {phase === "error" && <div className="banner banner-error">{error}</div>}
        {error && phase === "ready" && <div className="banner banner-error">{error}</div>}

        <QuickInput categories={categories} titleAutoParse={false} onAdd={addTask} />

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

      {showFeedback && (
        <div className="overlay" onClick={() => setShowFeedback(false)}>
          <div className="web-card fb-modal" onClick={(e) => e.stopPropagation()}>
            <div className="fb-modal-head">
              <button className="btn-sm ghost" onClick={() => setShowFeedback(false)}>
                닫기
              </button>
            </div>
            <FeedbackForm
              platform="web"
              appVersion={APP_VERSION}
              onOpenAdmin={() => {
                setShowFeedback(false);
                setShowAdmin(true);
              }}
            />
          </div>
        </div>
      )}
      {showAdmin && (
        <div className="overlay" onClick={() => setShowAdmin(false)}>
          <div className="web-admin" onClick={(e) => e.stopPropagation()}>
            <FeedbackAdmin onClose={() => setShowAdmin(false)} />
          </div>
        </div>
      )}

      {undoInfo && (
        <Snackbar message={undoInfo.message} onUndo={undoArchive} onDismiss={() => setUndoInfo(null)} />
      )}
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

// 웹에서도 KST 고정 시각 사용(데스크톱과 형식 일치)
function nowIso(): string {
  const d = new Date(Date.now() + 9 * 3600 * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}` +
    `T${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}+09:00`
  );
}
