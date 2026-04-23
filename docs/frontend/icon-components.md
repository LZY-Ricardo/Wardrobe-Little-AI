# 图标组件使用说明

本项目中有两种图标组件可供使用：

## 1. Icon 组件

`Icon` 组件用于显示单色图标，基于阿里巴巴矢量图标库的 Font Class 方法实现。

### 使用方法

```jsx
import Icon from '@/components/Icon'

// 在组件中使用
<Icon type='icon-shouye1' />
```

### 参数说明

- `type`：图标类型，必填，值为图标的名称（不需要包含 `iconfont` 前缀）
- `className`：自定义类名，可选
- `style`：自定义样式，可选
- `onClick`：点击事件处理函数，可选

## 2. SvgIcon 组件

`SvgIcon` 组件用于显示彩色图标，基于阿里巴巴矢量图标库的 Symbol 方法实现。

### 使用方法

```jsx
import SvgIcon from '@/components/SvgIcon'

// 在组件中使用
<SvgIcon iconName='icon-qingtian' />
```

### 参数说明

- `iconName`：图标名称，必填，值为图标的名称（包含 `icon-` 前缀）
- `className`：自定义类名，可选
- `style`：自定义样式，可选
- `onClick`：点击事件处理函数，可选

## 如何选择

- 如果需要显示单色图标，使用 `Icon` 组件
- 如果需要显示彩色图标，使用 `SvgIcon` 组件

## 如何添加新图标

1. 登录 [阿里巴巴矢量图标库](https://www.iconfont.cn/)
2. 将需要的图标添加到项目中
3. 生成新的Font Class和Symbol代码
4. 更新项目中的引用链接（在 `index.html` 文件中）