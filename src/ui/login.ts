// 로그인 화면과 오른쪽 위 계정 표시

import type { SupabaseClient } from '@supabase/supabase-js';
import { signInWithKakao } from '../net/supabase';
import { escapeHtml } from './format';

const GUEST_KEY = 'monster-village:guest';

export function chosenGuest(): boolean {
  try {
    return window.localStorage.getItem(GUEST_KEY) === '1';
  } catch {
    return false;
  }
}

/** 로그인 화면을 띄워요. "로그인 없이 해보기"를 고르면 끝나고, 카카오를 고르면 카카오 화면으로 이동해요. */
export function showLogin(client: SupabaseClient): Promise<void> {
  document.body.insertAdjacentHTML(
    'beforeend',
    `<div id="login" class="login-backdrop">
      <section class="window px-box login-box">
        <div class="window-title">🏘️ 미룬 일 몬스터 동네</div>
        <div class="window-body">
          <p>할 일을 미루면 몬스터가, 끝내면 귀여운 주민이 태어나는 마을이에요.</p>
          <p class="muted">친구와 방을 만들어 같이 집중하려면 로그인이 필요해요.</p>
          <div class="login-actions">
            <button class="px-btn kakao" data-act="kakao">카카오로 시작하기</button>
            <button class="px-btn ghost" data-act="guest">로그인 없이 해보기</button>
          </div>
          <p class="muted small">로그인 없이 하면 이 브라우저에만 저장돼요. 나중에 로그인하면 그대로 옮겨져요.</p>
          <p class="form-error" hidden></p>
        </div>
      </section>
    </div>`,
  );
  const root = document.getElementById('login')!;
  return new Promise((resolve) => {
    root.addEventListener('click', async (e) => {
      const act = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset.act;
      if (act === 'guest') {
        try { window.localStorage.setItem(GUEST_KEY, '1'); } catch { /* 저장이 막힌 브라우저 */ }
        root.remove();
        resolve();
      }
      if (act === 'kakao') {
        try {
          await signInWithKakao(client);
        } catch (err) {
          const error = root.querySelector<HTMLElement>('.form-error')!;
          error.textContent = `로그인을 시작하지 못했어요: ${(err as Error).message}`;
          error.hidden = false;
        }
      }
    });
  });
}

/** 오른쪽 위 계정 표시: 로그인했으면 이름과 로그아웃, 손님이면 로그인 버튼 */
export function mountAccountBadge(client: SupabaseClient, nickname: string | null): void {
  document.body.insertAdjacentHTML(
    'beforeend',
    `<div id="account" class="px-box">${
      nickname
        ? `<span>👤 ${escapeHtml(nickname)}</span><button class="px-btn small ghost" data-act="logout">로그아웃</button>`
        : `<span class="muted">손님</span><button class="px-btn small" data-act="login">카카오 로그인</button>`
    }</div>`,
  );
  document.getElementById('account')!.addEventListener('click', async (e) => {
    const act = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset.act;
    if (act === 'login') await signInWithKakao(client);
    if (act === 'logout') {
      await client.auth.signOut();
      try { window.localStorage.removeItem(GUEST_KEY); } catch { /* 무시 */ }
      window.location.reload();
    }
  });
}
