-- 미룬 일 몬스터 동네: 첫 DB 구조
-- Supabase 대시보드 → SQL Editor에 이 파일 내용을 그대로 붙여넣고 실행하면 돼요.
--
-- 구조 요약
-- - profiles     : 사용자 이름과 프로필 사진 (카카오 로그인 정보로 자동 생성)
-- - game_saves   : 내 게임 데이터 한 덩어리 (할 일, 주민, 집중 기록, 해금, 하루 계획)
-- - rooms        : 친구들과 만든 방(동네). 초대 코드로 들어와요
-- - room_members : 방에 들어온 사람
-- - room_tasks   : 방 광장의 나무에 걸린 공동 할 일
-- 모닥불(같이 집중)과 응원의 종은 저장하지 않고 실시간 채널로 주고받아요.
--
-- 접근 규칙(RLS) 요약
-- - 내 데이터는 나만 고칠 수 있어요.
-- - 같은 방 사람끼리는 서로의 프로필과 게임 데이터를 "구경"만 할 수 있어요.
-- - 방의 공동 할 일은 그 방 사람이면 누구나 보고, 추가하고, 끝낼 수 있어요.

-- ---------------------------------------------------------------- 표

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nickname text not null default '주민',
  avatar_url text,
  created_at timestamptz not null default now()
);

create table public.game_saves (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  state jsonb not null,
  updated_at timestamptz not null default now()
);

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 20),
  invite_code text not null unique default upper(substr(md5(random()::text), 1, 6)),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.room_members (
  room_id uuid not null references public.rooms (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

create table public.room_tasks (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 40),
  due_at timestamptz,
  created_by uuid not null references public.profiles (id) on delete cascade,
  done_by uuid references public.profiles (id) on delete set null,
  done_at timestamptz,
  created_at timestamptz not null default now()
);

create index room_members_user_idx on public.room_members (user_id);
create index room_tasks_room_idx on public.room_tasks (room_id);

-- ---------------------------------------------------------------- 도우미 함수
-- RLS 안에서 같은 표를 다시 조회하면 무한 반복이 생길 수 있어서, 권한 확인은 함수로 해요.

create function public.is_room_member(target_room uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.room_members
    where room_id = target_room and user_id = auth.uid()
  );
$$;

create function public.shares_room_with(other_user uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
    from public.room_members mine
    join public.room_members theirs on theirs.room_id = mine.room_id
    where mine.user_id = auth.uid() and theirs.user_id = other_user
  );
$$;

-- 방 만들기: 방을 만들고 만든 사람을 바로 멤버로 넣어요.
create function public.create_room(room_name text)
returns public.rooms
language plpgsql security definer set search_path = public
as $$
declare
  new_room public.rooms;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요해요.';
  end if;
  insert into public.rooms (name, owner_id) values (trim(room_name), auth.uid()) returning * into new_room;
  insert into public.room_members (room_id, user_id) values (new_room.id, auth.uid());
  return new_room;
end;
$$;

-- 초대 코드로 방에 들어가요. (아직 멤버가 아니면 방을 볼 수 없어서 함수로 처리해요)
create function public.join_room(code text)
returns public.rooms
language plpgsql security definer set search_path = public
as $$
declare
  target public.rooms;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요해요.';
  end if;
  select * into target from public.rooms where invite_code = upper(trim(code));
  if target.id is null then
    raise exception '초대 코드를 찾을 수 없어요.';
  end if;
  insert into public.room_members (room_id, user_id) values (target.id, auth.uid())
  on conflict do nothing;
  return target;
end;
$$;

-- 카카오로 처음 로그인하면 프로필을 자동으로 만들어요.
create function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, nickname, avatar_url)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'name',
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'nickname',
      new.raw_user_meta_data ->> 'user_name',
      '주민'
    ),
    coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------- 접근 규칙 (RLS)

alter table public.profiles enable row level security;
alter table public.game_saves enable row level security;
alter table public.rooms enable row level security;
alter table public.room_members enable row level security;
alter table public.room_tasks enable row level security;

-- 프로필: 나 + 같은 방 사람만 보이고, 내 것만 고쳐요.
create policy "프로필 보기" on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.shares_room_with(id));
create policy "내 프로필 고치기" on public.profiles
  for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- 게임 데이터: 같은 방 사람은 구경만, 고치는 건 나만.
create policy "게임 데이터 보기" on public.game_saves
  for select to authenticated
  using (user_id = auth.uid() or public.shares_room_with(user_id));
create policy "내 게임 데이터 만들기" on public.game_saves
  for insert to authenticated
  with check (user_id = auth.uid());
create policy "내 게임 데이터 고치기" on public.game_saves
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 방: 멤버만 보여요. 만들기와 들어가기는 위의 함수로만 해요. 방장은 이름을 바꾸거나 방을 없앨 수 있어요.
create policy "내 방 보기" on public.rooms
  for select to authenticated
  using (public.is_room_member(id));
create policy "방장이 방 고치기" on public.rooms
  for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "방장이 방 없애기" on public.rooms
  for delete to authenticated
  using (owner_id = auth.uid());

-- 방 멤버: 같은 방 멤버 목록을 볼 수 있고, 나는 언제든 나갈 수 있어요.
create policy "방 멤버 보기" on public.room_members
  for select to authenticated
  using (public.is_room_member(room_id));
create policy "방에서 나가기" on public.room_members
  for delete to authenticated
  using (user_id = auth.uid());

-- 공동 할 일(나무): 방 멤버면 누구나 보고, 걸고, 끝내요. 지우는 건 건 사람만.
create policy "공동 할 일 보기" on public.room_tasks
  for select to authenticated
  using (public.is_room_member(room_id));
create policy "공동 할 일 걸기" on public.room_tasks
  for insert to authenticated
  with check (public.is_room_member(room_id) and created_by = auth.uid());
create policy "공동 할 일 끝내기" on public.room_tasks
  for update to authenticated
  using (public.is_room_member(room_id)) with check (public.is_room_member(room_id));
create policy "공동 할 일 지우기" on public.room_tasks
  for delete to authenticated
  using (created_by = auth.uid());

-- 함수는 로그인한 사람만 쓸 수 있게 해요.
revoke execute on function public.create_room(text) from public, anon;
revoke execute on function public.join_room(text) from public, anon;
grant execute on function public.create_room(text) to authenticated;
grant execute on function public.join_room(text) to authenticated;

-- ---------------------------------------------------------------- 실시간
-- 공동 할 일이 바뀌면 방 사람들 화면에 바로 반영되게 해요.
alter publication supabase_realtime add table public.room_tasks;
