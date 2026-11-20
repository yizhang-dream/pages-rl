/* Per-browser reading positions and review records. Each favourite or missed
   question has its own key, so another tab can update a different item. */
window.CourseReview = (() => {
  const prefix = (window.COURSE_CONFIG.id || 'rl-viz') + '-review-';
  function read(key) {
    try { return JSON.parse(localStorage.getItem(prefix + key)); } catch { return null; }
  }
  function write(key, value) {
    try {
      if (value === null) localStorage.removeItem(prefix + key);
      else localStorage.setItem(prefix + key, JSON.stringify(value));
    } catch { return false; }
    window.dispatchEvent(new Event('course-review-change'));
    return true;
  }
  function records(group) {
    const rows = [];
    try {
      for (const key of Object.keys(localStorage)) {
        if (!key.startsWith(prefix + group + '/')) continue;
        const row = read(key.slice(prefix.length));
        if (row) rows.push(row);
      }
    } catch { /* Storage unavailable. */ }
    return rows.sort((a,b) => b.time - a.time);
  }
  function favorite(row) {
    const key = 'fav/' + row.key;
    const ok = write(key, read(key) ? null : { ...row, time: Date.now() });
    syncKeys(); return ok;
  }
  function noteResult(row, ok) {
    write('miss/' + row.key, ok ? null : { ...row, time: Date.now() });
  }
  const fillTopics = {
    l1: 'trajectory l2-state-value trajectory code code state-action transition',
    l2: 'l2-matrix l2-action-value l2-solving l2-code l2-solving l2-solving l2-examples',
    l3: 'l3-boe l3-boe l3-solving l3-contraction l3-solving l3-code l3-code l3-detour l3-detour',
    l4: 'l4-vi l4-vi l4-vi l4-code l4-pi l4-pi l4-pi l4-truncated l4-truncated',
    l5: 'l5-mean l5-exploring l5-exploring l5-eps l6-incremental l5-eps l5-basic l5-mean',
    l6: 'l6-rm l6-incremental l6-incremental l6-rm l7-td0 l4-truncated l6-rm l6-sgd',
    l7: 'l7-qlearning l7-unified l7-qlearning l7-sarsa l7-code l7-qlearning l7-qlearning l7-sarsa l7-sarsa',
    l8: 'l8-q-fa l8-dqn l8-dqn l8-dqn l8-q-fa l8-td-fa l8-code l8-td-fa',
    l9: 'l9-representation l9-representation l9-theorem l9-theorem l9-theorem l9-code l9-reinforce l9-reinforce',
    l10: 'l10-qac l10-a2c l10-qac l10-qac l10-code l10-summary l10-code l10-offpolicy',
  };
  const proofs = {
    'bellman-expand':'l2-bellman','closed-form-neumann':'l2-solving','bellman-optimality':'l3-boe',
    'contraction-banach':'l3-contraction','vi-error-bound':'l4-vi','mc-unbiased-variance':'l5-mean',
    'robbins-monro-conditions':'l6-rm','dvoretzky-ql-convergence':'l7-qlearning',
    'semi-gradient-dqn':'l8-td-fa','policy-gradient-theorem':'l9-theorem',
    'baseline-unbiased':'l10-a2c','reinforce-to-ac':'l10-qac',
  };
  const fillBlocks = {
    l1:[2,1,6,4,3,2,3],l2:[1,1,2,1,0,3,2],l3:[1,5,2,3,2,1,1,1,1],
    l4:[6,6,11,1,3,3,4,1,5],l5:[5,5,1,1,1,5,2,2],l6:[6,1,3,1,3,1,1,1],
    l7:[1,3,4,1,1,4,4,4,4],l8:[1,1,2,1,1,5,1,7],l9:[0,0,6,6,2,1,1,6],
    l10:[3,4,3,1,2,4,2,2],
  };
  const proofBlocks = {'bellman-expand':2,'closed-form-neumann':3,'bellman-optimality':1,
    'contraction-banach':3,'vi-error-bound':6,'mc-unbiased-variance':3,'robbins-monro-conditions':6,
    'dvoretzky-ql-convergence':2,'semi-gradient-dqn':7,'policy-gradient-theorem':2,'baseline-unbiased':2,'reinforce-to-ac':3};
  function exercise(source, kind, i, step) {
    const item = (kind === 'fill' ? window.DATA.fillSets : window.DATA.derivationSets)[source].items[i];
    const topic = kind === 'fill' ? fillTopics[source].split(' ')[i] : proofs[item.id];
    const section = source === 'l1' ? 'qa' : source + '-qa';
    return { key: [source,kind,item.id || i,step ?? 'all'].join('/'), kind, source, section, i, step, topic, formulaBlock: kind === 'fill' ? fillBlocks[source][i] : proofBlocks[item.id],
      label: kind === 'fill' ? item.stem.zh.replace(/\[\[\d+\]\]/g,'＿').slice(0,70) : item.name.zh + ' · 步骤 ' + (step+1) };
  }
  const savedKeys = Vue.reactive(new Set(records('fav').map(row => row.key)));
  function syncKeys() {
    savedKeys.clear();
    for (const row of records('fav')) savedKeys.add(row.key);
  }
  window.addEventListener('storage', e => { if (!e.key || e.key.startsWith(prefix + 'fav/')) syncKeys(); });
  function go(point) { window.dispatchEvent(new CustomEvent('course-reader-go', { detail: point })); }
  return { savedKeys, read, write, records, favorite, noteResult, exercise, go };
})();
