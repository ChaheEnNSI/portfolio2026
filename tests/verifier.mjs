// Vérifications automatiques du portfolio, lancées à chaque envoi sur GitHub (voir .github/workflows/qualite.yml).
// Sert le dépôt comme GitHub Pages (sous /portfolio2026/), puis contrôle dans Chromium :
// erreurs JavaScript, règle de sécurité (CSP), accessibilité (axe), thème, partage, ChahéOS, fichiers annexes ;
// puis un passage rapide dans Firefox et WebKit (Safari) quand ils sont installés (toujours en CI).
// Usage local : npm i --no-save playwright axe-core && npx playwright install chromium firefox webkit && node tests/verifier.mjs
import http from 'node:http';
import { readFile, mkdir, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, firefox, webkit } from 'playwright';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'tests', 'captures');
const AXE = await readFile(require.resolve('axe-core/axe.min.js'), 'utf8');
const TYPES = { '.woff2': 'font/woff2', '.html': 'text/html; charset=utf-8', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8' };

// --- petit serveur statique, comme GitHub Pages
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (!url.pathname.startsWith('/portfolio2026/')) { res.writeHead(404); return res.end(); }
  let rel = decodeURIComponent(url.pathname.slice('/portfolio2026/'.length));
  if (rel === '' || rel.endsWith('/')) rel += 'index.html';
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT + path.sep)) { res.writeHead(403); return res.end(); }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404, { 'content-type': TYPES['.html'] });
    res.end(await readFile(path.join(ROOT, '404.html')));
  }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}/portfolio2026/`;

const fails = [];
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'ÉCHEC'}  ${what}`); if (!ok) fails.push(what); };
await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();

// la visite guidée et l’écran de chargement ne gênent pas les tests
const QUIET = "try{sessionStorage.setItem('ld-skip','1');localStorage.setItem('tour-offer','no')}catch(e){}";
const CSP_SPY = "window.__csp=[];document.addEventListener('securitypolicyviolation',e=>window.__csp.push(e.violatedDirective+' '+e.blockedURI))";

// hors ligne : CDN_LOCAL=<dossier> sert les bibliothèques npm exactes depuis le disque (mêmes octets, mêmes empreintes)
const CDN_LOCAL = process.env.CDN_LOCAL;
async function open(opts, query = '', br = browser) {
  const ctx = await br.newContext(opts);
  if (CDN_LOCAL) await ctx.route('https://cdn.jsdelivr.net/npm/**', async route => {
    const rel = new URL(route.request().url()).pathname.replace('/npm/', '');
    try { await route.fulfill({ body: await readFile(path.join(CDN_LOCAL, rel)), contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' } }); } catch { await route.abort(); }
  });
  await ctx.addInitScript(QUIET); await ctx.addInitScript(CSP_SPY);
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', e => errors.push(String(e).slice(0, 200)));
  page.on('console', m => { if (m.type() === 'error' && !/GL|WebGL|GPU|Failed to load resource/i.test(m.text())) errors.push(m.text().slice(0, 200)); });
  // fichiers introuvables (sauf la lecture anticipée de Chrome qui prend parfois un modèle JS « ${PHOTO} » pour une image)
  page.on('response', r => { if (r.status() >= 400 && !r.url().includes('%7BPHOTO%7D')) errors.push(`${r.status()} ${r.url().slice(0, 120)}`); });
  page.on('requestfailed', r => errors.push(`échec ${r.url().slice(0, 120)}`));
  await page.goto(BASE + query);
  await page.waitForFunction(() => document.documentElement.classList.contains('ready'), null, { timeout: 45000 });
  await page.waitForTimeout(1200);
  return { ctx, page, errors };
}

// 1. ordinateur, animations actives : aucune erreur, aucune violation de la règle de sécurité
{
  const { ctx, page, errors } = await open({ viewport: { width: 1440, height: 900 }, locale: 'fr-FR' });
  check(errors.length === 0, `aucune erreur JavaScript (${errors.join(' | ') || 'rien'})`);
  const csp = await page.evaluate(() => window.__csp);
  check(csp.length === 0, `aucune violation de la CSP (${csp.join(' | ') || 'rien'})`);
  check(/Chahé Papazian/.test(await page.title()), 'le titre contient le nom');
  const ld = await page.evaluate(() => JSON.parse(document.querySelector('script[type="application/ld+json"]').textContent));
  check(ld['@type'] === 'ProfilePage' && ld.mainEntity && ld.mainEntity.name === 'Chahé Papazian', 'données structurées ProfilePage valides');
  check(await page.locator('#feat .dz-card').count() === 4, 'les 4 projets sont affichés');
  const libs = await page.evaluate(() => [!!window.gsap, !!window.ScrollTrigger, !!window.Lenis]);
  check(libs.every(Boolean), 'bibliothèques externes chargées (empreintes SRI acceptées)');
  await page.screenshot({ path: path.join(OUT, 'accueil-ordinateur.png') });
  const fonts = await page.evaluate(async () => { await document.fonts.ready; return [...document.fonts].filter(f => f.status === 'loaded').map(f => f.family); });
  check(fonts.includes('Archivo') && fonts.includes('IBM Plex Sans'), 'polices chargées depuis les fichiers du site');
  await ctx.close();
}

// 1 bis. thème clair / sombre : le choix s’applique, se garde au rechargement, sans erreur ; partage d’un projet
{
  const { ctx, page, errors } = await open({ viewport: { width: 1440, height: 900 }, colorScheme: 'light', locale: 'fr-FR', permissions: ['clipboard-read', 'clipboard-write'] });
  await page.click('#theme-btn'); await page.waitForTimeout(1600);
  const t1 = await page.evaluate(() => [document.documentElement.dataset.theme, getComputedStyle(document.body).backgroundColor, document.getElementById('theme-btn').getAttribute('aria-pressed')]);
  check(t1[0] === 'dark' && t1[1] === 'rgb(20, 33, 61)' && t1[2] === 'true', `bouton de thème : passage au sombre (${t1.join(', ')})`);
  await page.reload(); await page.waitForFunction(() => document.documentElement.classList.contains('ready'), null, { timeout: 45000 });
  check(await page.evaluate(() => document.documentElement.dataset.theme) === 'dark', 'bouton de thème : choix gardé au rechargement');
  await page.screenshot({ path: path.join(OUT, 'accueil-sombre.png') });
  await page.evaluate(() => document.querySelector('.pill-btn[data-open="0"]').click()); await page.waitForTimeout(1600);
  await page.click('#ov-share'); await page.waitForTimeout(400);
  const shared = await page.evaluate(() => navigator.clipboard.readText());
  check(shared === 'https://chaheennsi.github.io/portfolio2026/p/vigie/', `partager un projet : lien copié (${shared})`);
  check(errors.length === 0, `thème et partage sans erreur (${errors.join(' | ') || 'rien'})`);
  await ctx.close();
}

// 2. accessibilité (axe) : clair et sombre, ordinateur et téléphone
for (const scheme of ['light', 'dark']) {
  for (const vp of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    const { ctx, page } = await open({ viewport: vp, colorScheme: scheme, reducedMotion: 'reduce', bypassCSP: true, locale: 'fr-FR' });
    await page.evaluate(AXE);
    const v = await page.evaluate(async () => (await axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] })).violations
      .filter(x => x.impact === 'serious' || x.impact === 'critical')
      .map(x => `${x.id} (${x.nodes.length}) ${x.nodes[0].target.join(' ')}`));
    check(v.length === 0, `axe ${scheme} ${vp.width}px : ${v.join(' | ') || 'aucun problème sérieux'}`);
    if (vp.width < 700) await page.screenshot({ path: path.join(OUT, `accueil-telephone-${scheme}.png`) });
    await ctx.close();
  }
}

// 3. anglais et lien de partage d’un projet
{
  const { ctx, page } = await open({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' }, '?lang=en');
  check(await page.evaluate(() => document.documentElement.lang) === 'en', 'la version anglaise s’affiche avec ?lang=en');
  await ctx.close();
}
{
  const { ctx, page } = await open({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce', locale: 'fr-FR' }, '?projet=vigie');
  const ouvert = await page.waitForFunction(() => !document.getElementById('ov').hidden, null, { timeout: 8000 }).then(() => true, () => false);
  check(ouvert, '?projet=vigie ouvre directement la fiche du projet');
  await page.screenshot({ path: path.join(OUT, 'partage-vigie.png') });
  await ctx.close();
}

// 4. ChahéOS : s’ouvre, Touch ID déverrouille, le site derrière est inerte, puis tout revient à la fermeture
{
  const { ctx, page, errors } = await open({ viewport: { width: 1440, height: 900 }, locale: 'fr-FR' });
  await page.evaluate(() => { window.__site.term.open(); window.__site.term.exec('vrai richesse'); });
  await page.waitForFunction(() => { const b = document.querySelector('.os-boot2'); return b && b.classList.contains('gone'); }, null, { timeout: 15000 });
  await page.waitForTimeout(500);
  check(await page.evaluate(() => [...document.body.children].filter(e => e.id !== 'rx').every(e => e.inert)), 'ChahéOS ouvert : le site derrière est inerte');
  await page.click('.os-lk-tid'); await page.waitForTimeout(1600);
  check(await page.evaluate(() => document.querySelector('.os-lock').classList.contains('gone')), 'ChahéOS : Touch ID déverrouille la session');
  await page.screenshot({ path: path.join(OUT, 'chaheos.png') });
  await page.click('.os-logo'); await page.click('.os-mb >> text=Verrouiller'); await page.waitForTimeout(600);
  await page.keyboard.press('Escape'); await page.waitForTimeout(900);
  check(await page.evaluate(() => document.getElementById('rx').hidden && ![...document.body.children].some(e => e.inert)), 'ChahéOS fermé : le site redevient utilisable');
  check(errors.length === 0, `ChahéOS sans erreur JavaScript (${errors.join(' | ') || 'rien'})`);
  await ctx.close();
}

// 5. pages de partage, page 404, security.txt, plan du site
{
  const ctx = await browser.newContext(); const page = await ctx.newPage();
  for (const id of ['vigie', 'silverfort', 'smsi', 'hackathon']) {
    const html = await readFile(path.join(ROOT, 'p', id, 'index.html'), 'utf8');
    const img = await stat(path.join(ROOT, 'p', id, 'apercu.jpg')).then(s => s.size).catch(() => 0);
    check(html.includes(`p/${id}/apercu.jpg`) && img > 10000, `page de partage ${id} : image d’aperçu présente`);
    await page.goto(`${BASE}p/${id}/`);
    await page.waitForURL(u => u.search === `?projet=${id}`, { timeout: 10000 }).catch(() => {});
    check(new URL(page.url()).search === `?projet=${id}`, `page de partage ${id} : redirige vers le portfolio`);
  }
  const r404 = await page.goto(BASE + 'nexiste-pas');
  check(r404.status() === 404 && /introuvable/.test(await page.content()), 'la page 404 s’affiche');
  const sec = await readFile(path.join(ROOT, '.well-known', 'security.txt'), 'utf8');
  const exp = new Date((sec.match(/^Expires: (.+)$/m) || [])[1]);
  check(/^Contact: mailto:/m.test(sec) && exp > new Date(), `security.txt valide (expire le ${exp.toISOString().slice(0, 10)})`);
  check(exp - new Date() > 30 * 864e5, 'security.txt : plus d’un mois avant expiration (sinon, le renouveler)');
  check((await readFile(path.join(ROOT, 'sitemap.xml'), 'utf8')).includes('<loc>https://chaheennsi.github.io/portfolio2026/</loc>'), 'plan du site présent');
  await ctx.close();
}

// 6. autres moteurs : Firefox et WebKit (le moteur de Safari) — affichage, CSP, thème, fiche projet
for (const [nom, type] of [['Firefox', firefox], ['WebKit (Safari)', webkit]]) {
  let br;
  try { br = await type.launch(); } catch {
    if (process.env.CI) check(false, `${nom} : navigateur absent en CI`); else console.log(`--    ${nom} non installé ici (vérifié en CI)`);
    continue;
  }
  for (const vp of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    const mob = vp.width < 700;
    const { ctx, page, errors } = await open({ viewport: vp, locale: 'fr-FR', ...(mob && type !== firefox ? { isMobile: true, hasTouch: true } : {}) }, '', br);
    const csp = await page.evaluate(() => window.__csp);
    check(errors.length === 0 && csp.length === 0, `${nom} ${vp.width}px : aucune erreur ni violation CSP (${[...errors, ...csp].join(' | ') || 'rien'})`);
    const vis = await page.evaluate(() => { const h = document.querySelector('.hero-name'); const r = h && h.getBoundingClientRect(); return !!r && r.width > 100 && getComputedStyle(h).visibility !== 'hidden'; });
    check(vis, `${nom} ${vp.width}px : le nom s’affiche en haut de page`);
    await page.screenshot({ path: path.join(OUT, `${nom.split(' ')[0].toLowerCase()}-${vp.width}.png`) });
    if (!mob) {
      await page.click('#theme-btn'); await page.waitForTimeout(1200);
      check(await page.evaluate(() => document.documentElement.dataset.theme) === 'dark', `${nom} : bouton de thème`);
      await page.evaluate(() => document.querySelector('.pill-btn[data-open="1"]').click()); await page.waitForTimeout(1800);
      check(await page.evaluate(() => !document.getElementById('ov').hidden && /Silverfort/.test(document.getElementById('ov-title').textContent)), `${nom} : la fiche d’un projet s’ouvre`);
      await page.screenshot({ path: path.join(OUT, `${nom.split(' ')[0].toLowerCase()}-fiche.png`) });
    }
    await ctx.close();
  }
  await br.close();
}

await browser.close(); server.close();
console.log(fails.length ? `\n${fails.length} vérification(s) en échec.` : '\nTout est bon.');
process.exit(fails.length ? 1 : 0);
