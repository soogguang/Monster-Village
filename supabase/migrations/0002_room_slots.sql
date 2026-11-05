-- 방 멤버의 마당 자리(slot)
-- 0001_init.sql 다음에 실행해요. (SQL Editor에 붙여넣고 Run)
--
-- - 방마다 userId → 자리 번호를 저장해서, 방의 모든 멤버가 같은 배치를 봐요.
-- - 자리는 가운데 0, 오른쪽 1, 왼쪽 -1, 오른쪽 2, 왼쪽 -2 … 순서로 빈자리부터 줘요.
-- - 방을 나가도 자리 기록은 남아요. 다시 들어오면 같은 자리로 돌아오고, 그 자리는 다른 사람에게 주지 않아요.

create table public.room_slots (
  room_id uuid not null references public.rooms (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  slot integer not null,
  primary key (room_id, user_id),
  unique (room_id, slot)
);

alter table public.room_slots enable row level security;

create policy "방 자리 보기" on public.room_slots
  for select to authenticated
  using (public.is_room_member(room_id));

-- i번째 자리 번호: 0, 1, -1, 2, -2, …
create function public.slot_at(i integer)
returns integer
language sql immutable
as $$
  select case when i = 0 then 0 when i % 2 = 0 then -(i / 2) else (i + 1) / 2 end;
$$;

-- 이 방에서 아직 자리가 없으면 빈자리 중 가장 앞 순서를 줘요.
create function public.assign_room_slot(target_room uuid, target_user uuid)
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  existing integer;
  i integer := 0;
begin
  -- 같은 방에 동시에 여러 명이 들어와도 자리가 겹치지 않게 방 단위로 잠가요.
  perform pg_advisory_xact_lock(hashtext(target_room::text));
  select slot into existing from public.room_slots where room_id = target_room and user_id = target_user;
  if existing is not null then
    return existing;
  end if;
  while exists (select 1 from public.room_slots where room_id = target_room and slot = public.slot_at(i)) loop
    i := i + 1;
  end loop;
  insert into public.room_slots (room_id, user_id, slot) values (target_room, target_user, public.slot_at(i));
  return public.slot_at(i);
end;
$$;

-- 방 만들기와 들어가기를 할 때 자리도 함께 정해요.
create or replace function public.create_room(room_name text)
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
  perform public.assign_room_slot(new_room.id, auth.uid());
  return new_room;
end;
$$;

create or replace function public.join_room(code text)
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
  perform public.assign_room_slot(target.id, auth.uid());
  return target;
end;
$$;

-- 0002를 실행하기 전에 이미 방에 있던 멤버에게도 들어온 순서대로 자리를 줘요.
do $$
declare
  m record;
begin
  for m in select room_id, user_id from public.room_members order by room_id, joined_at loop
    perform public.assign_room_slot(m.room_id, m.user_id);
  end loop;
end;
$$;

revoke execute on function public.assign_room_slot(uuid, uuid) from public, anon, authenticated;
