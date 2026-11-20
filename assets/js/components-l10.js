/* ═══════════════════════════════════════════════════════════
   L10 组件：重要性采样直觉 / A2C (纯 On-Policy 与 Off-Policy IS 模式)
   ═══════════════════════════════════════════════════════════ */
(function () {
  const RLV = window.RLV;
  const { bi, stepOnce } = RLV;
  const GB = () => window.COMPONENTS.GridBoard;

  function computeOptimalV4x4() {
    const cfg = { size: 4, forbidden: [8, 10], target: 12, mode: 'book' };
    let v = new Array(16).fill(0);
    for (let k = 0; k < 200; k++) {
      const nv = new Array(16);
      for (let s = 1; s <= 16; s++) {
        let best = -Infinity;
        for (let a = 1; a <= 5; a++) {
          const rr = stepOnce(s, a, cfg);
          best = Math.max(best, rr.reward + 0.9 * v[rr.next - 1]);
        }
        nv[s - 1] = best;
      }
      v = nv;
    }
    return v;
  }

  /* ---------- L10 Slides 26–36 重要性采样二值基准实验台 ---------- */
  const ISLab = {
    name: 'L10ISLab',
    data: () => ({
      p1: 0.80, seed: 42, rand: null,
      n: 0, sumPlain: 0, sumIS: 0,
      plainTrace: [], isTrace: [],
    }),
    computed: {
      p0() { return 0.50; },
      trueMeanP0() { return 0.0; },
      trueMeanP1() { return 2 * this.p1 - 1; },
      rhoPos() { return this.p0 / this.p1; },
      rhoNeg() { return (1 - this.p0) / (1 - this.p1); },
      curPlain() { return this.n ? this.sumPlain / this.n : null; },
      curIS() { return this.n ? this.sumIS / this.n : null; },
      plainPath() { return this.toPath(this.plainTrace); },
      isPath() { return this.toPath(this.isTrace); },
    },
    methods: {
      bi,
      toPath(arr) {
        if (arr.length < 2) return '';
        return arr.map((v, i) => {
          const x = 14 + i / (arr.length - 1) * 352;
          const clamped = Math.max(-1.6, Math.min(1.6, v));
          const y = 66 - (clamped / 1.6) * 52;
          return `${x},${y}`;
        }).join(' ');
      },
      sample(k = 50) {
        for (let i = 0; i < k; i++) {
          const x = this.rand() < this.p1 ? 1 : -1;
          const rho = x === 1 ? this.rhoPos : this.rhoNeg;
          this.n++;
          this.sumPlain += x;
          this.sumIS += rho * x;
          this.plainTrace.push(this.sumPlain / this.n);
          this.isTrace.push(this.sumIS / this.n);
          if (this.plainTrace.length > 350) this.plainTrace.shift();
          if (this.isTrace.length > 350) this.isTrace.shift();
        }
      },
      reset() {
        this.rand = RLV.rng(this.seed);
        this.n = 0; this.sumPlain = 0; this.sumIS = 0;
        this.plainTrace = []; this.isTrace = [];
      },
    },
    mounted() { this.reset(); this.sample(150); },
    template: `
    <div class="lab">
      <div class="lab-head">
        <span class="lab-title">重要性采样收敛实验台 · X ∈ {+1,−1}, p₀(+1)=0.5 · Importance Sampling Lab</span>
      </div>
      <div class="ctl-row">
        <span class="ctl-label">p₁(+1) = <strong>{{ p1.toFixed(2) }}</strong></span>
        <input type="range" min="0.1" max="0.96" step="0.02" v-model.number="p1" @change="reset(); sample(150)"
               :aria-label="$root.lang === 'en' ? 'behavior probability p1(+1)' : '行为分布 p1(+1)'"
               :style="{width:'130px', '--fill': ((p1-0.1)/0.86*100)+'%'}">
        <button class="btn primary" @click="sample(100)">+100 <span v-html="bi('抽样','draws')"></span></button>
        <button class="btn ghost" @click="reset(); sample(150)"><span v-html="bi('↺ 重置','↺ Reset')"></span></button>
      </div>
      <div class="lab-body">
        <div class="lab-stage" style="flex:1 1 390px">
          <svg viewBox="0 0 380 132" style="width:100%;display:block;background:var(--chart-bg);border:1px solid var(--line);border-radius:12px">
            <line x1="14" y1="66" x2="366" y2="66" stroke="var(--green)" stroke-width="1.2" stroke-dasharray="5 4"/>
            <line x1="14" :y1="66 - (trueMeanP1/1.6)*52" x2="366" :y2="66 - (trueMeanP1/1.6)*52" stroke="var(--red)" stroke-width="1.1" stroke-dasharray="3 4"/>
            <text x="16" y="15" style="font:700 9.5px var(--mono)" fill="var(--accent)">IS weighted f̄_n → 0.00</text>
            <text x="220" y="15" style="font:700 9.5px var(--mono)" fill="var(--red)">Plain x̄_n → {{ trueMeanP1.toFixed(2) }}</text>
            <polyline v-if="plainPath" :points="plainPath" fill="none" stroke="var(--red)" stroke-width="1.8" opacity=".82"/>
            <polyline v-if="isPath" :points="isPath" fill="none" stroke="var(--accent)" stroke-width="2.2"/>
          </svg>
        </div>
        <div class="lab-side">
          <div class="tally" style="margin:0 0 8px">
            <span class="t-label">n</span>
            <span class="t-num">{{ n }}</span>
            <span class="t-label" style="margin-left:8px">x̄_n</span>
            <span class="t-num" style="color:var(--red)">{{ curPlain == null ? '—' : curPlain.toFixed(3) }}</span>
            <span class="t-label" style="margin-left:8px">f̄_n (IS)</span>
            <span class="t-num" style="color:var(--green)">{{ curIS == null ? '—' : curIS.toFixed(3) }}</span>
          </div>
          <p class="bi duo" style="font-size:12.5px" v-html="bi(
            '当前比值权重 ρ(+1)=' + rhoPos.toFixed(2) + '、ρ(−1)=' + rhoNeg.toFixed(2) + '。p₁(+1)=0.8 时红线死死卡在 +0.60，而蓝线经 ρ 修正后稳稳落回真均值 0.00；试着把 p₁ 拉到 0.94 体会罕见 −1 样本带来的大幅方差跳变。',
            'Weights ρ(+1)=' + rhoPos.toFixed(2) + ', ρ(−1)=' + rhoNeg.toFixed(2) + '. At p₁(+1)=0.8 the plain mean sticks at +0.60, whereas IS converges cleanly to 0.00. Drag p₁ near 0.94 to witness rare −1 draws spiking the IS estimate variance.')"></p>
        </div>
      </div>
    </div>`,
  };

  /* ---------- A2C 现场训练（严格 On-Policy 默认 + Off-Policy IS 对比） ---------- */
  const A2CLab = {
    name: 'L10A2CLab',
    components: { GridBoard: GB() },
    data: () => ({
      mode: 'on', alphaW: 0.1, alphaTheta: 0.05,
      seed: 42,                   // 随机种子固定：Reset 重训两轮轨迹逐点一致
      rand: null,                 // reset() 时以 seed 重建（RLV.rng）
      theta: null, w: null, visits: null, cur: 1,
      episodes: 0, steps: 0, deltaTrace: [], vStar: null,
      playing: false, timer: null,
    }),
    computed: {
      cfg() { return { size: 4, forbidden: [8, 10], target: 12, mode: 'book' }; },
      probs() {
        if (!this.theta) return null;
        return this.theta.map(row => {
          const m = Math.max(...row);
          const e = row.map(x => Math.exp(x - m));
          const s = e.reduce((a, b) => a + b, 0);
          return e.map(x => x / s);
        });
      },
      policy() { return this.probs || Array.from({ length: 16 }, () => [.2,.2,.2,.2,.2]); },
      heat() {
        if (!this.visits) return null;
        const m = Math.max(...this.visits, 1);
        return this.visits.map(x => Math.min(1, Math.pow(x / m, 0.6)));
      },
      deltaPath() {
        const arr = this.deltaTrace.slice(-120);
        if (arr.length < 2) return '';
        const m = Math.max(...arr.map(Math.abs), 0.5);
        return arr.map((d, i) => `${8 + i / (arr.length - 1) * 264},${32 - d / m * 24}`).join(' ');
      },
      rmseV() {
        if (!this.w || !this.vStar) return null;
        let sq = 0;
        for (let i = 0; i < 16; i++) sq += Math.pow(this.w[i] - this.vStar[i], 2);
        return Math.sqrt(sq / 16);
      },
    },
    methods: {
      bi,
      sampleWithMode(s) {
        const piRow = this.probs[s - 1];
        const eps = 0.25;
        const betaRow = this.mode === 'off'
          ? piRow.map(p => (1 - eps) * p + eps / 5)
          : piRow;
        let x = this.rand(), acc = 0, a = 5;
        for (let i = 0; i < 5; i++) { acc += betaRow[i]; if (x <= acc) { a = i + 1; break; } }
        const rho = this.mode === 'off' ? (piRow[a - 1] / (betaRow[a - 1] || 1e-8)) : 1.0;
        return { a, rho, piRow };
      },
      episode() {
        let s = 1 + (this.episodes % 16);
        // 持续任务固定 T=60 步 + 轮转起点保障全图批评家覆盖，target 按持续正常状态 v(s2) 自举（与 truthV 一致）
        for (let t = 0; t < 60; t++) {
          const { a, rho, piRow } = this.sampleWithMode(s);
          const rr = stepOnce(s, a, this.cfg);
          const s2 = rr.next;
          const v2 = this.w[s2 - 1];
          const delta = rr.reward + 0.9 * v2 - this.w[s - 1];
          this.deltaTrace.push(delta);
          // critic (带重要性权重 ρ，on-policy 时 ρ ≡ 1)
          this.w[s - 1] += this.alphaW * rho * delta;
          // actor (同用 ρ_t · δ_t · ∇lnπ)
          for (let i = 0; i < 5; i++) {
            const grad = (i === a - 1 ? 1 : 0) - piRow[i];
            this.theta[s - 1][i] += this.alphaTheta * rho * delta * grad;
          }
          this.visits[s - 1]++;
          this.steps++;
          s = s2; this.cur = s2;
        }
        this.episodes++;
        if (this.deltaTrace.length > 400) this.deltaTrace = this.deltaTrace.slice(-400);
        this.theta = this.theta.map(r => [...r]);
        this.w = [...this.w];
      },
      play() {
        if (this.playing) { this.stop(); return; }
        this.playing = true;
        this.timer = setInterval(() => {
          for (let i = 0; i < 3; i++) this.episode();
          if (this.episodes >= 1000) this.stop();
        }, 60);
      },
      stop() { this.playing = false; if (this.timer) { clearInterval(this.timer); this.timer = null; } },
      reset() {
        this.stop();
        this.rand = RLV.rng(this.seed);
        this.theta = Array.from({ length: 16 }, () => [0,0,0,0,0]);
        this.w = new Array(16).fill(0);
        this.visits = new Array(16).fill(0);
        this.episodes = 0; this.steps = 0; this.cur = 1; this.deltaTrace = [];
      },
    },
    mounted() { this.vStar = computeOptimalV4x4(); this.reset(); },
    unmounted() { this.stop(); },
    template: `
    <div class="lab">
      <div class="lab-head">
        <span class="lab-title">A2C 现场训练 · 演员(箭头) + 评论家(持续目标自举) · A2C live: On-Policy & Off-Policy IS</span>
        <div class="seg">
          <button :class="{active: mode==='on'}" @click="mode='on'; reset()">On-policy π_θ</button>
          <button :class="{active: mode==='off'}" @click="mode='off'; reset()">Off-policy β + IS ρ_t</button>
        </div>
      </div>
      <div class="ctl-row">
        <span class="ctl-label">α<sub>w</sub> = <strong>{{ alphaW.toFixed(2) }}</strong></span>
        <input type="range" min="0.02" max="0.5" step="0.02" v-model.number="alphaW"
               :aria-label="$root.lang === 'en' ? 'critic step size' : '评论家步长 αw'"
               :style="{width:'100px', '--fill': ((alphaW-0.02)/0.48*100)+'%'}">
        <span class="ctl-label">α<sub>θ</sub> = <strong>{{ alphaTheta.toFixed(2) }}</strong></span>
        <input type="range" min="0.01" max="0.2" step="0.01" v-model.number="alphaTheta"
               :aria-label="$root.lang === 'en' ? 'actor step size' : '演员步长 αθ'"
               :style="{width:'100px', '--fill': ((alphaTheta-0.01)/0.19*100)+'%'}">
        <button class="btn primary" @click="play"><span v-html="playing ? bi('⏸ 暂停','⏸ Pause') : bi('▶ 训练','▶ Train')"></span></button>
        <button class="btn ghost" @click="reset"><span v-html="bi('↺ 重置','↺ Reset')"></span></button>
      </div>
      <div class="lab-body">
        <div class="lab-stage" style="max-width:380px">
          <grid-board :size="4" :forbidden="cfg.forbidden" :target="cfg.target" :start="1"
                      :policy="policy" :values="(w||[]).map(x=>+x.toFixed(1))" :heat="heat" :agent="cur"/>
        </div>
        <div class="lab-side">
          <div class="tally" style="margin:0 0 12px">
            <span class="t-label" v-html="bi('回合', 'episodes')"></span>
            <span class="t-num">{{ episodes }}</span>
            <span class="t-label" style="margin-left:10px" v-html="bi('步数', 'steps')"></span>
            <span class="t-num">{{ steps }}</span>
            <span class="t-label" style="margin-left:10px" v-html="bi('价值 RMSE', 'v* RMSE')"></span>
            <span class="t-num" style="color:var(--green)">{{ rmseV == null ? '—' : rmseV.toFixed(2) }}</span>
          </div>
          <svg viewBox="0 0 280 64" style="width:100%;max-width:280px;display:block;background:var(--chart-bg);border:1px solid var(--line);border-radius:10px;margin-bottom:10px">
            <text x="272" y="14" text-anchor="end" style="font:700 9px var(--mono)" fill="var(--chart-ink)">δ TD error</text>
            <line x1="8" y1="32" x2="272" y2="32" stroke="var(--chart-grid)" stroke-width="1"/>
            <polyline v-if="deltaPath" :points="deltaPath" fill="none" stroke="var(--violet)" stroke-width="1.5"/>
          </svg>
          <p class="bi duo" style="font-size:13px" v-html="bi(
            '默认模式严格按当前 softmax 策略 π_θ 纯 on-policy 采样并把目标格视作持续正常状态（v_2 = w(s′) 严格自举，RMSE 趋近于 0）；切换到 Off-policy β + IS 后，由 ε=0.25 混合行为策略采样并乘以重要性比值 ρ_t = π/β 无偏纠偏。',
            'Default mode samples strictly on-policy from π_θ with continuing target bootstrapping (v_2 = w(s′), RMSE vs true v* converging cleanly); toggle Off-policy β + IS to sample from an ε=0.25 mixture weighted by ρ_t = π/β.')"></p>
        </div>
      </div>
    </div>`,
  };

  window.COMPONENTS['l10-is-lab'] = ISLab;
  window.COMPONENTS['l10-ac-lab'] = A2CLab;
})();
