import type { SupabaseClient } from '@supabase/supabase-js';
import { AVATARS, type AvatarId } from '../avatars';
import { savedAvatar, saveFirstAvatar } from '../net/avatarProfile';

/** 첫 로그인에서 이름을 정한 다음, 마을에 들어가기 전에 한 번만 보여줘요. */
export async function ensureFirstAvatar(
  client: SupabaseClient,
  metadata: Record<string, unknown> | null | undefined,
  characterDir: string,
): Promise<AvatarId> {
  const saved = savedAvatar(metadata);
  if (saved) return saved;
  return askAvatar(characterDir, (id) => saveFirstAvatar(client, id));
}

export function askAvatar(characterDir: string, save: (id: AvatarId) => Promise<AvatarId>): Promise<AvatarId> {
  document.body.insertAdjacentHTML('beforeend', `<div id="avatar-setup" class="login-backdrop">
    <section class="window px-box avatar-setup-window" role="dialog" aria-modal="true" aria-labelledby="avatar-setup-title">
      <div id="avatar-setup-title" class="window-title">🧑 마을에서 쓸 내 모습</div>
      <div class="window-body">
        <p>처음 시작할 때 한 번만 고를 수 있어요. 확정한 모습은 다음 접속에도 이어져요.</p>
        <div class="avatar-grid">${AVATARS.map((avatar) => `<button type="button" class="avatar-card" data-avatar-id="${avatar.id}" aria-pressed="false">
          <span class="avatar-preview" style="background-image:url('${characterDir}avatars/${avatar.id}-walk.png')" aria-hidden="true"></span>
          <strong>${avatar.name}</strong><span class="avatar-description">${avatar.description}</span>
        </button>`).join('')}</div>
        <p class="form-error" role="alert" hidden></p>
        <div class="avatar-setup-actions"><button type="button" class="px-btn green" data-act="confirm-avatar" disabled>모습을 먼저 골라 주세요</button></div>
      </div>
    </section>
  </div>`);
  const root = document.getElementById('avatar-setup')!;
  const confirm = root.querySelector<HTMLButtonElement>('[data-act=confirm-avatar]')!;
  const error = root.querySelector<HTMLElement>('.form-error')!;
  const cards = [...root.querySelectorAll<HTMLButtonElement>('[data-avatar-id]')];
  let selected: AvatarId | null = null;
  let saving = false;
  const ownsModal = document.body.dataset.modal !== 'open';
  if (ownsModal) document.body.dataset.modal = 'open';
  cards[0]?.focus();
  return new Promise((resolve) => {
    root.addEventListener('click', async (event) => {
      if (saving) return;
      const card = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-avatar-id]');
      if (card) {
        selected = card.dataset.avatarId as AvatarId;
        cards.forEach((button) => button.setAttribute('aria-pressed', String(button === card)));
        confirm.disabled = false;
        confirm.textContent = '이 모습으로 시작하기';
        return;
      }
      if (!(event.target as HTMLElement).closest('[data-act=confirm-avatar]') || !selected) return;
      saving = true;
      confirm.disabled = true;
      cards.forEach((button) => { button.disabled = true; });
      confirm.textContent = '저장 중…';
      error.hidden = true;
      try {
        const accepted = await save(selected);
        root.remove();
        if (ownsModal) delete document.body.dataset.modal;
        resolve(accepted);
      } catch {
        error.textContent = '모습을 저장하지 못했어요. 연결을 확인한 뒤 다시 눌러 주세요.';
        error.hidden = false;
        saving = false;
        confirm.disabled = false;
        cards.forEach((button) => { button.disabled = false; });
        confirm.textContent = '다시 저장하기';
      }
    });
  });
}
