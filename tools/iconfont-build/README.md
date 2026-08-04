# Intern Discovery 图标字体构建

此工具从仓库根目录的 `index.html` 中提取图标源数据，生成独立 SVG、描边转轮廓版本、固定 Unicode 清单、SVG Symbol、TTF、WOFF、WOFF2 和引用 CSS。

## 圆角字体档位

三套字体使用完全相同的 Unicode 码位：

- 锋利：`intern-discovery-icons-sharp.woff2` / `.woff` / `.ttf`
- 标准：`intern-discovery-icons-standard.woff2` / `.woff` / `.ttf`
- 圆润：`intern-discovery-icons-rounded.woff2` / `.woff` / `.ttf`

无后缀的 `intern-discovery-icons.woff2` / `.woff` / `.ttf` 与“标准”版内容一致，用于兼容原有引用。加载 `iconfont.css` 后，可分别使用 `iconfont-sharp`、`iconfont-standard`、`iconfont-rounded` 类；原来的 `iconfont` 类继续使用标准版。

## 约束

- `unicode-map.json` 是永久映射源，只能为新图标追加码位。
- 不得重排或回收既有码位。
- `U+E0AD`、`U+E0AE` 已为下线图标保留。
- 原始描边 SVG 是设计源；`outlined-svg/` 仅用于生成普通轮廓字体。

## 构建

```powershell
cd tools/iconfont-build
npm ci
npm run build
npm run verify
```

发布前应打开 `iconfont/demo.html`，重点检查 16px、20px、24px 和 32px 下的字形、基线、闭合轮廓和小尺寸可辨识度。
