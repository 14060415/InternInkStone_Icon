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
const indexHtml = await fs.readFile(path.join(projectRoot, 'index.html'), 'utf8');

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

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
  const glyphName = path.basename(icon.svg, '.svg');
  const glyphPattern = new RegExp(`<glyph\\s+glyph-name="${escapeRegExp(glyphName)}"\\s+unicode="&#x${icon.unicode.slice(2)};"\\s+horiz-adv-x="[^"]+"\\s+d="[^"]+"`);
  if (!glyphPattern.test(svgFont)) {
    errors.push(`字体字形名称或码位不一致：${icon.key} / ${icon.unicode}`);
  }
  if (unicodeMap.icons[icon.key] !== icon.unicode) {
    errors.push(`清单与 Unicode 映射不一致：${icon.key}`);
  }
}

if (!css.includes('.intern-inkstone-icon,.iconfont{')) {
  errors.push('CSS 缺少推荐类 .intern-inkstone-icon 或兼容类 .iconfont');
}
if (!indexHtml.includes('class="intern-inkstone-icon preview-glyph"')) {
  errors.push('列表页没有使用 WebFont Unicode 预览');
}
if (!indexHtml.includes('<div class="preview">${fontPreviewFor(icon)}</div>')) {
  errors.push('列表卡片没有调用 WebFont 预览函数');
}
if (indexHtml.includes('<div class="preview">${svgFor(icon)}</div>')) {
  errors.push('列表卡片仍在使用与发布字体不同的 SVG 预览');
}
if (!indexHtml.includes('class="intern-inkstone-icon" aria-hidden="true"')) {
  errors.push('完整 HTML 复制代码缺少推荐字体类');
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
  console.log(`验证通过：${manifest.icons.length} 个图标，Unicode/CSS/字体/列表预览映射一致。`);
}
