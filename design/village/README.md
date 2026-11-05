# 마당·광장 배경과 실제 화면 연결

현재 게임은 `public/assets/`의 PNG를 불러와 마당·광장을 그립니다.
실제 배치는 `src/world/layout.ts`, 정원 소품은 `src/world/decor.ts`, 화면·이동·카메라는 `src/scenes/VillageScene.ts`에서 관리합니다.
사용자가 실제 파일 수정을 요청해 Codex가 큰 집과 사물, 정원 무리 배치까지 연결했습니다.

## 현재 그림 규격

파일의 실제 크기를 그대로 사용합니다. 카메라 배율은 기존 1배·2배를 유지합니다.
원본 생성 이미지에서 더 큰 해상도로 다시 내보내 기존 작은 PNG를 화면에서 1.5배로 늘리지 않습니다.

| 그림 | 현재 크기 | 경로 |
| --- | --- | --- |
| 집 2종 | 320×320 | `public/assets/objects/house-teal.png`, `house-clay.png` |
| 수호나무 | 384×512 | `public/assets/objects/guardian-tree.png` |
| 모닥불 2프레임 | 192×192 | `public/assets/objects/campfire-01.png`, `campfire-02.png` |
| 응원의 종 | 144×192 | `public/assets/objects/cheering-bell.png` |
| 일반 나무 | 192×240, 자작나무 144×240 | `public/assets/objects/decor-tree-*.png` |
| 벤치 | 144×96 | `public/assets/objects/decor-bench.png` |
| 주민·반죽·플레이어 | 64×72 | `public/assets/characters/` |
| 바닥·울타리 타일 | 32×32 | `public/assets/terrain/` |

기본 28장의 목록은 [village-assets.json](../../public/assets/village-assets.json), 추가 장식·꽃 바닥 48장의 목록은 [decor-assets.json](../../public/assets/decor-assets.json)에 있습니다.
`file`은 `public/assets/` 기준이며 브라우저에서는 `/assets/`를 앞에 붙입니다.
사물·캐릭터는 바닥 중심 `(0.5,1)`, 바닥 타일은 좌상단 `(0,0)` 기준입니다.
투명 PNG의 알파는 0/255입니다. 캐릭터의 마지막 행 y=71은 투명합니다.
모닥불은 250ms 간격으로 반복하며, 두 프레임의 y=93 이하 돌·장작은 같습니다.

## 마당과 광장 배치

- 마당은 28×22타일(896×704) 그대로입니다. 집은 위쪽, 출입문과 길은 남쪽입니다.
- 큰 집이 울타리 안에 들어오도록 집 발밑을 아래로 옮기고, 앞에는 작은 돌 테라스를 깔았습니다.
- 왼쪽은 나무 그늘·벤치·돗자리, 오른쪽은 꽃·원예 공간입니다. 나무·관목·꽃·돌을 무리로 겹쳐 놓습니다.
- 테마는 주인 userId에 따라 햇살·보라 숲·분홍 소풍으로 고정됩니다. 무리 안의 위치도 고정 seed를 사용합니다.
- 반죽은 테라스 아래, 주민은 마당 아래쪽 활동 공간에서 시작합니다. 집이 커져도 뒤에 가려지거나 울타리 밖으로 생성되지 않게 했습니다.
- 집 앞에서 남쪽 문까지 최소 3타일 폭 길이 열려 있습니다.
- 광장은 28×18타일입니다. 큰 수호나무가 왼쪽을 감싸고, 가운데 아래에는 모닥불·그루터기 좌석, 오른쪽에는 종·게시판·벤치가 있습니다.
- `worldBlocks`가 실제 충돌 영역을 만듭니다. 나뭇잎과 투명 여백은 통과하고 밑동·벽·기둥·가구 발밑에 부딪힙니다.

## 방 인원에 따른 확장

방별 `userId → slot`은 DB에 보관합니다. 처음 5명은 광장 위 한 줄에 들어오고, 6명부터 광장을 둘러싼 칸으로 퍼집니다.
집은 모두 남쪽을 보며, 새 멤버가 들어와도 기존 집의 좌표는 바뀌지 않습니다.
현재 실행 기준은 `src/world/layout.ts`의 `TEMPLATE`, `cellAt`, `createVillageLayout`입니다.
`layout-template.json`과 `expandable-layout.mjs`는 초기 좌우 반복 배치의 참고 기록이며 현재 앱 전체 배치와는 다릅니다.
초기 컨셉의 집 3개는 인원 제한이 아닙니다.

## 실제 게임 확인 화면

- [수정한 마당](previews/runtime-yard.png)
- [수정한 광장](previews/runtime-plaza.png)
- [추가 장식의 파일 목록과 배치 기준](decor/README.md)

위 화면은 같은 저장소의 Vite 게임을 Chromium에서 실행해 기록했습니다.
단위 검사에서 기존 자리 유지·1,000명까지의 배치·집 테라스 연결을 확인하고, 나무·가구와 플레이어 발밑 크기를 포함해 모든 마당까지의 이동 경로를 검사합니다.
브라우저에서는 집 벽 충돌, 남쪽 출입문에서 광장까지 걷기, 13명·50명 방과 1배·2배 화면을 확인합니다.

## 초기 아트 참고

[village-concept.png](village-concept.png)와 기존 `previews/`의 전체 목록·크기 비교, `decor/previews/`의 정원 조합은 초기 규격의 검토 기록입니다.
현재 파일 크기는 매니페스트와 위 실제 게임 화면을 기준으로 합니다.
흙길 경계 타일(`dirt-edge-*`, `dirt-corner-*`)과 사물 근처에서 기능을 여는 상호작용은 후속 작업입니다.
