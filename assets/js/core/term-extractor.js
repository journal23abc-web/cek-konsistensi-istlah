const STOPWORDS = new Set(`yang dan di ke dari ini itu akan untuk pada dengan adalah dalam tidak atau juga dapat oleh sebagai karena jika maka telah sudah saat secara terhadap antara hanya masih harus bisa ada kita kami mereka saya anda dia ia nya kah lah pun per para sang si se ya tersebut tapi namun serta agar supaya sehingga meskipun walaupun apabila yaitu yakni tanpa setiap semua beberapa sangat lebih kurang satu dua tiga the and of to in on is are was were be been a an it that this`.split(/\s+/));

function tokens(sentence) {
  return [...sentence.matchAll(/[\p{L}\p{M}\p{N}]+(?:[-’'][\p{L}\p{M}\p{N}]+)*/gu)].map((m) => m[0].normalize('NFKC').toLocaleLowerCase('id-ID'));
}

function surfaceKey(term) {
  return term.normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase('id-ID').replace(/[^\p{L}\p{N}]/gu, '');
}

function levenshtein(a, b) {
  const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    let prev = dp[0]; dp[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const temp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = temp;
    }
  }
  return dp[b.length];
}

function similarSurface(a, b) {
  const ka = surfaceKey(a), kb = surfaceKey(b);
  if (ka === kb) return true;
  if (Math.abs(ka.length - kb.length) > 1 || Math.min(ka.length, kb.length) < 5) return false;
  if (ka.slice(0, 2) !== kb.slice(0, 2)) return false;
  return levenshtein(ka, kb) <= 1;
}

export function extractTerms(text, { limit = 60 } = {}) {
  const counts = new Map();
  const sentences = text.split(/(?<=[.!?;:\n])\s+/u);
  for (const sentence of sentences) {
    const words = tokens(sentence);
    for (let size = 1; size <= 3; size += 1) {
      for (let i = 0; i + size <= words.length; i += 1) {
        const gram = words.slice(i, i + size);
        if (STOPWORDS.has(gram[0]) || STOPWORDS.has(gram.at(-1))) continue;
        if (gram.every((w) => STOPWORDS.has(w)) || gram.some((w) => w.length < 2)) continue;
        const term = gram.join(' ');
        counts.set(term, (counts.get(term) || 0) + 1);
      }
    }
  }
  const all = [...counts.entries()].map(([term, count]) => {
    const wordCount = term.split(' ').length;
    const score = count * (1 + 0.65 * (wordCount - 1)) * Math.log2(2 + term.length);
    return { term, count, wordCount, score };
  });
  const candidates = all.filter((item) => item.count >= 2).sort((a, b) => b.score - a.score || b.count - a.count).slice(0, limit);

  const variantPool = all.filter((item) => item.wordCount <= 2 && item.term.length >= 4).sort((a, b) => b.count - a.count).slice(0, 400);
  const parent = variantPool.map((_, i) => i);
  const find = (x) => parent[x] === x ? x : (parent[x] = find(parent[x]));
  const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[rb] = ra; };
  for (let i = 0; i < variantPool.length; i += 1) {
    for (let j = i + 1; j < variantPool.length; j += 1) {
      if (Math.abs(variantPool[i].term.length - variantPool[j].term.length) > 2) continue;
      if (similarSurface(variantPool[i].term, variantPool[j].term)) union(i, j);
    }
  }
  const buckets = new Map();
  variantPool.forEach((item, index) => {
    const root = find(index);
    if (!buckets.has(root)) buckets.set(root, []);
    buckets.get(root).push(item);
  });
  const variantGroups = [...buckets.values()].filter((group) => group.length > 1).map((group) => group.sort((a, b) => b.count - a.count)).sort((a, b) => b.reduce((s, x) => s + x.count, 0) - a.reduce((s, x) => s + x.count, 0));
  return { candidates, variantGroups };
}
