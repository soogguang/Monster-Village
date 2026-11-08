// 로그인 화면과 오른쪽 위 계정 표시

import type { SupabaseClient } from '@supabase/supabase-js';
import { signInWithKakao } from '../net/supabase';
import { cleanNickname, escapeHtml, NICKNAME_MAX } from './format';

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
          <p>할 일을 미루면 반죽이 몬스터 반죽이 되고, 끝내면 귀여운 주민이 태어나는 마을이에요.</p>
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

/**
 * 동네에서 쓸 이름을 정하는 창. 저장하면 정리된 이름을 돌려줘요.
 * first면 처음 로그인 안내 문구를 보여주고 닫기 버튼이 없어요. (이름 없이 시작하지 않게)
 */
export function askNickname(initial: string, first: boolean): Promise<string | null> {
  document.body.insertAdjacentHTML(
    'beforeend',
    `<div id="nickname" class="login-backdrop">
      <section class="window px-box login-box">
        <div class="window-title">🏷️ ${first ? '동네에서 쓸 이름을 정해 주세요' : '이름 바꾸기'}</div>
        <form class="window-body">
          <p>${first ? '방 친구들에게 이 이름으로 보여요. 나중에 오른쪽 위 이름을 눌러서 바꿀 수 있어요.' : '방 친구들에게 보이는 이름이에요.'}</p>
          <input class="px-input" name="nickname" maxlength="${NICKNAME_MAX * 2}" value="${escapeHtml(initial)}" placeholder="이름 (1~${NICKNAME_MAX}자)" autocomplete="off" />
          <p class="form-error" hidden></p>
          <div class="login-actions">
            <button class="px-btn green">이 이름으로 할게요</button>
            ${first ? '' : '<button type="button" class="px-btn ghost" data-act="cancel">그만두기</button>'}
          </div>
        </form>
      </section>
    </div>`,
  );
  const root = document.getElementById('nickname')!;
  const form = root.querySelector('form')!;
  const input = form.querySelector<HTMLInputElement>('input')!;
  const error = form.querySelector<HTMLElement>('.form-error')!;
  input.focus();
  input.select();
  // 창이 떠 있는 동안 캐릭터가 움직이지 않게 해요. (다른 창이 이미 열려 있었다면 그대로 둬요)
  const ownsModal = document.body.dataset.modal !== 'open';
  if (ownsModal) document.body.dataset.modal = 'open';
  return new Promise((resolve) => {
    const close = (value: string | null) => {
      if (ownsModal) delete document.body.dataset.modal;
      root.remove();
      resolve(value);
    };
    root.querySelector('[data-act="cancel"]')?.addEventListener('click', () => close(null));
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = cleanNickname(input.value);
      if (!name) {
        error.textContent = `이름은 1~${NICKNAME_MAX}자로 적어 주세요.`;
        error.hidden = false;
        return;
      }
      close(name);
    });
  });
}

/** 이름을 저장해요. 다른 기기에서 다시 묻지 않도록 계정에 "이름 정함" 표시도 남겨요. */
export async function saveNickname(client: SupabaseClient, userId: string, nickname: string): Promise<void> {
  const { error } = await client.from('profiles').update({ nickname }).eq('id', userId);
  if (error) throw error;
  await client.auth.updateUser({ data: { nickname_confirmed: true } });
}

/**
 * 오른쪽 위 계정 표시: 로그인했으면 이름과 로그아웃, 손님이면 로그인 버튼.
 * 이름을 누르면 바꿀 수 있어요. 바꾸면 onRename으로 알려줘요.
 */
export function mountAccountBadge(
  client: SupabaseClient,
  account: { id: string; nickname: string } | null,
  onRename?: (nickname: string) => void,
): void {
  document.body.insertAdjacentHTML(
    'beforeend',
    `<div id="account" class="px-box">${
      account
        ? `<button class="account-name" data-act="rename" title="이름 바꾸기">👤 <span>${escapeHtml(account.nickname)}</span> ✏️</button><button class="px-btn small ghost" data-act="logout">로그아웃</button>`
        : `<span class="muted">손님</span><button class="px-btn small" data-act="login">카카오 로그인</button>`
    }</div>`,
  );
  const badge = document.getElementById('account')!;
  badge.addEventListener('click', async (e) => {
    const act = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset.act;
    if (act === 'login') await signInWithKakao(client);
    if (act === 'rename' && account) {
      const name = await askNickname(account.nickname, false);
      if (!name || name === account.nickname) return;
      try {
        await saveNickname(client, account.id, name);
        account.nickname = name;
        badge.querySelector('.account-name span')!.textContent = name;
        onRename?.(name);
      } catch (err) {
        console.warn('[이름] 저장하지 못했어요.', err);
        window.alert('이름을 저장하지 못했어요. 잠시 뒤에 다시 해 주세요.');
      }
    }
    if (act === 'logout') {
      await client.auth.signOut();
      try { window.localStorage.removeItem(GUEST_KEY); } catch { /* 무시 */ }
      window.location.reload();
    }
  });
}
