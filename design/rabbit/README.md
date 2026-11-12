# 펠트토끼와 주민 눈 스타일

펠트토끼는 연분홍 얼굴과 늘어진 귀, 회민트색 몸통 패치를 바탕으로 만들었습니다. 귀의 연보라·버터 노랑·딸기빛·크림색 천과 몸통 패치에 사각 누빔과 밝은 박음질을 넣었습니다. 정면과 점프에서는 작은 갈색 눈과 `ω` 모양 입을 쓰고, 착지와 수면에서는 눈을 감습니다.

[정면](../../public/assets/characters/sprout-rabbit.png) · [점프](../../public/assets/characters/sprout-rabbit-jump.png) · [착지](../../public/assets/characters/sprout-rabbit-land.png) · [잠자기](../../public/assets/characters/sprout-rabbit-sleep.png)

고양이의 정면과 민들레 모습은 별가시 고슴도치를 참고한 **5×6픽셀 타원형 눈과 왼쪽 위 흰 점 1개**를 사용합니다. [이전 비교 미리보기](eye-preview.png)에는 누빔 작업 전 토끼도 들어 있습니다.

```sh
python design/rabbit/adjust_eyes.py
```

기존 명령 경로를 유지하며, Pillow로 고양이의 64×72 게임 PNG에서 눈 영역을 정리합니다. 실행하면 고양이의 비교용 HTML을 `/workspace/exports/resident-eye-style/preview.html`에 저장합니다.
