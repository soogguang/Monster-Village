import Phaser from 'phaser';
import { parseCatalog, type CatalogEntry } from './rules/catalog';
import { VillageScene, type WorldAsset } from './scenes/VillageScene';
import { GameStore, LocalStorage } from './store';
import galmuri11 from 'galmuri/dist/Galmuri11.woff2?url';
import galmuri14 from 'galmuri/dist/Galmuri14.woff2?url';
import type { SupabaseClient } from '@supabase/supabase-js';
import { startCloudSave } from './net/cloudSave';
import { SupabaseRooms, roomView } from './net/rooms';
import { getSupabase } from './net/supabase';
import { mountHud } from './ui/hud';
import { chosenGuest, mountAccountBadge, showLogin } from './ui/login';
import './ui/pixel.css';

const CHARACTER_DIR = 'assets/characters/';

const store = new GameStore(new LocalStorage());
store.setCatalog(await loadCatalog());
const worldAssets = await loadWorldAssets();
await loadPixelFonts();
const account = await connectAccount();
const hud = mountHud(store, CHARACTER_DIR);
void connectRooms(account);

/** 로그인했으면 친구 방에 이어요. 개발 서버에서 ?demo-room 을 붙이면 가짜 친구로 화면을 확인할 수 있어요. */
async function connectRooms(account: { client: SupabaseClient; me: { id: string; nickname: string } } | null): Promise<void> {
  try {
    if (account) await roomView.connect(new SupabaseRooms(account.client, account.me));
    else if (import.meta.env.DEV && new URLSearchParams(window.location.search).has('demo-room')) {
      const { FakeRooms } = await import('./net/fakeRooms');
      await roomView.connect(new FakeRooms());
    }
  } catch (err) {
    console.warn('[방] 방 정보를 불러오지 못했어요.', err);
  }
}

/**
 * Supabase가 설정돼 있으면 로그인 상태를 확인해요.
 * - 로그인했으면 내 게임 데이터를 클라우드와 이어요.
 * - 로그인 안 했고 손님 모드도 안 골랐으면 로그인 화면을 보여줘요.
 * Supabase 값이 없으면(지금처럼 개발 중) 이 브라우저에만 저장해요.
 */
async function connectAccount(): Promise<{ client: SupabaseClient; me: { id: string; nickname: string } } | null> {
  const client = getSupabase();
  if (!client) return null;
  const { data } = await client.auth.getSession();
  const user = data.session?.user;
  if (!user) {
    if (!chosenGuest()) await showLogin(client);
    mountAccountBadge(client, null);
    return null;
  }
  const { data: profile } = await client.from('profiles').select('nickname').eq('id', user.id).maybeSingle();
  const nickname = profile?.nickname ?? '주민';
  mountAccountBadge(client, nickname);
  await startCloudSave(store, client, user.id).catch((err) =>
    console.warn('[클라우드 저장] 불러오지 못해서 이 브라우저의 데이터로 계속해요.', err),
  );
  return { client, me: { id: user.id, nickname } };
}

/** 한글 도트 폰트(갈무리, OFL 라이선스)를 불러와요. 실패해도 기본 글꼴로 계속 돌아가요. */
async function loadPixelFonts(): Promise<void> {
  const fonts = [new FontFace('Galmuri11', `url(${galmuri11})`), new FontFace('Galmuri14', `url(${galmuri14})`)];
  await Promise.all(fonts.map((f) => f.load().then((loaded) => document.fonts.add(loaded)).catch(() => undefined)));
}

/**
 * 배경 그림 목록(public/assets/village-assets.json, decor-assets.json)을 읽어요.
 * 텍스처 이름은 목록의 texture_key를 그대로 써요. 목록이 없으면 임시 그림으로 그려요.
 */
async function loadWorldAssets(): Promise<WorldAsset[]> {
  // 기본 배경(village-assets.json)과 꾸미기 장식(decor-assets.json), 둘 다 Codex 담당이에요.
  const lists = await Promise.all(['assets/village-assets.json', 'assets/decor-assets.json'].map(readManifest));
  return lists.flat();
}

async function readManifest(path: string): Promise<WorldAsset[]> {
  try {
    const res = await fetch(path, { cache: 'no-cache' });
    if (!res.ok) return [];
    const manifest = (await res.json()) as { assets?: { file?: string; texture_key?: string }[] };
    return (manifest.assets ?? [])
      .filter((a): a is { file: string; texture_key: string } => typeof a.file === 'string' && typeof a.texture_key === 'string')
      .map((a) => ({ key: a.texture_key, url: `assets/${a.file}` }));
  } catch {
    return [];
  }
}

/** 캐릭터 목록을 불러와요. 아직 파일이 없거나 형식이 틀려도 게임은 임시 그림으로 계속 돌아가요. */
async function loadCatalog(): Promise<CatalogEntry[]> {
  try {
    const res = await fetch(`${CHARACTER_DIR}catalog.json`, { cache: 'no-cache' });
    if (!res.ok) return [];
    const { entries, problems } = parseCatalog(await res.json());
    for (const p of problems) console.warn(`[catalog.json] ${p}`);
    return entries;
  } catch {
    return [];
  }
}

// 캔버스는 창 크기 그대로 쓰고, 픽셀 배율은 카메라 줌으로 고정해요.
// (창에 맞춰 화면 전체를 늘리면 픽셀이 지나치게 커져요.)
new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  pixelArt: true,
  roundPixels: true,
  backgroundColor: '#1d1b2a',
  physics: { default: 'arcade' },
  scale: { mode: Phaser.Scale.RESIZE },
  scene: [new VillageScene(store, CHARACTER_DIR, worldAssets, hud)],
});
