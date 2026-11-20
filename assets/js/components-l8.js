/* ═══════════════════════════════════════════════════════════
   L8 组件：平稳分布验证 / TD(0)-Linear vs 表格评估 / DQN 回放覆盖实验台
   ═══════════════════════════════════════════════════════════ */
(function () {
  const RLV = window.RLV;
  const { bi, stepOnce, s2rc } = RLV;
  const GB = () => window.COMPONENTS.GridBoard;

  // 4×4 作业世界近最优确定性基准动作（用于策略评估与平稳分布演示）
  const GREEDY_4X4 = [2, 2, 2, 3, 2, 2, 3, 3, 1, 1, 2, 5, 1, 2, 2, 1];
  // L8 Slides 18–20 2×2 世界基准动作：s1->下, s2->下, s3->右, s4->停留
  const GREEDY_2X2 = [3, 3, 2, 5];

  function buildPolicyMatrix(size, greedy, eps) {
    const nS = size * size;
    return Array.from({ length: nS }, (_, sIdx) => {
      const best = greedy[sIdx];
      return [1, 2, 3, 4, 5].map(a => (a === best ? 1 - 0.8 * eps : eps / 5));
    });
  }

  function solveMarkovChain(cfg, pi, gamma) {
    const nS = cfg.size * cfg.size;
    const P = Array.from({ length: nS }, () => new Array(nS).fill(0));
    const r = new Array(nS).fill(0);
    for (let s = 1; s <= nS; s++) {
      for (let a = 1; a <= 5; a++) {
        const prob = pi[s - 1][a - 1];
        const rr = stepOnce(s, a, cfg);
        P[s - 1][rr.next - 1] += prob;
        r[s - 1] += prob * rr.reward;
      }
    }
    // 平稳分布 d_π^T = d_π^T P_π（幂迭代）
    let d = new Array(nS).fill(1 / nS);
    for (let k = 0; k < 600; k++) {
      const nd = new Array(nS).fill(0);
      for (let i = 0; i < nS; i++) {
        for (let j = 0; j < nS; j++) nd[j] += d[i] * P[i][j];
      }
      d = nd;
    }
    // 精确策略价值 v_π = r_π + γ P_π v_π
    let v = new Array(nS).fill(0);
    for (let k = 0; k < 400; k++) {
      const nv = new Array(nS);
      for (let i = 0; i < nS; i++) {
        let acc = r[i];
        for (let j = 0; j < nS; j++) acc += gamma * P[i][j] * v[j];
        nv[i] = acc;
      }
      v = nv;
    }
    return { P, r, d, v };
  }

  function solveOptimalV4x4() {
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

  /* ---------- 1. 平稳分布实验台（L8 Slides 18-20） ---------- */
  const StationaryLab = {
    name: 'L8StationaryLab',
    components: { GridBoard: GB() },
    data: () => ({
      world: '2x2', eps: 0.5, seed: 42, rand: null,
      counts: [], steps: 0, cur: 1,
      playing: false, timer: null,
    }),
    computed: {
      cfg() {
        return this.world === '2x2'
          ? { size: 2, forbidden: [2], target: 4, mode: 'book' }
          : { size: 4, forbidden: [8, 10], target: 12, mode: 'book' };
      },
      nS() { return this.cfg.size * this.cfg.size; },
      pi() { return buildPolicyMatrix(this.cfg.size, this.world === '2x2' ? GREEDY_2X2 : GREEDY_4X4, this.eps); },
      exact() { return solveMarkovChain(this.cfg, this.pi, 0.9); },
      freqs() {
        if (!this.steps) return new Array(this.nS).fill(0);
        return this.counts.map(c => c / this.steps);
      },
      tvDist() {
        if (!this.steps) return null;
        let s = 0;
        for (let i = 0; i < this.nS; i++) s += Math.abs(this.freqs[i] - this.exact.d[i]);
        return 0.5 * s;
      },
      barIds() {
        return this.world === '2x2' ? [0, 1, 2, 3] : [0, 7, 9, 10, 11, 15];
      },
      heat() {
        const src = this.steps ? this.freqs : this.exact.d;
        const m = Math.max(...src, 1e-6);
        return src.map(x => Math.min(1, x / m));
      },
    },
    methods: {
      bi,
      stepN(k) {
        const cfg = this.cfg;
        for (let i = 0; i < k; i++) {
          const probs = this.pi[this.cur - 1];
          let x = this.rand(), acc = 0, a = 5;
          for (let j = 0; j < 5; j++) { acc += probs[j]; if (x <= acc) { a = j + 1; break; } }
          const rr = stepOnce(this.cur, a, cfg);
          this.cur = rr.next;
          this.counts[this.cur - 1]++;
          this.steps++;
        }
        this.counts = [...this.counts];
      },
      play() {
        if (this.playing) { this.stop(); return; }
        this.playing = true;
        this.timer = setInterval(() => {
          this.stepN(25);
          if (this.steps >= 5000) this.stop();
        }, 50);
      },
      stop() { this.playing = false; if (this.timer) { clearInterval(this.timer); this.timer = null; } },
      reset() {
        this.stop();
        this.rand = RLV.rng(this.seed);
        this.counts = new Array(this.nS).fill(0);
        this.steps = 0;
        this.cur = 1;
      },
    },
    mounted() { this.reset(); },
    unmounted() { this.stop(); },
    template: `
    <div class="lab">
      <div class="lab-head">
        <span class="lab-title">平稳分布实验台 · d_π^T = d_π^T P_π · Stationary Distribution Explorer</span>
        <div class="seg">
          <button :class="{active: world==='2x2'}" @click="world='2x2'; reset()">2×2 <span v-html="bi('讲义例','Slide Ex.')"></span></button>
          <button :class="{active: world==='4x4'}" @click="world='4x4'; reset()">4×4 <span v-html="bi('作业世界','Assign.')"></span></button>
        </div>
      </div>
      <div class="ctl-row">
        <span class="ctl-label">ε = <strong>{{ eps.toFixed(2) }}</strong></span>
        <input type="range" min="0.05" max="1" step="0.05" v-model.number="eps" @change="reset"
               :aria-label="$root.lang === 'en' ? 'exploration epsilon' : '探索率 ε'"
               :style="{width:'110px', '--fill': ((eps-0.05)/0.95*100)+'%'}">
        <button class="btn primary" @click="play"><span v-html="playing ? bi('⏸ 暂停','⏸ Pause') : bi('▶ 采样游走','▶ Sample walk')"></span></button>
        <button class="btn" @click="stepN(200)">+200 <span v-html="bi('步','steps')"></span></button>
        <button class="btn ghost" @click="reset"><span v-html="bi('↺ 重置','↺ Reset')"></span></button>
      </div>
      <div class="lab-body">
        <div class="lab-stage" style="max-width:290px">
          <grid-board :size="cfg.size" :forbidden="cfg.forbidden" :target="cfg.target" :start="1"
                      :policy="pi" :values="exact.d.map(x => +(x * 100).toFixed(1))" :heat="heat" :agent="cur"/>
        </div>
        <div class="lab-side">
          <div class="tally" style="margin:0 0 10px">
            <span class="t-label" v-html="bi('总步数 T','steps T')"></span>
            <span class="t-num">{{ steps }}</span>
            <span class="t-label" style="margin-left:10px">TV(N/T, d_π)</span>
            <span class="t-num" style="color:var(--green)">{{ tvDist == null ? '—' : tvDist.toFixed(3) }}</span>
          </div>
          <div class="dist" style="margin-bottom:10px">
            <div v-for="idx in barIds" :key="idx" class="dist-row" style="grid-template-columns:42px 1fr 112px">
              <span class="dist-name">s{{ idx+1 }}</span>
              <div class="dist-bar-track" style="position:relative">
                <div class="dist-bar" :style="{width: Math.min(100, freqs[idx]*100)+'%'}"></div>
                <div :title="'exact d_π'" :style="{position:'absolute', top:'-2px', bottom:'-2px', left: Math.min(99, exact.d[idx]*100)+'%', width:'2px', background:'var(--gold)'}"></div>
              </div>
              <span class="dist-val" style="font-size:11px;font-family:var(--mono)">{{ (freqs[idx]*100).toFixed(1) }}% / {{ (exact.d[idx]*100).toFixed(1) }}%</span>
            </div>
          </div>
          <p class="bi duo" style="font-size:12.5px" v-html="bi(
            '格内数值为精确 d_π(%)，右条蓝条 = 实测访问频率，金竖线 = 理论平稳分布。2×2 默认 ε=0.5 时理论恰好是 [3.5%, 10.8%, 13.3%, 72.4%]——游走千步后实测频率紧贴金线。',
            'Grid shows exact d_π(%); blue bar = empirical visit share; gold marker = stationary truth. On 2×2 at ε=0.5, exact d_π = [3.5%, 10.8%, 13.3%, 72.4%]—long-run frequencies converge onto the gold marks.')"></p>
        </div>
      </div>
    </div>`,
  };

  /* ---------- 2. 真实 4×4 马尔可夫链 TD(0)-Linear vs 表格评估 ---------- */
  const FitLab = {
    name: 'L8FitLab',
    components: { GridBoard: GB() },
    data: () => ({
      features: 'poly', order: 2, alpha: 0.12, playing: false, timer: null,
      seed: 42, rand: null,
      w: null, k: 0, cur: 1, rmseTrace: [],
    }),
    computed: {
      cfg() { return { size: 4, forbidden: [8, 10], target: 12, mode: 'book' }; },
      pi() { return buildPolicyMatrix(4, GREEDY_4X4, 0.25); },
      chain() { return solveMarkovChain(this.cfg, this.pi, 0.9); },
      dim() {
        if (this.features === 'onehot') return 16;
        if (this.features === 'poly') return (this.order + 1) * (this.order + 2) / 2;
        return (this.order + 1) * (this.order + 1);
      },
      estValues() {
        return Array.from({ length: 16 }, (_, i) => this.vhat(i + 1));
      },
      weightedRmse() {
        if (!this.w) return null;
        let acc = 0;
        for (let i = 0; i < 16; i++) {
          const err = this.vhat(i + 1) - this.chain.v[i];
          acc += this.chain.d[i] * err * err;
        }
        return Math.sqrt(acc);
      },
      trueCurve() {
        const vals = this.chain.v;
        const maxV = Math.max(...vals.map(Math.abs), 1);
        return vals.map((v, i) => `${16 + i / 15 * 368},${86 - (v / maxV) * 62}`).join(' ');
      },
      estCurve() {
        if (!this.w) return '';
        const vals = this.chain.v;
        const maxV = Math.max(...vals.map(Math.abs), 1);
        return this.estValues.map((v, i) => {
          const clamped = Math.max(-1.2 * maxV, Math.min(1.2 * maxV, v));
          return `${16 + i / 15 * 368},${86 - (clamped / maxV) * 62}`;
        }).join(' ');
      },
      rmseCurve() {
        const arr = this.rmseTrace.slice(-90);
        if (arr.length < 2) return '';
        const m = Math.max(...arr, 0.5);
        return arr.map((e, i) => `${16 + i / (arr.length - 1) * 368},${166 - Math.min(1, e / m) * 54}`).join(' ');
      },
    },
    methods: {
      bi,
      phi(s) {
        if (this.features === 'onehot') {
          const f = new Array(16).fill(0);
          f[s - 1] = 1;
          return f;
        }
        const { r, c } = s2rc(s, 4);
        if (this.features === 'poly') {
          const y = (r - 1.5) / 1.5;
          const x = (c - 1.5) / 1.5;
          const f = [];
          for (let deg = 0; deg <= this.order; deg++) {
            for (let i = 0; i <= deg; i++) {
              f.push(Math.pow(x, i) * Math.pow(y, deg - i));
            }
          }
          return f;
        }
        const yn = r / 3;
        const xn = c / 3;
        const f = [];
        for (let i = 0; i <= this.order; i++) {
          for (let j = 0; j <= this.order; j++) {
            f.push(Math.cos(Math.PI * (i * xn + j * yn)));
          }
        }
        return f;
      },
      vhat(s) {
        const p = this.phi(s);
        if (!this.w || this.w.length !== p.length) return 0;
        let acc = 0;
        for (let i = 0; i < p.length; i++) acc += p[i] * this.w[i];
        return Number.isFinite(acc) ? acc : 0;
      },
      sweep(n = 1) {
        const gamma = 0.9;
        for (let t = 0; t < n; t++) {
          const probs = this.pi[this.cur - 1];
          let x = this.rand(), acc = 0, a = 5;
          for (let j = 0; j < 5; j++) { acc += probs[j]; if (x <= acc) { a = j + 1; break; } }
          const rr = stepOnce(this.cur, a, this.cfg);
          const s2 = rr.next;
          const p1 = this.phi(this.cur);
          const p2 = this.phi(s2);
          let v1 = 0, v2 = 0, norm2 = 1e-8;
          for (let i = 0; i < this.dim; i++) {
            v1 += p1[i] * this.w[i];
            v2 += p2[i] * this.w[i];
            norm2 += p1[i] * p1[i];
          }
          // TD(0)-Linear 半梯度更新（Eq. 8.13）：target = r + γ v̂(s',w)，仅对前项求导
          const tdErr = rr.reward + gamma * v2 - v1;
          for (let i = 0; i < this.dim; i++) {
            this.w[i] += this.alpha * tdErr * p1[i] / norm2;
            if (!Number.isFinite(this.w[i])) this.w[i] = 0;
          }
          this.cur = s2;
          this.k++;
          if (this.k % 25 === 0) {
            const err = this.weightedRmse;
            if (err != null) {
              this.rmseTrace.push(err);
              if (this.rmseTrace.length > 240) this.rmseTrace.shift();
            }
          }
        }
        this.w = [...this.w];
      },
      play() {
        if (this.playing) { this.stop(); return; }
        this.playing = true;
        this.timer = setInterval(() => {
          this.sweep(40);
          if (this.k >= 6000) this.stop();
        }, 45);
      },
      stop() { this.playing = false; if (this.timer) { clearInterval(this.timer); this.timer = null; } },
      reset() {
        this.stop();
        this.rand = RLV.rng(this.seed);
        this.w = new Array(this.dim).fill(0);
        this.k = 0;
        this.cur = 1;
        this.rmseTrace = [];
      },
    },
    mounted() { this.reset(); },
    unmounted() { this.stop(); },
    template: `
    <div class="lab">
      <div class="lab-head">
        <span class="lab-title">TD(0)-Linear 半梯度评估（4×4 马尔可夫链）· Semi-gradient TD(0)-Linear</span>
        <div class="seg">
          <button :class="{active: features==='poly'}" @click="features='poly'; reset()"><span v-html="bi('多项式','Poly')"></span></button>
          <button :class="{active: features==='fourier'}" @click="features='fourier'; reset()">Fourier</button>
          <button :class="{active: features==='onehot'}" @click="features='onehot'; reset()"><span v-html="bi('One-Hot (表格)','One-Hot (Table)')"></span></button>
        </div>
      </div>
      <div class="ctl-row">
        <span v-if="features !== 'onehot'" class="ctl-label">order = <strong>{{ order }}</strong></span>
        <input v-if="features !== 'onehot'" type="range" min="1" max="3" step="1" v-model.number="order" @change="reset"
               :aria-label="$root.lang === 'en' ? 'feature order' : '特征阶数 order'"
               :style="{width:'90px', '--fill': ((order-1)/2*100)+'%'}">
        <span class="ctl-label">α = <strong>{{ alpha.toFixed(2) }}</strong></span>
        <input type="range" min="0.02" max="0.4" step="0.02" v-model.number="alpha"
               :aria-label="$root.lang === 'en' ? 'step size alpha' : '步长 α'"
               :style="{width:'95px', '--fill': ((alpha-0.02)/0.38*100)+'%'}">
        <button class="btn primary" @click="play"><span v-html="playing ? bi('⏸ 暂停','⏸ Pause') : bi('▶ TD/SGD 学习','▶ TD/SGD learn')"></span></button>
        <button class="btn" @click="sweep(200)">+200</button>
        <button class="btn ghost" @click="reset"><span v-html="bi('↺ 重置','↺ Reset')"></span></button>
      </div>
      <div class="lab-body">
        <div class="lab-stage" style="flex:1 1 390px">
          <svg viewBox="0 0 400 176" style="width:100%;display:block;background:var(--chart-bg);border:1px solid var(--line);border-radius:12px">
            <text x="16" y="15" style="font:700 9.5px var(--mono)" fill="var(--chart-ink)">s1..s16: v_π (gold) vs v̂(s,w) (blue)</text>
            <line x1="16" y1="86" x2="384" y2="86" stroke="var(--chart-grid)" stroke-width="1"/>
            <polyline :points="trueCurve" fill="none" stroke="var(--gold)" stroke-width="2" stroke-dasharray="6 4"/>
            <polyline v-if="w" :points="estCurve" fill="none" stroke="var(--accent)" stroke-width="2.4"/>
            <line x1="10" y1="98" x2="390" y2="98" stroke="var(--line)" stroke-dasharray="3 3" stroke-width="1"/>
            <text x="16" y="111" style="font:700 9.5px var(--mono)" fill="var(--chart-ink)">d_π-weighted RMSE over TD steps</text>
            <line x1="16" y1="166" x2="384" y2="166" stroke="var(--chart-grid)" stroke-width="1"/>
            <polyline v-if="rmseCurve" :points="rmseCurve" fill="none" stroke="var(--green)" stroke-width="1.8"/>
          </svg>
        </div>
        <div class="lab-side">
          <div style="max-width:210px;margin:0 0 10px">
            <grid-board :size="4" :forbidden="cfg.forbidden" :target="cfg.target" :start="1"
                        :policy="pi" :values="estValues.map(x=>+x.toFixed(1))" :agent="cur"/>
          </div>
          <div class="tally" style="margin:0 0 8px">
            <span class="t-label" v-html="bi('步数', 'TD steps')"></span>
            <span class="t-num">{{ k }}</span>
            <span class="t-label" style="margin-left:8px" v-html="bi('维度', 'dim')"></span>
            <span class="t-num">{{ dim }}</span>
            <span class="t-label" style="margin-left:8px">d_π-RMSE</span>
            <span class="t-num" style="color:var(--green)">{{ weightedRmse == null ? '—' : weightedRmse.toFixed(2) }}</span>
          </div>
          <p class="bi duo" style="font-size:12.5px" v-html="bi(
            '金虚线 = 策略 π 的精确价值 v_π；蓝实线 = 实时半梯度更新 r+γφ(s′)ᵀw − φ(s)ᵀw 的拟合。切至 One-Hot 即等价表格 TD(0)（16 维零偏差）；切 Poly/Fourier（dim=3..16）可见低维特征停在投影不动点 J_{PBE}(w*)=0。',
            'Gold dashed = exact v_π; blue solid = semi-gradient TD(0)-Linear over real chain transitions. Switching to One-Hot yields exact tabular TD(0); lower-order Poly/Fourier settles cleanly at the projected Bellman fixed point J_{PBE}=0.')"></p>
        </div>
      </div>
    </div>`,
  };

  /* ---------- 3. DQN 经验回放（100 vs 1000 步）与目标网络（L8 Slides 53-58） ---------- */
  const DqnReplayLab = {
    name: 'L8DqnReplayLab',
    data: () => ({
      bufferCap: 100, syncC: 15, batchSize: 32, lr: 0.75,
      seed: 42, rand: null,
      buffer: [], w: null, wTarget: null, vStar: null,
      iters: 0, lossTrace: [], rmseTrace: [],
      playing: false, timer: null,
    }),
    computed: {
      featDim() { return 80; }, // 5 actions × 16 邻域平滑 RBF 特征（局部泛化而非查表）
      coveragePct() {
        const seen = new Set(this.buffer.map(e => e.s));
        return Math.round((seen.size / 16) * 100);
      },
      latestLoss() { return this.lossTrace.length ? this.lossTrace[this.lossTrace.length - 1] : null; },
      latestRmse() { return this.rmseTrace.length ? this.rmseTrace[this.rmseTrace.length - 1] : null; },
      lossCurve() {
        const arr = this.lossTrace.slice(-120);
        if (arr.length < 2) return '';
        const m = Math.max(...arr, 0.25);
        return arr.map((v, i) => `${14 + i / (arr.length - 1) * 352},${122 - Math.min(1, v / m) * 100}`).join(' ');
      },
      rmseCurve() {
        const arr = this.rmseTrace.slice(-120);
        if (arr.length < 2) return '';
        const m = Math.max(...arr, 1);
        return arr.map((v, i) => `${14 + i / (arr.length - 1) * 352},${122 - Math.min(1, v / m) * 100}`).join(' ');
      },
    },
    methods: {
      bi,
      stateFeat(s) {
        const { r, c } = s2rc(s, 4);
        const v = new Array(16);
        for (let i = 0; i < 16; i++) {
          const p = s2rc(i + 1, 4);
          const d2 = (p.r - r) * (p.r - r) + (p.c - c) * (p.c - c);
          v[i] = i + 1 === s ? 0.85 : 0.15 * Math.exp(-d2 / 1.2);
        }
        return v;
      },
      qVal(wVec, s, a) {
        const sf = this.stateFeat(s);
        const off = (a - 1) * 16;
        let acc = 0;
        for (let i = 0; i < 16; i++) acc += wVec[off + i] * sf[i];
        return acc;
      },
      buildBuffer() {
        const cfg = { size: 4, forbidden: [8, 10], target: 12, mode: 'book' };
        const buf = [];
        let s = 1;
        for (let t = 0; t < this.bufferCap; t++) {
          // 100 步稀疏轨迹仅沿一条探索路径前进；1000 步全随机探索覆盖全网格
          const a = this.bufferCap < 500
            ? (this.rand() < 0.15 ? 1 + Math.floor(this.rand() * 5) : GREEDY_4X4[s - 1])
            : (1 + Math.floor(this.rand() * 5));
          const rr = stepOnce(s, a, cfg);
          buf.push({ s, a, r: rr.reward, s2: rr.next });
          s = rr.next;
          if (this.bufferCap >= 500 && t % 25 === 0) s = 1 + Math.floor(this.rand() * 16);
        }
        this.buffer = buf;
      },
      computeFullRmse() {
        if (!this.w || !this.vStar) return 0;
        let sq = 0;
        for (let s = 1; s <= 16; s++) {
          let mq = -Infinity;
          for (let a = 1; a <= 5; a++) mq = Math.max(mq, this.qVal(this.w, s, a));
          const d = mq - this.vStar[s - 1];
          sq += d * d;
        }
        return Math.sqrt(sq / 16);
      },
      stepBatch(n = 1) {
        const gamma = 0.9;
        for (let rep = 0; rep < n; rep++) {
          let batchLoss = 0;
          const grad = new Array(this.featDim).fill(0);
          for (let b = 0; b < this.batchSize; b++) {
            const tr = this.buffer[Math.floor(this.rand() * this.buffer.length)];
            let maxNext = -Infinity;
            for (let a2 = 1; a2 <= 5; a2++) {
              maxNext = Math.max(maxNext, this.qVal(this.wTarget, tr.s2, a2));
            }
            const y = tr.r + gamma * maxNext;
            const qNow = this.qVal(this.w, tr.s, tr.a);
            const err = qNow - y;
            batchLoss += err * err;
            const sf = this.stateFeat(tr.s);
            const off = (tr.a - 1) * 16;
            let n2 = 1e-8;
            for (let i = 0; i < 16; i++) n2 += sf[i] * sf[i];
            for (let i = 0; i < 16; i++) grad[off + i] += err * sf[i] / n2;
          }
          for (let j = 0; j < this.featDim; j++) {
            this.w[j] -= (this.lr / this.batchSize) * grad[j];
            if (!Number.isFinite(this.w[j])) this.w[j] = 0;
          }
          this.iters++;
          if (this.iters % this.syncC === 0) this.wTarget = [...this.w];
          if (rep === n - 1 || this.iters % 5 === 0) {
            this.lossTrace.push(batchLoss / this.batchSize);
            this.rmseTrace.push(this.computeFullRmse());
            if (this.lossTrace.length > 360) this.lossTrace.shift();
            if (this.rmseTrace.length > 360) this.rmseTrace.shift();
          }
        }
        this.w = [...this.w];
      },
      play() {
        if (this.playing) { this.stop(); return; }
        this.playing = true;
        this.timer = setInterval(() => {
          this.stepBatch(15);
          if (this.iters >= 2400) this.stop();
        }, 45);
      },
      stop() { this.playing = false; if (this.timer) { clearInterval(this.timer); this.timer = null; } },
      reset() {
        this.stop();
        this.rand = RLV.rng(this.seed);
        this.buildBuffer();
        this.w = new Array(this.featDim).fill(0);
        this.wTarget = new Array(this.featDim).fill(0);
        this.iters = 0; this.lossTrace = []; this.rmseTrace = [];
      },
    },
    mounted() { this.vStar = solveOptimalV4x4(); this.reset(); },
    unmounted() { this.stop(); },
    template: `
    <div class="lab">
      <div class="lab-head">
        <span class="lab-title">DQN 经验回放与目标网络实验台 · 100 vs 1000 步陷阱 · Replay & Target Lab</span>
        <div class="seg">
          <button :class="{active: bufferCap===100}" @click="bufferCap=100; reset()">100 <span v-html="bi('步稀疏','steps sparse')"></span></button>
          <button :class="{active: bufferCap===1000}" @click="bufferCap=1000; reset()">1000 <span v-html="bi('步全覆盖','steps full')"></span></button>
        </div>
        <div class="seg">
          <button :class="{active: syncC===1}" @click="syncC=1; reset()">C=1 <span v-html="bi('(移动靶)','(moving)')"></span></button>
          <button :class="{active: syncC===15}" @click="syncC=15; reset()">C=15 <span v-html="bi('(冻结靶)','(frozen)')"></span></button>
        </div>
      </div>
      <div class="ctl-row">
        <button class="btn primary" @click="play"><span v-html="playing ? bi('⏸ 暂停','⏸ Pause') : bi('▶ 回放训练','▶ Train replay')"></span></button>
        <button class="btn" @click="stepBatch(100)">+100 <span v-html="bi('批','batches')"></span></button>
        <button class="btn ghost" @click="reset"><span v-html="bi('↺ 重置','↺ Reset')"></span></button>
      </div>
      <div class="lab-body">
        <div class="lab-stage" style="flex:1 1 390px">
          <svg viewBox="0 0 380 136" style="width:100%;display:block;background:var(--chart-bg);border:1px solid var(--line);border-radius:12px">
            <text x="14" y="16" style="font:700 9.5px var(--mono)" fill="var(--cyan)">Batch TD Loss (pool)</text>
            <text x="200" y="16" style="font:700 9.5px var(--mono)" fill="var(--gold)">True Full-Grid v* RMSE</text>
            <line x1="14" y1="122" x2="366" y2="122" stroke="var(--chart-grid)" stroke-width="1"/>
            <polyline v-if="lossCurve" :points="lossCurve" fill="none" stroke="var(--cyan)" stroke-width="2"/>
            <polyline v-if="rmseCurve" :points="rmseCurve" fill="none" stroke="var(--gold)" stroke-width="2.2"/>
          </svg>
        </div>
        <div class="lab-side">
          <div class="tally" style="margin:0 0 10px">
            <span class="t-label" v-html="bi('覆盖状态','coverage')"></span>
            <span class="t-num">{{ coveragePct }}%</span>
            <span class="t-label" style="margin-left:8px">TD Loss</span>
            <span class="t-num" style="color:var(--cyan)">{{ latestLoss == null ? '—' : latestLoss.toFixed(3) }}</span>
            <span class="t-label" style="margin-left:8px">v* RMSE</span>
            <span class="t-num" style="color:var(--gold)">{{ latestRmse == null ? '—' : latestRmse.toFixed(2) }}</span>
          </div>
          <p class="bi duo" style="font-size:12.5px" v-html="bi(
            '先跑「100 步稀疏」：你会亲眼看见青线（回放池内部 TD Loss）迅速跌近 0，但金线（全图真实价值 RMSE）依旧高悬——因为未访问状态被严重误判；切回「1000 步全覆盖 + C=15 冻结靶」，两根线才一起扎实下降。',
            'First run “100 steps sparse”: cyan Batch TD Loss rapidly drops near 0 while gold Full-Grid v* RMSE stalls high—unvisited states remain mis-estimated. Switch to “1000 steps full + C=15 frozen target” to watch both curves converge cleanly.')"></p>
        </div>
      </div>
    </div>`,
  };

  window.COMPONENTS['l8-stationary-lab'] = StationaryLab;
  window.COMPONENTS['l8-fit-lab'] = FitLab;
  window.COMPONENTS['l8-dqn-replay-lab'] = DqnReplayLab;
})();
