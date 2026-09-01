// 개인 메모 창 (D-24 → D-26 탭 지원, 데스크톱 전용). 별도 창이라 바깥 클릭/패널 숨김에도
// 닫히지 않고 창 X 로만 닫힌다.
//
// 흐름: 비밀번호 게이트(클라우드 이메일 비밀번호 → Supabase 검증) → 편집기 → 자동 저장(암호화).
// 여러 개의 메모를 상단 가로 탭으로 관리(추가/이름변경(더블클릭)/삭제(확인)). 파일은 하나(memo.enc)에
// 전체 구조(JSON)를 통째로 암호화해 저장한다.

import { useEffect, useRef, useState } from "react";
import { readMemo, saveMemo } from "../api";
import { supabase, supabaseConfigured } from "../supabase";
import { decryptMemo, encryptMemo } from "../memo/crypto";

type Phase = "loading" | "login-required" | "auth" | "editing" | "decrypt-error";
type SaveState = "idle" | "saving" | "saved";

interface MemoTab {
  id: string;
  name: string;
  body: string;
}
interface MemoDoc {
  v: 2;
  activeId: string;
  memos: MemoTab[];
}

function newTab(name: string, body = ""): MemoTab {
  return { id: crypto.randomUUID(), name, body };
}

function freshDoc(): MemoDoc {
  const t = newTab("메모 1");
  return { v: 2, activeId: t.id, memos: [t] };
}

/** 복호화된 문자열을 MemoDoc 으로 해석. 옛 단일 메모(평문)는 탭 하나로 변환(마이그레이션). */
function parseDoc(text: string): MemoDoc {
  try {
    const j = JSON.parse(text) as Partial<MemoDoc> & { memos?: unknown };
    if (j && j.v === 2 && Array.isArray(j.memos) && j.memos.length > 0) {
      const memos: MemoTab[] = (j.memos as MemoTab[]).map((m) => ({
        id: typeof m.id === "string" ? m.id : crypto.randomUUID(),
        name: typeof m.name === "string" ? m.name : "메모",
        body: typeof m.body === "string" ? m.body : "",
      }));
      const activeId = memos.some((m) => m.id === j.activeId) ? (j.activeId as string) : memos[0].id;
      return { v: 2, activeId, memos };
    }
  } catch {
    /* 옛 형식(평문 단일 메모) */
  }
  const t = newTab("메모 1", text ?? "");
  return { v: 2, activeId: t.id, memos: [t] };
}

export default function Memo() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [email, setEmail] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doc, setDoc] = useState<MemoDoc>(freshDoc);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragId = useRef<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  // 시작: 로그인 세션 확인 → 이메일 확보(없으면 로그인 안내)
  useEffect(() => {
    if (!supabaseConfigured || !supabase) {
      setPhase("login-required");
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      const mail = data.session?.user.email ?? null;
      if (!mail) {
        setPhase("login-required");
      } else {
        setEmail(mail);
        setPhase("auth");
      }
    });
  }, []);

  // 비밀번호 검증 후 메모 로드
  const unlock = async () => {
    if (!supabase || !email) return;
    setBusy(true);
    setError(null);
    try {
      const { error: authErr } = await supabase.auth.signInWithPassword({ email, password });
      if (authErr) {
        setError("비밀번호가 올바르지 않습니다.");
        return;
      }
      setPassword("");
      const raw = await readMemo();
      if (!raw) {
        setDoc(freshDoc());
        setPhase("editing");
        return;
      }
      try {
        setDoc(parseDoc(await decryptMemo(raw, email)));
        setPhase("editing");
      } catch {
        setPhase("decrypt-error");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const persist = async (next: MemoDoc) => {
    if (!email) return;
    try {
      await saveMemo(await encryptMemo(JSON.stringify(next), email));
      setSaveState("saved");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSaveState("idle");
    }
  };

  // 상태 반영 + 저장(구조 변경은 즉시, 본문 입력은 디바운스)
  const commitDoc = (next: MemoDoc, immediate = false) => {
    setDoc(next);
    setSaveState("saving");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    if (immediate) {
      void persist(next);
    } else {
      saveTimer.current = setTimeout(() => void persist(next), 400);
    }
  };

  const active = doc.memos.find((m) => m.id === doc.activeId) ?? doc.memos[0];

  const onBody = (value: string) => {
    commitDoc({
      ...doc,
      memos: doc.memos.map((m) => (m.id === active.id ? { ...m, body: value } : m)),
    });
  };

  const setActive = (id: string) => {
    if (id === doc.activeId) return;
    commitDoc({ ...doc, activeId: id }, true);
  };

  const addTab = () => {
    const t = newTab(`메모 ${doc.memos.length + 1}`);
    commitDoc({ ...doc, memos: [...doc.memos, t], activeId: t.id }, true);
  };

  const startRename = (tab: MemoTab) => {
    setRenamingId(tab.id);
    setRenameValue(tab.name);
  };
  const commitRename = () => {
    if (!renamingId) return;
    const name = renameValue.trim() || "메모";
    commitDoc(
      { ...doc, memos: doc.memos.map((m) => (m.id === renamingId ? { ...m, name } : m)) },
      true,
    );
    setRenamingId(null);
  };

  // 드래그 앤 드롭으로 탭 순서 변경
  const reorder = (fromId: string, toId: string) => {
    if (fromId === toId) return;
    const arr = [...doc.memos];
    const from = arr.findIndex((m) => m.id === fromId);
    const to = arr.findIndex((m) => m.id === toId);
    if (from < 0 || to < 0) return;
    const [moved] = arr.splice(from, 1);
    arr.splice(to, 0, moved);
    commitDoc({ ...doc, memos: arr }, true);
  };

  const confirmDelete = () => {
    if (!pendingDeleteId) return;
    const remain = doc.memos.filter((m) => m.id !== pendingDeleteId);
    const memos = remain.length > 0 ? remain : [newTab("메모 1")];
    const activeId = memos.some((m) => m.id === doc.activeId) ? doc.activeId : memos[0].id;
    commitDoc({ ...doc, memos, activeId }, true);
    setPendingDeleteId(null);
  };

  // 복호화 실패(계정 비밀번호 변경 등) → 새 메모로 초기화(기존 내용은 안전을 위해 자동 덮어쓰지 않음)
  const resetMemo = () => {
    const fresh = freshDoc();
    setDoc(fresh);
    setPhase("editing");
    setError(null);
    void persist(fresh);
  };

  if (phase === "loading") {
    return <div className="memo-page center">불러오는 중…</div>;
  }

  if (phase === "login-required") {
    return (
      <div className="memo-page center">
        <div className="memo-msg">
          개인 메모는 클라우드 로그인 후 이용할 수 있습니다.
          <div className="memo-sub">패널 → 환경설정 → 클라우드 동기화에서 로그인하세요.</div>
        </div>
      </div>
    );
  }

  if (phase === "auth") {
    return (
      <div className="memo-page center">
        <div className="memo-gate">
          <div className="memo-gate-title">🔒 개인 메모</div>
          <div className="memo-sub">{email} 계정 비밀번호를 입력하세요.</div>
          <input
            type="password"
            placeholder="비밀번호"
            value={password}
            autoFocus
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void unlock();
            }}
          />
          <button className="btn" onClick={() => void unlock()} disabled={busy || !password}>
            {busy ? "확인 중…" : "열기"}
          </button>
          {error && <div className="sync-msg err">{error}</div>}
        </div>
      </div>
    );
  }

  if (phase === "decrypt-error") {
    return (
      <div className="memo-page center">
        <div className="memo-msg">
          이 비밀번호로 메모를 복호화할 수 없습니다.
          <div className="memo-sub">계정 비밀번호를 변경하셨거나 파일이 손상되었을 수 있습니다.</div>
          <button className="btn danger" onClick={resetMemo}>
            새 메모로 초기화
          </button>
        </div>
      </div>
    );
  }

  // editing
  const pendingTab = doc.memos.find((m) => m.id === pendingDeleteId);
  return (
    <div className="memo-page">
      <div className="memo-tabs">
        {doc.memos.map((tab) =>
          renamingId === tab.id ? (
            <input
              key={tab.id}
              className="memo-tabname-input"
              value={renameValue}
              autoFocus
              onChange={(e) => setRenameValue(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitRename();
                else if (e.key === "Escape") setRenamingId(null);
              }}
            />
          ) : (
            <div
              key={tab.id}
              className={
                "memo-tab" +
                (tab.id === doc.activeId ? " active" : "") +
                (dragOverId === tab.id ? " drag-over" : "")
              }
              draggable
              onClick={() => setActive(tab.id)}
              onDoubleClick={() => startRename(tab)}
              onDragStart={(e) => {
                dragId.current = tab.id;
                e.dataTransfer.effectAllowed = "move";
                // 일부 WebView 는 setData 가 없으면 드래그가 시작되지 않는다.
                e.dataTransfer.setData("text/plain", tab.id);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                if (dragId.current && dragOverId !== tab.id) setDragOverId(tab.id);
              }}
              onDragLeave={() => {
                if (dragOverId === tab.id) setDragOverId(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragId.current) reorder(dragId.current, tab.id);
                dragId.current = null;
                setDragOverId(null);
              }}
              onDragEnd={() => {
                dragId.current = null;
                setDragOverId(null);
              }}
              title="더블클릭하여 이름 변경 · 드래그하여 순서 변경"
            >
              <span className="memo-tab-name">{tab.name}</span>
              <button
                className="memo-tab-close"
                title="탭 삭제"
                onClick={(e) => {
                  e.stopPropagation();
                  setPendingDeleteId(tab.id);
                }}
              >
                ×
              </button>
            </div>
          ),
        )}
        <button className="memo-tab-add" title="새 메모 추가" onClick={addTab}>
          ＋
        </button>
      </div>

      <div className="memo-status">
        {saveState === "saving" ? "저장 중…" : saveState === "saved" ? "저장됨" : ""}
      </div>

      <textarea
        className="memo-area"
        value={active.body}
        placeholder="여기에 자유롭게 메모하세요. 입력하는 대로 자동 저장됩니다."
        autoFocus
        onChange={(e) => onBody(e.target.value)}
      />

      {error && <div className="sync-msg err">{error}</div>}

      {pendingTab && (
        <div className="overlay" onClick={() => setPendingDeleteId(null)}>
          <div className="confirm" onClick={(e) => e.stopPropagation()}>
            <div className="confirm-msg">
              이 메모 탭을 삭제할까요?
              <div className="confirm-title">“{pendingTab.name}”</div>
            </div>
            <div className="confirm-actions">
              <button className="btn danger" onClick={confirmDelete}>
                삭제
              </button>
              <button className="btn ghost" onClick={() => setPendingDeleteId(null)}>
                취소
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
