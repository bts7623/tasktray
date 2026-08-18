// 사용자 피드백 제출 폼 (D-23). 데스크톱 환경설정 하단 + 웹 메뉴에서 공용 사용.
// 로그인 사용자만 제출 가능. 오늘 남은 횟수 표시(서버 하루 5건 제한). 관리자면 [피드백 관리] 노출.

import { useEffect, useState } from "react";
import { supabase } from "../supabase";
import {
  DAILY_LIMIT,
  FEEDBACK_KINDS,
  feedbackLeftToday,
  isCurrentUserAdmin,
  submitFeedback,
  type FeedbackKind,
} from "./feedback";

export default function FeedbackForm({
  platform,
  appVersion,
  onOpenAdmin,
}: {
  platform: string;
  appVersion: string | null;
  onOpenAdmin: () => void;
}) {
  const [loggedIn, setLoggedIn] = useState(false);
  const [admin, setAdmin] = useState(false);
  const [kind, setKind] = useState<FeedbackKind>("제안");
  const [message, setMessage] = useState("");
  const [left, setLeft] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const refresh = () => {
    void isCurrentUserAdmin().then(setAdmin);
    void feedbackLeftToday().then(setLeft);
  };

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      const yes = !!data.session;
      setLoggedIn(yes);
      if (yes) refresh();
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      const yes = !!session;
      setLoggedIn(yes);
      if (yes) refresh();
      else {
        setAdmin(false);
        setLeft(null);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const send = async () => {
    if (!message.trim()) return;
    setBusy(true);
    setErr(null);
    setOk(null);
    try {
      await submitFeedback(kind, message, platform, appVersion);
      setMessage("");
      setOk("피드백을 보냈습니다. 감사합니다!");
      void feedbackLeftToday().then(setLeft);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const noneLeft = left !== null && left <= 0;

  return (
    <section className="setting-group">
      <div className="setting-label">사용자 피드백</div>

      {!loggedIn ? (
        <p className="setting-desc">로그인 후 이용할 수 있습니다. (위 클라우드 동기화에서 로그인)</p>
      ) : (
        <>
          <p className="setting-desc">
            버그·개선 제안을 보내주세요. 하루 {DAILY_LIMIT}건까지
            {left !== null && <> · 오늘 {left}건 남음</>}
          </p>
          <div className="fb-form">
            <div className="fb-kinds">
              {FEEDBACK_KINDS.map((k) => (
                <button
                  key={k}
                  type="button"
                  className={"btn-sm" + (kind === k ? "" : " ghost")}
                  onClick={() => setKind(k)}
                >
                  {k}
                </button>
              ))}
            </div>
            <textarea
              className="fb-text"
              rows={3}
              placeholder="내용을 입력하세요"
              value={message}
              maxLength={4000}
              onChange={(e) => setMessage(e.target.value)}
            />
            <div className="fb-actions">
              <button
                className="btn"
                onClick={() => void send()}
                disabled={busy || noneLeft || !message.trim()}
              >
                {busy ? "보내는 중…" : "보내기"}
              </button>
              {admin && (
                <button className="btn-sm ghost" onClick={onOpenAdmin}>
                  피드백 관리
                </button>
              )}
            </div>
          </div>
          {ok && <div className="sync-msg ok">{ok}</div>}
          {err && <div className="sync-msg err">{err}</div>}
        </>
      )}
    </section>
  );
}
