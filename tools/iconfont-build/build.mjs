import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { load } from 'cheerio';
import { SVGPathData } from 'svg-pathdata';
import {
  createSVG,
  createTTF,
  createWOFF,
  createWOFF2,
} from 'svgtofont/lib/utils';

const require = createRequire(import.meta.url);
const { outlineSvg } = require('@davestewart/outliner');

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, '..', '..');
const inputHtml = process.env.ICON_LIST_HTML || path.join(projectRoot, 'index.html');
const outputRoot = process.env.ICONFONT_OUTPUT || path.join(projectRoot, 'iconfont');
const sourceSvgDir = path.join(outputRoot, 'svg');
const outlineSvgDir = path.join(outputRoot, 'outlined-svg');
const distDir = outputRoot;
const mapPath = path.join(here, 'unicode-map.json');

const fontName = 'intern-discovery-icons';
const fontFamily = 'InternDiscoveryIcons';
const reservedCodePoints = new Set([0xE0AD, 0xE0AE]);

function extractLibrary(html) {
  const start = html.indexOf('const categoryDefinitions');
  const end = html.indexOf('const catalog =');
  if (start < 0 || end < 0 || end <= start) {
    throw new Error('无法从 HTML 定位图标数据区。');
  }
  const source = html.slice(start, end);
  return new Function(`${source}\nreturn { categoryDefinitions, glyphs, icons };`)();
}

function codePointHex(codePoint) {
  return `U+${codePoint.toString(16).toUpperCase().padStart(4, '0')}`;
}

function parseCodePoint(value) {
  if (typeof value !== 'string' || !/^U\+[0-9A-F]{4,6}$/i.test(value)) {
    throw new Error(`无效 Unicode：${value}`);
  }
  return Number.parseInt(value.slice(2), 16);
}

function validateLibrary(glyphs, icons) {
  const glyphKeys = Object.keys(glyphs);
  const iconKeys = icons.map(icon => icon.key);
  const tokens = icons.map(icon => icon.token);
  const codePoints = icons.map(icon => icon.unicode.codePointAt(0));
  const unique = (values) => new Set(values).size === values.length;

  if (!unique(glyphKeys)) throw new Error('glyphs 中存在重复 key。');
  if (!unique(iconKeys)) throw new Error('icons 中存在重复 key。');
  if (!unique(tokens)) throw new Error('icons 中存在重复 token。');
  if (!unique(codePoints)) throw new Error('当前页面中存在重复 Unicode。');

  const missing = iconKeys.filter(key => !Object.hasOwn(glyphs, key));
  const unused = glyphKeys.filter(key => !iconKeys.includes(key));
  if (missing.length) throw new Error(`缺少图形定义：${missing.join(', ')}`);
  if (unused.length) throw new Error(`存在未登记图形：${unused.join(', ')}`);

  for (const codePoint of codePoints) {
    if (codePoint < 0xE000 || codePoint > 0xF8FF) {
      throw new Error(`${codePointHex(codePoint)} 不在 BMP 私用区。`);
    }
    if (reservedCodePoints.has(codePoint)) {
      throw new Error(`${codePointHex(codePoint)} 已被保留，不能分配给现有图标。`);
    }
  }
}

async function loadOrCreateUnicodeMap(icons) {
  let document;
  try {
    document = JSON.parse(await fs.readFile(mapPath, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    document = {
      schemaVersion: 1,
      fontFamily,
      privateUseArea: 'BMP U+E000–U+F8FF',
      policy: 'append-only',
      reserved: {
        'U+E0AD': 'retired-model-cube',
        'U+E0AE': 'retired-api-app',
      },
      icons: Object.fromEntries(
        icons.map(icon => [icon.key, icon.unicodeHex])
      ),
    };
    await fs.writeFile(mapPath, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
  }

  if (document.schemaVersion !== 1 || !document.icons) {
    throw new Error('unicode-map.json 格式不受支持。');
  }

  const used = new Map();
  for (const [key, hex] of Object.entries(document.icons)) {
    const codePoint = parseCodePoint(hex);
    if (used.has(codePoint)) {
      throw new Error(`${hex} 同时分配给 ${used.get(codePoint)} 和 ${key}。`);
    }
    used.set(codePoint, key);
  }

  const missing = icons.filter(icon => !document.icons[icon.key]);
  if (missing.length) {
    throw new Error(
      `以下新图标尚未分配永久 Unicode：${missing.map(icon => icon.key).join(', ')}。` +
      '请只在 unicode-map.json 末尾追加新码位。'
    );
  }

  for (const icon of icons) {
    const mapped = parseCodePoint(document.icons[icon.key]);
    const current = icon.unicode.codePointAt(0);
    if (mapped !== current) {
      throw new Error(
        `${icon.key} 的页面码位 ${codePointHex(current)} 与永久映射 ` +
        `${codePointHex(mapped)} 不一致。`
      );
    }
  }

  return document;
}

function sourceSvg(fragment) {
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"',
    ' fill="none" stroke="currentColor" stroke-width="1.5"',
    ' stroke-linecap="round" stroke-linejoin="round"',
    ' shape-rendering="geometricPrecision">',
    fragment,
    '</svg>',
  ].join('');
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function fmt(value) {
  const normalized = Math.abs(value) < 0.000001 ? 0 : Number(value.toFixed(6));
  return String(normalized);
}

function rectPath(attrs) {
  const x = number(attrs.x);
  const y = number(attrs.y);
  const width = number(attrs.width);
  const height = number(attrs.height);
  let rx = Math.max(0, number(attrs.rx, number(attrs.ry)));
  let ry = Math.max(0, number(attrs.ry, rx));
  rx = Math.min(rx, width / 2);
  ry = Math.min(ry, height / 2);
  if (!rx && !ry) {
    return `M${fmt(x)} ${fmt(y)}H${fmt(x + width)}V${fmt(y + height)}H${fmt(x)}Z`;
  }
  return [
    `M${fmt(x + rx)} ${fmt(y)}`,
    `H${fmt(x + width - rx)}`,
    `A${fmt(rx)} ${fmt(ry)} 0 0 1 ${fmt(x + width)} ${fmt(y + ry)}`,
    `V${fmt(y + height - ry)}`,
    `A${fmt(rx)} ${fmt(ry)} 0 0 1 ${fmt(x + width - rx)} ${fmt(y + height)}`,
    `H${fmt(x + rx)}`,
    `A${fmt(rx)} ${fmt(ry)} 0 0 1 ${fmt(x)} ${fmt(y + height - ry)}`,
    `V${fmt(y + ry)}`,
    `A${fmt(rx)} ${fmt(ry)} 0 0 1 ${fmt(x + rx)} ${fmt(y)}`,
    'Z',
  ].join('');
}

function ellipsePath(cx, cy, rx, ry) {
  const kappa = 0.552284749831;
  const ox = rx * kappa;
  const oy = ry * kappa;
  return [
    `M${fmt(cx + rx)} ${fmt(cy)}`,
    `C${fmt(cx + rx)} ${fmt(cy + oy)} ${fmt(cx + ox)} ${fmt(cy + ry)} ${fmt(cx)} ${fmt(cy + ry)}`,
    `C${fmt(cx - ox)} ${fmt(cy + ry)} ${fmt(cx - rx)} ${fmt(cy + oy)} ${fmt(cx - rx)} ${fmt(cy)}`,
    `C${fmt(cx - rx)} ${fmt(cy - oy)} ${fmt(cx - ox)} ${fmt(cy - ry)} ${fmt(cx)} ${fmt(cy - ry)}`,
    `C${fmt(cx + ox)} ${fmt(cy - ry)} ${fmt(cx + rx)} ${fmt(cy - oy)} ${fmt(cx + rx)} ${fmt(cy)}`,
    'Z',
  ].join('');
}
function reverseEllipsePath(cx, cy, rx, ry) {
  const kappa = 0.552284749831;
  const ox = rx * kappa;
  const oy = ry * kappa;
  return [
    `M${fmt(cx + rx)} ${fmt(cy)}`,
    `C${fmt(cx + rx)} ${fmt(cy - oy)} ${fmt(cx + ox)} ${fmt(cy - ry)} ${fmt(cx)} ${fmt(cy - ry)}`,
    `C${fmt(cx - ox)} ${fmt(cy - ry)} ${fmt(cx - rx)} ${fmt(cy - oy)} ${fmt(cx - rx)} ${fmt(cy)}`,
    `C${fmt(cx - rx)} ${fmt(cy + oy)} ${fmt(cx - ox)} ${fmt(cy + ry)} ${fmt(cx)} ${fmt(cy + ry)}`,
    `C${fmt(cx + ox)} ${fmt(cy + ry)} ${fmt(cx + rx)} ${fmt(cy + oy)} ${fmt(cx + rx)} ${fmt(cy)}`,
    'Z',
  ].join('');
}

function pointsPath(points, close) {
  const values = String(points || '').trim().split(/[\s,]+/).map(Number);
  if (values.length < 4 || values.some(value => !Number.isFinite(value))) {
    throw new Error(`无效 points：${points}`);
  }
  let d = `M${fmt(values[0])} ${fmt(values[1])}`;
  for (let index = 2; index < values.length; index += 2) {
    d += `L${fmt(values[index])} ${fmt(values[index + 1])}`;
  }
  return close ? `${d}Z` : d;
}

function shapeToPath(name, attrs) {
  switch (name) {
    case 'path':
      return attrs.d;
    case 'line':
      return `M${fmt(number(attrs.x1))} ${fmt(number(attrs.y1))}` +
        `L${fmt(number(attrs.x2))} ${fmt(number(attrs.y2))}`;
    case 'rect':
      return rectPath(attrs);
    case 'circle': {
      const radius = number(attrs.r);
      return ellipsePath(number(attrs.cx), number(attrs.cy), radius, radius);
    }
    case 'ellipse':
      return ellipsePath(
        number(attrs.cx),
        number(attrs.cy),
        number(attrs.rx),
        number(attrs.ry)
      );
    case 'polyline':
      return pointsPath(attrs.points, false);
    case 'polygon':
      return pointsPath(attrs.points, true);
    default:
      return null;
  }
}

function inheritedAttribute($, element, name, fallback) {
  let current = element;
  while (current) {
    if (current.attribs && current.attribs[name] !== undefined) {
      return current.attribs[name];
    }
    current = current.parent;
  }
  return fallback;
}

function reverseAlternatingSubpaths(pathData, iconName) {
  const normalized = new SVGPathData(pathData)
    .toAbs()
    .normalizeST()
    .qtToC()
    .aToC();
  const subpaths = [];
  let current = [];
  for (const command of normalized.commands) {
    if (command.type === SVGPathData.MOVE_TO && current.length) {
      subpaths.push(current);
      current = [];
    }
    current.push(command);
  }
  if (current.length) subpaths.push(current);
  if (!subpaths.length) throw new Error(`${iconName} 的偶奇轮廓为空。`);
  return subpaths.map((commands, index) => {
    const subpath = new SVGPathData(commands);
    if (index % 2 === 1) subpath.reverse();
    return subpath.encode();
  }).join('');
}

function convertEvenOddToNonZero(svg, iconName) {
  const $ = load(svg, { xmlMode: true });
  $('path[fill-rule="evenodd"]').each((_, element) => {
    const node = $(element);
    node.attr('d', reverseAlternatingSubpaths(node.attr('d') || '', iconName));
    node.removeAttr('fill-rule');
    node.removeAttr('clip-rule');
  });
  const result = $.xml('svg');
  if (/fill-rule=["']evenodd["']/.test(result)) {
    throw new Error(`${iconName} 仍含字体不支持的偶奇填充规则。`);
  }
  return result;
}

function prepareForFont(svg, iconName) {
  const $ = load(svg, { xmlMode: true });
  if (iconName === 'atom') {
    const orbitPaths = $('path').toArray();
    if (orbitPaths.length !== 2) throw new Error('atom 轨道结构已变化，需要重新校准字体轮廓。');
    orbitPaths.forEach((element, index) => {
      element.name = 'ellipse';
      element.tagName = 'ellipse';
      element.attribs = {
        cx: '12',
        cy: '12',
        rx: '9.25',
        ry: '3.9681',
        transform: `rotate(${index ? 120 : 60} 12 12)`,
      };
    });
  }
  const shapes = $('path, line, rect, circle, ellipse, polyline, polygon').toArray();
  let outlinedShapeCount = 0;

  for (const element of shapes) {
    const $element = $(element);
    const originalName = element.name;
    const attrs = { ...element.attribs };
    let d = shapeToPath(originalName, attrs);
    if (!d) throw new Error(`${iconName} 含有无法转换的 ${originalName}。`);

    const fill = inheritedAttribute($, element, 'fill', 'black');
    const stroke = inheritedAttribute($, element, 'stroke', 'none');
    const strokeWidth = inheritedAttribute($, element, 'stroke-width', '1');
    const linecap = inheritedAttribute($, element, 'stroke-linecap', 'round');
    const linejoin = inheritedAttribute($, element, 'stroke-linejoin', 'round');
    const hasFill = fill !== 'none' && fill !== 'transparent';
    const hasStroke = stroke !== 'none' && stroke !== 'transparent' && Number(strokeWidth) > 0;
    const directEllipseOutline = hasStroke && !hasFill && ['circle', 'ellipse'].includes(originalName);
    if (directEllipseOutline) {
      const width = Number(strokeWidth);
      const cx = number(attrs.cx);
      const cy = number(attrs.cy);
      const rx = originalName === 'circle' ? number(attrs.r) : number(attrs.rx);
      const ry = originalName === 'circle' ? number(attrs.r) : number(attrs.ry);
      const innerRx = rx - width / 2;
      const innerRy = ry - width / 2;
      if (innerRx <= 0 || innerRy <= 0) throw new Error(`${iconName} 的圆形描边过粗。`);
      d = ellipsePath(cx, cy, rx + width / 2, ry + width / 2) +
        reverseEllipsePath(cx, cy, innerRx, innerRy);
    }

    element.name = 'path';
    element.tagName = 'path';
    for (const key of [
      'x', 'y', 'width', 'height', 'rx', 'ry', 'cx', 'cy', 'r',
      'x1', 'y1', 'x2', 'y2', 'points',
    ]) {
      delete element.attribs[key];
    }
    element.attribs.d = d;

    if (hasFill && hasStroke) {
      const fillClone = $element.clone();
      fillClone.attr('fill', '#000');
      fillClone.removeAttr('stroke');
      fillClone.removeAttr('stroke-width');
      fillClone.removeAttr('stroke-linecap');
      fillClone.removeAttr('stroke-linejoin');
      $element.before(fillClone);
    }

    if (directEllipseOutline) {
      element.attribs.fill = '#000';
      delete element.attribs.stroke;
      delete element.attribs['stroke-width'];
      delete element.attribs['stroke-linecap'];
      delete element.attribs['stroke-linejoin'];
    } else if (hasStroke) {
      element.attribs.fill = 'none';
      element.attribs.stroke = '#000';
      element.attribs['stroke-width'] = strokeWidth;
      element.attribs['stroke-linecap'] = linecap;
      element.attribs['stroke-linejoin'] = linejoin;
      outlinedShapeCount += 1;
    } else if (hasFill) {
      element.attribs.fill = '#000';
      delete element.attribs.stroke;
      delete element.attribs['stroke-width'];
      delete element.attribs['stroke-linecap'];
      delete element.attribs['stroke-linejoin'];
    } else {
      throw new Error(`${iconName} 中存在既无填充也无描边的图形。`);
    }
  }

  const prepared = $.xml('svg');
  const log = {};
  let outlined;
  try {
    outlined = outlineSvg(prepared, ['outline'], log);
  } catch (error) {
    const $retry = load(prepared, { xmlMode: true });
    let relaxedClosedPaths = 0;
    $retry('path[stroke]').each((_, element) => {
      const node = $retry(element);
      const d = node.attr('d') || '';
      if (/z\s*$/i.test(d)) {
        node.attr('d', d.replace(/z\s*$/i, ''));
        relaxedClosedPaths += 1;
      }
    });
    if (!relaxedClosedPaths) {
      throw new Error(`${iconName} 描边转轮廓失败：${error.message}`, { cause: error });
    }
    try {
      outlined = outlineSvg($retry.xml('svg'), ['outline'], log);
    } catch (retryError) {
      throw new Error(`${iconName} 闭合曲线轮廓转换失败：${retryError.message}`, { cause: retryError });
    }
  }
  if (log.paths !== outlinedShapeCount) {
    throw new Error(
      `${iconName} 描边转换数量异常：预期 ${outlinedShapeCount}，实际 ${log.paths ?? 0}。`
    );
  }
  if (/<(?:line|rect|circle|ellipse|polyline|polygon)\b/.test(outlined)) {
    throw new Error(`${iconName} 仍含未转换的基础图形。`);
  }
  const $outlined = load(outlined, { xmlMode: true });
  $outlined('[stroke], [stroke-width], [stroke-linecap], [stroke-linejoin]').each(
    (_, element) => {
      const node = $outlined(element);
      node.removeAttr('stroke');
      node.removeAttr('stroke-width');
      node.removeAttr('stroke-linecap');
      node.removeAttr('stroke-linejoin');
    }
  );
  const cleaned = $outlined.xml('svg');
  if (/\sstroke=/.test(cleaned)) throw new Error(`${iconName} 仍含描边，不能安全生成普通轮廓字体。`);
  const nonZero = convertEvenOddToNonZero(cleaned, iconName);
  return nonZero.replaceAll('fill="#000"', 'fill="black"');
}

function xmlEscape(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function makeSymbolSprite(icons, glyphs) {
  const symbols = icons.map(icon => [
    `<symbol id="${xmlEscape(icon.token)}" viewBox="0 0 24 24"`,
    ' fill="none" stroke="currentColor" stroke-width="1.5"',
    ' stroke-linecap="round" stroke-linejoin="round">',
    glyphs[icon.key],
    '</symbol>',
  ].join(''));
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true">',
    ...symbols,
    '</svg>',
    '',
  ].join('\n');
}

function makeCss(icons, unicodeMap) {
  const rules = icons.map(icon => {
    const codePoint = parseCodePoint(unicodeMap.icons[icon.key]);
    return `.${icon.token}::before{content:"\\${codePoint.toString(16).toLowerCase()}";}`;
  });
  return [
    '/* Generated file. Do not edit by hand. */',
    '@font-face{',
    `  font-family:"${fontFamily}";`,
    `  src:url("./${fontName}.woff2") format("woff2"),`,
    `      url("./${fontName}.woff") format("woff");`,
    '  font-weight:normal;',
    '  font-style:normal;',
    '  font-display:block;',
    '}',
    '.iconfont{',
    `  font-family:"${fontFamily}"!important;`,
    '  font-style:normal;',
    '  font-weight:normal;',
    '  font-variant:normal;',
    '  line-height:1;',
    '  text-transform:none;',
    '  speak:never;',
    '  -webkit-font-smoothing:antialiased;',
    '  -moz-osx-font-smoothing:grayscale;',
    '}',
    ...rules,
    '',
  ].join('\n');
}

function makeUnicodeMapScript(unicodeMap) {
  return [
    '/* Generated file. Unicode assignments are append-only. */',
    'globalThis.InternDiscoveryIconUnicode = Object.freeze(',
    `${JSON.stringify(unicodeMap.icons, null, 2)}`,
    ');',
    '',
  ].join('\n');
}

function makeManifest(icons, unicodeMap) {
  return {
    schemaVersion: 1,
    name: 'Intern Discovery Icons',
    fontFamily,
    fontFiles: {
      woff2: `${fontName}.woff2`,
      woff: `${fontName}.woff`,
      ttf: `${fontName}.ttf`,
    },
    icons: icons.map(icon => ({
      key: icon.key,
      name: icon.name,
      token: icon.token,
      unicode: unicodeMap.icons[icon.key],
      htmlEntity: `&#x${unicodeMap.icons[icon.key].slice(2)};`,
      category: icon.category,
      family: icon.family,
      aliases: icon.aliases,
      svg: `./svg/${icon.token.slice(5)}.svg`,
    })),
  };
}

function makeDemo(icons, unicodeMap) {
  const cards = icons.map(icon => {
    const hex = unicodeMap.icons[icon.key];
    return [
      '<article>',
      `<span class="sample iconfont ${icon.token}" aria-hidden="true"></span>`,
      `<strong>${xmlEscape(icon.name)}</strong>`,
      `<code>${xmlEscape(icon.token)}</code>`,
      `<small>${hex}</small>`,
      '</article>',
    ].join('');
  }).join('\n');
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Intern Discovery Unicode Icon Font</title>
  <link rel="stylesheet" href="./iconfont.css">
  <style>
    *{box-sizing:border-box}
    body{margin:0;padding:32px;color:#172437;background:#f5f7fa;font:14px/1.5 Inter,"PingFang SC",sans-serif}
    h1{margin:0 0 8px;font-size:26px}p{margin:0 0 28px;color:#667085}
    main{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px}
    article{display:grid;grid-template-columns:48px 1fr;grid-template-rows:auto auto auto;column-gap:12px;padding:14px;border:1px solid #dfe5ed;border-radius:10px;background:#fff}
    .sample{grid-row:1/4;align-self:center;font-size:32px;color:#1768c4}
    strong{font-size:13px}code,small{color:#667085;font-size:11px}
  </style>
</head>
<body>
  <h1>Intern Discovery Unicode Icon Font</h1>
  <p>${icons.length} 个图标 · 永久 Unicode 映射 · WOFF2/WOFF</p>
  <main>${cards}</main>
</body>
</html>
`;
}

async function emptyAndCreate(directory) {
  await fs.rm(directory, { recursive: true, force: true });
  await fs.mkdir(directory, { recursive: true });
}

async function main() {
  const html = await fs.readFile(inputHtml, 'utf8');
  const persistedUnicodeMap = JSON.parse(await fs.readFile(mapPath, 'utf8'));
  globalThis.InternDiscoveryIconUnicode = persistedUnicodeMap.icons;
  const { glyphs, icons } = extractLibrary(html);
  validateLibrary(glyphs, icons);
  const unicodeMap = await loadOrCreateUnicodeMap(icons);
  delete globalThis.InternDiscoveryIconUnicode;

  await emptyAndCreate(outputRoot);
  await fs.mkdir(sourceSvgDir, { recursive: true });
  await fs.mkdir(outlineSvgDir, { recursive: true });
  await fs.mkdir(distDir, { recursive: true });

  for (const icon of icons) {
    const fileName = `${icon.token.slice(5)}.svg`;
    const source = sourceSvg(glyphs[icon.key]);
    const outlined = prepareForFont(source, icon.key);
    await fs.writeFile(path.join(sourceSvgDir, fileName), `${source}\n`, 'utf8');
    await fs.writeFile(path.join(outlineSvgDir, fileName), `${outlined}\n`, 'utf8');
  }

  const unicodeByFileName = new Map(
    icons.map(icon => [
      icon.token.slice(5),
      parseCodePoint(unicodeMap.icons[icon.key]),
    ])
  );
  const fontOptions = {
    src: outlineSvgDir,
    dist: distDir,
    fontName,
    startUnicode: 0xE001,
    getIconUnicode(name) {
      const codePoint = unicodeByFileName.get(name);
      if (!codePoint) throw new Error(`字体生成器遇到未知图标：${name}`);
      return [String.fromCodePoint(codePoint), codePoint];
    },
    svgicons2svgfont: {
      fontName: fontFamily,
      fontHeight: 1024,
      descent: 0,
      normalize: false,
      fixedWidth: true,
      centerHorizontally: true,
      centerVertically: true,
      log: () => {},
    },
  };

  const { unicodeObject } = await createSVG(fontOptions);
  const ttf = await createTTF(fontOptions);
  await Promise.all([
    createWOFF(fontOptions, ttf),
    createWOFF2(fontOptions, ttf),
  ]);

  for (const icon of icons) {
    const fileName = icon.token.slice(5);
    const actual = unicodeObject[fileName]?.codePointAt(0);
    const expected = unicodeByFileName.get(fileName);
    if (actual !== expected) {
      throw new Error(
        `${icon.key} 字体码位错误：预期 ${codePointHex(expected)}，` +
        `实际 ${actual ? codePointHex(actual) : '缺失'}。`
      );
    }
  }

  const manifest = makeManifest(icons, unicodeMap);
  await Promise.all([
    fs.writeFile(
      path.join(outputRoot, 'unicode-map.json'),
      `${JSON.stringify(unicodeMap, null, 2)}\n`,
      'utf8'
    ),
    fs.writeFile(
      path.join(outputRoot, 'unicode-map.js'),
      makeUnicodeMapScript(unicodeMap),
      'utf8'
    ),
    fs.writeFile(
      path.join(outputRoot, 'manifest.json'),
      `${JSON.stringify(manifest, null, 2)}\n`,
      'utf8'
    ),
    fs.writeFile(
      path.join(outputRoot, 'iconfont.symbol.svg'),
      makeSymbolSprite(icons, glyphs),
      'utf8'
    ),
    fs.writeFile(path.join(distDir, 'iconfont.css'), makeCss(icons, unicodeMap), 'utf8'),
    fs.writeFile(path.join(distDir, 'demo.html'), makeDemo(icons, unicodeMap), 'utf8'),
    fs.copyFile(path.join(here, 'PACKAGE_README.md'), path.join(outputRoot, 'README.md')),
  ]);

  const summary = {
    icons: icons.length,
    glyphs: Object.keys(glyphs).length,
    codePointMin: codePointHex(Math.min(...unicodeByFileName.values())),
    codePointMax: codePointHex(Math.max(...unicodeByFileName.values())),
    reserved: [...reservedCodePoints].map(codePointHex),
    files: {
      woff2: (await fs.stat(path.join(distDir, `${fontName}.woff2`))).size,
      woff: (await fs.stat(path.join(distDir, `${fontName}.woff`))).size,
      ttf: (await fs.stat(path.join(distDir, `${fontName}.ttf`))).size,
    },
  };
  await fs.writeFile(
    path.join(outputRoot, 'build-report.json'),
    `${JSON.stringify(summary, null, 2)}\n`,
    'utf8'
  );
  console.log(JSON.stringify(summary, null, 2));
}

await main();
