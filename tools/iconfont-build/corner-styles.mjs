export const cornerProfiles = Object.freeze({
  sharp: Object.freeze({ linecap: 'round', linejoin: 'miter', radius: 0.5, pointedRadius: 0.1 }),
  standard: Object.freeze({ linecap: 'round', linejoin: 'round', radius: 1.5, pointedRadius: 0.5 }),
  rounded: Object.freeze({ linecap: 'round', linejoin: 'round', radius: 2.5, pointedRadius: 1 }),
});

function setSvgAttribute(tag, name, value) {
  const pattern = new RegExp(String.raw`\s${name}="[^"]*"`);
  if (pattern.test(tag)) return tag.replace(pattern, ` ${name}="${value}"`);
  return tag.replace(/\/?>$/, ending => ` ${name}="${value}"${ending}`);
}

function pathNumber(value) {
  const normalized = Math.abs(value) < 0.0005 ? 0 : Number(value.toFixed(3));
  return String(normalized);
}

function samePoint(a, b) {
  return Math.abs(a.x - b.x) < 0.0001 && Math.abs(a.y - b.y) < 0.0001;
}

function parseLinearPathData(data) {
  if (/[AaCcQqSsTt]/.test(data)) return null;
  const tokens = data.match(/[MmLlHhVvZz]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g);
  if (!tokens?.length) return null;
  const isCommand = token => /^[MmLlHhVvZz]$/.test(token);
  let index = 0;
  let command = '';
  let x = 0;
  let y = 0;
  let startX = 0;
  let startY = 0;
  let current = null;
  const subpaths = [];
  const hasNumber = () => index < tokens.length && !isCommand(tokens[index]);
  const readNumber = () => Number(tokens[index++]);
  const appendPoint = (nextX, nextY) => {
    x = nextX;
    y = nextY;
    const point = { x, y };
    if (!current.points.length || !samePoint(current.points.at(-1), point)) current.points.push(point);
  };

  while (index < tokens.length) {
    if (isCommand(tokens[index])) command = tokens[index++];
    else if (!command) return null;
    const lower = command.toLowerCase();
    const relative = command === lower;
    if (lower === 'z') {
      if (!current) return null;
      current.closed = true;
      if (current.points.length > 1 && samePoint(current.points[0], current.points.at(-1))) current.points.pop();
      x = startX;
      y = startY;
      current = null;
      command = '';
      continue;
    }
    if (lower === 'm') {
      if (!hasNumber()) return null;
      let first = true;
      while (hasNumber()) {
        if (index + 1 >= tokens.length || isCommand(tokens[index + 1])) return null;
        let nextX = readNumber();
        let nextY = readNumber();
        if (relative) {
          nextX += x;
          nextY += y;
        }
        if (first) {
          current = { points: [], closed: false };
          subpaths.push(current);
          x = nextX;
          y = nextY;
          startX = x;
          startY = y;
          current.points.push({ x, y });
          first = false;
        } else appendPoint(nextX, nextY);
      }
      command = relative ? 'l' : 'L';
      continue;
    }
    if (!current) return null;
    if (lower === 'l') {
      let consumed = false;
      while (hasNumber()) {
        if (index + 1 >= tokens.length || isCommand(tokens[index + 1])) return null;
        let nextX = readNumber();
        let nextY = readNumber();
        if (relative) {
          nextX += x;
          nextY += y;
        }
        appendPoint(nextX, nextY);
        consumed = true;
      }
      if (!consumed) return null;
      continue;
    }
    if (lower === 'h') {
      let consumed = false;
      while (hasNumber()) {
        let nextX = readNumber();
        if (relative) nextX += x;
        appendPoint(nextX, y);
        consumed = true;
      }
      if (!consumed) return null;
      continue;
    }
    if (lower === 'v') {
      let consumed = false;
      while (hasNumber()) {
        let nextY = readNumber();
        if (relative) nextY += y;
        appendPoint(x, nextY);
        consumed = true;
      }
      if (!consumed) return null;
      continue;
    }
    return null;
  }
  return subpaths.length ? subpaths : null;
}

function filletCorner(previous, corner, next, radius, pointedRadius = radius) {
  const before = { x: previous.x - corner.x, y: previous.y - corner.y };
  const after = { x: next.x - corner.x, y: next.y - corner.y };
  const beforeLength = Math.hypot(before.x, before.y);
  const afterLength = Math.hypot(after.x, after.y);
  if (beforeLength < 0.01 || afterLength < 0.01) return null;
  const beforeUnit = { x: before.x / beforeLength, y: before.y / beforeLength };
  const afterUnit = { x: after.x / afterLength, y: after.y / afterLength };
  const cosine = Math.max(-1, Math.min(1, beforeUnit.x * afterUnit.x + beforeUnit.y * afterUnit.y));
  const angle = Math.acos(cosine);
  if (angle < 0.08 || Math.PI - angle < 0.08) return null;
  const effectiveRadius = angle < Math.PI / 2 - 0.01 ? pointedRadius : radius;
  const tangent = Math.min(effectiveRadius / Math.tan(angle / 2), beforeLength * 0.35, afterLength * 0.35);
  if (!Number.isFinite(tangent) || tangent < 0.01) return null;
  return {
    entry: { x: corner.x + beforeUnit.x * tangent, y: corner.y + beforeUnit.y * tangent },
    exit: { x: corner.x + afterUnit.x * tangent, y: corner.y + afterUnit.y * tangent },
  };
}

function hasRoundedJunction(subpaths) {
  return Boolean(subpaths?.some((shaft, shaftIndex) => {
    if (shaft.closed || shaft.points.length !== 2) return false;
    return shaft.points.some(junction => subpaths.some((branch, branchIndex) => {
      if (branchIndex === shaftIndex || branch.points.length < 3) return false;
      return branch.points.some((point, index) => samePoint(point, junction) &&
        (branch.closed || (index > 0 && index < branch.points.length - 1)));
    }));
  }));
}

function reconcileRoundedJunctions(subpaths, radius, pointedRadius, capRadius = 0.75) {
  const adjusted = subpaths.map(subpath => ({
    closed: subpath.closed,
    points: subpath.points.map(point => ({ ...point })),
  }));
  adjusted.forEach((shaft, shaftIndex) => {
    if (shaft.closed || shaft.points.length !== 2) return;
    [0, 1].forEach(endpointIndex => {
      const junction = shaft.points[endpointIndex];
      const other = shaft.points[1 - endpointIndex];
      for (let branchIndex = 0; branchIndex < adjusted.length; branchIndex += 1) {
        if (branchIndex === shaftIndex) continue;
        const branch = adjusted[branchIndex];
        if (branch.points.length < 3) continue;
        const cornerIndex = branch.points.findIndex((point, index) =>
          samePoint(point, junction) && (branch.closed || (index > 0 && index < branch.points.length - 1))
        );
        if (cornerIndex < 0) continue;
        const previous = branch.points[(cornerIndex - 1 + branch.points.length) % branch.points.length];
        const next = branch.points[(cornerIndex + 1) % branch.points.length];
        const fillet = filletCorner(previous, junction, next, radius, pointedRadius);
        if (!fillet) continue;
        const curveMid = {
          x: fillet.entry.x * 0.25 + junction.x * 0.5 + fillet.exit.x * 0.25,
          y: fillet.entry.y * 0.25 + junction.y * 0.5 + fillet.exit.y * 0.25,
        };
        const dx = other.x - junction.x;
        const dy = other.y - junction.y;
        const length = Math.hypot(dx, dy);
        if (length < 0.01) continue;
        const ux = dx / length;
        const uy = dy / length;
        const projection = (curveMid.x - junction.x) * ux + (curveMid.y - junction.y) * uy;
        if (projection <= 0.01) continue;
        const shift = Math.min(projection + capRadius, length * 0.3);
        shaft.points[endpointIndex] = { x: junction.x + ux * shift, y: junction.y + uy * shift };
        break;
      }
    });
  });
  return adjusted;
}

function roundedSubpath(subpath, radius, pointedRadius = radius) {
  const points = subpath.points;
  const linear = () => `M${pathNumber(points[0].x)} ${pathNumber(points[0].y)}` +
    points.slice(1).map(point => ` L${pathNumber(point.x)} ${pathNumber(point.y)}`).join('') +
    (subpath.closed ? ' Z' : '');
  if (points.length < 3) return { data: points.length ? linear() : '', changed: false };
  const corners = points.map((point, index) => {
    if (!subpath.closed && (index === 0 || index === points.length - 1)) return null;
    const previous = points[(index - 1 + points.length) % points.length];
    const next = points[(index + 1) % points.length];
    return filletCorner(previous, point, next, radius, pointedRadius);
  });
  if (!corners.some(Boolean)) return { data: linear(), changed: false };
  if (subpath.closed) {
    const first = corners[0];
    let data = `M${pathNumber((first?.exit ?? points[0]).x)} ${pathNumber((first?.exit ?? points[0]).y)}`;
    for (let index = 1; index < points.length; index += 1) {
      const point = points[index];
      const fillet = corners[index];
      if (fillet) data += ` L${pathNumber(fillet.entry.x)} ${pathNumber(fillet.entry.y)} Q${pathNumber(point.x)} ${pathNumber(point.y)} ${pathNumber(fillet.exit.x)} ${pathNumber(fillet.exit.y)}`;
      else data += ` L${pathNumber(point.x)} ${pathNumber(point.y)}`;
    }
    if (first) data += ` L${pathNumber(first.entry.x)} ${pathNumber(first.entry.y)} Q${pathNumber(points[0].x)} ${pathNumber(points[0].y)} ${pathNumber(first.exit.x)} ${pathNumber(first.exit.y)}`;
    else data += ` L${pathNumber(points[0].x)} ${pathNumber(points[0].y)}`;
    return { data: `${data} Z`, changed: true };
  }
  let data = `M${pathNumber(points[0].x)} ${pathNumber(points[0].y)}`;
  for (let index = 1; index < points.length - 1; index += 1) {
    const point = points[index];
    const fillet = corners[index];
    if (fillet) data += ` L${pathNumber(fillet.entry.x)} ${pathNumber(fillet.entry.y)} Q${pathNumber(point.x)} ${pathNumber(point.y)} ${pathNumber(fillet.exit.x)} ${pathNumber(fillet.exit.y)}`;
    else data += ` L${pathNumber(point.x)} ${pathNumber(point.y)}`;
  }
  const last = points.at(-1);
  data += ` L${pathNumber(last.x)} ${pathNumber(last.y)}`;
  return { data, changed: true };
}

function roundedLinearPathData(data, radius, pointedRadius = radius, { trimJunctions = false } = {}) {
  const subpaths = parseLinearPathData(data);
  if (!subpaths) return data;
  const source = trimJunctions
    ? reconcileRoundedJunctions(subpaths, radius, pointedRadius)
    : subpaths;
  const rounded = source.map(subpath => roundedSubpath(subpath, radius, pointedRadius));
  return rounded.some(subpath => subpath.changed)
    ? rounded.map(subpath => subpath.data).join(' ')
    : data;
}

export function glyphForCornerStyle(glyph, mode) {
  const profile = cornerProfiles[mode] ?? cornerProfiles.standard;
  let transformed = glyph.replace(/<rect\b[^>]*\/?>/g, tag => {
    const ry = tag.match(/\sry="([^"]+)"/);
    const width = Number(tag.match(/\swidth="([^"]+)"/)?.[1]);
    const height = Number(tag.match(/\sheight="([^"]+)"/)?.[1]);
    if (!Number.isFinite(width) || !Number.isFinite(height)) return tag;
    const maximum = Math.min(width, height) / 2;
    const radius = Math.min(maximum, profile.radius);
    tag = setSvgAttribute(tag, 'rx', Number(radius.toFixed(3)));
    if (ry) tag = setSvgAttribute(tag, 'ry', Number(radius.toFixed(3)));
    return tag;
  });
  transformed = transformed.replace(/<path\b[^>]*\/?>/g, tag => {
    const locked = /data-corner-lock/.test(tag);
    tag = tag.replace(/\sdata-corner-lock(?:="[^"]*")?/, '');
    if (locked) return setSvgAttribute(tag, 'stroke-linejoin', 'round');
    const pointed = /data-corner-pointed/.test(tag);
    const trimRequested = /data-junction-trim/.test(tag);
    tag = tag.replace(/\sdata-corner-pointed(?:="[^"]*")?/, '');
    tag = tag.replace(/\sdata-junction-trim(?:="[^"]*")?/, '');
    const match = tag.match(/\sd="([^"]+)"/);
    if (!match) return tag;
    const scaleMatch = tag.match(/\sdata-corner-scale="([^"]+)"/);
    const requestedScale = Number(scaleMatch?.[1] ?? 1);
    const scale = Number.isFinite(requestedScale) && requestedScale > 0 ? requestedScale : 1;
    const maxMatch = tag.match(/\sdata-corner-max="([^"]+)"/);
    const requestedMax = Number(maxMatch?.[1] ?? Infinity);
    const maximum = Number.isFinite(requestedMax) && requestedMax > 0 ? requestedMax : Infinity;
    const cleanTag = tag
      .replace(/\sdata-corner-scale="[^"]+"/, '')
      .replace(/\sdata-corner-max="[^"]+"/, '');
    const subpaths = parseLinearPathData(match[1]);
    const triangle = Boolean(subpaths?.some(subpath => subpath.closed && subpath.points.length === 3));
    const junction = trimRequested && hasRoundedJunction(subpaths);
    const baseRadius = pointed || triangle || junction ? profile.pointedRadius : profile.radius;
    const rounded = roundedLinearPathData(
      match[1],
      Math.min(baseRadius * scale, maximum),
      Math.min(profile.pointedRadius * scale, maximum),
      { trimJunctions: mode === 'rounded' && junction }
    );
    return rounded === match[1] ? cleanTag : cleanTag.replace(match[0], ` d="${rounded}"`);
  });
  return transformed;
}
