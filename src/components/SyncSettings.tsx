// 환경설정의 '클라우드 동기화' 섹션. 이메일/비밀번호 로그인 + 수동 동기화. (D-22)

import { useEffect, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { supabase, supabaseConfigured } from "../supabase";
import { syncNow } from "../sync/sync";

const WEB_URL = "https://tasktray.vercel.app";

export default function SyncSettings() {
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setUserEmail(data.session?.user.email ?? null);
      setUserId(data.session?.user.id ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUserEmail(session?.user.email ?? null);
      setUserId(session?.user.id ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!supabaseConfigured || !supabase) {
    return (
      <section className="setting-group">
        <div className="setting-label">클라우드 동기화</div>
        <p className="setting-desc">
          `.env.local` 에 Supabase URL·키가 설정되지 않았습니다. 설정 후 앱을 다시 시작하세요.
        </p>
      </section>
    );
  }

  const sb = supabase; // 위 가드 이후 non-null

  const login = async () => {
    setError(null);
    setMessage(null);
    setBusy(true);
    try {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw error;
      setPassword("");
      setMessage("로그인되었습니다.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    await sb.auth.signOut();
    setMessage(null);
    setError(null);
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(WEB_URL);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* 클립보드 접근 실패는 무시 */
    }
  };
  const openLink = () => {
    void openUrl(WEB_URL).catch(() => {});
  };

  const doSync = async () => {
    if (!userId) return;
    setError(null);
    setMessage(null);
    setBusy(true);
    try {
      const r = await syncNow(userId);
      setMessage(`동기화 완료 · 받음 ${r.pulled} / 올림 ${r.pushed}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="setting-group">
      <div className="setting-label">클라우드 동기화</div>

      <div className="sync-weblink">
        <span className="sync-weblink-desc">웹·모바일 접속 주소 (폰에서 열어 홈 화면에 추가)</span>
        <div className="sync-weblink-row">
          <code className="sync-weblink-url">{WEB_URL}</code>
          <button className="btn-sm" onClick={openLink}>
            열기
          </button>
          <button className="btn-sm ghost" onClick={() => void copyLink()}>
            {copied ? "복사됨" : "복사"}
          </button>
        </div>
      </div>

      {userEmail ? (
        <>
          <p className="setting-desc">
            로그인됨: <b>{userEmail}</b>
          </p>
          <div className="inline">
            <button className="btn" onClick={() => void doSync()} disabled={busy}>
              {busy ? "동기화 중…" : "지금 동기화"}
            </button>
            <button className="btn-sm ghost" onClick={() => void logout()} disabled={busy}>
              로그아웃
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="setting-desc">Supabase 계정으로 로그인하면 다기기(모바일 포함)와 동기화됩니다.</p>
          <div className="sync-login">
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
                if (e.key === "Enter") void login();
              }}
            />
            <button className="btn" onClick={() => void login()} disabled={busy}>
              {busy ? "…" : "로그인"}
            </button>
          </div>
        </>
      )}

      {message && <div className="sync-msg ok">{message}</div>}
      {error && <div className="sync-msg err">{error}</div>}
    </section>
  );
}
