# Render 上传部署排错

如果 Render 显示：

```text
Deploy failed
Exited with status 1 while building your code
```

先点页面里的 `deploy logs`，看最后几行错误。

## 最常见原因 1：上传目录层级错了

Render 项目根目录里必须直接看到这些文件：

```text
package.json
server.js
render.yaml
public/
prompts/
```

如果 Render 里变成这样：

```text
sde-writer-site/package.json
sde-writer-site/server.js
```

就会失败，因为 Render 在根目录找不到 `package.json`。

解决办法：

上传时进入 `sde-writer-site` 文件夹，把里面的文件全部上传，而不是上传外层文件夹本身。

## 最常见原因 2：Node 版本太新

已经改成更稳的：

```text
NODE_VERSION=20.19.0
```

如果你之前上传过旧版文件，需要重新上传最新文件，或在 Render 环境变量里把 `NODE_VERSION` 改成 `20.19.0`。

## 最常见原因 3：环境变量没填

Render 后台要填：

```text
DEEPSEEK_API_KEY=你的 DeepSeek API Key
INVITE_CODE=你的邀请码
```

不过环境变量没填通常不会导致“构建失败”，只会导致网站打开后不能生成。

## 如果还失败

请点 `deploy logs`，截图最后 20 行发回来。真正原因一定在那里。
