# Intern Discovery Icons 发布包

本目录由 `tools/iconfont-build` 自动生成。普通业务项目只需要引用本目录中的静态资源，不需要安装构建依赖。

## CSS 类引用

```html
<link rel="stylesheet" href="./iconfont/iconfont.css">
<i class="intern-inkstone-icon icon-menu" aria-hidden="true"></i>
```

有语义的操作按钮必须提供可访问名称：

```html
<button type="button" aria-label="打开菜单">
  <i class="intern-inkstone-icon icon-menu" aria-hidden="true"></i>
</button>
```

## Unicode 引用

```html
<span class="intern-inkstone-icon">&#xE001;</span>
```

Unicode 字符只有在应用 `InternDiscoveryIcons` 字体后才会显示为图标。推荐使用 `.intern-inkstone-icon`；旧版 `.iconfont` 仍作为兼容别名保留。永久对应关系见 `unicode-map.json` 和 `manifest.json`。

## SVG Symbol 引用

```html
<svg aria-hidden="true" viewBox="0 0 24 24">
  <use href="./iconfont/iconfont.symbol.svg#icon-menu"></use>
</svg>
```

## 文件说明

- `intern-discovery-icons.woff2`：现代浏览器首选字体。
- `intern-discovery-icons.woff`：兼容回退字体。
- `intern-discovery-icons.ttf`：下载和字体检查用途。
- `iconfont.css`：`@font-face` 和全部 token 映射。
- `unicode-map.json`：永久、只追加的 Unicode 来源。
- `unicode-map.js`：供 `file://` 可直接打开的图标页使用。
- `manifest.json`：名称、token、分类、别名和码位清单。
- `svg/`：保留描边的设计源输出。
- `outlined-svg/`：生成普通轮廓字体的中间产物。
- `iconfont.symbol.svg`：保留描边能力的 SVG Symbol 集。
- `demo.html`：字体字形检查页。

## 发布规则

1. `unicode-map.json` 只能追加；不得改变、回收或按排序重算既有码位。
2. `U+E0AD`、`U+E0AE` 已为下线图标保留。
