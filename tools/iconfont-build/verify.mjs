import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SVGPathData } from 'svg-pathdata';

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, '..', '..');
const root = process.env.ICONFONT_OUTPUT || path.join(projectRoot, 'iconfont');
const dist = root;
const manifest = JSON.parse(await fs.readFile(path.join(root, 'manifest.json'), 'utf8'));
const unicodeMap = JSON.parse(await fs.readFile(path.join(root, 'unicode-map.json'), 'utf8'));
const css = await fs.readFile(path.join(dist, 'iconfont.css'), 'utf8');
const variantIds = ['sharp', 'standard', 'rounded'];
const svgFonts = Object.fromEntries(await Promise.all(variantIds.map(async variant => [
  variant,
  await fs.readFile(path.join(dist, `intern-discovery-icons-${variant}.svg`), 'utf8'),
])));

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function contourAreaSigns(pathData) {
  const commands = new SVGPathData(pathData)
    .toAbs()
    .normalizeST()
    .qtToC()
    .aToC()
    .commands;
  const contours = [];
  let points = [];
  for (const command of commands) {
    if (command.type === SVGPathData.MOVE_TO && points.length) {
      contours.push(points);
      points = [];
    }
    if ('x' in command && 'y' in command) points.push([command.x, command.y]);
  }
  if (points.length) contours.push(points);
  return contours.map(contour => {
    let twiceArea = 0;
    for (let index = 0; index < contour.length; index += 1) {
      const current = contour[index];
      const next = contour[(index + 1) % contour.length];
      twiceArea += current[0] * next[1] - next[0] * current[1];
    }
    return Math.sign(twiceArea);
  }).filter(Boolean);
}

const errors = [];
const iconKeys = new Set();
const tokens = new Set();
const codePoints = new Set();
const hollowGlyphs = new Set([
  'bookmark', 'star', 'eye', 'bell', 'lock',
  'languageChinese', 'trash', 'edit', 'settings', 'fastForward', 'rewind',
  'filePdf', 'filePresentation', 'table', 'occupation',
  'lightbulb', 'bellOff', 'eyeOff', 'python', 'dna',
  'flask', 'network',
  'sparkles', 'cpu', 'message', 'messages', 'play', 'messagePlus',
]);

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
  const glyphPattern = new RegExp(`<glyph\\s+glyph-name="${escapeRegExp(glyphName)}"\\s+unicode="&#x${icon.unicode.slice(2)};"\\s+horiz-adv-x="[^"]+"\\s+d="([^"]+)"`);
  for (const [variant, svgFont] of Object.entries(svgFonts)) {
    const glyphMatch = svgFont.match(glyphPattern);
    if (!glyphMatch) {
      errors.push(`${variant} 字体字形名称或码位不一致：${icon.key} / ${icon.unicode}`);
    } else if (hollowGlyphs.has(icon.key)) {
      const signs = contourAreaSigns(glyphMatch[1]);
      if (signs.length < 2 || signs[0] === signs[1]) {
        errors.push(`${variant} 描边图标孔洞方向错误：${icon.key}`);
      }
    }
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
  ...variantIds.flatMap(variant => [
    `intern-discovery-icons-${variant}.woff2`,
    `intern-discovery-icons-${variant}.woff`,
    `intern-discovery-icons-${variant}.ttf`,
    `intern-discovery-icons-${variant}.svg`,
  ]),
  'iconfont.css',
  'demo.html',
]) {
  const stats = await fs.stat(path.join(dist, name));
  if (!stats.isFile() || stats.size === 0) errors.push(`无效产物：${name}`);
}

const variantDirectories = {
  sharp: { source: 'svg-sharp', outline: 'outlined-svg-sharp' },
  standard: { source: 'svg', outline: 'outlined-svg' },
  rounded: { source: 'svg-rounded', outline: 'outlined-svg-rounded' },
};
const outlineFiles = [];
for (const [variant, directories] of Object.entries(variantDirectories)) {
  const sourceSvgs = (await fs.readdir(path.join(root, directories.source)))
    .filter(name => name.endsWith('.svg'));
  const outlineSvgs = (await fs.readdir(path.join(root, directories.outline)))
    .filter(name => name.endsWith('.svg'));
  if (sourceSvgs.length !== manifest.icons.length) {
    errors.push(`${variant} 源 SVG 数量错误：${sourceSvgs.length}`);
  }
  if (outlineSvgs.length !== manifest.icons.length) {
    errors.push(`${variant} 轮廓 SVG 数量错误：${outlineSvgs.length}`);
  }
  outlineFiles.push(...outlineSvgs.map(name => ({ variant, directory: directories.outline, name })));
}
for (const { variant, directory, name } of outlineFiles) {
  const outlined = await fs.readFile(path.join(root, directory, name), 'utf8');
  if (/fill-rule=["']evenodd["']/.test(outlined)) {
    errors.push(`${variant} 轮廓 SVG 仍依赖字体不支持的偶奇填充：${name}`);
  }
  if (/<text\b/.test(outlined)) {
    errors.push(`${variant} 轮廓 SVG 仍含字体生成器会忽略的文字：${name}`);
  }
}

for (const variant of variantIds) {
  const metadata = manifest.fontVariants?.[variant];
  if (!metadata) {
    errors.push(`清单缺少 ${variant} 字体信息`);
    continue;
  }
  if (!css.includes(metadata.fontFiles.woff2) || !css.includes(metadata.fontFiles.woff)) {
    errors.push(`CSS 缺少 ${variant} 字体引用`);
  }
}
for (const extension of ['svg', 'ttf', 'woff', 'woff2']) {
  const base = await fs.readFile(path.join(dist, `intern-discovery-icons.${extension}`));
  const standard = await fs.readFile(path.join(dist, `intern-discovery-icons-standard.${extension}`));
  if (!base.equals(standard)) errors.push(`标准兼容文件内容不一致：${extension}`);
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`验证通过：${manifest.icons.length} 个图标，锋利/标准/圆润三套 Unicode/CSS/字体/描边孔洞映射一致。`);
}
