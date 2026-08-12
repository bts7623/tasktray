// Supabase 클라이언트 (동기화 백엔드). 키는 .env.local(VITE_*) 에서 읽는다.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** .env.local 에 URL·키가 채워져 있으면 true. */
export const supabaseConfigured = Boolean(url && anon);

/** 미설정 시 null. 사용 전 supabaseConfigured 로 확인한다. */
export const supabase: SupabaseClient | null = supabaseConfigured
  ? createClient(url as string, anon as string, {
      auth: { persistSession: true, autoRefreshToken: true },
    })
  : null;
