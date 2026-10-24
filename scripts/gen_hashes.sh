#!/usr/bin/env bash
set -e
docker run --rm node:20.18-alpine sh -c '
cd /tmp
npm init -y >/dev/null 2>&1
npm install --silent bcryptjs >/dev/null 2>&1
node -e "
const b = require(\"bcryptjs\");
const pass = [
  \"AdminCinema@2026!SecureKey\",
  \"Staff01Cinema@2026!Key\",
  \"Staff02Cinema@2026!Key\",
  \"Customer01@2026!Pass\",
  \"Customer02@2026!Pass\"
];
pass.forEach(p => console.log(p + \":::\" + b.hashSync(p, 10)));
"
'
