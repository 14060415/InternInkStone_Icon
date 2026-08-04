# Intern InkStone Icon

Intern InkStone 的公共 Unicode 图标库，包含 176 枚图标、固定私有区码位、SVG 源文件及 WOFF2/WOFF/TTF 字体。

## 在线图标列表

发布地址：

```text
https://14060415.github.io/InternInkStone_Icon/
```

## 使用

先加载图标字体 CSS：

```html
<link
  rel="stylesheet"
  href="https://14060415.github.io/InternInkStone_Icon/iconfont/iconfont.css"
>
```

再使用列表中复制的 Unicode、HTML 实体或完整 HTML：

```html
<span class="iconfont" aria-hidden="true">&#xE001;</span>
```

这些码位属于 Unicode 私有使用区，未加载 `InternDiscoveryIcons` 字体时不会显示正确图案。

## 三种圆角档位

三档共用稳定 Unicode 码位，但使用独立字体文件和 HTML 类：

```html
<span class="iconfont iconfont-sharp" aria-hidden="true">&#xE001;</span>
<span class="iconfont iconfont-standard" aria-hidden="true">&#xE001;</span>
<span class="iconfont iconfont-rounded" aria-hidden="true">&#xE001;</span>
```

正式字体源笔触为 1.875，在 16px 下约为 1.25px。`iconfont` 默认使用标准档位。

## 更新约束

- `tools/iconfont-build/unicode-map.json` 是永久映射源。
- 已发布码位不得重排、回收或分配给不同语义的图标。
- 更新既有图标时保留原码位，重新生成并发布字体文件。
- 新图标只追加新码位。
- `U+E0AD`、`U+E0AE` 为已下线图标保留。

## 构建与验证

```powershell
cd tools/iconfont-build
npm ci
npm run build
