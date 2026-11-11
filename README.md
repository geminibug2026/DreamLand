# Dreamland

브라우저에서 쓰는 롤플레이 · 대화 프런트엔드입니다. 설치할 패키지가 없고, Node.js 만 있으면 바로 실행됩니다.
데이터(캐릭터 · 대화 · 설정)는 브라우저에 저장되고, API 키는 `data/` 폴더에만 보관됩니다.

## 준비물

- [Node.js](https://nodejs.org) 18 이상 (LTS 권장)

## 실행

### Windows

1. 이 저장소를 내려받습니다. (`Code › Download ZIP` 으로 받아 압축을 풀거나 `git clone`)
2. `start.bat` 을 두 번 누릅니다. 브라우저가 자동으로 열립니다.

검은 창을 닫으면 서버가 꺼집니다.

### macOS · Linux

```sh
git clone https://github.com/geminibug2026/DreamLand.git dreamland
cd dreamland
sh start.sh
```

### 안드로이드 (Termux)

[Termux](https://termux.dev) 를 설치한 뒤:

```sh
pkg update
pkg install git nodejs-lts
git clone https://github.com/geminibug2026/DreamLand.git dreamland
cd dreamland
sh start.sh
```

브라우저가 자동으로 열리지 않으면 `http://localhost:4173` 을 직접 열어 주세요.
화면을 꺼도 서버가 멈추지 않게 하려면 실행 전에 `termux-wake-lock` 을 한 번 입력합니다.

다음부터는 `cd dreamland && sh start.sh` 만 하면 됩니다.

## 같은 공유기의 다른 기기에서 쓰기

PC 에서 켜 두고 휴대폰으로 접속하려면 `start-lan.bat` (또는 `sh start.sh --lan`)으로 실행합니다.
창에 나오는 주소를 휴대폰에서 열고, 함께 나오는 접속 키를 한 번 입력하면 됩니다. 믿을 수 있는 네트워크에서만 사용하세요.

## 업데이트

```sh
git pull
```

ZIP 으로 받았다면 새 ZIP 을 풀어 덮어쓰되 `data/` 폴더는 그대로 두세요.

## 알아 둘 것

- 포트를 바꾸려면 `PORT` 환경 변수를 정합니다. (예: `PORT=4180 sh start.sh`)
- 주소(포트)가 달라지면 브라우저가 다른 저장 공간으로 보기 때문에 데이터가 비어 보입니다. 같은 주소로 다시 열면 그대로 있습니다.
- 기기를 옮길 때는 `설정 › 백업 내보내기` 로 받은 파일을 새 기기에서 `백업에서 복원` 합니다. API 키는 백업에 들어가지 않으니 다시 넣어 주세요.
