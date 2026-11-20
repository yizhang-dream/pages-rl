/* ═══════════════════════════════════════════════════════════
   RL 可视化课堂 · 课程声明式清单 (COURSE_CONFIG)
   复用引擎契约：新建一门可视化课程时，只需替换本文件与 data*.js，
   root-template.js / app.js / components.js / subpage-shell.js 免改通用。
   ═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var cfg = {
    id: 'rl-viz',
    version: '20261119h',
    liveOrigin: 'https://rl.xn--ltr42g543b.cn',
    repoUrl: 'https://github.com/yizhang-dream/rl-visual-course',
    defaultTheme: 'chalk',
    defaultLang: 'both',

    themes: [
      { key: 'chalk',   scheme: 'dark',  label: '墨板 Chalkboard',  zh: '墨板',   en: 'Chalkboard',  dot: '#ffd76a', swatchClass: 'dot-theme-chalk' },
      { key: 'swiss',   scheme: 'light', label: '讲义 Swiss Notes', zh: '讲义',   en: 'Swiss Notes', dot: '#2138e0', swatchClass: 'dot-theme-swiss' },
      { key: 'quant',   scheme: 'dark',  label: '深空 Quant Dark',  zh: '深空',   en: 'Quant Dark',  dot: '#3ce6c2', swatchClass: 'dot-theme-quant' },
      { key: 'forest',  scheme: 'light', label: '教科书 Forest',    zh: '教科书', en: 'Forest',      dot: '#2e6b45', swatchClass: 'dot-theme-forest' },
      { key: 'classic', scheme: 'light', label: '经典 Classic',     zh: '经典',   en: 'Classic',     dot: '#3e6fe0', swatchClass: 'dot-theme-classic' },
    ],

    brand: {
      zh: 'RL 可视化课堂',
      en: 'RL Visual Classroom',
      subtitle: 'Mathematical Foundation of RL · Visual Course',
      homeAria: '回到首页 / Back to Home',
      homeTitle: 'RL 可视化课堂 · 全书十讲 | RL Visual Classroom · Mathematical Foundation of RL',
      lessonTitleSuffix: 'RL 可视化课堂',
    },

    hero: {
      kicker: '📖 全书可视化 · Visual Book · Mathematical Foundation of RL · 双语',
      titleLead: { zh: '把强化学习全书', en: 'Run the whole RL book, ' },
      titleGrad: { zh: '“跑”起来', en: 'visually' },
      sub: {
        zh: '以可视化教学的高标准，把 Shiyu Zhao《Mathematical Foundation of Reinforcement Learning》全书十讲与西湖大学课程讲义做成可玩的交互实验：从网格世界与 Bellman 方程，到值迭代、蒙特卡洛、随机近似、时序差分、值函数近似、策略梯度与 Actor-Critic。',
        en: 'All ten lectures of Shiyu Zhao’s “Mathematical Foundation of Reinforcement Learning” turned into playable interactive labs: from the grid world and the Bellman equation to VI/PI, Monte Carlo, stochastic approximation, TD, function approximation, policy gradient, and Actor-Critic.',
      },
      sub2: {
        zh: '每一课都包含：双语精讲 · 交互实验台 · 代码逐行精讲 · 连贯长推理 · 问答填空与定理交互推导。',
        en: 'Every lesson pairs bilingual notes, interactive labs, a type-by-type code walkthrough, a coherent reasoning chain, Q&A cards, fill-ins, and interactive theorem derivations.',
      },
      primaryCtas: [
        { kind: 'go', target: 'grid-world', cls: 'btn primary', icon: '🚀', zh: '从第一课开始', en: 'Start from Lesson 1' },
        { kind: 'go', target: 'l2-bellman', cls: 'btn', icon: '🧮', zh: '直达 Bellman 方程', en: 'Bellman equation' },
        { kind: 'go', target: 'l7-qlearning', cls: 'btn', icon: '⚖️', zh: '直达 Q-learning', en: 'Q-learning' },
        { kind: 'link', href: 'graph3d.html', cls: 'btn ghost', icon: '🌌', zh: '知识星图', en: 'Knowledge Map' },
        { kind: 'link', href: 'lite.html', cls: 'btn ghost', icon: '📓', zh: '笔记本实验室', en: 'Notebook Lab' },
        { kind: 'link', href: 'concordance.html', cls: 'btn ghost', icon: '🔍', zh: '术语索引', en: 'Concordance' },
        { kind: 'link', href: 'resources.html', cls: 'btn ghost', icon: '📚', zh: '资料索引', en: 'Resources' },
      ],
    },

    knowledgeTreeRoot: {
      badge: 'RL',
      zh: '强化学习的数学根基 · 全书十讲',
      en: 'Mathematical Foundation of RL · 10 lectures',
    },

    branches: [
      { key: 'I',   cls: 'b-model',  zh: '建模根基',        en: 'Modeling',                 nos: [1] },
      { key: 'II',  cls: 'b-values', zh: '值与方程',        en: 'Values & equations',       nos: [2, 3] },
      { key: 'III', cls: 'b-mb',     zh: '有模型算法',      en: 'Model-based',              nos: [4] },
      { key: 'IV',  cls: 'b-mf',     zh: '无模型 · 值方法', en: 'Model-free · value-based', nos: [5, 6, 7, 8] },
      { key: 'V',   cls: 'b-policy', zh: '策略方法',        en: 'Policy-based',             nos: [9, 10] },
    ],

    howToUse: {
      title: { zh: '怎么用这一课', en: 'How to use this course' },
      steps: [
        {
          ico: '①',
          zh: '按侧栏三层目录顺学：每节配有「讲义 + 实验台」，先读推导再动手调参。',
          en: 'Follow the sidebar hierarchy: each section pairs prose with a lab — read the derivation, then tune the knobs.',
        },
        {
          ico: '②',
          zh: '右上角切换 中英双语 / 中文 / English；宽屏双语模式左右并排对齐对照。',
          en: 'Switch bilingual / Chinese / English from the top bar; wide screens align both languages side by side.',
        },
        {
          ico: '③',
          zh: '每讲工具箱含「连贯长推理」「代码精讲」「问答」「知识填空」与「定理交互推导」。',
          en: 'Every lecture toolbox includes a reasoning chain, code walkthrough, Q&A flip cards, fill-ins, and step-gated derivations.',
        },
        {
          ico: '④',
          zh: '配套 3D 知识星图、JupyterLite 在线 Python 实验室、全书术语反查与西湖大学 5 次作业路线图。',
          en: 'Backed by the 3D knowledge constellation, browser JupyterLite Python labs, term concordance, and Westlake A1–A5 roadmap.',
        },
      ],
      callout: {
        kind: 'warn',
        icon: '⚠️',
        zh: '注意：讲义示例的禁区约定是「可进入但扣分」，<strong>课程作业代码是「弹回原地」</strong>——L1 讲义第 8 页明确区分了这两种模型，本课在 §1.3 实验台提供一键切换。',
        en: 'Note: the book’s slides use accessible-but-penalised forbidden cells, whereas <strong>the assignment code bounces back</strong> — L1 Slide 8 makes this fork explicit, and §1.3 lets you toggle both rules.',
      },
    },

    videoProvider: {
      cnBase: 'https://www.bilibili.com/video/BV1sd4y167NS/?p=',
      enBase: 'https://www.youtube.com/watch?v=',
      enTail: '&list=PLEhdbSEZZbDaFWPX4gehhwB9vJZJ1DNm8&index=',
      overviewCn: 'https://www.bilibili.com/video/BV1sd4y167NS/?p=1',
      overviewEn: 'https://www.youtube.com/watch?v=ZHMWHr9811U&list=PLEhdbSEZZbDaFWPX4gehhwB9vJZJ1DNm8&index=1',
    },

    auxPages: [
      { id: 'classroom',   href: 'index.html',       zh: '课堂',       en: 'Classroom' },
      { id: 'graph3d',     href: 'graph3d.html',     zh: '知识星图',   en: 'Constellation' },
      { id: 'lite',        href: 'lite.html',        zh: '笔记本实验', en: 'Notebook Lab' },
      { id: 'concordance', href: 'concordance.html', zh: '术语索引',   en: 'Concordance' },
      { id: 'resources',   href: 'resources.html',   zh: '资料索引',   en: 'Resources' },
    ],

    footer: {
      credit: {
        zh: '基于 Shiyu Zhao《Mathematical Foundation of Reinforcement Learning》全书十讲与西湖大学 IUSLab 讲义/代码制作 · 仅用于学习',
        en: 'Built on Shiyu Zhao’s “Mathematical Foundation of Reinforcement Learning” and Westlake IUSLab slides/code · For study only',
      },
      licenseHref: 'https://github.com/yizhang-dream/rl-visual-course/blob/main/NOTICE.md',
      licenseLabel: { zh: '开源协议', en: 'License' },
    },
  };

  window.COURSE_CONFIG = cfg;
  if (typeof window !== 'undefined' && !window.RLV_VERSION) {
    window.RLV_VERSION = cfg.version;
  }
})();
