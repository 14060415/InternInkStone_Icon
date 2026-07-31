# Intern Discovery 图标字体构建

此工具从仓库根目录的 `index.html` 中提取图标源数据，生成独立 SVG、描边转轮廓版本、固定 Unicode 清单、SVG Symbol、TTF、WOFF、WOFF2 和引用 CSS。

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
