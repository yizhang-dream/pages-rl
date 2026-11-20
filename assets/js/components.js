/* ═══════════════════════════════════════════════════════════
   RL 可视化课堂 · 核心组件库（工具集 + GridBoard + 全讲共用组件）
   GridBoard 是唯一的网格渲染引擎，所有实验台都建立在它之上；
   各讲专属组件在 components-l1.js…components-l10.js。
   ═══════════════════════════════════════════════════════════ */
(function () {
  const D = window.DATA;

  /* ---------- 几何与规则助手 ---------- */
  const CELL = 100, PAD = 14;
  const s2rc = (s, n) => ({ r: Math.floor((s - 1) / n), c: (s - 1) % n });
  const rc2s = (r, c, n) => r * n + c + 1;
  const center = (s, n) => {
    const { r, c } = s2rc(s, n);
    return { x: PAD + c * CELL + CELL / 2, y: PAD + r * CELL + CELL / 2 };
  };

  // 可种子化随机（mulberry32）：训练类实验台 Reset 时以同一 seed 重建，
  // 保证「Reset 再训练」轨迹逐点可复现
  const rng = (seed) => {
    let a = (seed === undefined ? 42 : seed) >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  // 执行一步：优先查书中 3×3 权威表；否则按规则生成
  // mode: 'book' 禁区可进入(书) | 'code' 禁区弹回(老师代码/作业)
  // rForbidden: 进禁区/撞禁区的奖励（各讲实验台可调，如 −10；缺省 −1 与书一致）
  function stepOnce(state, aid, cfg) {
    const { size, forbidden = [], target } = cfg;
    const rForbidden = cfg.rForbidden === undefined ? -1 : cfg.rForbidden;
    if (size === 3 && cfg.mode === 'book') {
      const next = D.T3[state - 1][aid - 1];
      const sym = D.R3SYM[state - 1][aid - 1];
      const reward = sym === 'b' ? -1 : sym === 'f' ? rForbidden : sym === 't' ? 1 : 0;
      const type = sym === 't' ? 'target' : sym === 'f' ? 'forbidden'
        : sym === 'b' ? 'bounce' : (next === state ? 'stay' : 'move');
      return { next, reward, type, sym };
    }
    const a = D.actions[aid - 1];
    const { r, c } = s2rc(state, size);
    const nr = r + a.dy, nc = c + a.dx;
    if (nr < 0 || nr >= size || nc < 0 || nc >= size) {
      return { next: state, reward: -1, type: 'bounce', sym: 'b' };
    }
    const next = rc2s(nr, nc, size);
    if (next === target) return { next, reward: 1, type: 'target', sym: 't' };
    if (forbidden.includes(next)) {
      if (cfg.mode === 'code') return { next: state, reward: rForbidden, type: 'bounce-forbidden', sym: 'f' };
      return { next, reward: rForbidden, type: 'forbidden', sym: 'f' };
    }
    return { next, reward: 0, type: next === state ? 'stay' : 'move', sym: 0 };
  }

  const RLV_CFG = window.COURSE_CONFIG || {};
  const CFG_ID = RLV_CFG.id || 'rl-viz';

  const escAttr = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // 将文本中的行内 $...$ 公式转为 <i class="fx-inline" data-tex="..."></i>（跳过 HTML 标签与 <code>/<pre>）
  function fmtMath(str) {
    if (str == null) return '';
    const s = String(str);
    if (s.indexOf('$') < 0) return s;
    const parts = s.split(/(<[^>]+>)/g);
    let inCode = 0;
    return parts.map((p) => {
      if (!p) return '';
      if (p.charAt(0) === '<') {
        if (/^<(code|pre|script|style)\b/i.test(p) && !/\/>$/.test(p)) inCode++;
        else if (/^<\/(code|pre|script|style)\b/i.test(p)) inCode = Math.max(0, inCode - 1);
        return p;
      }
      if (inCode > 0 || p.indexOf('$') < 0) return p;
      return p.replace(/\$([^\n$]{1,220}?)\$/g, (_, tex) => `<i class="fx-inline" data-tex="${escAttr(tex.trim())}"></i>`);
    }).join('');
  }

  const bi = (zh, en) =>
    `<span class="zh du-line">${fmtMath(zh)}</span><span class="en du-line">${fmtMath(en)}</span>`;

  const biAny = (v) => {
    if (v == null) return '';
    if (typeof v === 'object') return bi(v.zh || '', v.en || '');
    return fmtMath(v);
  };

  const TYPE_LABEL = {
    move:  { zh: '普通移动', en: 'normal move',  cls: '' },
    stay:  { zh: '原地不动', en: 'stay still',   cls: '' },
    bounce:{ zh: '撞边界弹回', en: 'bounced by boundary', cls: 'warn' },
    'bounce-forbidden': { zh: '禁区弹回（不可进入）', en: 'bounced by forbidden cell', cls: 'danger' },
    forbidden: { zh: '进入禁区（可进入，挨罚）', en: 'entered forbidden cell (accessible, penalised)', cls: 'danger' },
    target:{ zh: '到达目标！', en: 'target reached!', cls: 'done' },
  };

  const STAR = '0,-27 6.76,-9.3 25.68,-8.34 10.94,3.55 15.87,21.84 0,11.5 -15.87,21.84 -10.94,3.55 -25.68,-8.34 -6.76,-9.3';

  /* ═════════════ GridBoard 核心渲染 ═════════════ */
  const GridBoard = {
    name: 'GridBoard',
    props: {
      size:        { type: Number, default: 3 },
      forbidden:   { type: Array, default: () => [] },   // 1-based
      target:      { type: Number, default: 9 },
      start:       { type: Number, default: null },
      agent:       { type: Number, default: null },
      trajStates:  { type: Array, default: () => [] },   // 1-based states
      progress:    { type: Number, default: 1 },          // 0..1
      policy:      { type: Array, default: null },        // n×5 书本动作序
      values:      { type: Array, default: null },
      labels:      { type: Boolean, default: true },
      selected:    { type: Number, default: null },
      clickable:   { type: Boolean, default: false },
      rewardPops:  { type: Array, default: () => [] },    // {id, state, text, kind}
      flashState:  { type: Number, default: null },
      flashKey:    { type: Number, default: 0 },
      probe:       { type: Object, default: null },       // {state, action, key}
      heat:        { type: Array, default: null },        // 每格访问热度 0..1
    },
    emits: ['cell'],
    computed: {
      W() { return this.size * CELL + PAD * 2; },
      allStates() { return Array.from({ length: this.size * this.size }, (_, i) => i + 1); },
      gridLines() {
        const L = [];
        for (let i = 1; i < this.size; i++) {
          L.push({ x1: PAD + i * CELL, y1: PAD, x2: PAD + i * CELL, y2: this.W - PAD });
          L.push({ x1: PAD, y1: PAD + i * CELL, x2: this.W - PAD, y2: PAD + i * CELL });
        }
        return L;
      },
      arrows() {
        if (!this.policy) return [];
        const out = [];
        this.policy.forEach((row, si) => {
          const st = si + 1;
          const { x, y } = center(st, this.size);
          row.forEach((p, ai) => {
            if (p < 0.005) return;
            if (ai === 4) {
              out.push({ st, type: 'circle', x, y, p });
              return;
            }
            const a = D.actions[ai];
            const len = 14 + p * 38;
            const x1 = x + a.dx * 8, y1 = y + a.dy * 8;
            const x2 = x + a.dx * (8 + len), y2 = y + a.dy * (8 + len);
            // 箭头头部（垂直方向）
            const hx = -a.dy, hy = a.dx, hw = 4.6, hl = 11;
            const tip = { x: x2 + a.dx * hl * 0.6, y: y2 + a.dy * hl * 0.6 };
            const b1 = { x: x2 + hx * hw, y: y2 + hy * hw };
            const b2 = { x: x2 - hx * hw, y: y2 - hy * hw };
            out.push({ st, type: 'arrow', x1, y1, x2, y2, tip, b1, b2, p, key: `${st}-${ai}` });
          });
        });
        return out;
      },
      trajPts() {
        return this.trajStates.map((s) => {
          const { x, y } = center(s, this.size);
          return `${x},${y}`;
        });
      },
      trajLen() {
        let L = 0;
        for (let i = 1; i < this.trajStates.length; i++) {
          const a = center(this.trajStates[i - 1], this.size);
          const b = center(this.trajStates[i], this.size);
          L += Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
        }
        return L;
      },
      trajStyle() {
        const L = this.trajLen || 1;
        return {
          strokeDasharray: `${L}`,
          strokeDashoffset: `${L * (1 - this.progress)}`,
          transition: 'stroke-dashoffset .5s cubic-bezier(.2,0,0,1)',
        };
      },
      agentStyle() {
        if (this.agent == null) return { display: 'none' };
        const { x, y } = center(this.agent, this.size);
        return { transform: `translate(${x}px, ${y}px)` };
      },
      valueTexts() {
        if (!this.values) return [];
        return this.values.map((v, i) => ({ st: i + 1, ...center(i + 1, this.size), v }));
      },
    },
    methods: {
      cellFill(st) {
        if (st === this.target) return 'var(--cyan)';
        if (this.forbidden.includes(st)) return 'var(--gold)';
        return 'var(--cell-alt)';
      },
      clickCell(st) { if (this.clickable) this.$emit('cell', st); },
      // 可编辑格子的读屏标签：坐标 + 当前类型（随语言切换）
      cellLabel(st) {
        const { r, c } = s2rc(st, this.size);
        const en = this.$root && this.$root.lang === 'en';
        const kind = st === this.target ? (en ? 'target' : '目标')
          : this.forbidden.includes(st) ? (en ? 'forbidden cell' : '禁区')
          : (en ? 'normal cell' : '普通格');
        const pos = en ? 'row ' + (r + 1) + ', column ' + (c + 1) : '第 ' + (r + 1) + ' 行第 ' + (c + 1) + ' 列';
        const hint = en ? 'press Enter to select' : '按 Enter 选择';
        return 's' + st + ' · ' + pos + ' · ' + kind + ' · ' + hint;
      },
    },
    template: `
    <svg :viewBox="'0 0 ' + W + ' ' + W" class="grid-board" :class="{clickable}">
      <rect v-for="st in allStates" :key="'f'+st"
            :x="PAD + s2rc(st,size).c*CELL" :y="PAD + s2rc(st,size).r*CELL"
            :width="CELL" :height="CELL" :fill="cellFill(st)"/>
      <line v-for="(l,i) in gridLines" :key="'g'+i" class="gline"
            :x1="l.x1" :y1="l.y1" :x2="l.x2" :y2="l.y2"/>
      <rect class="gframe" :x="PAD" :y="PAD" :width="W-2*PAD" :height="W-2*PAD" fill="none" rx="3"/>
      <rect v-if="start" :x="PAD + s2rc(start,size).c*CELL + 3" :y="PAD + s2rc(start,size).r*CELL + 3"
            :width="CELL-6" :height="CELL-6" fill="none" stroke="var(--accent)" stroke-width="2.4"
            stroke-dasharray="7 5" rx="6"/>

      <template v-if="labels">
        <text v-for="st in allStates" :key="'lb'+st" class="st-label"
            :class="{small: size===4}"
            :x="PAD + s2rc(st,size).c*CELL + 9" :y="PAD + s2rc(st,size).r*CELL + 24">{{'s'+st}}</text>
      </template>

      <text v-if="start" :x="PAD + s2rc(start,size).c*CELL + CELL/2" :y="PAD + s2rc(start,size).r*CELL + CELL - 12"
            class="cell-tag" fill="var(--accent)" font-size="13">
        <tspan v-if="$root.lang === 'en'">Start</tspan><tspan v-else>起点</tspan>
      </text>

      <!-- 策略箭头 -->
      <g v-for="ar in arrows" :key="ar.key || ('c'+ar.st)" class="probe-arrow">
        <title>{{'s'+ar.st+' · p='+ar.p}}</title>
        <line v-if="ar.type==='arrow'" :x1="ar.x1" :y1="ar.y1" :x2="ar.x2" :y2="ar.y2"
              stroke="var(--green)" :stroke-width="2 + ar.p*2.2" stroke-linecap="round" opacity=".92"/>
        <polygon v-if="ar.type==='arrow'" :points="ar.tip.x+','+ar.tip.y+' '+ar.b1.x+','+ar.b1.y+' '+ar.b2.x+','+ar.b2.y"
                 fill="var(--green)" opacity=".92"/>
        <circle v-if="ar.type==='circle'" :cx="ar.x" :cy="ar.y" r="8.5"
                fill="none" stroke="var(--green)" stroke-width="3" opacity=".9"/>
      </g>

      <!-- 访问热度层 -->
      <template v-if="heat">
        <rect v-for="(h,i) in heat" :key="'h'+i" v-show="h > 0.01"
              :x="PAD + s2rc(i+1,size).c*CELL" :y="PAD + s2rc(i+1,size).r*CELL"
              :width="CELL" :height="CELL" fill="var(--red)" :opacity="h*0.5"/>
      </template>

      <!-- 轨迹 -->
      <polyline v-if="trajPts.length>1" class="traj-line" :points="trajPts.join(' ')" :style="trajStyle" opacity=".8"/>

      <!-- 探针箭头（单步演示） -->
      <g v-if="probe" :key="probe.key" class="probe-arrow">
        <template v-for="(act,ai) in (probe.action ? [probe.action] : [])">
          <line :x1="center(probe.state,size).x + (act.dx||0)*0"
                :y1="center(probe.state,size).y"
                :x2="center(probe.state,size).x + act.dx*46"
                :y2="center(probe.state,size).y + act.dy*46"
                stroke="var(--violet)" stroke-width="4" stroke-linecap="round" stroke-dasharray="8 6"/>
        </template>
      </g>

      <!-- 奖励浮字 -->
      <g v-for="pop in rewardPops" :key="pop.id" class="rw-float">
        <circle :cx="center(pop.state,size).x" :cy="center(pop.state,size).y - 4" r="21"
                :fill="pop.kind==='pos' ? 'var(--green)' : pop.kind==='neg' ? 'var(--red)' : 'var(--ink-3)'" opacity=".92"/>
        <text :x="center(pop.state,size).x" :y="center(pop.state,size).y + 1" text-anchor="middle"
              fill="var(--on-accent)" font-weight="800" font-size="16" font-family="var(--mono)">{{pop.text}}</text>
      </g>

      <!-- 撞击闪烁 -->
      <rect v-if="flashState!=null" :key="'fl'+flashKey" class="bounce-flash"
            :x="PAD + s2rc(flashState,size).c*CELL" :y="PAD + s2rc(flashState,size).r*CELL"
            :width="CELL" :height="CELL" fill="var(--red)" opacity=".28"/>

      <!-- 价值数字 -->
      <text v-for="vt in valueTexts" :key="'v'+vt.st" :x="vt.x" :y="vt.y+5"
            text-anchor="middle" font-weight="700" font-size="15" font-family="var(--mono)"
            fill="var(--ink)" style="paint-order:stroke; stroke:var(--cell-alt); stroke-width:4px;">{{vt.v}}</text>

      <!-- 智能体 -->
      <g class="agent-g" :style="agentStyle">
        <polygon class="agent-star agent-pulse" :points="STAR" fill="var(--accent)" stroke="var(--cell-alt)" stroke-width="2"/>
      </g>

      <!-- 点击热区（最上层；可编辑时键盘可达） -->
      <rect v-for="st in allStates" :key="'h'+st" class="cell-hit" :class="{'sel-halo': st===selected}"
            :x="PAD + s2rc(st,size).c*CELL" :y="PAD + s2rc(st,size).r*CELL"
            :width="CELL" :height="CELL" fill="transparent" @click="clickCell(st)"
            :tabindex="clickable ? 0 : -1" :role="clickable ? 'button' : null"
            :aria-label="clickable ? cellLabel(st) : null"
            @keydown.enter.prevent="clickCell(st)" @keydown.space.prevent="clickCell(st)"/>
    </svg>`,
    setup() { return { CELL, PAD, s2rc, center, STAR }; },
  };

  /* ═════════════ §1.8 概念链 ═════════════ */
  // props.nodes：各讲小节传入的自定义链条（数据形态与 concepts 条目一致：
  // { k?, zh, en, d: { zh, en } }）；不传时回退到 L1 的默认十条。
  const ConceptChain = {
    name: 'ConceptChain',
    props: { nodes: { type: Array, default: null } },
    data: () => ({ hot: -1, lock: false, open: null, timer: null }),
    concepts: [
      { k: 'grid', zh: '网格世界', en: 'grid world', d: { zh: '舞台：智能体、格子、禁区、目标。', en: 'The stage: agent, cells, forbidden areas, target.' } },
      { k: 'sa', zh: '状态 · 动作', en: 'state · action', d: { zh: '“我在哪”“我能做什么”——全部编号。', en: '“Where am I”“what can I do” — everything indexed.' } },
      { k: 'trans', zh: '状态转移', en: 'transition', d: { zh: '世界的回应规则，可用条件概率 p(s′|s,a) 描述。', en: 'How the world responds, described by p(s′|s,a).' } },
      { k: 'pol', zh: '策略 π(a|s)', en: 'policy π(a|s)', d: { zh: '每个状态的行为准则，可确定性可随机。', en: 'Conduct at every state — deterministic or stochastic.' } },
      { k: 'rew', zh: '奖励 r(s,a)', en: 'reward r(s,a)', d: { zh: '环境的即时反馈，塑造行为的缰绳。', en: 'The environment\'s instant feedback shaping behaviour.' } },
      { k: 'traj', zh: '轨迹', en: 'trajectory', d: { zh: '沿策略走出的“状态-动作-奖励”链。', en: 'The state-action-reward chain a policy traces.' } },
      { k: 'ret', zh: '回报', en: 'return', d: { zh: '轨迹上奖励的总和——评价策略的尺子。', en: 'Total reward along a trajectory — the ruler of policies.' } },
      { k: 'gam', zh: '折扣率 γ', en: 'discount rate γ', d: { zh: '未来在今天的汇率：救发散 + 调远近。', en: 'Today\'s exchange rate for the future: tames divergence, balances horizons.' } },
      { k: 'ep', zh: '回合 episode', en: 'episode', d: { zh: '一段完整经历；episodic 与 continuing 可统一。', en: 'One complete experience; episodic unifies with continuing.' } },
      { k: 'mdp', zh: 'MDP · 马尔可夫性', en: 'MDP · Markov property', d: { zh: '全部概念的数学框架，地基是无记忆性。', en: 'The mathematical frame for everything, founded on memorylessness.' } },
    ],
    mounted() {
      this.timer = setInterval(() => {
        if (this.lock) return;
        this.hot = (this.hot + 1) % this.list.length;
      }, 1100);
    },
    unmounted() { if (this.timer) clearInterval(this.timer); },
    setup() { return { bi }; },
    computed: {
      list() { return (this.nodes && this.nodes.length) ? this.nodes : this.$options.concepts; },
    },
    methods: {
      enter(i) { this.lock = true; this.hot = i; },
      leave() { this.lock = false; },
      toggle(i) { this.open = this.open === i ? null : i; },
    },
    template: `
    <div class="lab">
      <div class="lab-head"><span class="lab-title">概念依赖链 · 悬停查看 · 点击固定 / Concept chain — hover, click to pin</span></div>
      <div class="chain" style="row-gap:12px">
        <template v-for="(c,i) in list" :key="c.k || i">
          <span v-if="i>0" class="chain-arrow" style="font-size:15px">→</span>
          <button class="chain-node" style="cursor:pointer; min-width:74px"
                  :class="{now: hot===i, past: open===i}" @mouseenter="enter(i)" @mouseleave="leave" @click="toggle(i)">
            <span class="cn-s" style="font-size:12.5px;font-family:var(--font)">{{c.zh}}</span>
            <span class="cn-r" style="font-size:10px">{{c.en}}</span>
          </button>
        </template>
      </div>
      <div v-if="open!=null" class="callout idea" :key="open" style="margin:14px 0 0">
        <div class="callout-icon">🔗</div>
        <div class="callout-body">
          <p class="bi duo" style="font-weight:700">{{ list[open].zh }} · {{ list[open].en }}</p>
          <p class="bi duo" style="font-size:14px" v-html="bi(list[open].d.zh, list[open].d.en)"></p>
        </div>
      </div>
    </div>`,
  };

  /* ═════════════ 代码精讲 ═════════════ */
  function hlPy(line) {
    const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    let out = '';
    let rest = line;
    const ci = rest.indexOf('#');
    let comment = null;
    if (ci >= 0) {
      const before = rest.slice(0, ci);
      const q = (before.match(/'/g) || []).length + (before.match(/"/g) || []).length;
      if (q % 2 === 0) { comment = rest.slice(ci); rest = before; }
    }
    const KW = /^(import|from|class|def|return|if|elif|else|for|in|while|assert|not|and|or|None|True|False|lambda|with|try|except|raise|as|pass|break|continue|global|is)$/;
    const BI = /^(print|range|len|enumerate|isinstance|tuple|list|dict|set|zip|input|float|int|str|np|plt|patches|random|argparse|type|sum|Exception)$/;
    const re = /('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")|([A-Za-z_][A-Za-z_0-9]*)|(\d+\.?\d*)|(\s+)|(.)/g;
    let m;
    while ((m = re.exec(rest)) !== null) {
      if (m[1]) out += `<span class="tok-str">${esc(m[1])}</span>`;
      else if (m[2]) {
        const w = m[2];
        if (KW.test(w)) out += `<span class="tok-kw">${w}</span>`;
        else if (w === 'self') out += `<span class="tok-self">${w}</span>`;
        else if (BI.test(w)) out += `<span class="tok-bi">${w}</span>`;
        else if (rest[m.index + w.length] === '(' && ['def','class'].includes(out.match(/tok-kw">(\w+)<\/span>(?!.*tok-kw)/)?.[1] || '')) out += `<span class="tok-def">${w}</span>`;
        else out += esc(w);
      }
      else if (m[3]) out += `<span class="tok-num">${m[3]}</span>`;
      else if (m[4]) out += m[4];
      else out += esc(m[5]);
    }
    if (comment) out += `<span class="tok-com">${esc(comment)}</span>`;
    return out || '&nbsp;';
  }

  const CodeLab = {
    name: 'CodeLab',
    props: { source: { type: String, default: 'l1' } },
    data: () => ({ tab: null, lit: null }),
    computed: {
      files() {
        return (D.codeFileSets && D.codeFileSets[this.source]) || D.codeFiles || [];
      },
      file() { return this.files.find(f => f.id === this.tab) || this.files[0] || { id: '', file: '', code: '', intro: '', notes: [] }; },
      lines() { return (this.file.code || '').split('\n').map(hlPy); },
      litLines() {
        if (!this.lit) return new Set();
        const s = new Set();
        for (let i = this.lit[0]; i <= this.lit[1]; i++) s.add(i);
        return s;
      },
    },
    watch: {
      source: {
        immediate: true,
        handler() {
          this.tab = this.files[0] ? this.files[0].id : null;
          this.lit = null;
        },
      },
      files(list) {
        if (list.length && !list.some(f => f.id === this.tab)) {
          this.tab = list[0].id;
          this.lit = null;
        }
      },
    },
    methods: {
      noteLines(n) { return 'L' + (n.lines[0] === n.lines[1] ? n.lines[0] : n.lines[0] + '–' + n.lines[1]); },
      clickNote(n) { this.lit = this.lit && this.lit[0] === n.lines[0] && this.lit[1] === n.lines[1] ? null : n.lines; },
    },
    template: `
    <div v-if="files.length">
      <div class="code-tabs" role="tablist" :aria-label="$root.lang === 'en' ? 'Source files' : '代码文件'">
        <button v-for="f in files" :key="f.id" type="button" class="code-tab" :class="{active: tab===f.id}"
                role="tab" :aria-selected="tab===f.id ? 'true' : 'false'"
                @click="tab=f.id; lit=null">{{ f.tab }}</button>
      </div>
      <div class="code-panel">
        <div class="code-file-bar">
          <span class="dots"><i style="background:#ff5f57"></i><i style="background:#febc2e"></i><i style="background:#28c840"></i></span>
          {{ file.file }}
        </div>
        <div class="code-scroll">
          <pre class="codeblock"><code><span v-for="(l,i) in lines" :key="file.id+i" class="cl" :class="{hl: litLines.has(i+1)}"
              v-html="l"></span></code></pre>
        </div>
        <div class="code-notes">
          <p v-if="file.intro" class="bi duo code-intro" v-html="biAny(file.intro)"></p>
          <div v-for="(n,ni) in file.notes" :key="ni" class="code-note" :class="{lit: lit && lit[0]===n.lines[0] && lit[1]===n.lines[1]}"
               role="button" tabindex="0" @click="clickNote(n)" @keydown.enter.prevent="clickNote(n)" @keydown.space.prevent="clickNote(n)">
            <span class="cn-badge">{{ noteLines(n) }}</span>
            <span class="cn-body">
              <span class="zh" v-html="fmtMath(n.zh)"></span>
              <span class="en" v-html="fmtMath(n.en)"></span>
            </span>
          </div>
        </div>
      </div>
    </div>`,
    setup() { return { bi, biAny, fmtMath }; },
  };

  /* ═════════════ 长推理链 ═════════════ */
  const ReasoningLab = {
    name: 'ReasoningLab',
    props: { source: { type: String, default: 'l1' } },
    data: () => ({ shown: 1, essay: false }),
    computed: {
      steps() {
        return (D.reasoningSets && D.reasoningSets[this.source]) || D.reasoning;
      },
      closingHTML() {
        const closings = D.reasoningClosings || {};
        const c = closings[this.source] || {
          zh: '推理链闭合：每一步都由上一步逼出。带着这条逻辑主线去读代码、做实验，每一个细节都不再孤立。',
          en: 'The reasoning chain is closed: every link was forced by the previous one. Carry this spine into the code and experiments — no detail stands isolated.',
        };
        return biAny(c);
      },
    },
    watch: { source() { this.shown = 1; this.essay = false; } },
    setup() { return { bi, biAny }; },
    methods: {
      questionHTML(q) {
        if (!q) return '';
        if (typeof q === 'object') {
          return bi(
            '<strong>逼出的问题 →</strong> ' + (q.zh || ''),
            '<strong>The question it forces →</strong> ' + (q.en || q.zh || '')
          );
        }
        return bi('<strong>逼出的问题 →</strong> ' + q, '<strong>The question it forces →</strong> ' + q);
      },
      next() {
        if (this.shown < this.steps.length) {
          this.shown++;
          this.$nextTick(() => {
            const el = this.$refs['step' + (this.shown - 1)];
            if (el && el[0]) el[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
          });
        }
      },
      all() { this.essay = true; this.shown = this.steps.length; },
      stepMode() { this.essay = false; },
      restart() { this.shown = 1; this.essay = false; this.$nextTick(() => this.$refs.top && this.$refs.top.scrollIntoView({ behavior: 'smooth', block: 'center' })); },
    },
    template: `
    <div class="lab">
      <div class="reason-ctl" ref="top">
        <button class="btn primary" @click="next" :disabled="shown>=steps.length || essay">⏭ <span v-html="bi('下一步推理','Next step of the reasoning')"></span></button>
        <button class="btn" @click="all" v-if="!essay">📜 <span v-html="bi('连贯全文模式','Continuous essay mode')"></span></button>
        <button class="btn ghost" @click="stepMode" v-if="essay">🧩 <span v-html="bi('返回逐步模式','Back to step mode')"></span></button>
        <button class="btn ghost" @click="restart">↺ <span v-html="bi('重来','Restart')"></span></button>
        <span class="reason-progress">{{ shown }} / {{ steps.length }}</span>
      </div>
      <div class="reason-wrap">
        <div v-for="(st,i) in steps" :key="i" :ref="'step'+i" class="reason-step"
             :class="{shown: essay || i < shown, now: (i === shown-1 && !essay)}">
          <span class="rs-no">{{ i+1 }}</span>
          <span class="rs-link">⛓ {{ st.link }}</span>
          <h4><span class="zh">{{ st.title.zh }}</span><span class="en">{{ st.title.en }}</span></h4>
          <p class="bi duo" style="font-size:14.5px" v-html="bi(st.zh, st.en)"></p>
          <p v-if="st.question" class="bi duo reason-q" v-html="questionHTML(st.question)"></p>
        </div>
      </div>
      <div v-if="shown>=steps.length || essay" class="callout done">
        <div class="callout-icon">🎓</div>
        <div class="callout-body"><p class="bi duo" v-html="closingHTML"></p></div>
      </div>
    </div>`,
  };

  /* ═════════════ Q&A 翻转卡 ═════════════ */
  const QaLab = {
    name: 'QaLab',
    props: { source: { type: String, default: 'l1' } },
    data: () => ({ flipped: {} }),
    computed: { cards() { return (D.qaSets && D.qaSets[this.source]) || D.qa; } },
    setup() { return { bi }; },
    methods: { flip(i) { this.flipped[i] = !this.flipped[i]; } },
    template: `
    <div class="qa-grid">
      <div v-for="(c,i) in cards" :key="i" class="qa-card" :class="{flipped: !!flipped[i]}"
           role="button" tabindex="0" :aria-expanded="flipped[i] ? 'true' : 'false'"
           @click="flip(i)" @keydown.enter.prevent="flip(i)" @keydown.space.prevent="flip(i)">
        <div class="qa-inner">
          <div class="qa-face">
            <span class="qa-tag">{{ c.tag }}</span>
            <p class="bi duo" style="font-weight:700; font-size:15.5px" v-html="bi(c.q.zh, c.q.en)"></p>
            <span class="qa-hint" v-html="bi('点击翻转看答案 →','click to flip →')"></span>
          </div>
          <div class="qa-face back">
            <span class="qa-tag" style="background:var(--surface)">A</span>
            <p class="bi duo" style="font-size:14px" v-html="bi(c.a.zh, c.a.en)"></p>
            <span class="qa-hint" v-html="bi('← 点击翻回','← flip back')"></span>
          </div>
        </div>
      </div>
    </div>`,
  };

  /* ═════════════ 知识填空 FillLab ═════════════ */
  // —— 纯函数（不碰 DOM，node 可直接测；经 window.RLV 暴露给校验脚本）——
  // [[n]] 解析："a [[1]] b [[2]]" → { segs: [txt|{t:'b',n}...], nums: ['1','2'] }
  // 段含首尾文本段（split 语义），文本段可能为空串
  function parseBlanks(text) {
    const parts = String(text == null ? '' : text).split(/(\[\[\d+\]\])/);
    const segs = [];
    const nums = [];
    parts.forEach((p) => {
      const m = /^\[\[(\d+)\]\]$/.exec(p);
      if (m) { segs.push({ t: 'b', n: parseInt(m[1], 10) }); nums.push(m[1]); }
      else segs.push({ t: 'txt', s: p });
    });
    return { segs, nums };
  }
  // number 空解析：空串 → NaN（防 Number('')===0 误判对）；逗号按欧洲小数点容错
  function parseNum(s) {
    const t = String(s == null ? '' : s).trim();
    if (t === '') return NaN;
    return Number(t.replace(',', '.'));
  }
  // 判一个空：choices 型比下标；number 型比 |x−answer|≤tol
  function judgeBlank(val, blank) {
    if (!blank) return false;
    if (blank.choices) return val === blank.answer;
    const x = parseNum(val);
    if (Number.isNaN(x)) return false;
    const tol = typeof blank.tol === 'number' ? blank.tol : 0;
    // +1e-9 吸收浮点表示误差，保证 |x−answer|===tol 的边界按 ≤ 判
    return Math.abs(x - blank.answer) <= tol + 1e-9;
  }

  const FillLab = {
    name: 'FillLab',
    props: { source: { type: String, default: 'l1' } },
    // st[i] = 每条状态 { vals: 每空作答（choice=下标 / number=原始字符串）,
    //                   marks: 每空对错（null 未判 / true / false）, checked: 已检查 }
    // open = 当前展开选项组的空 { i, b }（同时只开一个）
    data: () => ({ st: [], open: null }),
    computed: {
      // 整讲缺失 → bank 为 null → v-if 不渲染（优雅降级）
      bank() { return (D.fillSets && D.fillSets[this.source]) || null; },
      items() { return this.bank ? this.bank.items : []; },
      storeKey() { return CFG_ID + '-fill-' + this.source; },
      checkedCount() { return this.st.filter((s) => s && s.checked).length; },
      rightCount() { return this.st.filter((s) => s && s.checked && s.marks.every(Boolean)).length; },
      scoreText() {
        const en = this.$root && this.$root.lang === 'en';
        const body = this.checkedCount + '/' + this.items.length + ' · ' + this.rightCount;
        return en ? 'checked ' + body : '已检查 ' + body;
      },
    },
    watch: {
      source: { immediate: true, handler() { this.load(); } },
      items() { this.load(); },   // 题库可能随讲数据懒加载注入
    },
    mounted() {
      this.retryListener = e => {
        const row = e.detail;
        if (row.kind !== 'fill' || row.source !== this.source) return;
        this.st[row.i] = this.fresh()[row.i]; this.open = null; this.save();
      };
      window.addEventListener('course-retry', this.retryListener);
    },
    beforeUnmount() { window.removeEventListener('course-retry', this.retryListener); },
    setup() { return { bi }; },
    methods: {
      /* ── 渲染辅助 ── */
      // 一条 = stem 行（双语各行）+ code 等宽行（仅 kind='code'）；code.zh===code.en 时双语只出一行
      lineLangs(it, field) {
        const lang = this.$root && this.$root.lang;
        if (lang === 'zh') return ['zh'];
        if (lang === 'en') return ['en'];
        const o = (it && it[field]) || {};
        return String(o.zh) === String(o.en) ? ['zh'] : ['zh', 'en'];
      },
      itemLines(it) {
        const out = [];
        this.lineLangs(it, 'stem').forEach((lgk) => out.push({ lgk, mono: false, segs: this.segs(it, 'stem', lgk) }));
        if (it.kind === 'code') {
          this.lineLangs(it, 'code').forEach((lgk) => out.push({ lgk, mono: true, segs: this.segs(it, 'code', lgk) }));
        }
        return out;
      },
      segs(it, field, lgk) {
        const o = (it && it[field]) || {};
        return parseBlanks(o[lgk]).segs;
      },
      isNum(it, b) {
        const bl = it.blanks && it.blanks[b];
        return !!bl && !bl.choices;   // choices 型（数组或 {zh,en}）→ 槽按钮，其余 → 数字输入
      },
      // choices 兼容三种形态（题库实际三种都在用）：
      // ['a','b'] · [{zh,en},...] · { zh:['a'], en:['b'] } → 统一成显示对象数组
      choiceList(blank) {
        const c = blank && blank.choices;
        if (!c) return [];
        const opt = (o) => (o && typeof o === 'object')
          ? { zh: o.zh == null ? '' : String(o.zh), en: o.en == null ? '' : String(o.en) }
          : { plain: String(o) };
        if (Array.isArray(c)) return c.map(opt);
        const zh = Array.isArray(c.zh) ? c.zh : [];
        const en = Array.isArray(c.en) ? c.en : [];
        const out = [];
        for (let k = 0; k < Math.max(zh.length, en.length); k++) {
          out.push({ zh: zh[k] == null ? '' : String(zh[k]), en: en[k] == null ? '' : String(en[k]) });
        }
        return out;
      },
      // 选项的可读文本（槽上文案 / aria / title 共用；随语言切换）
      optTitle(o) {
        if (!o) return '';
        if (o.plain != null) return o.plain;
        const lang = this.$root && this.$root.lang;
        if (lang === 'en') return o.en || o.zh || '';
        if (lang === 'zh') return o.zh || o.en || '';
        return o.zh === o.en ? (o.zh || '') : [o.zh, o.en].filter(Boolean).join(' · ');
      },
      optOf(i, b) {
        const v = this.st[i] && this.st[i].vals[b];
        if (v == null) return null;
        return this.choiceList(this.items[i].blanks[b])[v] || null;
      },
      numVal(i, b) {
        const v = this.st[i] && this.st[i].vals[b];
        return v == null ? '' : String(v);
      },
      numHint(i, b) {
        const bl = this.items[i].blanks && this.items[i].blanks[b];
        const h = bl && bl.hint;
        if (!h) return '…';
        const en = this.$root && this.$root.lang === 'en';
        return String(en ? (h.en || h.zh || '') : (h.zh || h.en || ''));
      },
      markCls(i, b) {
        const s = this.st[i];
        if (!s || !s.checked || s.marks[b] == null) return '';
        return s.marks[b] ? 'right' : 'wrong';
      },
      hasVal(i, b) {
        const v = this.st[i] && this.st[i].vals[b];
        return v != null && v !== '';
      },
      slotLabel(i, b) {
        const it = this.items[i];
        const bl = it && it.blanks && it.blanks[b];
        if (!bl) return '';
        const en = this.$root && this.$root.lang === 'en';
        let s = en ? 'blank ' + (b + 1) : '第 ' + (b + 1) + ' 空';
        s += bl.choices ? (en ? ', pick an option' : '，选一项') : (en ? ', type a number' : '，填数字');
        if (!bl.choices && bl.hint) s += en ? ', ' + (bl.hint.en || bl.hint.zh) : '，' + (bl.hint.zh || bl.hint.en);
        if (this.hasVal(i, b)) {
          const picked = bl.choices ? this.optTitle(this.optOf(i, b)) : this.numVal(i, b);
          if (picked) s += en ? ', current: ' + picked : '，当前填了：' + picked;
        }
        if (this.st[i] && this.st[i].checked && this.st[i].marks[b] === false) {
          const ans = bl.choices ? this.optTitle(this.choiceList(bl)[bl.answer]) : String(bl.answer);
          s += en ? ', wrong — correct answer: ' + ans : '，答错，正确答案：' + ans;
        }
        return s;
      },
      slotTitle(i, b) {
        // 答错的空：tooltip 给出正确项（其余不占 title）
        const it = this.items[i];
        const bl = it && it.blanks && it.blanks[b];
        if (!bl) return '';
        const s = this.st[i];
        if (!s || !s.checked || s.marks[b] !== false) return '';
        const en = this.$root && this.$root.lang === 'en';
        const ans = bl.choices ? this.optTitle(this.choiceList(bl)[bl.answer]) : String(bl.answer);
        return (en ? 'Correct answer: ' : '正确答案：') + ans;
      },
      optsLabel() {
        const en = this.$root && this.$root.lang === 'en';
        return en ? 'Options for blank ' + (this.open.b + 1) : '第 ' + (this.open.b + 1) + ' 空的选项';
      },
      allFilled(i) {
        const s = this.st[i];
        const it = this.items[i];
        if (!s || !it || !it.blanks) return false;
        return it.blanks.every((bl, b) =>
          (bl.choices ? this.hasVal(i, b) : String(s.vals[b] == null ? '' : s.vals[b]).trim() !== ''));
      },
      verdictCls(i) {
        const s = this.st[i];
        return s && s.checked ? (s.marks.every(Boolean) ? 'good' : 'bad') : '';
      },
      verdictText(i) {
        const s = this.st[i];
        if (!s || !s.checked) return '';
        const en = this.$root && this.$root.lang === 'en';
        const total = s.marks.length;
        const right = s.marks.filter(Boolean).length;
        return right === total
          ? (en ? '✓ Correct · ' + total + '/' + total + ' blanks' : '✓ 答对 · ' + total + '/' + total + ' 空')
          : (en ? '✗ Wrong · ' + right + '/' + total + ' — correct answers marked on the blanks'
                : '✗ 答错 · ' + right + '/' + total + ' —— 正确答案已标在空上');
      },
      /* ── 交互 ── */
      toggleOpts(i, b) {
        this.open = this.open && this.open.i === i && this.open.b === b ? null : { i, b };
      },
      choose(i, b, oi) {
        this.st[i].vals[b] = oi;
        if (this.st[i].checked) this.clearMarks(i);   // 改答案 → 本条判分作废，须重查
        this.open = null;
        this.save();
      },
      onNum(i, b, e) {
        this.st[i].vals[b] = e.target.value;
        if (this.st[i].checked) this.clearMarks(i);
        this.save();
      },
      clearMarks(i) {
        const s = this.st[i];
        s.checked = false;
        s.marks = s.marks.map(() => null);
      },
      reviewRow(i) { return window.CourseReview.exercise(this.source, 'fill', i); },
      study(i) { window.dispatchEvent(new CustomEvent('course-study', {detail:this.reviewRow(i)})); },
      checkItem(i) {
        const s = this.st[i];
        s.marks = this.items[i].blanks.map((bl, b) => judgeBlank(s.vals[b], bl));
        s.checked = true;
        window.CourseReview.noteResult(this.reviewRow(i), s.marks.every(Boolean));
        this.save();
      },
      reset() {
        this.st = this.fresh();
        this.open = null;
        try { localStorage.removeItem(this.storeKey); } catch { /* 写不进（隐私模式）就不记 */ }
      },
      /* ── 持久化：localStorage 'rl-viz-fill-<source>'，恢复含已检查的 why 展开态 ── */
      fresh() {
        return this.items.map((it) => ({
          vals: (it.blanks || []).map(() => null),
          marks: (it.blanks || []).map(() => null),
          checked: false,
        }));
      },
      load() {
        const items = this.items;
        let saved;
        try { saved = JSON.parse(localStorage.getItem(this.storeKey) || 'null'); } catch { saved = null; }
        const ok = saved && Array.isArray(saved.items) && saved.items.length === items.length &&
          saved.items.every((s, i) =>
            s && Array.isArray(s.vals) && Array.isArray(s.marks) &&
            s.vals.length === (items[i].blanks || []).length &&
            s.marks.length === (items[i].blanks || []).length);
        this.st = ok ? saved.items.map((s) => ({
          vals: s.vals.slice(),
          marks: s.marks.map((m) => (m == null ? null : !!m)),
          checked: !!s.checked,
        })) : this.fresh();
        this.open = null;
      },
      save() {
        try { localStorage.setItem(this.storeKey, JSON.stringify({ v: 1, items: this.st })); } catch { /* 写不进就不记 */ }
      },
    },
    template: `
    <div v-if="bank" class="lab fill-lab">
      <div class="lab-head">
        <span class="lab-title"><span v-html="bi(bank.title.zh, bank.title.en)"></span></span>
        <span class="fill-sub" v-html="bi('填空并检查——答错也会给出讲解', 'Fill the blanks and check — wrong answers come with explanations')"></span>
      </div>

      <div v-for="(it, i) in items" :key="i" class="fill-item" :data-retry-key="reviewRow(i).key">
        <div class="fill-item-head">
          <span class="fill-tag"><span class="zh">{{ it.tag.zh }}</span><span class="en">{{ it.tag.en }}</span></span>
        </div>

        <!-- stem 行与 code 等宽行：同一空号 n 的槽共享同一份作答状态 -->
        <div class="fill-lines">
          <template v-for="(ln, li) in itemLines(it)" :key="'ln' + i + '-' + li">
            <p class="fill-line" :class="[ln.lgk, ln.mono ? 'mono' : '']">
              <template v-for="(seg, si) in ln.segs" :key="'sg' + si">
                <span v-if="seg.t === 'txt'">{{ seg.s }}</span>
                <input v-else-if="isNum(it, seg.n - 1)" type="text" inputmode="decimal" class="fill-num"
                       :class="markCls(i, seg.n - 1)" :value="numVal(i, seg.n - 1)"
                       :placeholder="numHint(i, seg.n - 1)" :aria-label="slotLabel(i, seg.n - 1)"
                       :title="slotTitle(i, seg.n - 1)" @input="onNum(i, seg.n - 1, $event)">
                <span v-else-if="seg.n > (it.blanks || []).length">{{ '[[[' + seg.n + ']]]' }}</span>
                <button v-else type="button" class="fill-slot" :class="markCls(i, seg.n - 1)"
                        :aria-pressed="hasVal(i, seg.n - 1) ? 'true' : 'false'"
                        :aria-label="slotLabel(i, seg.n - 1)" :title="slotTitle(i, seg.n - 1)"
                        @click="toggleOpts(i, seg.n - 1)">
                  <span v-if="hasVal(i, seg.n - 1)" class="fill-slot-txt">{{ optTitle(optOf(i, seg.n - 1)) }}</span>
                  <span v-else class="fill-slot-ph">{{ seg.n }}</span>
                </button>
              </template>
            </p>
          </template>
        </div>

        <!-- 当前空的选项组（单选语义；真实按钮，Tab + Enter 可用） -->
        <div v-if="open && open.i === i" class="fill-opts" role="group" :aria-label="optsLabel()">
          <button v-for="(o, oi) in choiceList(items[i].blanks[open.b])" :key="oi" type="button"
                  class="fill-opt" :class="{ picked: st[i].vals[open.b] === oi }"
                  :aria-pressed="st[i].vals[open.b] === oi ? 'true' : 'false'"
                  @click="choose(i, open.b, oi)">
            <span v-if="o.plain != null">{{ o.plain }}</span>
            <template v-else><span class="zh">{{ o.zh }}</span><span class="en">{{ o.en }}</span></template>
          </button>
        </div>

        <div class="fill-item-foot">
          <button type="button" class="btn sm primary" :disabled="!allFilled(i)" @click="checkItem(i)">
            ✓ <span v-html="bi('检查', 'Check')"></span>
          </button>
          <span class="fill-verdict" :class="verdictCls(i)" aria-live="polite">{{ verdictText(i) }}</span>
        </div>

        <!-- 已检查后展开的逐空讲解（再次作答即收起，须重查） -->
        <div v-if="st[i].checked" class="fill-why">
          <button v-if="st[i].marks.includes(false)" class="btn sm" @click="study(i)">回看推导，再做一次 / Review and retry</button>
          <p v-for="(bl, ki) in it.blanks" :key="'w' + ki" class="fill-why-line">
            <span class="fill-why-no">{{ ki + 1 }}</span>
            <span class="fill-why-body bi duo" v-html="bi(bl.why.zh, bl.why.en)"></span>
          </p>
        </div>
      </div>

      <div class="fill-foot">
        <span class="fill-score">{{ scoreText }}</span>
        <button type="button" class="btn ghost sm" @click="reset">↺ <span v-html="bi('重置本组', 'Reset this set')"></span></button>
      </div>
    </div>`,
  };

  /* ═════════════ 定理推导 DerivationLab ═════════════ */
  // 走步式定理推导（ReasoningLab 的走步模式 + FillLab 的 choice 判分）。
  // 数据契约（scripts/check_data.js checkDerivations 校验，缺失讲跳过）：
  //   D.derivationSets[source] = { title?: {zh,en}, items: [
  //     { id, name: {zh,en}, intro: {zh,en}, steps: [
  //       { tex, why: {zh,en}, blank?: {
  //           q?: {zh,en}|string,            // 题干（缺省用组件默认提示）
  //           choices: ['文本'|{zh,en}|{tex}], // tex 型选项行内 KaTeX 渲染
  //           answer,                         // 正确下标（judgeBlank 比对）
  //           hint?: {zh,en}|string, whyWrong?: [...]   // 可选降级
  //       } }] }] }
  // 带 blank 的步骤在走步模式下答对才放行"下一步"；完成落 localStorage
  // 'rl-viz-deriv-<source>'（已完成 item id 数组）。全文模式为复习视图不设门。
  const DerivationLab = {
    name: 'DerivationLab',
    props: { source: { type: String, default: 'l1' } },
    // ans[i] = 第 i 步作答 { pick, ok }（null 未答）；hintOn[i] = 提示已展开
    data: () => ({ cur: 0, shown: 1, essay: false, ans: [], hintOn: [], doneIds: [] }),
    computed: {
      // 整讲缺失 → bank 为 null → v-if 不渲染（优雅降级，同 FillLab）
      bank() { return (D.derivationSets && D.derivationSets[this.source]) || null; },
      items() { return this.bank && Array.isArray(this.bank.items) ? this.bank.items : []; },
      item() { return this.items[this.cur] || null; },
      steps() { return (this.item && this.item.steps) || []; },
      storeKey() { return CFG_ID + '-deriv-' + this.source; },
      doneCount() { return this.items.filter((it) => this.doneIds.indexOf(it.id) >= 0).length; },
      titleHTML() {
        return this.bank && this.bank.title
          ? bi(this.bank.title.zh, this.bank.title.en)
          : bi('定理推导实验室', 'Derivation lab');
      },
    },
    watch: {
      source: { immediate: true, handler() { this.loadDone(); this.restoreProgress(); } },
      items() { this.restoreProgress(); },   // 题库可能随讲数据懒加载注入
      shown() { this.$nextTick(() => this.renderTex()); },
      essay() { this.$nextTick(() => this.renderTex()); },
      cur() { this.$nextTick(() => this.renderTex()); },
    },
    mounted() {
      this.$nextTick(() => this.renderTex());
      this.retryListener = e => {
        const row = e.detail;
        if (row.source !== this.source || row.kind !== 'proof') return;
        if (this.cur !== row.i) this.openItem(row.i);
        this.essay = false; this.shown = row.step + 1; this.ans[row.step] = null; this.saveProgress();
      };
      window.addEventListener('course-retry', this.retryListener);
    },
    beforeUnmount() { window.removeEventListener('course-retry', this.retryListener); },
    setup() { return { bi }; },
    methods: {
      /* ── 状态 ── */
      reviewRow(i) { return window.CourseReview.exercise(this.source, 'proof', this.cur, i); },
      study(i) { window.dispatchEvent(new CustomEvent('course-study', {detail:this.reviewRow(i)})); },
      saveProgress() {
        if (!this.item) return;
        window.CourseReview.write('proof/'+this.source, {id:this.item.id, shown:this.shown, ans:this.ans, essay:this.essay});
      },
      restoreProgress() {
        const state = window.CourseReview.read('proof/'+this.source);
        const i = this.items.findIndex(it => it.id === state?.id);
        this.openItem(i < 0 ? this.firstUnDone() : i, false);
        if (i >= 0 && Array.isArray(state.ans) && state.ans.length === this.steps.length) {
          this.shown = Math.min(this.steps.length, Math.max(1,state.shown || 1));
          this.ans = state.ans; this.essay = !!state.essay;
        }
      },
      firstUnDone() {
        const i = this.items.findIndex((it) => this.doneIds.indexOf(it.id) < 0);
        return i >= 0 ? i : 0;
      },
      openItem(i, save = true) {
        const n = this.items.length;
        this.cur = n ? Math.min(Math.max(i || 0, 0), n - 1) : 0;
        this.shown = 1;
        this.essay = false;
        this.ans = this.steps.map(() => null);
        this.hintOn = this.steps.map(() => false);
        if (save) this.saveProgress();
        this.$nextTick(() => this.renderTex());
      },
      /* ── 走步（同 ReasoningLab；blank 步答对才放行） ── */
      stepCleared(i) {
        const bl = this.steps[i] && this.steps[i].blank;
        return !bl || !!(this.ans[i] && this.ans[i].ok);
      },
      canNext() { return this.stepCleared(this.shown - 1); },
      next() {
        if (this.essay || this.shown >= this.steps.length || !this.canNext()) return;
        this.shown++; this.saveProgress();
        this.markDoneIfWalked();
        this.scrollStep(this.shown - 1);
      },
      all() { this.essay = true; this.shown = this.steps.length; this.saveProgress(); },
      stepMode() { this.essay = false; this.saveProgress(); },
      restart() { this.openItem(this.cur); },
      scrollStep(i) {
        this.$nextTick(() => {
          const el = this.$refs['step' + i];
          if (el && el[0]) el[0].scrollIntoView({ behavior: 'instant', block: 'center' });
        });
      },
      /* ── 填空判分（judgeBlank 比下标；错选标红 + whyWrong，可重选） ── */
      pick(i, ci) {
        const bl = this.steps[i] && this.steps[i].blank;
        if (!bl || (this.ans[i] && this.ans[i].ok)) return;   // 答对后锁定
        this.ans[i] = { pick: ci, ok: judgeBlank(ci, bl) };
        window.CourseReview.noteResult(this.reviewRow(i), this.ans[i].ok); this.saveProgress();
        this.markDoneIfWalked();
      },
      /* ── 完成持久化：走完最后一步且沿途 blank 全对 → 记 item id ── */
      markDoneIfWalked() {
        if (this.essay || this.shown < this.steps.length) return;
        if (!this.steps.every((st, i) => this.stepCleared(i))) return;
        const it = this.item;
        if (!it || this.doneIds.indexOf(it.id) >= 0) return;
        this.doneIds = this.doneIds.concat([it.id]);
        try { localStorage.setItem(this.storeKey, JSON.stringify(this.doneIds)); } catch { /* 写不进（隐私模式）就不记 */ }
      },
      loadDone() {
        let arr;
        try { arr = JSON.parse(localStorage.getItem(this.storeKey) || 'null'); } catch { arr = null; }
        this.doneIds = Array.isArray(arr) ? arr.filter((x) => typeof x === 'string') : [];
      },
      /* ── 文案辅助（hint/q/whyWrong 兼容 string | {zh,en}） ── */
      biHTML(o) {
        if (o == null) return '';
        return typeof o === 'string' ? fmtMath(o) : bi(String(o.zh || ''), String(o.en || ''));
      },
      qHTML(bl) {
        return bl.q ? this.biHTML(bl.q)
          : bi('关键一步：选出正确的下一步依据', 'The key move: pick what justifies the next line');
      },
      whyWrongHTML(bl, pick) {
        const w = bl && Array.isArray(bl.whyWrong) ? bl.whyWrong[pick] : null;
        return this.biHTML(w);
      },
      optsAria() {
        const en = this.$root && this.$root.lang === 'en';
        return en ? 'Options for the key step' : '关键步选项';
      },
      choiceIsTex(c) { return !!c && typeof c === 'object' && c.tex != null; },
      /* ── KaTeX：tex 字段与 {tex} 型选项逐个渲染（幂等，复用 app.js 套路） ── */
      async renderTex() {
        const jobs = [];
        for (let i = 0; i < this.steps.length; i++) {
          if (!(this.essay || i < this.shown)) continue;
          const st = this.steps[i];
          const r = this.$refs['tex' + i];
          const el = Array.isArray(r) ? r[0] : r;
          if (el && !el.querySelector('.katex')) jobs.push({ el, tex: st.tex, inline: false });
          const bl = st.blank;
          if (bl && Array.isArray(bl.choices) && !this.essay) {
            bl.choices.forEach((c, ci) => {
              if (!this.choiceIsTex(c)) return;
              const rc = this.$refs['cho' + i + '-' + ci];
              const cel = Array.isArray(rc) ? rc[0] : rc;
              if (cel && !cel.querySelector('.katex')) jobs.push({ el: cel, tex: String(c.tex), inline: true });
            });
          }
        }
        if (!jobs.length) return;
        let katex = null;
        try { katex = await window.RLVLoader.ensureKatex(); }
        catch (e) { console.error('[deriv] KaTeX 加载失败，公式回退为源码', e); }
        jobs.forEach((j) => {
          if (!katex) { j.el.textContent = j.tex; return; }
          try {
            katex.render(j.tex, j.el, {
              displayMode: !j.inline, throwOnError: false,
              trust: true, strict: 'ignore',
            });
          } catch { j.el.textContent = j.tex; }
        });
      },
    },
    template: `
    <div v-if="bank" class="lab deriv-lab">
      <div class="lab-head">
        <span class="lab-title"><span v-html="titleHTML"></span></span>
        <span class="fill-sub"><span v-html="bi('亲手走完证明链——带 ★ 的关键步答对才放行','Walk the proof yourself — ★ key steps unlock only when answered right')"></span></span>
        <span class="fill-score">{{ doneCount }} / {{ items.length }} ✓</span>
      </div>

      <div v-if="items.length > 1" class="deriv-tabs" role="tablist">
        <button v-for="(it, i) in items" :key="it.id" type="button" class="deriv-tab"
                :class="{ active: cur === i, done: doneIds.indexOf(it.id) >= 0 }"
                role="tab" :aria-selected="cur === i ? 'true' : 'false'" @click="openItem(i)">
          <span class="zh">{{ it.name.zh }}</span><span class="en">{{ it.name.en }}</span>
          <span v-if="doneIds.indexOf(it.id) >= 0" class="deriv-done" aria-hidden="true">✓</span>
        </button>
      </div>

      <p v-if="item" class="bi duo deriv-intro" v-html="bi(item.intro.zh, item.intro.en)"></p>

      <div class="reason-ctl" ref="top">
        <button class="btn primary" type="button" @click="next"
                :disabled="essay || shown >= steps.length || !canNext()">
          ⏭ <span v-html="bi('下一步推导','Next step')"></span></button>
        <button class="btn" type="button" @click="all" v-if="!essay">📜 <span v-html="bi('连贯全文模式','Essay mode')"></span></button>
        <button class="btn ghost" type="button" @click="stepMode" v-if="essay">🧩 <span v-html="bi('返回逐步模式','Back to step mode')"></span></button>
        <button class="btn ghost" type="button" @click="restart">↺ <span v-html="bi('重来','Restart')"></span></button>
        <span class="reason-progress">{{ shown }} / {{ steps.length }}</span>
      </div>

      <div class="reason-wrap">
        <div v-for="(st, i) in steps" :key="cur + '-' + i" :data-retry-key="reviewRow(i).key" :ref="'step' + i"
             class="reason-step deriv-step" :class="{ shown: essay || i < shown, now: (i === shown - 1 && !essay) }">
          <span class="rs-no">{{ i + 1 }}</span>
          <span v-if="st.blank" class="rs-link deriv-star"><span class="zh">★ 关键步 · 答对放行</span><span class="en">★ key step · answer to unlock</span></span>
          <div class="deriv-tex" :ref="'tex' + i"></div>
          <p v-if="essay || !st.blank || (ans[i] && ans[i].ok)" class="bi duo deriv-why" v-html="bi(st.why.zh, st.why.en)"></p>

          <div v-if="st.blank && !essay && i < shown" class="deriv-blank">
            <p class="deriv-q bi duo" v-html="qHTML(st.blank)"></p>
            <div class="fill-opts" role="group" :aria-label="optsAria()">
              <button v-for="(c, ci) in st.blank.choices" :key="ci" type="button"
                      class="fill-opt deriv-opt"
                      :class="{ picked: ans[i] && ans[i].pick === ci,
                                right: ans[i] && ans[i].pick === ci && ans[i].ok,
                                wrong: ans[i] && ans[i].pick === ci && !ans[i].ok }"
                      :aria-pressed="ans[i] && ans[i].pick === ci ? 'true' : 'false'"
                      :disabled="ans[i] && ans[i].ok"
                      :aria-label="choiceIsTex(c) ? String(c.tex) : null"
                      @click="pick(i, ci)">
                <span v-if="choiceIsTex(c)" :ref="'cho' + i + '-' + ci" class="deriv-cho-tex"></span>
                <template v-else-if="c && c.zh != null"><span class="zh">{{ c.zh }}</span><span class="en">{{ c.en }}</span></template>
                <span v-else>{{ c }}</span>
              </button>
            </div>
            <div v-if="!(ans[i] && ans[i].ok)" class="deriv-aid">
              <button v-if="ans[i] && !ans[i].ok" class="btn sm" @click="study(i)">回看推导，再做一次 / Review and retry</button>
              <button v-if="st.blank.hint != null && !hintOn[i]" type="button" class="btn ghost sm" @click="hintOn[i] = true">
                💡 <span v-html="bi('看提示','Show hint')"></span>
              </button>
              <p v-if="hintOn[i]" class="deriv-hint bi duo" v-html="biHTML(st.blank.hint)"></p>
              <p v-if="ans[i] && !ans[i].ok && whyWrongHTML(st.blank, ans[i].pick)"
                 class="deriv-wrong bi duo" aria-live="polite" v-html="whyWrongHTML(st.blank, ans[i].pick)"></p>
            </div>
            <p v-else class="deriv-solved" aria-live="polite"><span v-html="bi('✓ 答对，链条可以继续','✓ correct — the chain may continue')"></span></p>
          </div>
        </div>
      </div>

      <div v-if="shown >= steps.length || essay" class="callout done">
        <div class="callout-icon">{{ essay ? '📜' : '🎓' }}</div>
        <div class="callout-body"><p class="bi duo" v-html="bi(
          '推导链闭合：每一环谁也少不了谁——而且这一遍是你自己推出来的。',
          'The chain is closed — every link indispensable, and this time you derived it yourself.')"></p></div>
      </div>
    </div>`,
  };

  /* ═════════════ 笔记本入口 NotebookBridge ═════════════ */
  // 静态卡片：把讲内小节桥接到 /lite/ JupyterLite 子站。卡片数据来自
  // assets/js/nb-manifest.js 的 window.NB_MANIFEST（单一事实源，lite.html hub 页共用）；
  // manifest 缺失时渲染占位提示，不报错（lite 构建是发版时本地步骤）。
  // props.nb：'nb1' 或 ['nb1','nb2']（id 数组，按 manifest 顺序渲染）。
  const NotebookBridge = {
    name: 'NotebookBridge',
    props: { nb: { type: [String, Array], default: () => [] } },
    data: () => ({ liteOriginPrefix: '' }),
    computed: {
      cards() {
        const m = window.NB_MANIFEST;
        if (!Array.isArray(m)) return [];
        const ids = Array.isArray(this.nb) ? this.nb : [this.nb];
        const want = new Set(ids.filter((x) => typeof x === 'string' && x));
        return m.filter((e) => e && e.id && want.has(e.id));
      },
      tourHref() {
        const m = window.NB_MANIFEST;
        const nb0 = Array.isArray(m) ? m.find((e) => e && e.id === 'nb0') : null;
        return nb0 ? this.hrefOf(nb0) : '';
      },
    },
    mounted() {
      // 镜像部署（非 localhost/127.0.0.1 且非主站域名）若未构建 lite/lab/index.html，自动改指主站在线实验台
      if (typeof location === 'undefined' || !/^https?:/.test(location.protocol)) return;
      if (/^(localhost|127\.0\.0\.1)$/i.test(location.hostname)) return;
      const live = String(RLV_CFG.liveOrigin || '').replace(/\/+$/, '');
      if (!live || location.origin === live) return;
      if (window.__RLV_LITE_REMOTE === true) { this.liteOriginPrefix = live + '/'; return; }
      if (window.__RLV_LITE_REMOTE === false) return;
      fetch('lite/lab/index.html', { method: 'HEAD' }).then((res) => {
        window.__RLV_LITE_REMOTE = !res.ok;
        if (!res.ok) this.liteOriginPrefix = live + '/';
      }).catch(() => { /* ignore network errors */ });
    },
    setup() { return { bi }; },
    methods: {
      hrefOf(e) { const view = matchMedia('(max-width: 720px)').matches ? 'notebooks' : 'lab';
        return this.liteOriginPrefix + 'lite/' + view + '/index.html?path=notebooks/' + e.file; },
      levelText(lv) {
        const en = this.$root && this.$root.lang === 'en';
        if (lv >= 3) return en ? 'challenge' : '挑战';
        if (lv === 2) return en ? 'intermediate' : '进阶';
        return en ? 'beginner' : '入门';
      },
      lecturesText(e) {
        const en = this.$root && this.$root.lang === 'en';
        const s = (e.lectures || []).map((l) => 'L' + l).join('/');
        if (!s) return en ? 'site-wide tour' : '全站导览';
        return (en ? 'lectures ' : '对应讲 ') + s;
      },
      minsText(e) {
        const en = this.$root && this.$root.lang === 'en';
        return e.minutes + (en ? ' min' : ' 分钟');
      },
    },
    template: `
    <div class="lab nb-bridge">
      <div class="lab-head">
        <span class="lab-title"><span v-html="bi('笔记本实验室 · 在浏览器里亲手跑','Notebook lab · run it yourself, in the browser')"></span></span>
        <span class="fill-sub"><span v-html="bi('JupyterLite + Pyodide 内核，numpy 开箱即用，无需安装','JupyterLite + Pyodide kernel — numpy included, nothing to install')"></span></span>
      </div>

      <div v-if="!cards.length" class="nb-empty">
        <p class="bi duo" v-html="bi(
          '笔记本清单尚未就绪（window.NB_MANIFEST 缺失）——入口就位后这里会列出可运行的笔记本。',
          'The notebook manifest is not ready yet (window.NB_MANIFEST missing) — cards will appear here once it ships.')"></p>
      </div>

      <div v-else class="nb-grid">
        <div v-for="c in cards" :key="c.id" class="nb-card">
          <div class="nb-card-head">
            <span class="nb-id">{{ c.id.toUpperCase() }}</span>
            <span class="nb-meta">{{ levelText(c.level) }} · {{ minsText(c) }}</span>
          </div>
          <p class="nb-name"><span class="zh">{{ c.zh.name }}</span><span class="en">{{ c.en.name }}</span></p>
          <p class="nb-goal"><span class="zh">{{ c.zh.goal }}</span><span class="en">{{ c.en.goal }}</span></p>
          <p class="nb-lec">{{ lecturesText(c) }}</p>
          <div class="nb-actions">
            <a class="btn primary sm" :href="hrefOf(c)" target="_blank" rel="noopener">
              📓 <span v-html="bi('在 Jupyter 中打开','Open in Jupyter')"></span>
            </a>
            <a v-if="c.id !== 'nb0' && tourHref" class="btn ghost sm" :href="tourHref" target="_blank" rel="noopener">
              🧭 <span v-html="bi('首次使用？先跑 NB0 导览','First time? Run the NB0 tour')"></span>
            </a>
          </div>
        </div>
      </div>
    </div>`,
  };

  /* ═════════════ 首页 ═════════════ */
  const HomeHero = {
    name: 'HomeHero',
    emits: ['go'],
    computed: {
      heroCfg() {
        return RLV_CFG.hero || {
          kicker: '📖 全书可视化 · Visual Book · Mathematical Foundation of RL · 双语',
          titleLead: { zh: '把强化学习全书', en: 'Run the whole RL book, ' },
          titleGrad: { zh: '“跑”起来', en: 'visually' },
          sub: {
            zh: '以可视化教学的高标准，把 Shiyu Zhao《Mathematical Foundation of Reinforcement Learning》全书十讲做成可玩的交互实验。',
            en: 'All ten lectures of Shiyu Zhao’s “Mathematical Foundation of Reinforcement Learning” turned into playable interactive labs.',
          },
          sub2: {
            zh: '每一课都包含：双语精讲 · 交互实验台 · 代码精讲 · 连贯长推理 · 问答填空与定理推导。',
            en: 'Every lesson pairs bilingual notes, interactive labs, code walkthroughs, a reasoning chain, Q&A cards, fill-ins, and theorem derivations.',
          },
          primaryCtas: [
            { kind: 'go', target: 'grid-world', cls: 'btn primary', icon: '🚀', zh: '从第一课开始', en: 'Start from Lesson 1' },
          ],
        };
      },
      // 全书统计：小节总数 / widget 实验台数 / 讲数 / 主题数（仅读元数据，冷启动兼容按讲懒加载）
      stats() {
        const D = window.DATA;
        return {
          sections: D.navGroups.reduce((n, g) => n + g.items.length, 0),
          widgets: D.otherLectures.reduce((n, l) => n + (l.widgets || 0), 0),
          lectures: D.navGroups.length,
          themes: (Array.isArray(RLV_CFG.themes) && RLV_CFG.themes.length) || 5,
        };
      },
    },
    mounted() {
      if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      const el = this.$el;
      if (!el || !el.classList) return;
      el.classList.add('hero-in');
      const nums = Array.from(el.querySelectorAll('.hero-stat b'));
      nums.forEach((b, i) => {
        const target = parseInt(b.textContent, 10) || 0;
        const t0 = performance.now() + 620 + i * 60;
        const dur = 750;
        b.textContent = '0';
        const tick = (now) => {
          const t = Math.min(1, Math.max(0, (now - t0) / dur));
          const e = 1 - Math.pow(1 - t, 3);
          b.textContent = String(Math.round(target * e));
          if (t < 1) requestAnimationFrame(tick);
          else b.textContent = String(target);
        };
        requestAnimationFrame(tick);
      });
    },
    template: `
    <div class="home-hero">
      <span class="hero-kicker">{{ heroCfg.kicker }}</span>
      <h1 class="hero-title">
        <span v-html="bi(heroCfg.titleLead.zh, heroCfg.titleLead.en)"></span><span class="grad" v-html="bi(heroCfg.titleGrad.zh, heroCfg.titleGrad.en)"></span>
      </h1>
      <p class="hero-sub" v-html="bi(heroCfg.sub.zh, heroCfg.sub.en)"></p>
      <p class="hero-sub-en" v-html="bi(heroCfg.sub2.zh, heroCfg.sub2.en)"></p>
      <div class="hero-cta">
        <template v-for="(c,ci) in heroCfg.primaryCtas" :key="ci">
          <button v-if="c.kind === 'go'" type="button" :class="c.cls" @click="$emit('go', c.target)">
            {{ c.icon }} <span v-html="bi(c.zh, c.en)"></span>
          </button>
          <a v-else :class="c.cls" :href="c.href" style="text-decoration:none">
            {{ c.icon }} <span v-html="bi(c.zh, c.en)"></span>
          </a>
        </template>
      </div>
      <div class="hero-stats">
        <div class="hero-stat"><b>{{ stats.sections }}</b><span v-html="bi('个小节双语精讲','sections, bilingual')"></span></div>
        <div class="hero-stat"><b>{{ stats.widgets }}</b><span v-html="bi('个交互实验台','interactive labs')"></span></div>
        <div class="hero-stat"><b>{{ stats.lectures }}</b><span v-html="bi('讲全书覆盖','lectures, one visual course')"></span></div>
        <div class="hero-stat"><b>{{ stats.themes }}</b><span v-html="bi('套主题随点随换','themes, one click apart')"></span></div>
      </div>
    </div>`,
    setup() { return { bi }; },
  };

  const LectureIndex = {
    name: 'LectureIndex',
    emits: ['go'],
    computed: {
      lectures() { return window.DATA.otherLectures; },
      firstId() {
        const map = {};
        window.DATA.navGroups.forEach(g => { map[g.lecture] = g.items[0] && g.items[0].id; });
        return map;
      },
    },
    template: `
    <div class="course-map-card">
      <h3 class="sub" style="margin-top:0"><span v-html="bi('课程索引：逐讲进入','Lecture index: enter any lesson')"></span></h3>
      <div class="lx-grid">
        <button v-for="l in lectures" :key="l.no" class="lx-card reveal-item" :class="l.live ? '' : 'pending'"
                @click="$emit('go', firstId[l.no])">
          <span class="lx-no">LESSON {{ l.no }}{{ l.live ? '' : ' · Soon' }}</span>
          <span class="lx-zh">{{ l.zh }}</span>
          <span class="lx-en">{{ l.en }}</span>
          <span class="lx-go" v-if="l.live" v-html="bi('进入本讲 →','Enter →')"></span>
        </button>
      </div>
    </div>`,
    setup() { return { bi }; },
  };

  const CourseMap = {
    name: 'CourseMap',
    emits: ['go'],
    computed: {
      treeRoot() {
        return RLV_CFG.knowledgeTreeRoot || { badge: 'RL', zh: '强化学习的数学根基 · 全书十讲', en: 'Mathematical Foundation of RL · 10 lectures' };
      },
      firstIds() {
        const map = {};
        window.DATA.navGroups.forEach(g => { map[g.lecture] = g.items[0] && g.items[0].id; });
        return map;
      },
      branches() {
        const byNo = {};
        window.DATA.otherLectures.forEach(l => { byNo[l.no] = l; });
        const defs = Array.isArray(RLV_CFG.branches) && RLV_CFG.branches.length ? RLV_CFG.branches : [
          { key: 'I', cls: 'b-model', zh: '全部章节', en: 'All Lectures', nos: window.DATA.otherLectures.map(l => l.no) },
        ];
        return defs.map(d => ({ ...d, leaves: d.nos.map(no => byNo[no]).filter(Boolean) }));
      },
    },
    template: `
    <div class="course-map-card">
      <h3 class="sub" style="margin-top:0"><span v-html="bi('全书知识树 · The Knowledge Tree','The Knowledge Tree · lectures by cluster')"></span></h3>
      <div class="ktree">
        <div class="ktree-root">
          <span class="kt-root-badge">{{ treeRoot.badge }}</span>
          <span class="zh">{{ treeRoot.zh }}</span>
          <span class="en">{{ treeRoot.en }}</span>
        </div>
        <div class="ktree-branches">
          <div class="ktree-branch reveal-item" :class="b.cls" v-for="b in branches" :key="b.key">
            <div class="ktree-branch-head">
              <span class="kt-branch-key">{{ b.key }}</span>
              <span class="kt-branch-zh">{{ b.zh }}</span>
              <span class="kt-branch-en">{{ b.en }}</span>
            </div>
            <div class="ktree-leaves">
              <button class="ktree-leaf reveal-item" v-for="leaf in b.leaves" :key="leaf.no"
                      @click="$emit('go', firstIds[leaf.no])">
                <span class="kt-leaf-no">L{{ leaf.no }}</span>
                <span class="kt-leaf-title">
                  <span class="zh">{{ leaf.zh }}</span>
                  <span class="en">{{ leaf.en }}</span>
                </span>
                <span class="kt-leaf-go">→</span>
              </button>
            </div>
          </div>
        </div>
      </div>
      <div class="map-caption">
        <span v-for="b in branches" :key="'lg-' + b.key"><i class="kt-swatch" :class="b.cls"></i><span v-html="bi(b.zh, b.en)"></span></span>
        <span v-html="bi('· 点击任意一讲进入其首节','· click any lecture to enter')"></span>
        <span v-html="bi(' · 或先看 <a href=&quot;graph3d.html&quot;>3D 知识星图</a>',' · or start from the <a href=&quot;graph3d.html&quot;>3D map</a>')"></span>
      </div>
    </div>`,
    setup() { return { bi }; },
  };

  const HowToUse = {
    name: 'HowToUse',
    emits: ['go'],
    computed: {
      cfgHtu() {
        return RLV_CFG.howToUse || {
          title: { zh: '怎么用这一课', en: 'How to use this lesson' },
          steps: [],
          callout: null,
        };
      },
    },
    template: `
    <div class="course-map-card">
      <h3 class="sub" style="margin-top:0"><span v-html="bi(cfgHtu.title.zh, cfgHtu.title.en)"></span></h3>
      <div class="goal-list">
        <div class="goal-item" v-for="(st,si) in cfgHtu.steps" :key="si">
          <span class="g-ico">{{ st.ico }}</span>
          <span class="g-body">
            <span class="zh" v-html="st.zh"></span>
            <span class="en" v-html="st.en"></span>
          </span>
        </div>
      </div>
      <div v-if="cfgHtu.callout" :class="['callout', cfgHtu.callout.kind || 'warn']" style="margin:16px 0 0">
        <div class="callout-icon">{{ cfgHtu.callout.icon || '⚠️' }}</div>
        <div class="callout-body"><p class="bi duo" v-html="bi(cfgHtu.callout.zh, cfgHtu.callout.en)"></p></div>
      </div>
    </div>`,
    setup() { return { bi }; },
  };

  /* ═════════════ 官方视频索引 OfficialVideos（配置驱动） ═════════════ */
  const vp = RLV_CFG.videoProvider || {};
  const OVL_CN_BASE = vp.cnBase || 'https://www.bilibili.com/video/BV1sd4y167NS/?p=';
  const OVL_EN_BASE = vp.enBase || 'https://www.youtube.com/watch?v=';
  const OVL_EN_TAIL = vp.enTail || '&list=PLEhdbSEZZbDaFWPX4gehhwB9vJZJ1DNm8&index=';
  const OVL_OVERVIEW_CN = vp.overviewCn || (OVL_CN_BASE + '1');
  const OVL_OVERVIEW_EN = vp.overviewEn || (OVL_EN_BASE + 'ZHMWHr9811U' + OVL_EN_TAIL + '1');

  const OfficialVideos = {
    name: 'OfficialVideos',
    props: { source: { type: String, default: '' } },
    computed: {
      // 单一 computed 块：讲名 / 分集区间 / 每集中英链接一次性算好，模板保持哑渲染
      info() {
        const src = String(this.source || '');
        const no = Number(src.slice(1));
        const sets = (window.DATA && window.DATA.videoSets) || {};
        const set = sets[src] || null;
        const lec = ((window.DATA && window.DATA.otherLectures) || [])
          .find((l) => l && l.no === no);
        const eps = ((set && Array.isArray(set.episodes)) ? set.episodes : [])
          .filter((ep) => ep && ep.n && ep.yt)
          .map((ep) => ({
            n: ep.n,
            title: ep.en,
            cn: OVL_CN_BASE + ep.n,
            en: OVL_EN_BASE + ep.yt + OVL_EN_TAIL + ep.n,
          }));
        const first = eps.length ? eps[0] : null;
        return {
          lecZh: lec ? lec.zh : 'L' + no,
          lecEn: lec ? lec.en : 'L' + no,
          ok: !!set,
          min: set ? set.min : 0,
          max: set ? set.max : 0,
          eps,
          cnAll: OVL_CN_BASE + (set ? set.min : 1),
          enAll: first ? first.en : '',
          cnOverview: OVL_OVERVIEW_CN,
          enOverview: OVL_OVERVIEW_EN,
        };
      },
    },
    setup() { return { bi }; },
    template: `
    <div class="lab ovl-card" :data-source="source">
      <div class="lab-head">
        <span class="lab-title"><span v-html="bi(info.lecZh + ' · 官方视频索引', info.lecEn + ' · Official Video Index')"></span></span>
        <span v-if="info.ok" class="ovl-range">P{{ info.min }}–P{{ info.max }}</span>
      </div>
      <p v-if="!info.ok" class="bi duo ovl-empty" v-html="bi(
        '官方视频分集数据尚未就绪（videoSets 缺失），就位后这里会列出本讲对应的全部分集与双语入口。',
        'Official episode data is not ready yet (videoSets missing) — the bilingual per-episode links will appear here once it ships.')"></p>
      <template v-else>
        <p class="bi duo ovl-note" v-html="bi(
          '官方视频课的中文版与英文版共用同一套编号：第 n 集就是第 n 集。下表是本站小节 ↔ 官方分集的对应关系，点链接直达对应一集。',
          'The Chinese and English versions of the official video course share one numbering: episode n is episode n, always. Each row maps this lecture’s sections to their official episodes — click through to jump straight to it.')"></p>
        <ul class="ovl-list">
          <li v-for="ep in info.eps" :key="ep.n" class="ovl-ep">
            <span class="ovl-ep-name">P{{ ep.n }} · {{ ep.title }}</span>
            <span class="ovl-ep-links">
              <a class="ovl-a ovl-a-cn" :href="ep.cn" target="_blank" rel="noopener" v-html="bi('中文版','Chinese')"></a>
              <a class="ovl-a ovl-a-en" :href="ep.en" target="_blank" rel="noopener" v-html="bi('英文版','English')"></a>
            </span>
          </li>
        </ul>
        <div class="ovl-foot">
          <a class="btn ghost sm ovl-all-cn" :href="info.cnAll" target="_blank" rel="noopener">▶ <span v-html="bi('中文版连播','Play all (Chinese)')"></span></a>
          <a class="btn ghost sm ovl-all-en" :href="info.enAll" target="_blank" rel="noopener">▶ <span v-html="bi('英文版连播','Play all (English)')"></span></a>
        </div>
        <div class="ovl-overview">
          <span class="ovl-ov-name" v-html="bi('总览 · 官方第 1 集（全书导览，各讲共用）','Overview · official episode 1 (whole-book tour, shared by all lectures)')"></span>
          <span class="ovl-ov-links">
            <a class="ovl-ov-link" :href="info.cnOverview" target="_blank" rel="noopener" v-html="bi('中文版','Chinese')"></a>
            <a class="ovl-ov-link" :href="info.enOverview" target="_blank" rel="noopener" v-html="bi('英文版','English')"></a>
          </span>
        </div>
      </template>
    </div>`,
  };

  /* ═════════════ 实验台锚点 + 分享按钮（全站通用注入） ═════════════
     app.js 在小节渲染后调用 window.RLV.enhanceLabs(容器)：
     1) 给容器内每个 .lab 赋稳定 id「lab-<sectionId>」，同节多台按文档序后缀 -2/-3…
        —— 文档序是数据的确定函数：各讲数据经 ensureLecture 注入后才渲染，
        Vue 按 blocks 数组顺序同步出 DOM，不存在异步乱序，故命名可复现；
        已有 id / 已注入过的 .lab（data-lab-anchor 标记）一律跳过，幂等。
     2) 每台右上角注入一枚分享按钮：点击把「页面绝对 URL + #lab-锚点」写剪贴板
        （navigator.clipboard 优先，execCommand 降级兜 file://），
        同时 history.replaceState 静默把地址栏 hash 指到该台；
        反馈「已复制 / Copied」用 .zh/.en du-line 双语行，语言模式由 body[data-lang] 接管。
     不碰各实验台组件内部状态，45+ 个组件零改动。 */
  function labAnchorOf(lab, sec) {
    const secId = sec.id.replace(/^sec-/, '');
    const siblings = Array.prototype.slice.call(sec.querySelectorAll('.lab'));
    const idx = siblings.indexOf(lab);            // 0-based，文档序 = 数据块序
    return 'lab-' + secId + (idx > 0 ? '-' + (idx + 1) : '');
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    // 降级：file:// / 旧浏览器 / 剪贴板权限被拒时走隐藏 textarea + execCommand
    return new Promise((resolve, reject) => {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      let okFlag;
      try { okFlag = document.execCommand('copy'); } catch { okFlag = false; }
      document.body.removeChild(ta);
      if (okFlag) resolve(); else reject(new Error('execCommand copy failed'));
    });
  }

  function injectShareButton(lab) {
    if (lab.querySelector(':scope > .lab-share')) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'lab-share';
    btn.setAttribute('aria-label', '复制本实验台链接 / Copy link to this lab');
    btn.setAttribute('title', '复制本实验台链接 / Copy link to this lab');
    btn.innerHTML =
      '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/></svg>'
      + '<span class="lab-share-tip" role="status" aria-live="polite">'
      + bi('已复制', 'Copied') + '</span>';
    btn.addEventListener('click', () => {
      const url = location.href.split('#')[0] + '#' + lab.id;   // file:// 下 origin 为 "null"，用 href 兜底
      try { history.replaceState(null, '', '#' + lab.id); } catch { /* 历史栈不可用就只写剪贴板 */ }
      copyText(url).then(() => {
        btn.classList.add('copied');
        clearTimeout(btn.__labTipTimer);
        btn.__labTipTimer = setTimeout(() => btn.classList.remove('copied'), 1600);
      }).catch((e) => console.error('[lab-share] 剪贴板写入失败', e));
    });
    lab.appendChild(btn);
  }

  function enhanceLabs(scope) {
    const root = scope || document;
    if (!root || !root.querySelectorAll) return;
    const labs = Array.prototype.slice.call(root.querySelectorAll('.lab'));
    if (root.classList && root.classList.contains('lab')) labs.push(root);
    labs.forEach((lab) => {
      if (lab.dataset.labAnchor) return;              // 已注入过：幂等跳过
      const sec = lab.closest('.lesson-section');
      if (!sec || !sec.id) return;                    // 首页等非小节场景不注入
      if (!lab.id) lab.id = labAnchorOf(lab, sec);    // 不覆盖已有 id
      lab.dataset.labAnchor = lab.id;
      injectShareButton(lab);
    });
  }

  /* ═════════════ 注册 ═════════════ */
  // 共享助手：后续 per-lecture 组件文件通过 window.RLV 复用
  window.RLV = { stepOnce, s2rc, rc2s, center, bi, biAny, fmtMath, TYPE_LABEL, hlPy, CELL, PAD, STAR, rng,
    parseBlanks, parseNum, judgeBlank, enhanceLabs };

  window.COMPONENTS = {
    GridBoard,
    'concept-chain': ConceptChain,
    'code-lab': CodeLab,
    'reasoning-lab': ReasoningLab,
    'qa-lab': QaLab,
    'fill-lab': FillLab,
    'derivation-lab': DerivationLab,
    'notebook-bridge': NotebookBridge,
    'home-hero': HomeHero,
    'lecture-index': LectureIndex,
    'course-map': CourseMap,
    'how-to-use': HowToUse,
    'official-videos': OfficialVideos,
  };
})();
