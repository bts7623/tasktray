// 사용자 피드백 데이터 계층 (D-23). Supabase 재사용.
// 보안은 RLS 가 담당: 일반 사용자는 INSERT(자기 것)만, 관리자(admins)만 전체 SELECT/UPDATE.
// 하루 제한(5건)은 서버 트리거로 강제되고, 여기서는 화면 표시용 남은 횟수만 조회한다.

import { supabase } from "../supabase";

export type FeedbackKind = "버그" | "제안" | "기타";
export const FEEDBACK_KINDS: FeedbackKind[] = ["버그", "제안", "기타"];
export const DAILY_LIMIT = 5;

export interface FeedbackItem {
  id: string;
  userId: string;
  userEmail: string | null;
  kind: string;
  message: string;
  appVersion: string | null;
  platform: string | null;
  status: "open" | "done" | string;
  createdAt: string;
}

interface FeedbackRow {
  id: string;
  user_id: string;
  user_email: string | null;
  kind: string;
  message: string;
  app_version: string | null;
  platform: string | null;
  status: string;
  created_at: string;
}

function rowToItem(r: FeedbackRow): FeedbackItem {
  return {
    id: r.id,
    userId: r.user_id,
    userEmail: r.user_email,
    kind: r.kind,
    message: r.message,
    appVersion: r.app_version,
    platform: r.platform,
    status: r.status,
    createdAt: r.created_at,
  };
}

/** 현재 로그인 사용자가 관리자인지(admins 에 본인 행이 있는지). */
export async function isCurrentUserAdmin(): Promise<boolean> {
  if (!supabase) return false;
  const { data: sess } = await supabase.auth.getSession();
  const uid = sess.session?.user.id;
  if (!uid) return false;
  const { data, error } = await supabase
    .from("admins")
    .select("user_id")
    .eq("user_id", uid)
    .maybeSingle();
  if (error) return false;
  return !!data;
}

/** 오늘(KST) 남은 제출 가능 횟수. 알 수 없으면 한도값을 낙관적으로 반환. */
export async function feedbackLeftToday(): Promise<number> {
  if (!supabase) return DAILY_LIMIT;
  const { data, error } = await supabase.rpc("feedback_left_today");
  if (error || typeof data !== "number") return DAILY_LIMIT;
  return data;
}

/** 피드백 제출. 하루 제한 초과 시 서버 트리거가 거부하고 그 메시지를 반환한다. */
export async function submitFeedback(
  kind: FeedbackKind,
  message: string,
  platform: string,
  appVersion: string | null,
): Promise<void> {
  if (!supabase) throw new Error("서버(Supabase)가 설정되지 않았습니다.");
  const { data: sess } = await supabase.auth.getSession();
  const user = sess.session?.user;
  if (!user) throw new Error("로그인이 필요합니다.");
  const body = message.trim();
  if (!body) throw new Error("내용을 입력해주세요.");
  const { error } = await supabase.from("feedback").insert({
    user_id: user.id,
    user_email: user.email ?? null,
    kind,
    message: body,
    app_version: appVersion,
    platform,
  });
  if (error) throw new Error(error.message);
}

/** (관리자) 전체 피드백을 최신순으로 조회. */
export async function loadAllFeedback(): Promise<FeedbackItem[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("feedback")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data as FeedbackRow[]).map(rowToItem);
}

/** (관리자) 처리 상태 토글. */
export async function setFeedbackStatus(id: string, status: "open" | "done"): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from("feedback").update({ status }).eq("id", id);
  if (error) throw new Error(error.message);
}
