const MODEL = 'gemini-2.0-flash';
const H_ACAO = 'Access-Control-Allow-Origin';
const H_ACAM = 'Access-Control-Allow-Methods';
const H_ACAH = 'Access-Control-Allow-Headers';
const H_CT = 'Content-Type';
const H_AUTH = 'Authorization';
const H_XFN = 'X-File-Name';
const H_CD = 'Content-Disposition';
const H_LEN = 'Content-Length';
const H_OFF = 'X-Goog-Upload-Offset';
const H_CMD = 'X-Goog-Upload-Command';
const H_PROTO = 'X-Goog-Upload-Protocol';
const H_HCL = 'X-Goog-Upload-Header-Content-Length';
const H_HCT = 'X-Goog-Upload-Header-Content-Type';
const H_URL = 'X-Goog-Upload-URL';
const H_REF = 'HTTP-Referer';
const H_TIT = 'X-Title';

const HL = { gemini: { f: 0, cd: 0 }, deepseek: { f: 0, cd: 0 }, openrouter: { f: 0, cd: 0 } };
const CD = 300000;
function ok(n) { const h = HL[n]; return h.f < 3 && Date.now() > h.cd; }
function bad(n) { const h = HL[n]; h.f++; if (h.f >= 3) h.cd = Date.now() + CD; }
function fine(n) { const h = HL[n]; h.f = 0; h.cd = 0; }

function cors(e) {
  const o = {};
  o[H_ACAO] = e.ALLOWED_ORIGIN || '*';
  o[H_ACAM] = 'GET,POST,PUT,DELETE,OPTIONS';
  o[H_ACAH] = 'Content-Type,Authorization,X-File-Name';
  return o;
}

function J(o, s, h) {
  s = s || 200;
  const hh = h || {};
  hh[H_CT] = 'application/json';
  return new Response(JSON.stringify(o), { status: s, headers: hh });
}

async function getUid(r, e) {
  const raw = r.headers.get(H_AUTH) || '';
  const t = raw.replace('Bearer ', '');
  if (!t || !e.FIREBASE_API_KEY) return null;
  const url = 'https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + e.FIREBASE_API_KEY;
  const bh = {};
  bh[H_CT] = 'application/json';
  const x = await fetch(url, { method: 'POST', headers: bh, body: JSON.stringify({ idToken: t }) });
  if (!x.ok) return null;
  const j = await x.json();
  const us = j.users;
  if (!us || !us[0]) return null;
  return us[0].localId || null;
}

function b64(b) {
  let s = '';
  const c = 0x8000;
  for (let i = 0; i < b.length; i += c) {
    s += String.fromCharCode.apply(null, b.subarray(i, i + c));
  }
  return btoa(s);
}

const PT1 = 'لخّص الملف ده في ملخص دراسي منظم.';
const PT2 = 'حافظ على المصطلحات بالعربي والانجليزي واللاتيني زي ما هي.';
const PT3 = 'نظّمها في أقسام بعنوان ونقاط.';
const PT4 = 'استخرج المصطلحات بتعريفها.';
const PT5 = 'اعمل أسئلة مراجعة وبطاقات حفظ.';
const PTJ = 'ارجع JSON فقط:';
const SCHEMA = JSON.stringify({
  title: '',
  overview: '',
  sections: [{ heading: '', points: [''] }],
  terms: [{ term: '', definition: '' }],
  questions: [''],
  flashcards: [{ front: '', back: '' }],
  wordCount: 0,
  readingTime: 0
});

function PR(f, l) {
  const lang = l === 'en' ? 'انجليزي' : 'عربي مع المصطلحات الاجنبية';
  return PT1 + ' (' + f + ') ' + PT2 + PT3 + PT4 + PT5 + ' ' + lang + ' ' + PTJ + SCHEMA;
}

async function gem(pr, key, uri, mi, inl) {
  const parts = [{ text: pr }];
  if (uri) parts.push({ file_data: { mime_type: mi, file_uri: uri } });
  else if (inl) parts.push({ inline_data: { mime_type: mi, data: inl } });
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + MODEL + ':generateContent?key=' + key;
  const cfg = { temperature: 0.3, responseMimeType: 'application/json' };
  const body = { contents: [{ role: 'user', parts: parts }], generationConfig: cfg };
  const bh = {};
  bh[H_CT] = 'application/json';
  const r = await fetch(url, { method: 'POST', headers: bh, body: JSON.stringify(body) });
  if (!r.ok) throw new Error('g' + r.status);
  const j = await r.json();
  const c = j.candidates && j.candidates[0];
  const cp = c && c.content && c.content.parts && c.content.parts[0];
  const tx = cp && cp.text;
  if (!tx) throw new Error('empty');
  return JSON.parse(tx);
}

async function upf(by, mi, key) {
  const len = by.byteLength;
  const hs = {};
  hs[H_PROTO] = 'resumable';
  hs[H_CMD] = 'start';
  hs[H_HCL] = String(len);
  hs[H_HCT] = mi;
  hs[H_CT] = 'application/json';
  const s = await fetch('https://generativelanguage.googleapis.com/upload/v1beta/files?key=' + key, { method: 'POST', headers: hs, body: JSON.stringify({ file: { display_name: 'f' } }) });
  if (!s.ok) throw new Error('us' + s.status);
  const u = s.headers.get(H_URL);
  const hp = {};
  hp[H_LEN] = String(len);
  hp[H_CT] = mi;
  hp[H_OFF] = '0';
  hp[H_CMD] = 'upload, finalize';
  const p = await fetch(u, { method: 'PUT', headers: hp, body: by });
  if (!p.ok) throw new Error('up' + p.status);
  const pj = await p.json();
  const uri = pj.file && pj.file.uri;
  if (!uri) throw new Error('nouri');
  return uri;
}

async function txt(provider, text, pr, key, model) {
  const url = provider === 'deepseek' ? 'https://api.deepseek.com/chat/completions' : 'https://openrouter.ai/api/v1/chat/completions';
  const bh = {};
  bh[H_CT] = 'application/json';
  bh[H_AUTH] = 'Bearer ' + key;
  if (provider === 'openrouter') {
    bh[H_REF] = 'https://mlakhasy.web.app';
    bh[H_TIT] = 'Melakhasy';
  }
  const msgs = [{ role: 'system', content: pr }, { role: 'user', content: text }];
  const body = { model: model, messages: msgs, temperature: 0.3, response_format: { type: 'json_object' } };
  const r = await fetch(url, { method: 'POST', headers: bh, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(provider + r.status);
  const j = await r.json();
  const ch = j.choices && j.choices[0];
  const tx = ch && ch.message && ch.message.content;
  if (!tx) throw new Error('empty');
  return JSON.parse(tx);
}

async function hUpload(r, e, C, id) {
  const fn = decodeURIComponent(r.headers.get(H_XFN) || 'f');
  const mi = r.headers.get(H_CT) || 'application/octet-stream';
  const fid = crypto.randomUUID();
  await e.FILES.put('files/' + fid, r.body, {
    httpMetadata: { contentType: mi },
    customMetadata: { uid: id, fileName: fn, mimeType: mi }
  });
  return J({ fileId: fid }, 200, C);
}

async function hSumm(r, e, C, id) {
  const bd = await r.json();
  const o = await e.FILES.get('files/' + bd.fileId);
  if (!o) return J({ error: 'nf' }, 404, C);
  const md = o.customMetadata;
  if (!md || md.uid !== id) return J({ error: 'fb' }, 403, C);
  const mi = md.mimeType || 'application/octet-stream';
  const fn = md.fileName || 'f';
  const pr = PR(fn, 'ar');
  const ab = await o.arrayBuffer();
  const by = new Uint8Array(ab);
  const isT = mi === 'text/plain';
  const text = isT ? new TextDecoder().decode(by) : null;
  if (e.GEMINI_API_KEY && ok('gemini')) {
    try {
      let out;
      if (isT && by.length < 1000000) {
        out = await gem(pr, e.GEMINI_API_KEY, null, mi, b64(by));
      } else {
        const uri = await upf(by, mi, e.GEMINI_API_KEY);
        out = await gem(pr, e.GEMINI_API_KEY, uri, mi, null);
      }
      fine('gemini');
      return J({ provider: 'gemini', summary: out }, 200, C);
    } catch (err) { bad('gemini'); }
  }
  if (text) {
    if (e.DEEPSEEK_API_KEY && ok('deepseek')) {
      try {
        const out = await txt('deepseek', text, pr, e.DEEPSEEK_API_KEY, 'deepseek-chat');
        fine('deepseek');
        return J({ provider: 'deepseek', summary: out }, 200, C);
      } catch (err) { bad('deepseek'); }
    }
    if (e.OPENROUTER_API_KEY && ok('openrouter')) {
      try {
        const out = await txt('openrouter', text, pr, e.OPENROUTER_API_KEY, 'meta-llama/llama-3.3-70b-instruct:free');
        fine('openrouter');
        return J({ provider: 'openrouter', summary: out }, 200, C);
      } catch (err) { bad('openrouter'); }
    }
  }
  const msg = isT ? 'كل المزودات مشغولة، جرّب بعد شوية.' : 'الملفات (PDF/صور) بتحتاج Gemini وهو مشغول، جرّب بعد دقايق.';
  return J({ error: 'busy', message: msg }, 503, C);
}

async function hGet(r, e, C, id, p) {
  const fid = p.split('/').pop();
  const o = await e.FILES.get('files/' + fid);
  if (!o) return J({ error: 'nf' }, 404, C);
  const md = o.customMetadata;
  if (!md || md.uid !== id) return J({ error: 'fb' }, 403, C);
  const nm = encodeURIComponent(md.fileName || 'f');
  const hm = o.httpMetadata;
  const ct = (hm && hm.contentType) || 'application/octet-stream';
  const hd = Object.assign({}, C);
  hd[H_CT] = ct;
  hd[H_CD] = 'attachment; filename=' + nm;
  return new Response(o.body, { headers: hd });
}

async function hDel(r, e, C, id, p) {
  const fid = p.split('/').pop();
  const o = await e.FILES.head('files/' + fid);
  if (!o) return J({ ok: true }, 200, C);
  const md = o.customMetadata;
  if (!md || md.uid !== id) return J({ error: 'fb' }, 403, C);
  await e.FILES.delete('files/' + fid);
  return J({ ok: true }, 200, C);
}

export default {
  async fetch(r, e) {
    const u = new URL(r.url);
    const p = u.pathname;
    const C = cors(e);
    try {
      if (r.method === 'OPTIONS') return new Response(null, { headers: C });
      const id = await getUid(r, e);
      if (!id) return J({ error: 'unauth' }, 401, C);
      if (p === '/file' && r.method === 'PUT') return await hUpload(r, e, C, id);
      if (p === '/summarize' && r.method === 'POST') return await hSumm(r, e, C, id);
      if (p.indexOf('/file/') === 0 && r.method === 'GET') return await hGet(r, e, C, id, p);
      if (p.indexOf('/file/') === 0 && r.method === 'DELETE') return await hDel(r, e, C, id, p);
      return J({ error: '404' }, 404, C);
    } catch (err) {
      return J({ error: 'exc', message: String(err) }, 500);
    }
  }
};
