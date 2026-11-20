# 强化学习的数学原理：交互式可视化课堂 (RL Visual Course)

《强化学习的数学原理》双语交互式可视化讲义与在线实验平台，集成静态解析、交互试题与无需服务端配置的 JupyterLite 实验环境。

## 快速使用

- **本地启动**：平台资源完全离线化（由 `assets/vendor/` 静态提供）。请使用本地 HTTP 服务器托管（避免直接以 `file://` 协议打开以防止浏览器本地跨域限制）：
  ```bash
  python -m http.server 8080
  ```
- **访问入口**：在浏览器中打开 `http://localhost:8080/index.html`。

## 结构说明

- `index.html`：主讲义入口与章节目录。
- `data*.js`：讲义文本内容与各讲交互式练习题库。
- `components*.js`：强化学习可视化图表与算法交互组件。
- `notebooks/`：配套交互练习与算法实现原件。
- `lite-build/`：JupyterLite 离线环境构建配置（见 [lite-build/build.md](lite-build/build.md)）。

## 贡献与授权

- 维护与贡献规范：详见 [CONTRIBUTING.md](CONTRIBUTING.md)。
- 平台代码遵循 [Apache-2.0](LICENSE) 许可；自有教学设计与可视化内容遵循 [CC BY 4.0](LICENSE-CONTENT.md)；第三方依赖与来源说明详见 [NOTICE.md](NOTICE.md)。

