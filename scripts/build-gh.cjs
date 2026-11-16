// Сборка GitHub Pages: временно убирает src/app/api (сервер недоступен на Pages),
// собирает статический экспорт в .next-export, возвращает API на место.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const root = path.join(__dirname, '..');
const apiDir = path.join(root, 'src', 'app', 'api');
const apiBak = path.join(root, 'src', '_api_server');

const moved = { back: false };
function move(from, to) {
  if (fs.existsSync(from)) { fs.renameSync(from, to); return true; }
  return false;
}
try {
  if (move(apiDir, apiBak)) moved.back = true;
  execSync('npx next build', {
    cwd: root, stdio: 'inherit',
    env: { ...process.env, NEXT_EXPORT: '1', NEXT_PUBLIC_GH_PAGES: '1' },
  });
  console.log('GH EXPORT OK');
} finally {
  if (moved.back) move(apiBak, apiDir);
}
