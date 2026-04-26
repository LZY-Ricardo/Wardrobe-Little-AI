# Change: update auth baseline hardening

## Why
- 当前注册与修改密码规则主要依赖前端校验，后端未强制收口，存在规则不一致与绕过风险。
- JWT secret 仍存在硬编码 fallback，不利于环境隔离与部署安全。

## What Changes
- 为现有用户名密码体系补齐后端强校验，统一注册、登录、修改密码的基础规则。
- 将新注册与新改密码升级为强密码策略，老账号登录链路保持兼容。
- 去除 JWT secret 的硬编码 fallback，改为必须从 `server/.env` 提供。
- 同步前端注册页与修改密码弹窗提示，保持与后端规则一致。

## Impact
- Affected specs: auth
- Affected code: `server/routes/user.js`, `server/utils/jwt.js`, `server/middleware/rateLimit.js`, `client/src/pages/Login/index.jsx`, `client/src/pages/Register/index.jsx`, `client/src/pages/Person/index.jsx`
