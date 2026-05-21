import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');
const appDir = path.join(projectRoot, 'app');

// 颜色与类名映射表
const replacements = [
  // 基础背景、面板和输入框
  { from: 'border-[#3c3f2e]', to: 'border-[#2a2a4a]' },
  { from: 'bg-[#202216]', to: 'bg-[#1a1a2e]' },
  { from: 'bg-[#11130f]', to: 'bg-[#0d0d1a]' },
  { from: 'bg-[#0d0f0c]', to: 'bg-[#0a0a12]' },
  { from: 'bg-[#161812]', to: 'bg-[#121223]/85 backdrop-blur-md' },
  { from: 'bg-[#253016]', to: 'bg-[#8b5cf6]/15' },
  { from: 'border-[#2a2d21]', to: 'border-[#1e1e3a]' },
  { from: 'bg-[#202216]/70', to: 'bg-[#1a1a2e]/70' },
  { from: 'bg-[#11130f]/85', to: 'bg-[#0d0d1a]/85' },
  { from: 'bg-[#11130f]/88', to: 'bg-[#0d0d1a]/85' },
  { from: 'bg-[#11130f]/90', to: 'bg-[#0d0d1a]/90' },
  { from: 'bg-black/55', to: 'bg-black/60 backdrop-blur-sm' },

  // 文字与标签
  { from: 'text-[#a7a28f]', to: 'text-[#8b8ba3]' },
  { from: 'text-[#d8d4c3]', to: 'text-[#c4c4d4]' },
  { from: 'text-[#f1f0e6]', to: 'text-[#f0f0ff]' },
  { from: 'text-[#6d6a5d]', to: 'text-[#4a4a60]' },
  { from: 'text-[#c3beaa]', to: 'text-[#a5a5bd]' },

  // 主色荧光黄绿 -> 科技电紫/青色
  { from: 'text-[#d6ff3f]', to: 'text-[#8b5cf6]' },
  { from: 'border-[#d6ff3f]', to: 'border-[#8b5cf6]' },
  { from: 'bg-[#d6ff3f] text-[#11130f]', to: 'bg-gradient-to-r from-[#8b5cf6] to-[#06d6a0] text-white font-extrabold shadow-md shadow-[rgba(139,92,246,0.2)]' },
  { from: 'hover:bg-[#e5ff70]', to: 'hover:brightness-110' },
  { from: 'bg-[#d6ff3f]', to: 'bg-[#8b5cf6]' },
  { from: 'text-[#11130f]', to: 'text-white' },
  { from: 'hover:border-[#d6ff3f]', to: 'hover:border-[#8b5cf6]' },
  { from: 'hover:border-[#3c3f2e]', to: 'hover:border-[#2a2a4a]' },
  { from: 'hover:bg-[#202216]', to: 'hover:bg-[#1a1a2e]' },

  // 危险状态
  { from: 'border-[#ff4d3d]', to: 'border-[#f43f5e]' },
  { from: 'bg-[#ff4d3d]', to: 'bg-[#f43f5e]' },
  { from: 'text-[#ff8b82]', to: 'text-[#fb7185]' },
  { from: 'text-[#ff4d3d]', to: 'text-[#f43f5e]' },
  { from: 'bg-[#2a1512]', to: 'bg-[#f43f5e]/15' },

  // 警告状态
  { from: 'border-[#ffb238]', to: 'border-[#fb923c]' },
  { from: 'bg-[#ffb238]', to: 'bg-[#fb923c]' },
  { from: 'text-[#ffd08a]', to: 'text-[#fdba74]' },
  { from: 'text-[#ffb238]', to: 'text-[#fb923c]' },
  { from: 'bg-[#2b2110]', to: 'bg-[#fb923c]/15' },

  // 成功状态
  { from: 'border-[#42d67d]', to: 'border-[#06d6a0]' },
  { from: 'bg-[#42d67d]', to: 'bg-[#06d6a0]' },
  { from: 'text-[#87eba9]', to: 'text-[#34d399]' },
  { from: 'text-[#42d67d]', to: 'text-[#06d6a0]' },
  { from: 'bg-[#102517]', to: 'bg-[#06d6a0]/15' },

  // 地图发光色
  { from: 'bg-[#d6ff3f]/25', to: 'bg-[#8b5cf6]/20' },
  { from: 'bg-[#ff4d3d]/25', to: 'bg-[#f43f5e]/15' },
  { from: 'bg-[#ffb238]/25', to: 'bg-[#fb923c]/15' },

  // 圆角升级与动画注入 (可选但推荐)
  { from: 'rounded border border-[#3c3f2e]', to: 'rounded-xl border border-[#2a2a4a]' },
  { from: 'rounded border border-[#2a2d21]', to: 'rounded-xl border border-[#1e1e3a]' },
];

function walk(dir, callback) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      if (file !== 'node_modules' && file !== '.next') {
        walk(filePath, callback);
      }
    } else if (stat.isFile() && (file.endsWith('.tsx') || file.endsWith('.ts'))) {
      callback(filePath);
    }
  }
}

let modifiedCount = 0;

walk(appDir, (filePath) => {
  // 排除我们已经重构过的关键组件，只针对页面级或者次级文件做全局替换
  if (filePath.endsWith('ui.tsx') || filePath.endsWith('forms.tsx') || filePath.endsWith('globals.css') || filePath.endsWith('layout.tsx')) {
    return;
  }

  let content = fs.readFileSync(filePath, 'utf8');
  let originalContent = content;

  for (const r of replacements) {
    // 全局匹配
    const regex = new RegExp(escapeRegExp(r.from), 'g');
    content = content.replace(regex, r.to);
  }

  if (content !== originalContent) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`✅ Migrated: ${path.relative(projectRoot, filePath)}`);
    modifiedCount++;
  }
});

console.log(`\n🎉 Theme migration complete! Modified ${modifiedCount} files.`);

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
