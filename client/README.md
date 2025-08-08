# 移动端适配
## viewport 单位方案 

使用 CSS 的 viewport 单位 (vw, vh) 结合 **postcss-px-to-viewport** 插件实现移动端适配。

### 优点
- 更符合 W3C 标准，是未来的发展趋势
- 不需要额外的 JavaScript 运行时计算
- 直接基于视口宽度，更直观易理解
- 浏览器原生支持，性能更好

### 缺点
- 在非常老旧的浏览器上兼容性略差（但现代移动浏览器支持良好）

### 安装步骤

```bash
npm install postcss-px-to-viewport --save-dev
```

### 配置方法

在 `vite.config.js` 中添加以下配置：

```javascript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import postcsspxtoviewport from 'postcss-px-to-viewport'

export default defineConfig({
  plugins: [react()],
  css: {
    postcss: {
      plugins: [
        postcsspxtoviewport({
          unitToConvert: 'px', // 要转化的单位
          viewportWidth: 375, // UI设计稿的宽度
          unitPrecision: 6, // 转换后的精度，即小数点位数
          propList: ['*'], // 指定转换的css属性的单位，*代表全部css属性的单位都进行转换
          viewportUnit: 'vw', // 指定需要转换成的视窗单位，默认vw
          fontViewportUnit: 'vw', // 指定字体需要转换成的视窗单位，默认vw
          selectorBlackList: ['ignore-'], // 指定不转换为视窗单位的类名
          minPixelValue: 1, // 默认值1，小于或等于1px则不进行转换
          mediaQuery: true, // 是否在媒体查询的css代码中也进行转换，默认false
          replace: true, // 是否转换后直接更换属性值
          exclude: [], // 设置忽略文件，用正则做目录名匹配
          landscape: false // 是否处理横屏情况
        })
      ]
    }
  }
})
```

### 使用说明

配置完成后，你可以直接使用设计稿的 px 单位进行开发，插件会自动将 px 转换为 vw 单位。例如：

```css
.container {
  width: 375px; /* 会被转换为 100vw */
  height: 200px; /* 会被转换为 53.33333vw */
  font-size: 16px; /* 会被转换为 4.26667vw */
}
```

### 特殊处理

如果某些元素不希望被转换，可以使用以下方式：

1. 添加 `ignore-` 前缀的类名（根据 selectorBlackList 配置）
2. 使用行内注释：`/* px-to-viewport-ignore */`
3. 使用行内注释忽略下一行：`/* px-to-viewport-ignore-next */`

# css 预处理器
使用 less 减少css样式冗余

# 路由配置
使用 react-router-dom 配置路由，实现页面跳转。
创建router文件夹 采取集中式管理路由
在router文件夹下创建index.jsx文件 配置路由
在App.jsx文件中引入路由配置文件

# UI库
Ant Design Mobile 

# html 标签样式重置
使用 CSS Reset 重置 html 标签的默认样式

# css 样式隔离
使用 css modules 实现样式隔离，避免全局样式冲突。

# axios 配置
请求拦截器
响应拦截器

# 登录鉴权
双token无感刷新



