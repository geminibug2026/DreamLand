#!/usr/bin/env sh
# Dreamland 실행 (Linux · macOS · Termux)
#   sh start.sh          이 기기에서만
#   sh start.sh --lan    같은 공유기의 다른 기기에서도 (접속 키가 화면에 나옵니다)
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 가 필요합니다."
  if [ -n "$TERMUX_VERSION" ]; then echo "  pkg install nodejs-lts  를 실행한 뒤 다시 시작해 주세요."
  else echo "  https://nodejs.org 에서 설치한 뒤 다시 시작해 주세요."; fi
  exit 1
fi
major=$(node -p "process.versions.node.split('.')[0]")
if [ "$major" -lt 18 ]; then
  echo "Node.js 18 이상이 필요합니다. (지금: $(node -v))"
  exit 1
fi
exec node server.js --open "$@"
