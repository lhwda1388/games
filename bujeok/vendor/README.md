# vendor

- `pixi.min.js` — PixiJS v8.6.6 전역 빌드(`var PIXI`). 출처: https://cdn.jsdelivr.net/npm/pixi.js@8.6.6/dist/pixi.min.js · 라이선스: MIT(파일 머리 주석).
  버전을 바꿀 때는 이 파일과 README를 함께 바꾸고 브라우저에서 입문을 끝까지 플레이해 확인한다.
- `fonts/Galmuri11.woff2`, `fonts/Galmuri11-Bold.woff2`, `fonts/Galmuri9.woff2` — 갈무리 2.40.3 픽셀 글꼴. 출처: npm `galmuri@2.40.3`(https://github.com/quiple/galmuri)의 `dist/` · 라이선스: SIL OFL 1.1(`../LICENSES/Galmuri-OFL.txt`, 고지 `../LICENSES/Galmuri-NOTICE.txt`).
  파일 이름과 내용을 바꾸지 않는다(받은 원본 그대로). 외부 것 전체 목록은 `../LICENSES/README.txt`.

## 캐시 무효화 토큰(`?v=`)

`index.html`과 `art.html`의 모든 로컬 `<script src>`와 `@font-face` 글꼴 URL 끝에 같은 토큰을 붙인다. 토큰은 콘텐츠 `VERSION`(`content/index.js`) 그대로다(예: `?v=17`). 빌드 단계가 없어서 토큰은 HTML에 그대로 반복된다.
**`VERSION`을 올릴 때 토큰도 같이 올린다**(예: `17` → `18`). 두 파일에서 찾아 바꾸기 한 번이면 된다: `sed -i '' 's/?v=17/?v=18/g' index.html art.html`.
올리지 않으면 돌아온 브라우저가 옛 JS와 새 JS를 섞어 불러 검은 화면이나 멈춘 루프가 날 수 있다. `test/licenses.test.js`가 두 HTML의 모든 로컬 스크립트·글꼴이 같은 토큰을 쓰고, 그 토큰이 `VERSION`과 같은지 확인한다.
