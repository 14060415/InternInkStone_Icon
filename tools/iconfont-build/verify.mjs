import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, '..', '..');
const root = process.env.ICONFONT_OUTPUT || path.join(projectRoot, 'iconfont');
const dist = root;
const manifest = JSON.parse(await fs.readFile(path.join(root, 'manifest.json'), 'utf8'));
const unicodeMap = JSON.parse(await fs.readFile(path.join(root, 'unicode-map.json'), 'utf8'));
const css = await fs.readFile(path.join(dist, 'iconfont.css'), 'utf8');
const svgFont = await fs.readFile(
  path.join(dist, 'intern-discovery-icons.svg'),
  'utf8'
);

const errors = [];
const iconKeys = new Set();
const tokens = new Set();
const codePoints = new Set();

for (const icon of manifest.icons) {
  if (iconKeys.has(icon.key)) errors.push(`重复 key：${icon.key}`);
  if (tokens.has(icon.token)) errors.push(`重复 token：${icon.token}`);
  if (codePoints.has(icon.unicode)) errors.push(`重复 Unicode：${icon.unicode}`);
  iconKeys.add(icon.key);
  tokens.add(icon.token);
  codePoints.add(icon.unicode);

  const hex = icon.unicode.slice(2).toLowerCase();
  if (!css.includes(`.${icon.token}::before{content:"\\${hex}";}`)) {
    errors.push(`CSS 缺少 ${icon.token} / ${icon.unicode}`);
  }
  const serializedUnicode = `unicode="&#x${icon.unicode.slice(2)};"`;
  if (!svgFont.includes(serializedUnicode)) {
    errors.push(`字体缺少 ${icon.key} / ${icon.unicode}`);
  }
  if (unicodeMap.icons[icon.key] !== icon.unicode) {
    errors.push(`清单与 Unicode 映射不一致：${icon.key}`);
  }
}

for (const name of [
  'intern-discovery-icons.woff2',
  'intern-discovery-icons.woff',
  'intern-discovery-icons.ttf',
  'intern-discovery-icons.svg',
  'iconfont.css',
  'demo.html',
]) {
  const stats = await fs.stat(path.join(dist, name));
  if (!stats.isFile() || stats.size === 0) errors.push(`无效产物：${name}`);
}

const sourceSvgs = (await fs.readdir(path.join(root, 'svg')))
  .filter(name => name.endsWith('.svg'));
const outlineSvgs = (await fs.readdir(path.join(root, 'outlined-svg')))
  .filter(name => name.endsWith('.svg'));
if (sourceSvgs.length !== manifest.icons.length) {
  errors.push(`源 SVG 数量错误：${sourceSvgs.length}`);
}
if (outlineSvgs.length !== manifest.icons.length) {
  errors.push(`轮廓 SVG 数量错误：${outlineSvgs.length}`);
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`验证通过：${manifest.icons.length} 个图标，Unicode/CSS/字体映射一致。`);
}
