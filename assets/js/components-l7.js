/* ═══════════════════════════════════════════════════════════
   L7 组件：TD 目标对照表 / n-step Sarsa 频谱实验台 / Q-learning & Sarsa 现场训练
   ═══════════════════════════════════════════════════════════ */
(function () {
  const RLV = window.RLV;
  const { stepOnce, bi } = RLV;
  const GB = () => window.COMPONENTS.GridBoard;
  const MAX_EPISODES = 1000;   // doneMark 与 play 自动停止共用同一上限

  function computeOptimalV4x4() {
    const cfg = { size: 4, forbidden: [8, 10], target: 12, mode: 'book' };
    const gamma = 0.9;
    let v = new Array(16).fill(0);
    for (let it = 0; it < 200; it++) {
      let diff = 0;
      const nv = new Array(16);
      for (let s = 1; s <= 16; s++) {
        let best = -Infinity;
        for (let a = 1; a <= 5; a++) {
          const rr = stepOnce(s, a, cfg);
          const q = rr.reward + gamma * v[rr.next - 1];
          if (q > best) best = q;
        }
        nv[s - 1] = best;
        diff = Math.max(diff, Math.abs(best - v[s - 1]));
      }
      v = nv;
      if (diff < 1e-7) break;
    }
    return v;
  }

  /* ---------- TD 目标对照表 ---------- */
  const TargetTable = {
    name: 'L7TargetTable',
    data: () => ({ rows: [
      { name: 'MC', zh: '真实整条回报（α = 1）', en: 'full return (α = 1)', tgt: 'r₁ + γr₂ + γ²r₃ + … (n=∞)', bias: '无偏 / 0', var_: '最大', algo: 'MC Basic' },
      { name: 'n-step', zh: 'n 步真实奖励 + 自举一次', en: 'n rewards + 1 bootstrap', tgt: 'r₁ + γr₂ + … + γⁿq(sₙ,aₙ)', bias: '中', var_: '中', algo: 'n-step Sarsa' },
      { name: 'Sarsa', zh: '一步真实奖励 + 自举 q', en: '1 reward + bootstrap q', tgt: 'r₁ + γq(s₁,a₁)', bias: '有偏', var_: '小', algo: 'Sarsa (on-policy)' },
      { name: 'Q', zh: '一步奖励 + max 自举', en: '1 reward + max bootstrap', tgt: 'r₁ + γmax_a q(s₁,a)', bias: '有偏', var_: '小', algo: 'Q-learning (off-policy)' },
    ]}),
    template: `
    <div class="lab">
      <div class="lab-head"><span class="lab-title">TD 目标决定一切 · The TD target decides everything</span></div>
      <div class="data-table-wrap" tabindex="0" role="region" :aria-label="$root.lang === 'en' ? 'TD target comparison table' : 'TD 目标对照表'">
        <table class="data-table">
          <thead><tr>
            <th></th><th v-html="bi('目标取法','target taken as')"></th><th v-html="bi('统一目标 q̄_t','unified target q̄_t')"></th>
            <th v-html="bi('偏差','bias')"></th><th v-html="bi('方差','variance')"></th><th v-html="bi('所属算法','algorithm')"></th>
          </tr></thead>
          <tbody>
            <tr v-for="r in rows" :key="r.name">
              <td class="row-head">{{ r.name }}</td>
              <td style="font-size:12px" v-html="bi(r.zh, r.en)"></td>
              <td style="font-family:var(--mono); font-size:12px">{{ r.tgt }}</td>
              <td>{{ r.bias }}</td><td>{{ r.var_ }}</td>
              <td style="font-size:12px">{{ r.algo }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="bi duo" style="font-size:12.5px;color:var(--ink-3)" v-html="bi(
        '全部套进同一个模板 q_{t+1}(s_t,a_t) = q_t(s_t,a_t) − α_t[q_t(s_t,a_t) − q̄_t]（Eq. 7.28）。当 n = ∞ 且 α_t = 1 时，q_{t+1} = q̄_t = G_t 直接退化为直代式 MC。',
        'All fit the single template q_{t+1}(s_t,a_t) = q_t(s_t,a_t) − α_t[q_t(s_t,a_t) − q̄_t] (Eq. 7.28). Setting n = ∞ and α_t = 1 reduces directly to Monte Carlo replacement q_{t+1} = G_t.')"></p>
    </div>`,
    setup() { return { bi }; },
  };

  /* ---------- n-step Sarsa 偏差-方差连续谱实验台 ---------- */
  const NStepLab = {
    name: 'L7NStepLab',
    components: { GridBoard: GB() },
    data: () => ({
      nChoice: '4', alpha: 0.12, eps: 0.2,
      seed: 42, rand: null,
      q: null, visits: null, episodes: 0, rmseTrace: [],
      vStar: null, playing: false, timer: null, cur: 1,
    }),
    computed: {
      cfg() { return { size: 4, forbidden: [8, 10], target: 12 }; },
      nVal() { return this.nChoice === 'MC' ? Infinity : parseInt(this.nChoice, 10); },
      heat() {
        if (!this.visits) return null;
        const m = Math.max(...this.visits, 1);
        return this.visits.map(x => Math.min(1, Math.pow(x / m, 0.55)));
      },
      greedyPi() {
        if (!this.q) return [];
        return this.q.map(row => {
          const m = Math.max(...row);
          const ties = row.reduce((acc, x, i) => (x > m - 1e-9 ? [...acc, i] : acc), []);
          const r = [0, 0, 0, 0, 0];
          ties.forEach(i => { r[i] = 1 / ties.length; });
          return r;
        });
      },
      values() {
        if (!this.q) return [];
        return this.q.map(row => Math.max(...row));
      },
      currentRmse() {
        if (!this.q || !this.vStar) return null;
        let sq = 0;
        for (let i = 0; i < 16; i++) {
          const d = Math.max(...this.q[i]) - this.vStar[i];
          sq += d * d;
        }
        return Math.sqrt(sq / 16);
      },
      rmsePath() {
        const arr = this.rmseTrace.slice(-100);
        if (arr.length < 2) return '';
        const m = Math.max(...arr, 1);
        return arr.map((e, i) => `${10 + i / (arr.length - 1) * 260},${64 - Math.min(1, e / m) * 52}`).join(' ');
      },
    },
    methods: {
      bi,
      pick(s) {
        if (this.rand() < this.eps) return 1 + Math.floor(this.rand() * 5);
        const row = this.q[s - 1];
        const m = Math.max(...row);
        const ties = row.reduce((acc, x, i) => (x > m - 1e-9 ? [...acc, i + 1] : acc), []);
        return ties[Math.floor(this.rand() * ties.length)];
      },
      episode() {
        const gamma = 0.9;
        const H = 60;
        const n = this.nVal;
        let s = 1;
        let a = this.pick(s);
        const states = [s], actions = [a], rewards = [0];
        for (let t = 0; t < H; t++) {
          const rr = stepOnce(s, a, this.cfg);
          rewards.push(rr.reward);
          s = rr.next;
          a = this.pick(s);
          states.push(s);
          actions.push(a);
          this.visits[s - 1]++;
          this.cur = s;
        }
        if (!Number.isFinite(n)) {
          // MC (n = ∞)：自尾部倒推整幕回报
          let G = 0;
          for (let tau = H - 1; tau >= 0; tau--) {
            G = rewards[tau + 1] + gamma * G;
            const st = states[tau], act = actions[tau];
            this.q[st - 1][act - 1] += this.alpha * (G - this.q[st - 1][act - 1]);
          }
        } else {
          for (let tau = 0; tau < H; tau++) {
            const end = Math.min(H, tau + n);
            let G = 0;
            let p = 1;
            for (let k = tau + 1; k <= end; k++) {
              G += p * rewards[k];
              p *= gamma;
            }
            G += p * this.q[states[end] - 1][actions[end] - 1];
            const st = states[tau], act = actions[tau];
            this.q[st - 1][act - 1] += this.alpha * (G - this.q[st - 1][act - 1]);
          }
        }
        this.q = this.q.map(row => [...row]);
        this.visits = [...this.visits];
        this.episodes++;
        const rmse = this.currentRmse;
        if (rmse != null) {
          this.rmseTrace.push(rmse);
          if (this.rmseTrace.length > 300) this.rmseTrace.shift();
        }
      },
      play() {
        if (this.playing) { this.stop(); return; }
        this.playing = true;
        this.timer = setInterval(() => {
          for (let i = 0; i < 3; i++) this.episode();
          if (this.episodes >= 400) this.stop();
        }, 55);
      },
      stop() { this.playing = false; if (this.timer) { clearInterval(this.timer); this.timer = null; } },
      reset() {
        this.stop();
        this.rand = RLV.rng(this.seed);
        this.q = Array.from({ length: 16 }, () => [0, 0, 0, 0, 0]);
        this.visits = new Array(16).fill(0);
        this.episodes = 0; this.rmseTrace = []; this.cur = 1;
      },
    },
    mounted() { this.vStar = computeOptimalV4x4(); this.reset(); },
    unmounted() { this.stop(); },
    template: `
    <div class="lab">
      <div class="lab-head">
        <span class="lab-title">n-step Sarsa 连续谱实验台 · 从 TD(n=1) 到 MC(n=∞) · n-step Spectrum Lab</span>
        <div class="seg">
          <button v-for="opt in ['1','2','4','8','MC']" :key="opt"
                  :class="{active: nChoice===opt}" @click="nChoice=opt; reset()">{{ opt === 'MC' ? 'MC (∞)' : 'n=' + opt }}</button>
        </div>
      </div>
      <div class="ctl-row">
        <span class="ctl-label">α = <strong>{{ alpha.toFixed(2) }}</strong></span>
        <input type="range" min="0.04" max="0.4" step="0.02" v-model.number="alpha"
               :aria-label="$root.lang === 'en' ? 'learning rate alpha' : '学习率 α'"
               :style="{width:'105px', '--fill': ((alpha-0.04)/0.36*100)+'%'}">
        <span class="ctl-label">ε = <strong>{{ eps.toFixed(2) }}</strong></span>
        <input type="range" min="0.05" max="0.5" step="0.05" v-model.number="eps"
               :aria-label="$root.lang === 'en' ? 'exploration rate epsilon' : '探索率 ε'"
               :style="{width:'105px', '--fill': ((eps-0.05)/0.45*100)+'%'}">
        <button class="btn primary" @click="play"><span v-html="playing ? bi('⏸ 暂停','⏸ Pause') : bi('▶ 跑谱对比','▶ Run n-step')"></span></button>
        <button class="btn" @click="for(let i=0;i<10;i++) episode()">+10 <span v-html="bi('回合','ep')"></span></button>
        <button class="btn ghost" @click="reset"><span v-html="bi('↺ 重置','↺ Reset')"></span></button>
      </div>
      <div class="lab-body">
        <div class="lab-stage" style="max-width:340px">
          <grid-board :size="4" :forbidden="cfg.forbidden" :target="cfg.target" :start="1"
                      :policy="greedyPi" :values="values.map(x=>+x.toFixed(1))" :heat="heat" :agent="cur"/>
        </div>
        <div class="lab-side">
          <div class="tally" style="margin:0 0 10px">
            <span class="t-label" v-html="bi('回合','episodes')"></span>
            <span class="t-num">{{ episodes }}</span>
            <span class="t-label" style="margin-left:10px" v-html="bi('相对 v* RMSE','RMSE vs v*')"></span>
            <span class="t-num" style="color:var(--gold)">{{ currentRmse == null ? '—' : currentRmse.toFixed(2) }}</span>
          </div>
          <svg viewBox="0 0 280 74" style="width:100%;max-width:300px;display:block;background:var(--chart-bg);border:1px solid var(--line);border-radius:10px;margin-bottom:10px">
            <line x1="10" y1="64" x2="270" y2="64" stroke="var(--chart-grid)" stroke-width="1"/>
            <text x="270" y="14" text-anchor="end" style="font:700 9px var(--mono)" fill="var(--chart-ink)">RMSE vs v* ({{ nChoice === 'MC' ? 'MC' : 'n='+nChoice }})</text>
            <polyline v-if="rmsePath" :points="rmsePath" fill="none" stroke="var(--accent)" stroke-width="1.8"/>
          </svg>
          <p class="bi duo" style="font-size:13px" v-html="bi(
            '切不同 n 再跑相同回合数：n=1 曲线最平滑但依赖早期估值推进；n=4 在偏差与方差间折中最稳；切到 MC (∞) 后方差骤升、曲线剧烈锯齿抖动。',
            'Compare the same episode budget across n: n=1 decays smoothly yet propagates slowly; n=4 balances bias and variance cleanly; switching to MC (∞) spikes variance and makes RMSE oscillate sharply.')"></p>
        </div>
      </div>
    </div>`,
  };

  /* ---------- Q-learning / Sarsa 现场训练 ---------- */
  const QLearnLab = {
    name: 'L7QLearnLab',
    components: { GridBoard: GB() },
    data: () => ({
      algo: 'Q', eps: 0.2, alpha: 0.1,
      seed: 42,                   // 随机种子固定：Reset 重训两轮轨迹逐点一致
      rand: null,                 // reset() 时以 seed 重建（RLV.rng）
      q: null, visits: null, episodes: 0, steps: 0,
      playing: false, timer: null, cur: 1,
    }),
    computed: {
      cfg() { return { size: 4, forbidden: [8, 10], target: 12 }; },
      heat() {
        if (!this.visits) return null;
        const m = Math.max(...this.visits, 1);
        return this.visits.map(x => Math.min(1, Math.pow(x / m, 0.6)));
      },
      greedyPi() {
        if (!this.q) return [];
        return this.q.map(row => {
          const m = Math.max(...row);
          const ties = row.reduce((acc, x, i) => (x > m - 1e-9 ? [...acc, i] : acc), []);
          const r = [0,0,0,0,0];
          ties.forEach(i => { r[i] = 1 / ties.length; });
          return r;
        });
      },
      values() {
        if (!this.q) return [];
        return this.q.map(row => Math.max(...row));
      },
      doneMark() {
        return this.episodes >= MAX_EPISODES;
      },
    },
    methods: {
      bi,
      pick(s) {
        if (this.rand() < this.eps) return 1 + Math.floor(this.rand() * 5);
        const row = this.q[s - 1];
        const m = Math.max(...row);
        const ties = row.reduce((acc, x, i) => (x > m - 1e-9 ? [...acc, i + 1] : acc), []);
        return ties[Math.floor(this.rand() * ties.length)];
      },
      episode() {
        let s = 1;
        let a = this.pick(s);
        for (let t = 0; t < 120; t++) {
          const rr = stepOnce(s, a, this.cfg);
          const s2 = rr.next;
          if (this.algo === 'Q') {
            const target = rr.reward + 0.9 * Math.max(...this.q[s2 - 1]);
            this.q[s - 1][a - 1] += this.alpha * (target - this.q[s - 1][a - 1]);
            a = this.pick(s2);
          } else {
            const a2 = this.pick(s2);
            const target = rr.reward + 0.9 * this.q[s2 - 1][a2 - 1];
            this.q[s - 1][a - 1] += this.alpha * (target - this.q[s - 1][a - 1]);
            a = a2;
          }
          this.visits[s2 - 1]++;
          this.steps++;
          s = s2;
          this.cur = s2;
          if (s === this.cfg.target && this.rand() < 0.05) break;
        }
        this.episodes++;
      },
      play() {
        if (this.playing) { this.stop(); return; }
        this.playing = true;
        this.timer = setInterval(() => {
          for (let i = 0; i < 3; i++) this.episode();
          if (this.episodes >= MAX_EPISODES) this.stop();
        }, 60);
      },
      stop() { this.playing = false; if (this.timer) { clearInterval(this.timer); this.timer = null; } },
      reset() {
        this.stop();
        this.rand = RLV.rng(this.seed);
        this.q = Array.from({ length: 16 }, () => [0,0,0,0,0]);
        this.visits = new Array(16).fill(0);
        this.episodes = 0; this.steps = 0; this.cur = 1;
      },
    },
    mounted() { this.reset(); },
    unmounted() { this.stop(); },
    template: `
    <div class="lab">
      <div class="lab-head">
        <span class="lab-title">现场训练 · 4×4 作业世界 · Live training on the assignment world</span>
        <div class="seg">
          <button :class="{active: algo==='Q'}" @click="algo='Q'; reset()">Q-learning <span v-html="bi('(off-policy)','(off-policy)')"></span></button>
          <button :class="{active: algo==='S'}" @click="algo='S'; reset()">Sarsa <span v-html="bi('(on-policy)','(on-policy)')"></span></button>
        </div>
      </div>
      <div class="ctl-row">
        <span class="ctl-label">ε = <strong>{{ eps.toFixed(2) }}</strong></span>
        <input type="range" min="0" max="0.6" step="0.05" v-model.number="eps"
               :aria-label="$root.lang === 'en' ? 'exploration rate epsilon' : '探索率 ε'"
               :style="{width:'110px', '--fill': (eps/0.6*100)+'%'}">
        <span class="ctl-label">α = <strong>{{ alpha.toFixed(2) }}</strong></span>
        <input type="range" min="0.02" max="0.6" step="0.02" v-model.number="alpha"
               :aria-label="$root.lang === 'en' ? 'learning rate alpha' : '学习率 α'"
               :style="{width:'110px', '--fill': ((alpha-0.02)/0.58*100)+'%'}">
        <button class="btn primary" @click="play"><span v-html="playing ? bi('⏸ 暂停','⏸ Pause') : bi('▶ 训练','▶ Train')"></span></button>
        <button class="btn" @click="episode()">+1 <span v-html="bi('回合','episode')"></span></button>
        <button class="btn ghost" @click="reset"><span v-html="bi('↺ 重置','↺ Reset')"></span></button>
      </div>
      <div class="lab-body">
        <div class="lab-stage" style="max-width:380px">
          <grid-board :size="4" :forbidden="cfg.forbidden" :target="cfg.target" :start="1"
                      :policy="greedyPi" :values="values.map(x=>+x.toFixed(1))" :heat="heat" :agent="cur"/>
        </div>
        <div class="lab-side">
          <div class="tally" style="margin:0 0 12px">
            <span class="t-label" v-html="bi('回合','episodes')"></span>
            <span class="t-num">{{ episodes }}</span>
            <span class="t-label" style="margin-left:12px" v-html="bi('步数','steps')"></span>
            <span class="t-num">{{ steps }}</span>
          </div>
          <p class="bi duo" style="font-size:13.5px" v-html="bi(
            '看三样东西：① 箭头场怎么从乱指收敛到最优（红色热度 = 访问次数，探索的足迹）；② s2（右上角起点的必经格）的 q 值爬升；③ 两种算法的差异——Sarsa 因为目标里的 a′ 是探索着选的，会学到『更保守』的策略（离禁区远一点）。',
            'Watch three things: ① how the arrow field converges from chaos to optimal (red heat = visit counts, the footprints of exploration); ② the q values climbing at must-pass cells; ③ the difference between the two — Sarsa’s target contains an exploratory a′, so it learns a slightly more conservative policy (keeping distance from forbidden cells).')"></p>
          <div class="callout warn" style="margin:12px 0 0">
            <div class="callout-icon">🎓</div>
            <div class="callout-body"><p class="bi duo" style="font-size:13px" v-html="bi(
              '实验建议：先 ε=0.2 训练 300 回合，再把 ε 拧到 0 继续训练——策略会在最优附近「定格」。调大 α 观察抖动，调小观察变慢——L6 的步长三命运在此重演。',
              'Try: train 300 episodes at ε=0.2, then set ε=0 and keep training — the policy freezes near optimal. Raise α to see jitter, lower it to see slowness — L6’s three step-size fates replay here.')"></p></div>
          </div>
        </div>
      </div>
    </div>`,
  };

  window.COMPONENTS['l7-target-table'] = TargetTable;
  window.COMPONENTS['l7-nstep-lab'] = NStepLab;
  window.COMPONENTS['l7-qlearn-lab'] = QLearnLab;
})();
