// 현재 로그인 사용자 id (없으면 null). 자동 동기화 조건 확인용.

import { supabase } from "../supabase";

export async function currentUserId(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}
