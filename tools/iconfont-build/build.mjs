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
import { cornerProfiles, glyphForCornerStyle } from './corner-styles.mjs';

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
const cornerVariants = Object.freeze([
  { id: 'sharp', familySuffix: 'Sharp' },
  { id: 'standard', familySuffix: 'Standard' },
  { id: 'rounded', familySuffix: 'Rounded' },
]);
const strokeWeights = Object.freeze([
  { id: 'normal', fileSuffix: '', familySuffix: '', sourceStroke: 1.5, scale: 1, strokeAt16: 1 },
  { id: 'w1875', fileSuffix: '-w1875', familySuffix: 'W1875', sourceStroke: 1.875, scale: 1.25, strokeAt16: 1.25 },
]);
const fontVariants = Object.freeze(cornerVariants.flatMap(corner =>
  strokeWeights.map(weight => ({
    id: weight.id === 'normal' ? corner.id : `${corner.id}-${weight.id}`,
    corner: corner.id,
    weight: weight.id,
    sourceStroke: weight.sourceStroke,
    strokeScale: weight.scale,
    strokeAt16: weight.strokeAt16,
    name: `${fontName}-${corner.id}${weight.fileSuffix}`,
    family: `${fontFamily}${corner.familySuffix}${weight.familySuffix}`,
  }))
));
const publicFontVariants = Object.freeze(fontVariants.filter(variant => variant.weight === 'w1875'));
const reservedCodePoints = new Set([0xE0AD, 0xE0AE]);
const textPathOverrides = Object.freeze({
  PDF: "M6.35351 17.6L6.35351 13.01875L8.40653 13.01875Q9.07724 13.01875 9.41123 13.38438Q9.74522 13.75 9.74522 14.425L9.74522 14.425Q9.74522 15.11875 9.38124 15.50938Q9.01726 15.9 8.27021 15.9L8.27021 15.9L7.59405 15.9L7.59405 17.6L6.35351 17.6zM7.59405 13.95L7.59405 14.97188L7.89668 14.97188Q8.25385 14.97188 8.39835 14.82969Q8.54286 14.6875 8.54286 14.46563L8.54286 14.46563Q8.54286 14.25 8.41744 14.1Q8.29202 13.95 7.94576 13.95L7.94576 13.95L7.59405 13.95zM10.40775 17.6L10.40775 13.01875L12.24265 13.01875Q12.78522 13.01875 13.11921 13.1875Q13.4532 13.35625 13.67131 13.67188Q13.88943 13.9875 13.98758 14.40625Q14.08573 14.825 14.08573 15.29375L14.08573 15.29375Q14.08573 16.02813 13.93987 16.43281Q13.79401 16.8375 13.53499 17.11094Q13.27598 17.38438 12.97879 17.475L12.97879 17.475Q12.57256 17.6 12.24265 17.6L12.24265 17.6L10.40775 17.6zM11.95092 14.05625L11.64283 14.05625L11.64283 16.55938L11.94547 16.55938Q12.33263 16.55938 12.49621 16.46094Q12.6598 16.3625 12.7525 16.11719Q12.8452 15.87188 12.8452 15.32188L12.8452 15.32188Q12.8452 14.59375 12.63799 14.325Q12.43078 14.05625 11.95092 14.05625L11.95092 14.05625zM14.74008 17.6L14.74008 13.01875L17.79372 13.01875L17.79372 14.00313L15.98062 14.00313L15.98062 14.80313L17.52925 14.80313L17.52925 15.72813L15.98062 15.72813L15.98062 17.6L14.74008 17.6z",
  PPT: "M6.4936 17.6L6.4936 13.01875L8.49617 13.01875Q9.15039 13.01875 9.47617 13.38438Q9.80196 13.75 9.80196 14.425L9.80196 14.425Q9.80196 15.11875 9.44692 15.50938Q9.09188 15.9 8.36319 15.9L8.36319 15.9L7.70365 15.9L7.70365 17.6L6.4936 17.6zM7.70365 13.95L7.70365 14.97188L7.99885 14.97188Q8.34724 14.97188 8.48819 14.82969Q8.62914 14.6875 8.62914 14.46563L8.62914 14.46563Q8.62914 14.25 8.5068 14.1Q8.38447 13.95 8.04672 13.95L8.04672 13.95L7.70365 13.95zM10.42693 17.6L10.42693 13.01875L12.4295 13.01875Q13.08373 13.01875 13.40951 13.38438Q13.73529 13.75 13.73529 14.425L13.73529 14.425Q13.73529 15.11875 13.38025 15.50938Q13.02522 15.9 12.29653 15.9L12.29653 15.9L11.63699 15.9L11.63699 17.6L10.42693 17.6zM11.63699 13.95L11.63699 14.97188L11.93218 14.97188Q12.28057 14.97188 12.42152 14.82969Q12.56248 14.6875 12.56248 14.46563L12.56248 14.46563Q12.56248 14.25 12.44014 14.1Q12.31781 13.95 11.98005 13.95L11.98005 13.95L11.63699 13.95zM14.09166 14.15L14.09166 13.01875L17.75373 13.01875L17.75373 14.15L16.52506 14.15L16.52506 17.6L15.32033 17.6L15.32033 14.15L14.09166 14.15z",
});

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

function scaleStrokeWidths(fragment, scale) {
  if (scale === 1) return fragment;
  return fragment.replace(/stroke-width=(['"])(-?\d*\.?\d+)\1/g, (match, quote, value) =>
    `stroke-width=${quote}${fmt(number(value) * scale)}${quote}`
  );
}

function sourceSvg(fragment, profile = cornerProfiles.standard, strokeWidth = 1.5) {
  const stroke = /data-shape="filled"/.test(fragment) ? 'none' : 'currentColor';
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"',
    ` fill="none" stroke="${stroke}" stroke-width="${fmt(strokeWidth)}"`,
    ` stroke-linecap="${profile.linecap}" stroke-linejoin="${profile.linejoin}"`,
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

function rectOutlinePath(attrs, strokeWidth) {
  const half = strokeWidth / 2;
  const x = number(attrs.x);
  const y = number(attrs.y);
  const width = number(attrs.width);
  const height = number(attrs.height);
  const rx = Math.max(0, number(attrs.rx, number(attrs.ry)));
  const ry = Math.max(0, number(attrs.ry, rx));
  const outer = rectPath({
    x: x - half,
    y: y - half,
    width: width + strokeWidth,
    height: height + strokeWidth,
    rx: rx + half,
    ry: ry + half,
  });
  const innerWidth = width - strokeWidth;
  const innerHeight = height - strokeWidth;
  if (innerWidth <= 0 || innerHeight <= 0) return outer;
  const inner = rectPath({
    x: x + half,
    y: y + half,
    width: innerWidth,
    height: innerHeight,
    rx: Math.max(0, rx - half),
    ry: Math.max(0, ry - half),
  });
  const reversedInner = new SVGPathData(inner)
    .toAbs()
    .normalizeHVZ(false, true, true)
    .normalizeST()
    .qtToC()
    .aToC()
    .reverse()
    .encode();
  return outer + reversedInner;
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

function splitNormalizedSubpaths(pathData, iconName) {
  const normalized = new SVGPathData(pathData)
    .toAbs()
    .normalizeHVZ(false, true, true)
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
  return subpaths;
}

function flattenSubpath(commands, iconName) {
  const points = [];
  let currentX = 0;
  let currentY = 0;
  for (const command of commands) {
    if (command.type === SVGPathData.MOVE_TO) {
      currentX = command.x;
      currentY = command.y;
      points.push([currentX, currentY]);
    } else if (command.type === SVGPathData.LINE_TO) {
      currentX = command.x;
      currentY = command.y;
      points.push([currentX, currentY]);
    } else if (command.type === SVGPathData.CURVE_TO) {
      const startX = currentX;
      const startY = currentY;
      for (let step = 1; step <= 12; step += 1) {
        const t = step / 12;
        const inverse = 1 - t;
        const x = inverse ** 3 * startX +
          3 * inverse ** 2 * t * command.x1 +
          3 * inverse * t ** 2 * command.x2 +
          t ** 3 * command.x;
        const y = inverse ** 3 * startY +
          3 * inverse ** 2 * t * command.y1 +
          3 * inverse * t ** 2 * command.y2 +
          t ** 3 * command.y;
        points.push([x, y]);
      }
      currentX = command.x;
      currentY = command.y;
    } else if (command.type !== SVGPathData.CLOSE_PATH) {
      throw new Error(`${iconName} 含有未标准化的轮廓命令。`);
    }
  }
  if (points.length < 3) throw new Error(`${iconName} 含有无法定向的子轮廓。`);
  return points;
}

function signedPolygonArea(points) {
  let twiceArea = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    twiceArea += current[0] * next[1] - next[0] * current[1];
  }
  return twiceArea / 2;
}

function pointInPolygon(point, polygon) {
  let inside = false;
  const [x, y] = point;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const [x1, y1] = polygon[index];
    const [x2, y2] = polygon[previous];
    const crosses = (y1 > y) !== (y2 > y) &&
      x < (x2 - x1) * (y - y1) / (y2 - y1) + x1;
    if (crosses) inside = !inside;
  }
  return inside;
}

function interiorPoint(points, area, iconName) {
  let centroidX = 0;
  let centroidY = 0;
  let areaFactor = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    const cross = current[0] * next[1] - next[0] * current[1];
    centroidX += (current[0] + next[0]) * cross;
    centroidY += (current[1] + next[1]) * cross;
    areaFactor += cross;
  }
  if (Math.abs(areaFactor) > 1e-9) {
    const centroid = [centroidX / (3 * areaFactor), centroidY / (3 * areaFactor)];
    if (pointInPolygon(centroid, points)) return centroid;
  }

  let minY = Infinity;
  let maxY = -Infinity;
  for (const [, y] of points) {
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  const height = Math.max(maxY - minY, 1);
  const scanlines = [0.5, 0.33, 0.67, 0.2, 0.8].map(ratio => minY + height * ratio);
  for (const y of scanlines) {
    const intersections = [];
    for (let index = 0; index < points.length; index += 1) {
      const [x1, y1] = points[index];
      const [x2, y2] = points[(index + 1) % points.length];
      if ((y1 > y) !== (y2 > y)) {
        intersections.push(x1 + (x2 - x1) * (y - y1) / (y2 - y1));
      }
    }
    intersections.sort((a, b) => a - b);
    let best = null;
    for (let index = 0; index + 1 < intersections.length; index += 2) {
      const width = intersections[index + 1] - intersections[index];
      const candidate = [(intersections[index] + intersections[index + 1]) / 2, y];
      if (width > 1e-8 && pointInPolygon(candidate, points) && (!best || width > best.width)) {
        best = { point: candidate, width };
      }
    }
    if (best) return best.point;
  }
  throw new Error(`${iconName} 无法找到子轮廓内部采样点（面积 ${area}）。`);
}

function orientSubpathsForNonZero(pathData, iconName) {
  const entries = splitNormalizedSubpaths(pathData, iconName)
    .map(commands => {
      const polygon = flattenSubpath(commands, iconName);
      return { commands, polygon, area: signedPolygonArea(polygon) };
    })
    .filter(entry => Math.abs(entry.area) >= 1e-7);
  if (!entries.length) throw new Error(`${iconName} 的有效轮廓为空。`);
  for (const entry of entries) {
    entry.sample = interiorPoint(entry.polygon, entry.area, iconName);
  }
  return entries.map((entry, index) => {
    const currentArea = Math.abs(entry.area);
    const depth = entries.reduce((count, other, otherIndex) => {
      if (otherIndex === index || Math.abs(other.area) <= currentArea + 1e-7) return count;
      return pointInPolygon(entry.sample, other.polygon) ? count + 1 : count;
    }, 0);
    const desiredSign = depth % 2 === 0 ? 1 : -1;
    const actualSign = Math.sign(entry.area);
    const subpath = new SVGPathData(entry.commands);
    if (actualSign !== desiredSign) subpath.reverse();
    return subpath.encode();
  }).join('');
}

function convertEvenOddToNonZero(svg, iconName) {
  const $ = load(svg, { xmlMode: true });
  $('path[fill]').each((_, element) => {
    const node = $(element);
    node.attr('d', orientSubpathsForNonZero(node.attr('d') || '', iconName));
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
  $('text').each((_, element) => {
    const label = $(element).text().trim();
    const d = textPathOverrides[label];
    if (!d) throw new Error(`${iconName} 含有尚未转换为轮廓的文字：${label}`);
    element.name = 'path';
    element.tagName = 'path';
    element.children = [];
    element.attribs = { d, fill: '#000', stroke: 'none' };
  });
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
    const directRectOutline = hasStroke && !hasFill && originalName === 'rect';
    if (directRectOutline) {
      d = rectOutlinePath(attrs, Number(strokeWidth));
    } else if (directEllipseOutline) {
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

    if (directEllipseOutline || directRectOutline) {
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
  const symbols = icons.map(icon => {
    const fragment = glyphs[icon.key];
    const stroke = /data-shape="filled"/.test(fragment) ? 'none' : 'currentColor';
    return [
    `<symbol id="${xmlEscape(icon.token)}" viewBox="0 0 24 24"`,
    ` fill="none" stroke="${stroke}" stroke-width="1.5"`,
    ' stroke-linecap="round" stroke-linejoin="round">',
    fragment,
    '</symbol>',
  ].join('');
  });
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true">',
    ...symbols,
    '</svg>',
    '',
  ].join('\n');
}

const publicFontBaseUrl =
  'https://raw.githubusercontent.com/14060415/InternInkStone_Icon/main/iconfont';
const fontAssetVersion = '20260812-r9';

function fontFace(family, file) {
  return [
    '@font-face{',
    `  font-family:"${family}";`,
    `  src:url("./${file}.woff2?v=${fontAssetVersion}") format("woff2"),`,
    `      url("${publicFontBaseUrl}/${file}.woff2?v=${fontAssetVersion}") format("woff2"),`,
    `      url("./${file}.woff?v=${fontAssetVersion}") format("woff"),`,
    `      url("${publicFontBaseUrl}/${file}.woff?v=${fontAssetVersion}") format("woff");`,
    '  font-weight:normal;',
    '  font-style:normal;',
    '  font-display:block;',
    '}',
  ];
}

function makeCss(icons, unicodeMap) {
  const rules = icons.map(icon => {
    const codePoint = parseCodePoint(unicodeMap.icons[icon.key]);
    return `.${icon.token}::before{content:"\\${codePoint.toString(16).toLowerCase()}";}`;
  });
  return [
    '/* Generated file. Do not edit by hand. */',
    ...fontFace(fontFamily, fontName),
    ...fontVariants.flatMap(variant => fontFace(variant.family, variant.name)),
    `.iconfont,${publicFontVariants.flatMap(variant => [`.iconfont-${variant.corner}`, `.iconfont-${variant.id}`]).join(',')}{`,
    '  font-style:normal;',
    '  font-weight:normal;',
    '  font-variant:normal;',
    '  line-height:1;',
    '  text-transform:none;',
    '  speak:never;',
    '  -webkit-font-smoothing:antialiased;',
    '  -moz-osx-font-smoothing:grayscale;',
    '}',
    `.iconfont{font-family:"${fontFamily}"!important;}`,
    ...publicFontVariants.flatMap(variant => [
      `.iconfont-${variant.corner}{font-family:"${variant.family}"!important;}`,
      `.iconfont-${variant.id}{font-family:"${variant.family}"!important;}`,
    ]),
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
    fontVariants: Object.fromEntries(fontVariants.map(variant => [
      variant.id,
      {
        fontFamily: variant.family,
        corner: variant.corner,
        weight: variant.weight,
        sourceStroke: variant.sourceStroke,
        strokeAt16: variant.strokeAt16,
        fontFiles: {
          woff2: `${variant.name}.woff2`,
          woff: `${variant.name}.woff`,
          ttf: `${variant.name}.ttf`,
        },
      },
    ])),
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

function variantDirectories(variant) {
  if (variant.corner === 'standard' && variant.weight === 'normal') {
    return { source: sourceSvgDir, outline: outlineSvgDir };
  }
  return {
    source: path.join(outputRoot, `svg-${variant.id}`),
    outline: path.join(outputRoot, `outlined-svg-${variant.id}`),
  };
}

function makeFontOptions(variant, outlineDir, unicodeByFileName) {
  return {
    src: outlineDir,
    dist: distDir,
    fontName: variant.name,
    startUnicode: 0xE001,
    getIconUnicode(name) {
      const codePoint = unicodeByFileName.get(name);
      if (!codePoint) throw new Error(`字体生成器遇到未知图标：${name}`);
      return [String.fromCodePoint(codePoint), codePoint];
    },
    svgicons2svgfont: {
      fontName: variant.family,
      fontHeight: 1024,
      descent: 0,
      normalize: false,
      fixedWidth: true,
      centerHorizontally: true,
      centerVertically: true,
      log: () => {},
    },
  };
}

async function buildVariantFont(variant, outlineDir, icons, unicodeByFileName) {
  const options = makeFontOptions(variant, outlineDir, unicodeByFileName);
  const { unicodeObject } = await createSVG(options);
  const ttf = await createTTF(options);
  await Promise.all([
    createWOFF(options, ttf),
    createWOFF2(options, ttf),
  ]);
  for (const icon of icons) {
    const fileName = icon.token.slice(5);
    const actual = unicodeObject[fileName]?.codePointAt(0);
    const expected = unicodeByFileName.get(fileName);
    if (actual !== expected) {
      throw new Error(
        `${variant.id}/${icon.key} 字体码位错误：预期 ${codePointHex(expected)}，` +
        `实际 ${actual ? codePointHex(actual) : '缺失'}。`
      );
    }
  }
  return {
    woff2: (await fs.stat(path.join(distDir, `${variant.name}.woff2`))).size,
    woff: (await fs.stat(path.join(distDir, `${variant.name}.woff`))).size,
    ttf: (await fs.stat(path.join(distDir, `${variant.name}.ttf`))).size,
  };
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
  await fs.mkdir(distDir, { recursive: true });
  const directories = new Map();
  for (const variant of fontVariants) {
    const dirs = variantDirectories(variant);
    directories.set(variant.id, dirs);
    await Promise.all([
      fs.mkdir(dirs.source, { recursive: true }),
      fs.mkdir(dirs.outline, { recursive: true }),
    ]);
  }

  for (const variant of fontVariants) {
    const profile = cornerProfiles[variant.corner];
    const dirs = directories.get(variant.id);
    for (const icon of icons) {
      const fileName = `${icon.token.slice(5)}.svg`;
      const cornerFragment = glyphForCornerStyle(glyphs[icon.key], variant.corner);
      let fragment = scaleStrokeWidths(cornerFragment, variant.strokeScale);
      if (icon.key === 'edit' && variant.id === 'sharp-w1875') {
        fragment = fragment.replace(
          /<path d="[^"]+"/,
          '<path d="M5.4 20 L7.379 20 L8.439 19.561 L17.939 10.061 L17.939 7.939 ' +
          'L16.061 6.061 L13.939 6.061 L4.439 15.561 L4 16.621 L4 18.6 L5.4 20 Z ' +
          'M13.5 6.5 L17.5 10.5"'
        );
      }
      const sourceSvgText = sourceSvg(fragment, profile, variant.sourceStroke);
      let outlined;
      try {
        outlined = prepareForFont(sourceSvgText, icon.key);
      } catch (error) {
        throw new Error(`${variant.id}/${icon.key} 描边转轮廓失败：${error.message}`, { cause: error });
      }
      await Promise.all([
        fs.writeFile(path.join(dirs.source, fileName), `${sourceSvgText}\n`, 'utf8'),
        fs.writeFile(path.join(dirs.outline, fileName), `${outlined}\n`, 'utf8'),
      ]);
    }
  }

  const unicodeByFileName = new Map(
    icons.map(icon => [
      icon.token.slice(5),
      parseCodePoint(unicodeMap.icons[icon.key]),
    ])
  );
  const variantFiles = {};
  for (const variant of fontVariants) {
    variantFiles[variant.id] = await buildVariantFont(
      variant,
      directories.get(variant.id).outline,
      icons,
      unicodeByFileName
    );
  }

  const standard = publicFontVariants.find(variant => variant.corner === 'standard');
  for (const extension of ['svg', 'ttf', 'woff', 'woff2']) {
    await fs.copyFile(
      path.join(distDir, `${standard.name}.${extension}`),
      path.join(distDir, `${fontName}.${extension}`)
    );
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
    files: variantFiles['standard-w1875'],
    strokeWeights: Object.fromEntries(strokeWeights.map(weight => [weight.id, {
      sourceStroke: weight.sourceStroke,
      strokeAt16: weight.strokeAt16,
      scale: weight.scale,
    }])),
    variants: variantFiles,
  };
  await fs.writeFile(
    path.join(outputRoot, 'build-report.json'),
    `${JSON.stringify(summary, null, 2)}\n`,
    'utf8'
  );
  console.log(JSON.stringify(summary, null, 2));
}

await main();
