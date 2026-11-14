set -e
mkdir -p /work
cd /work
npm init -y > /dev/null
npm install --no-audit --no-fund playwright@1.65.0
node /site/scripts/shots.mjs
