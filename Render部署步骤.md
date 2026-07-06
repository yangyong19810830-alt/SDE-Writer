# Render 部署步骤

这个文件夹已经可以部署到 Render。

## 方式一：用 render.yaml 部署

1. 把 `sde-writer-site` 这个文件夹上传到 GitHub 仓库。
2. 打开 Render Dashboard。
3. 选择 `New` -> `Blueprint`。
4. 连接这个 GitHub 仓库。
5. Render 会读取 `render.yaml`。
6. 按提示填写两个私密环境变量：

```text
DEEPSEEK_API_KEY=你的 DeepSeek API Key
INVITE_CODE=你想设置的邀请码
```

7. 部署完成后，Render 会给你一个 `onrender.com` 网址。

用户打开网址后，只需要输入邀请码，就能使用；你的 DeepSeek Key 不会显示在网页里。

## 方式二：手动建 Web Service

如果你不用 Blueprint，也可以手动创建：

1. Render Dashboard -> `New` -> `Web Service`
2. 连接 GitHub 仓库
3. 设置：

```text
Runtime: Node
Build Command: npm install
Start Command: npm start
```

4. Environment Variables 添加：

```text
DEEPSEEK_API_KEY=你的 DeepSeek API Key
INVITE_CODE=你想设置的邀请码
DEEPSEEK_BASE_URL=https://api.deepseek.com
```

5. 部署完成后，把 Render 给你的公网网址发给用户。

## 注意

- Render 免费服务可能会休眠，第一次打开可能慢一点。
- 别把 DeepSeek API Key 写进代码或发给别人，只放在 Render 的 Environment Variables 里。
- 邀请码可以定期更换，防止外传。
