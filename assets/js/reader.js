/* Inline glossary and full-book passage lookup. Review takes place in a separate
   reading pane so the source paragraph and live exercise state stay mounted. */
window.CourseReader = (() => {
  const cards = window.READER_CARDS;
  const params = new URLSearchParams(location.search);
  const preview = params.has('review') && window.parent !== window;
  if (preview) document.documentElement.classList.add('reader-preview');
  const aliases = new Map();
  for (const [i, card] of cards.entries()) {
    const names = [card.zh, card.en, card.en.split(' (')[0], ...card.alias.map(a => a.replace(/\\b/g, ''))];
    for (const name of names) {
      if (!name || /[\\{}?]/.test(name)) continue;
      aliases.set(name.toLowerCase(), i);
    }
  }
  const escaped = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [...aliases.keys()].sort((a, b) => b.length - a.length).map(s => {
    return (/^[a-z]/i.test(s) ? '\\b' : '') + escaped(s) + (/[a-z]$/i.test(s) ? '\\b' : '');
  });
  const matcher = new RegExp(patterns.join('|'), 'gi');
  const cache = new Map();
  function annotate(html) {
    if (preview) return html;
    if (cache.has(html)) return cache.get(html);
    const template = document.createElement('template');
    template.innerHTML = html;
    const walker = document.createTreeWalker(template.content, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const node of nodes) {
      if (node.parentElement?.closest('a,button,code,pre,[data-tex]')) continue;
      const text = node.textContent;
      const fragment = document.createDocumentFragment();
      let pos = 0;
      for (const match of text.matchAll(matcher)) {
        fragment.append(text.slice(pos, match.index));
        const button = document.createElement('button');
        button.className = 'reader-term';
        button.type = 'button';
        button.dataset.term = aliases.get(match[0].toLowerCase());
        button.textContent = match[0];
        fragment.append(button);
        pos = match.index + match[0].length;
      }
      if (pos) { fragment.append(text.slice(pos)); node.replaceWith(fragment); }
    }
    const result = template.innerHTML;
    cache.set(html, result);
    return result;
  }

  async function land(section, ready) {
    if (!preview) return false;
    await ready;
    await document.fonts.ready;
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const block = section.querySelector('[data-read-block="' + Number(params.get('block')) + '"]');
    const target = block || section;
    target.classList.add('reader-target', 'in', 'rv-done');
    const line = params.get('line');
    const paragraph = line && [...target.querySelectorAll('.du-line')].find(n =>
      n.getBoundingClientRect().height && n.textContent.toLowerCase().includes(line.toLowerCase()));
    (paragraph || target).scrollIntoView({ behavior: 'instant', block: 'start' });
    return true;
  }

  let indexRequest;
  function loadPassages() {
    if (!indexRequest) indexRequest = fetch('assets/js/reader-passages.json?v=' + window.RLV_VERSION)
      .then(r => { if (!r.ok) throw Error('search index'); return r.json(); })
      .catch(e => { indexRequest = null; throw e; });
    return indexRequest;
  }
  const panel = {
    data: () => ({ term: null, query: '', rows: [], limit: 24, state: '', destination: '', frameTitle: '', lang: 'both', shelf: false, favorites: [], misses: [], position: null, message: '', retry: null }),
    computed: {
      matches() {
        const q = this.query.trim().toLowerCase();
        if (!q) return [];
        return this.rows.filter(r => r.zh.toLowerCase().includes(q) || r.en.toLowerCase().includes(q));
      },
    },
    methods: {
      refreshShelf() {
        this.favorites = window.CourseReview.records('fav');
        this.misses = window.CourseReview.records('miss');
        this.position = window.CourseReview.read('position');
      },
      toggleFavorite(row) {
        this.message = window.CourseReview.favorite(row) ? (window.CourseReview.read('fav/' + row.key) ? '已收藏 / Saved' : '已移除 / Removed') : '无法保存 / Storage unavailable';
        this.refreshShelf();
      },
      termFavorite() {
        const t = this.term;
        this.toggleFavorite({ key: 'term/' + t.en, kind: 'term', label: t.zh + ' · ' + t.en, name: t.en });
      },
      toPoint(point) {
        this.afterClose = () => window.CourseReview.go(point);
        this.back();
      },
      showFavorite(row) {
        if (row.kind === 'term') { this.shelf = false; this.term = cards.find(c => c.en === row.name); }
        else this.toPoint(row);
      },
      async open(card, mode) {
        this.shelf = mode === 'shelf'; this.retry = null; this.message = ''; this.afterClose = null;
        this.refreshShelf();
        this.term = card; this.destination = ''; this.query = ''; this.limit = 24;
        this.lang = document.body.dataset.lang || 'both';
        this.origin = document.activeElement;
        this.scroller = document.querySelector('main.content');
        this.savedTop = this.scroller.scrollTop;
        this.previousRestoration = history.scrollRestoration;
        history.scrollRestoration = 'manual';
        document.body.classList.add('reader-open');
        this.$refs.dialog.showModal();
        history.pushState({ ...history.state, readerOpen: true }, '');
        if (!card && !mode) {
          this.$nextTick(() => this.$refs.search?.focus());
          await this.load();
        }
      },
      async load() {
        this.state = 'loading';
        try { this.rows = await loadPassages(); this.state = ''; }
        catch { this.state = 'error'; }
      },
      visit([section, block], title, line = '') {
        const url = new URL(location.href);
        url.searchParams.set('review', '1'); url.searchParams.set('block', block);
        if (line) url.searchParams.set('line', line);
        const passage = this.rows.find(r => r.id === section && r.block === block && line &&
          (r.zh.toLowerCase().includes(line.toLowerCase()) || r.en.toLowerCase().includes(line.toLowerCase())));
        const visibleLang = passage && this.lang !== 'both' && !passage[this.lang].toLowerCase().includes(line.toLowerCase()) ? 'both' : this.lang;
        url.searchParams.set('readingLang', visibleLang);
        url.hash = 'sec-' + section;
        this.frameTitle = title; this.destination = url.href;
      },
      excerpt(row) {
        const q = this.query.trim().toLowerCase();
        const text = row.zh.toLowerCase().includes(q) ? row.zh : row.en;
        const i = text.toLowerCase().indexOf(q);
        return (i > 36 ? '…' : '') + text.slice(Math.max(0, i - 36), i + q.length + 52) +
          (i + q.length + 52 < text.length ? '…' : '');
      },
      finish() {
        if (this.$refs.dialog.open) this.$refs.dialog.close();
        this.destination = '';
        this.origin?.focus({ preventScroll: true });
        const restore = () => this.scroller.scrollTo({ top: this.savedTop, behavior: 'instant' });
        restore();
        requestAnimationFrame(() => {
          restore();
          document.body.classList.remove('reader-open');
          history.scrollRestoration = this.previousRestoration;
          const next = this.afterClose; this.afterClose = null;
          if (next) next();
        });
      },
      back() {
        if (history.state?.readerOpen) history.back();
        else this.finish();
      },
    },
    mounted() {
      this.click = e => {
        const save = e.target.closest('[data-save-block]');
        if (save) {
          const section = save.dataset.saveSection, block = Number(save.dataset.saveBlock);
          const el = document.getElementById('sec-' + section).querySelector('[data-read-block="' + block + '"]');
          const text = el.querySelector('.lab-title,.zh') || el;
          this.toggleFavorite({ key: [section, block].join('/'), kind: save.dataset.saveKind, section, block,
            label: window.DATA.sections[section].title.zh + ' · ' + text.textContent.trim().slice(0,65) });
          return;
        }
        if (e.target.closest('[data-review-shelf]')) { this.open(null,'shelf'); return; }
        const term = e.target.closest('.reader-term');
        if (term || e.target.closest('[data-reader-search]')) this.open(term ? cards[Number(term.dataset.term)] : null);
      };
      this.study = e => {
        this.open(null, 'study');
        this.retry = e.detail;
        this.visit([e.detail.topic, e.detail.formulaBlock ?? 0], '回看推导 · ' + e.detail.label);
      };
      window.addEventListener('course-study', this.study);
      this.stored = e => { if (!e.key || e.key.includes('-review-')) this.refreshShelf(); };
      window.addEventListener('storage', this.stored);
      this.pop = () => { if (this.$refs.dialog.open) this.finish(); };
      document.addEventListener('click', this.click);
      window.addEventListener('popstate', this.pop);
    },
    beforeUnmount() { window.removeEventListener('course-study', this.study); window.removeEventListener('storage', this.stored); document.removeEventListener('click', this.click); window.removeEventListener('popstate', this.pop); },
    template: `
    <dialog ref="dialog" class="reader-dialog" :class="{'with-frame':destination}" aria-label="查词与正文检索 / Reading tools" @cancel.prevent="back">
      <header><strong>{{ destination ? frameTitle : term ? term.zh + ' · ' + term.en : shelf ? '我的复习 / Review' : '搜正文 · Search passages' }}</strong>
        <button v-if="retry" type="button" class="btn" @click="toPoint({section:retry.section,retry})">返回重做 / Retry question</button>
        <button v-else type="button" class="btn" @click="back">返回原文 / Return</button></header>
      <iframe v-if="destination" :key="destination" :src="destination" :title="frameTitle"></iframe>
      <div v-else-if="shelf" class="reader-body">
        <h3>续读 / Continue</h3><button v-if="position" class="reader-result" @click="toPoint(position)">{{ position.label }}</button><p v-else>还没有阅读记录 / No reading position yet</p>
        <h3>收藏 / Saved</h3><p v-if="!favorites.length">尚无收藏 / No saved items</p>
        <div v-for="row in favorites" :key="row.key" class="review-row"><button class="reader-result" @click="showFavorite(row)">{{ row.label }}</button><button class="btn" @click="toggleFavorite(row)">移除 / Remove</button></div>
        <h3>待重做 / Try again</h3><p v-if="!misses.length">没有待重做题目 / No outstanding questions</p>
        <button v-for="row in misses" :key="row.key" class="reader-result" @click="toPoint({section:row.section,retry:row})">{{ row.source.toUpperCase() }} · {{ row.label }}</button>
      </div>
      <div v-else-if="term" class="reader-body">
        <button class="btn" @click="termFavorite">{{ favorites.some(f=>f.name===term.en) ? '★ 已收藏 / Saved' : '☆ 收藏术语 / Save term' }}</button>
        <p class="zh">{{ term.definition.zh }}</p><p class="en">{{ term.definition.en }}</p>
        <button class="btn" @click="visit(term.reading, term.zh + ' · 原理与推导')">原理与推导 / Reasoning</button>
        <button class="btn" @click="visit(term.experiment, term.zh + ' · 相关实验')">相关实验 / Experiment</button>
      </div>
      <div v-else class="reader-body">
        <input ref="search" type="search" v-model="query" @input="limit=24" aria-label="搜索正文原句 / Search passages" placeholder="输入原句或片段 · Find a phrase">
        <p v-if="state==='loading'" role="status">载入索引中… / Loading…</p>
        <button v-else-if="state==='error'" class="btn" @click="load">重新加载索引 / Retry</button>
        <template v-else-if="query.trim()"><p role="status">{{ matches.length }} 条匹配 / matches</p>
          <button class="reader-result" v-for="(r,i) in matches.slice(0,limit)" :key="i"
            @click="visit([r.id,r.block], r.title.zh, query.trim())"><strong>{{ 'L'+r.no+' · '+(lang==='en'?r.title.en:r.title.zh) }}</strong><span>{{ excerpt(r) }}</span></button>
          <button v-if="limit<matches.length" class="btn" @click="limit+=24">更多结果 / More</button>
        </template>
      </div>
    </dialog>`,
  };
  return { annotate, preview, land, panel, readingLang: params.get('readingLang') };
})();
