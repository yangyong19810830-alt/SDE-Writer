# SDE公众号长文写作网站

这是一个本地小网站，用 DeepSeek API 生成公众号长文。

核心规则：

- 后台使用 SDE 知识论组织文章。
- 公众号正文不出现“SDE”“S/D/E”“三方程”“六路径”“三原理”“知识画像”等术语。
- 支持先生成大纲、直接生成长文、修订已有草稿。

## 启动方式

最适合直接双击的方式：

```text
START_WEBSITE.bat
```

启动成功后，打开浏览器访问：

```text
http://localhost:5173
```

DeepSeek API Key 不会出现在网页里。请在启动网站前通过环境变量设置。

最简单的方式：右键或在 PowerShell 中运行：

```powershell
.\start.ps1
```

脚本会提示你输入 DeepSeek API Key，不会把 Key 写进网页或代码文件。

也可以手动设置 DeepSeek API Key：

```powershell
$env:DEEPSEEK_API_KEY="sk-your-deepseek-api-key"
```

然后启动：

```powershell
node server.js
```

打开：

```text
http://localhost:5173
```

## 可选配置

```powershell
$env:PORT="5173"
$env:DEEPSEEK_BASE_URL="https://api.deepseek.com"
```

## 给别人使用

如果要在外地用手机访问，或分享给其他人，需要部署到公网。看：

```text
公网部署说明.md
```

## 模型

页面默认使用 `deepseek-v4-pro`，也可以切换为 `deepseek-v4-flash`。

DeepSeek API 采用 OpenAI 兼容格式，当前官方文档给出的基础地址是：

```text
https://api.deepseek.com
```
