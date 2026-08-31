// 개인 메모 창 (D-24, 데스크톱 전용). 별도 창이라 바깥 클릭/패널 숨김에도 닫히지 않고 창 X 로만 닫힌다.
//
// 흐름: 비밀번호 게이트(클라우드 이메일 비밀번호 → Supabase 검증) → 편집기 → 자동 저장(암호화).
// 저장 절차 없이 입력되는 대로 디바운스 저장(스티커 메모). 파일은 암호화되어 저장된다.

import { useEffect, useRef, useState } from "react";
import { readMemo, saveMemo } from "../api";
import { supabase, supabaseConfigured } from "../supabase";
import { decryptMemo, encryptMemo } from "../memo/crypto";

type Phase = "loading" | "login-required" | "auth" | "editing" | "decrypt-error";
type SaveState = "idle" | "saving" | "saved";

export default function Memo() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [email, setEmail] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
        setText("");
        setPhase("editing");
        return;
      }
      try {
        setText(await decryptMemo(raw, email));
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

  // 입력되는 대로 디바운스 암호화 저장(별도 저장 버튼 없음)
  const onChange = (value: string) => {
    setText(value);
    setSaveState("saving");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void persist(value);
    }, 400);
  };

  const persist = async (value: string) => {
    if (!email) return;
    try {
      const enc = await encryptMemo(value, email);
      await saveMemo(enc);
      setSaveState("saved");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSaveState("idle");
    }
  };

  // 복호화 실패(계정 비밀번호 변경 등) → 새 메모로 초기화(기존 내용은 안전을 위해 자동 덮어쓰지 않음)
  const resetMemo = () => {
    setText("");
    setPhase("editing");
    setError(null);
    void persist("");
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
  return (
    <div className="memo-page">
      <div className="memo-bar">
        <span className="memo-bar-title">개인 메모</span>
        <span className="memo-save">
          {saveState === "saving" ? "저장 중…" : saveState === "saved" ? "저장됨" : ""}
        </span>
      </div>
      <textarea
        className="memo-area"
        value={text}
        placeholder="여기에 자유롭게 메모하세요. 입력하는 대로 자동 저장됩니다."
        autoFocus
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
