// 관리자용 피드백 열람 화면 (D-23). 데스크톱 별도 창 + 웹 오버레이 공용.
// admins 에 등록된 사용자만 RLS 로 데이터가 조회된다(비관리자는 빈 목록).

import { useEffect, useState } from "react";
import { supabase } from "../supabase";
import { loadAllFeedback, setFeedbackStatus, type FeedbackItem } from "./feedback";

type Filter = "all" | "open" | "done";

function fmt(iso: string): string {
  // 저장은 UTC(timestamptz). KST 로 표시.
  const d = new Date(iso);
  const k = new Date(d.getTime() + 9 * 3600 * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${k.getUTCFullYear()}-${p(k.getUTCMonth() + 1)}-${p(k.getUTCDate())} ${p(k.getUTCHours())}:${p(k.getUTCMinutes())}`;
}

export default function FeedbackAdmin({ onClose }: { onClose?: () => void }) {
  const [items, setItems] = useState<FeedbackItem[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");

  const load = () => {
    loadAllFeedback()
      .then(setItems)
      .catch((e) => setErr(String(e)));
  };

  useEffect(() => {
    load();
    // 실시간 갱신(선택): feedback 테이블 변경 시 재조회
    const sb = supabase;
    if (!sb) return;
    const ch = sb
      .channel("feedback-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "feedback" }, () => load())
      .subscribe();
    return () => {
      void sb.removeChannel(ch);
    };
  }, []);

  const toggle = async (it: FeedbackItem) => {
    try {
      await setFeedbackStatus(it.id, it.status === "done" ? "open" : "done");
      load();
    } catch (e) {
      setErr(String(e));
    }
  };

  const shown = (items ?? []).filter((it) => filter === "all" || it.status === filter);
  const openCount = (items ?? []).filter((it) => it.status !== "done").length;

  return (
    <div className="page feedback-admin">
      <div className="fb-admin-head">
        <h1>피드백 관리{items ? ` · 미처리 ${openCount}건` : ""}</h1>
        <div className="inline">
          <div className="preset-group">
            {(["all", "open", "done"] as Filter[]).map((f) => (
              <button
                key={f}
                className={"btn-sm" + (filter === f ? "" : " ghost")}
                onClick={() => setFilter(f)}
              >
                {f === "all" ? "전체" : f === "open" ? "미처리" : "처리됨"}
              </button>
            ))}
          </div>
          <button className="btn-sm" onClick={load}>
            새로고침
          </button>
          {onClose && (
            <button className="btn-sm ghost" onClick={onClose}>
              닫기
            </button>
          )}
        </div>
      </div>

      {err && <div className="banner banner-error">{err}</div>}
      {!items ? (
        <p className="empty">불러오는 중…</p>
      ) : shown.length === 0 ? (
        <p className="empty">표시할 피드백이 없습니다.</p>
      ) : (
        <div className="fb-table-wrap">
          <table className="fb-table">
            <thead>
              <tr>
                <th>일시</th>
                <th>유형</th>
                <th>내용</th>
                <th>작성자</th>
                <th>버전</th>
                <th>상태</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((it) => (
                <tr key={it.id} className={it.status === "done" ? "fb-done" : ""}>
                  <td className="fb-when">{fmt(it.createdAt)}</td>
                  <td>{it.kind}</td>
                  <td className="fb-msg">{it.message}</td>
                  <td className="fb-who">{it.userEmail ?? it.userId.slice(0, 8)}</td>
                  <td className="fb-ver">
                    {it.appVersion ?? "-"}
                    {it.platform ? ` · ${it.platform}` : ""}
                  </td>
                  <td>
                    <button
                      className={"btn-sm" + (it.status === "done" ? " ghost" : "")}
                      onClick={() => void toggle(it)}
                    >
                      {it.status === "done" ? "처리됨" : "미처리"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
