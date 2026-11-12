// Supabase 연결
// 주소와 공개 키는 .env.local(내 컴퓨터) 또는 Vercel 환경 변수에 넣어요. 둘 다 공개돼도 괜찮은 값이에요.
//   VITE_SUPABASE_URL=https://○○○○.supabase.co
//   VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
// 값이 없으면 로그인 없이 이 브라우저에만 저장하는 방식으로 돌아가요.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null | undefined;

export function getSupabase(): SupabaseClient | null {
  if (client !== undefined) return client;
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
  client = url && key ? createClient(url, key) : null;
  return client;
}

/** 카카오 로그인 화면으로 보내요. 로그인이 끝나면 이 페이지로 돌아와요. */
export async function signInWithKakao(client: SupabaseClient): Promise<void> {
  const { error } = await client.auth.signInWithOAuth({
    provider: 'kakao',
    options: {
      redirectTo: window.location.origin + window.location.pathname,
      // Supabase는 기본으로 이메일(account_email)까지 요청하는데, 이메일 동의는 비즈 앱만 켤 수 있어서 KOE205 오류가 나요.
      // 그래서 우리가 켜 둔 동의 항목(닉네임·프로필 사진)만 요청해요. Supabase의 "Allow users without an email"도 켜 둬야 해요.
      queryParams: { scope: 'profile_nickname profile_image' },
    },
  });
  if (error) throw error;
}
