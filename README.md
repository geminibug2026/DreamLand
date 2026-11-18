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

### 아이폰 · 아이패드

아이폰에서는 서버를 직접 돌릴 수 없어서, PC(또는 Mac)에서 드림랜드를 켜 두고 아이폰으로 접속합니다.

1. PC 에서 `start-lan.bat` (macOS · Linux 는 `sh start.sh --lan`)으로 실행합니다.
   Windows 에서 방화벽 허용 창이 뜨면 **개인 네트워크**를 허용해 주세요.
2. 아이폰을 PC 와 **같은 와이파이**에 연결합니다.
3. 아이폰 Safari 에서 PC 창에 나온 `http://192.168.x.x:4173` 같은 주소를 엽니다.
4. PC 창에 나온 **접속 키**를 입력합니다. (처음 한 번만)
5. Safari 아래의 공유 버튼 › **홈 화면에 추가**를 누르면 앱처럼 아이콘으로 열 수 있습니다.

알아 둘 것:

- 쓰는 동안 PC 가 켜져 있어야 합니다. PC 가 잠자기에 들어가면 접속이 끊깁니다.
- 아이폰에서 연 화면에서는 **키 잠금**(설정 › 보안)을 켤 수 없습니다. 보안 연결(https)이 아닌 주소에서는 아이폰이 암호화 기능을 막기 때문입니다. API 키는 기본적으로 PC 의 `data/` 폴더에 보관되니 그대로 쓰면 됩니다.
- 대화와 캐릭터는 PC 의 `data/` 폴더에도 함께 저장됩니다. 그래도 가끔 `설정 › 백업 내보내기` 로 백업해 두세요.
- PC 의 주소(`192.168.x.x`)는 공유기가 바꿀 수 있습니다. 접속이 안 되면 PC 창에 새로 나온 주소로 열어 주세요.
- PC 를 켜 두지 않고 쓰려면 아래의 「아이폰 앱」을 설치하세요.

## 아이폰 앱 (시험판)

드림랜드를 앱으로 설치하면 PC 를 켜 두지 않아도, 밖에서도 쓸 수 있습니다.
앱스토어에 올린 앱이 아니라서, 설치 파일(IPA)을 받아 **내 Apple 계정으로 서명해서** 넣어야 합니다. 이때 PC 나 Mac 이 한 번 필요합니다.

1. [Releases](https://github.com/geminibug2026/DreamLand/releases) 에서 `Dreamland-iOS-…-unsigned.ipa` 를 PC 로 받습니다.
2. PC 에 [Sideloadly](https://sideloadly.io) 를 설치합니다. Windows 는 먼저 Apple 홈페이지판 [iTunes](https://www.apple.com/itunes/download/win64) 와 iCloud 를 설치해야 합니다. (Microsoft Store 판은 안 됩니다 — 깔려 있다면 지우고, sideloadly.io 첫 화면의 링크로 받으세요)
3. 아이폰을 USB 로 연결하고, 아이폰에 뜨는 "이 컴퓨터를 신뢰하겠습니까?" 에서 **신뢰**를 누릅니다.
4. Sideloadly 에 받은 IPA 를 끌어다 놓고, Apple 계정을 입력한 뒤 **Start** 를 누릅니다.
5. 아이폰에서 `설정 › 일반 › VPN 및 기기 관리` 로 들어가 내 Apple 계정을 **신뢰**합니다.
   `설정 › 개인정보 보호 및 보안 › 개발자 모드` 를 켜라고 나오면 켜고 다시 시작합니다.
6. 홈 화면의 Dreamland 를 엽니다.

[AltStore](https://altstore.io) 로 설치해도 됩니다.

알아 둘 것:

- **무료 Apple 계정으로 서명한 앱은 7일 뒤에 열리지 않습니다.** 그 전에 같은 방법으로 다시 서명하면 자료는 그대로 이어집니다. Sideloadly · AltStore 의 자동 갱신을 켜 두면 PC 가 켜져 있고 같은 와이파이에 있을 때 알아서 갱신됩니다.
- **앱을 지우면 자료도 함께 지워집니다.** 갱신이 안 될 때 앱부터 지우지 말고, 평소에 `설정 › 백업 내보내기` 로 백업을 앱 밖(파일 앱 등)에 받아 두세요.
- 자료(캐릭터 · 대화 · 설정 · API 키)는 아이폰의 앱 안에만 저장됩니다. PC 의 드림랜드와 자동으로 이어지지 않으니, 옮길 때는 `백업 내보내기` → `백업에서 복원` 을 씁니다. API 키는 백업에 들어가지 않습니다.
- PC 의 `data/` 폴더에 하던 자동 저장 · 자동 백업, 다른 앱 폴더에서 가져오기는 앱에 없습니다.
- 브라우저에서 바로 연결하는 것을 막아 둔 서비스는 연결 설정의 "드림랜드 서버를 거쳐 연결"을 켜면 아이폰의 연결 기능으로 보냅니다. 이때는 답이 한 글자씩 나오지 않고 다 만들어진 뒤 한 번에 나옵니다.
- iOS 15 이상이 필요합니다. 아직 시험판이라 고르지 못한 곳이 있을 수 있습니다.

직접 빌드하려면 Mac 에서 `npm ci && npm run build:web` 뒤 `ios-app` 폴더에서 `npm ci && cp -R ../web www && npx cap add ios && npx cap open ios` 를 실행합니다. (Xcode 26 이상)

## 업데이트

```sh
git pull
```

ZIP 으로 받았다면 새 ZIP 을 풀어 덮어쓰되 `data/` 폴더는 그대로 두세요.

## 알아 둘 것

- 포트를 바꾸려면 `PORT` 환경 변수를 정합니다. (예: `PORT=4180 sh start.sh`)
- 주소(포트)가 달라지면 브라우저가 다른 저장 공간으로 보기 때문에 데이터가 비어 보입니다. 같은 주소로 다시 열면 그대로 있습니다.
- 기기를 옮길 때는 `설정 › 백업 내보내기` 로 받은 파일을 새 기기에서 `백업에서 복원` 합니다. API 키는 백업에 들어가지 않으니 다시 넣어 주세요.
