// Vérifications automatiques du portfolio, lancées à chaque envoi sur GitHub (voir .github/workflows/qualite.yml).
// Sert le dépôt comme GitHub Pages (sous /portfolio2026/), puis contrôle dans Chromium :
// erreurs JavaScript, règle de sécurité (CSP), accessibilité (axe), décor 3D « nuit de veille », partage, ChahéOS, fichiers annexes ;
// puis un passage rapide dans Firefox et WebKit (Safari) quand ils sont installés (toujours en CI).
// Usage local : npm i --no-save playwright axe-core && npx playwright install chromium firefox webkit && node tests/verifier.mjs
import http from 'node:http';
import { readFile, mkdir, stat } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, firefox, webkit } from 'playwright';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'tests', 'captures');
const AXE = await readFile(require.resolve('axe-core/axe.min.js'), 'utf8');
const TYPES = { '.mp4': 'video/mp4', '.webm': 'video/webm', '.webp': 'image/webp', '.woff2': 'font/woff2', '.html': 'text/html; charset=utf-8', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8' };

// --- petit serveur statique, comme GitHub Pages
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (!url.pathname.startsWith('/portfolio2026/')) { res.writeHead(404); return res.end(); }
  let rel = decodeURIComponent(url.pathname.slice('/portfolio2026/'.length));
  if (rel === '' || rel.endsWith('/')) rel += 'index.html';
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT + path.sep)) { res.writeHead(403); return res.end(); }
  try {
    const body = await readFile(file), type = TYPES[path.extname(file)] || 'application/octet-stream';
    const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
    if (m && (m[1] || m[2])) {
      const a = m[1] ? +m[1] : Math.max(0, body.length - +m[2]), b = m[1] && m[2] ? Math.min(+m[2], body.length - 1) : body.length - 1;
      if (a >= body.length || a > b) { res.writeHead(416, { 'content-range': `bytes */${body.length}` }); return res.end(); }
      res.writeHead(206, { 'content-type': type, 'content-range': `bytes ${a}-${b}/${body.length}`, 'accept-ranges': 'bytes', 'content-length': b - a + 1 });
      return res.end(body.subarray(a, b + 1));
    }
    res.writeHead(200, { 'content-type': type, 'accept-ranges': 'bytes', 'content-length': body.length });
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
// boucles vivantes déclarées dans la page (une par chapitre qui en a une)
const BOUCLES = (() => { try { const m = /const FILM_BOUCLES = \[([\d, ]*)\]/.exec(readFileSync(path.join(ROOT, 'index.html'), 'utf8')); return m ? m[1].split(',').map(x => x.trim()).filter(Boolean).map(Number) : []; } catch { return []; } })();
await mkdir(OUT, { recursive: true });
// WebGL logiciel : les machines de test n’ont pas de carte graphique, le décor 3D doit quand même tourner
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

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
  await ctx.addInitScript(`try{Object.defineProperty(navigator,'hardwareConcurrency',{get:()=>${opts.modeste ? 2 : 8}});Object.defineProperty(navigator,'deviceMemory',{get:()=>${opts.modeste ? 2 : 8}})}catch(e){}`);
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', e => errors.push(String(e).slice(0, 200)));
  page.on('console', m => { if (m.type() === 'error' && !/GL|WebGL|GPU|Failed to load resource/i.test(m.text())) errors.push(m.text().slice(0, 200)); });
  // fichiers introuvables (sauf la lecture anticipée de Chrome qui prend parfois un modèle JS « ${PHOTO} » pour une image)
  page.on('response', r => { if (r.status() >= 400 && !r.url().includes('%7BPHOTO%7D')) errors.push(`${r.status()} ${r.url().slice(0, 120)}`); });
  // une vidéo dont on interrompt le chargement en fermant la fiche n’est pas une erreur
  page.on('requestfailed', r => { if (/\/v\/[\w-]+\.(mp4|webm)$/.test(r.url()) && /abort|cancel/i.test((r.failure() || {}).errorText || '')) return; errors.push(`échec ${r.url().slice(0, 120)}`); });
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

// 1 bis. nuit de veille : le décor 3D tourne, le faisceau suit la souris et éclaire le nom, l’heure du quart avance avec le défilement ; partage d’un projet
{
  const { ctx, page, errors } = await open({ viewport: { width: 1440, height: 900 }, colorScheme: 'light', locale: 'fr-FR', permissions: ['clipboard-read', 'clipboard-write'] });
  const nuit = await page.waitForFunction(() => document.documentElement.classList.contains('nuit-ok'), null, { timeout: 30000 }).then(() => true, () => false);
  check(nuit, 'nuit de veille : le décor est actif');
  const film = await page.evaluate(() => document.documentElement.classList.contains('film'));
  const t1 = await page.evaluate(() => [document.documentElement.dataset.theme, getComputedStyle(document.body).backgroundColor, document.documentElement.classList.contains('film') ? document.querySelectorAll('.film-i').length === 7 : document.getElementById('nuit').width > 300]);
  check(t1[0] === 'dark' && t1[1] === 'rgb(7, 12, 28)' && t1[2], `nuit de veille : fond de nuit pour tous, même si l’appareil préfère le clair (${t1.join(', ')})`);
  if (nuit) {
    // son d'ambiance : coupé par défaut, le bouton l'allume puis le coupe, sans erreur
    const son = await page.evaluate(async () => { const b = document.getElementById('son-btn'); if (!b || b.hidden) return 'absent'; const a0 = b.getAttribute('aria-pressed'); b.click(); await new Promise(r => setTimeout(r, 400)); const a1 = b.getAttribute('aria-pressed'); b.click(); await new Promise(r => setTimeout(r, 300)); return [a0, a1, b.getAttribute('aria-pressed')].join(','); });
    check(son === 'false,true,false', `nuit de veille : le son d’ambiance est coupé par défaut et s’allume au bouton (${son})`);
    for (const x of [300, 360, 420, 480]) { await page.mouse.move(x, 300); await page.waitForTimeout(350); }
    const tenu = await page.waitForFunction(f => f ? !!document.querySelector('.film-lampe.on') : /Vous tenez|You hold/.test(document.getElementById('veille-t').textContent), film, { timeout: 8000 }).then(() => true, () => false);
    check(tenu, film ? 'film : la lampe suit le curseur' : 'nuit de veille : la souris prend le faisceau en main');
    // (à l'accueil, curseur posé sur le ciel à gauche : le faisceau du phare traverse le nom en biais)
    const lit = await page.waitForFunction(f => { const c = [...document.querySelectorAll('.hero-name .ch')].map(e => parseFloat(e.style.getPropertyValue('--l'))); return f ? Math.max(...c) - Math.min(...c) > .2 : c.some(v => v > .6) && c.some(v => v < .4); }, film, { timeout: 12000 }).then(() => true, () => false);
    check(lit, 'nuit de veille : le faisceau éclaire les lettres du nom, pas tout le nom d’un coup');
    if (film) {
      const v0 = await page.evaluate(() => [...document.querySelectorAll('.film-v')].map(v => ((v.querySelector('source') || {}).src || '').split('/').pop()));
      check(v0.length <= 1 && v0.every(x => /^film-0\.(webm|mp4)$/.test(x)), `film : à l’accueil, seul le premier plan se charge (${v0.join(', ') || 'aucun'})`);
      // la lampe rejoint le curseur en douceur : on attend qu'elle y soit avant de vérifier qu'elle ne bouge plus
      const lampeFixe = await page.evaluate(async () => { const l = document.querySelector('.film-lampe'); await new Promise(r => setTimeout(r, 2500)); const a = l.style.transform; await new Promise(r => setTimeout(r, 1500)); return l.classList.contains('on') && l.style.transform === a; });
      check(lampeFixe, 'film : la lampe reste allumée sous le curseur immobile');
      if (BOUCLES.includes(2)) {
        await page.evaluate(() => { const y = document.getElementById('profil').getBoundingClientRect().top + scrollY; const l = window.__lenis; if (l && l.scrollTo) l.scrollTo(y, { immediate: true, force: true }); else scrollTo(0, y); });
        const b = await page.waitForFunction(() => { const v = document.querySelector('.film-b.on'); return v && !v.paused && /boucle-2\.(webm|mp4)$/.test(v.currentSrc); }, null, { timeout: 20000 }).then(() => true, () => false);
        check(b, 'film : arrêté sur le Profil, la boucle vivante du chapitre se lance');
      }
    }
    await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
    const h = await page.waitForFunction(() => /^0[5-7]:/.test(document.getElementById('hd-heure-t').textContent), null, { timeout: 15000 }).then(() => true, () => false);
    check(h, `nuit de veille : l’heure du quart avance avec le défilement (${await page.textContent('#hd-heure-t')})`);
    check((await page.textContent('#bilan')).length > 20, 'nuit de veille : bilan du quart affiché au contact');
    if (film) {
      const pl = await page.waitForFunction(() => [...document.querySelectorAll('.film-i')].findIndex(v => v.classList.contains('on')) === 6, null, { timeout: 8000 }).then(() => true, () => false);
      check(pl, 'film : en bas de page, c’est l’image du lever du soleil qui est à l’écran');
      // rechargement : la page revient en haut, même si l'adresse porte une ancre
      await page.evaluate(() => { location.hash = 'projets'; }); await page.waitForTimeout(300);
      await page.reload(); await page.waitForFunction(() => document.documentElement.classList.contains('nuit-ok') && !document.documentElement.classList.contains('ld-on'), null, { timeout: 30000 }).catch(() => {}); await page.waitForTimeout(1200);
      const haut = await page.evaluate(() => [Math.round(scrollY), location.hash]);
      check(haut[0] < 40 && haut[1] === '', `rechargement : retour en haut de page, ancre retirée (${haut.join(' ')})`);
    }
    await page.evaluate(() => scrollTo(0, 0)); await page.waitForTimeout(1500);
  }
  await page.screenshot({ path: path.join(OUT, 'accueil-nuit.png') });
  await page.evaluate(() => document.querySelector('.pill-btn[data-open="0"]').click()); await page.waitForTimeout(1600);
  await page.click('#ov-share'); await page.waitForTimeout(400);
  const shared = await page.evaluate(() => navigator.clipboard.readText());
  check(shared === 'https://chaheennsi.github.io/portfolio2026/p/vigie/', `partager un projet : lien copié (${shared})`);
  check(errors.length === 0, `nuit de veille et partage sans erreur (${errors.join(' | ') || 'rien'})`);
  await ctx.close();
}

// 1 bis a. fichiers du film : tout ce que la page peut demander est présent
{
  const manque = [];
  for (let i = 0; i < 6; i++) for (const x of ['.webm', '.mp4', '-p.webm', '-p.mp4']) if (!existsSync(path.join(ROOT, 'v', `film-${i}${x}`))) manque.push(`film-${i}${x}`);
  for (let i = 0; i <= 6; i++) for (const x of ['.jpg', '-p.jpg']) if (!existsSync(path.join(ROOT, 'v', `film-${i}${x}`))) manque.push(`film-${i}${x}`);
  for (const k of BOUCLES) for (const x of ['.webm', '.mp4', '-p.webm', '-p.mp4']) if (!existsSync(path.join(ROOT, 'v', `boucle-${k}${x}`))) manque.push(`boucle-${k}${x}`);
  check(manque.length === 0, `film : plans, images d’arrêt et boucles (${BOUCLES.join(', ') || 'aucune'}) présents (${manque.join(', ') || 'rien ne manque'})`);
}

// 1 bis c. téléphone en hauteur : le film est recadré sur le sujet (fichiers portrait)
{
  const { ctx, page, errors } = await open({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'fr-FR' });
  await page.waitForFunction(() => document.documentElement.classList.contains('nuit-ok'), null, { timeout: 30000 }).catch(() => {});
  if (await page.evaluate(() => document.documentElement.classList.contains('film'))) {
    const p = await page.waitForFunction(() => { const im = document.querySelector('.film-i.on'); return im && /film-0-p\.jpg$/.test(im.src) && im.naturalWidth > 0; }, null, { timeout: 15000 }).then(() => true, () => false);
    const v = await page.evaluate(() => [...document.querySelectorAll('.film-v source')].map(s => s.src.split('/').pop()));
    check(p && v.every(x => /-p\.(webm|mp4)$/.test(x)), `téléphone : film recadré en hauteur (image ${p ? 'portrait' : 'absente'}, vidéos ${v.join(', ') || 'pas encore'})`);
    check(errors.length === 0, `téléphone : film sans erreur (${errors.join(' | ') || 'rien'})`);
  }
  await ctx.close();
}

// 1 bis b. mode léger : sur un appareil modeste, le film devient des images fixes en fondu, sans aucune vidéo
{
  const { ctx, page, errors } = await open({ viewport: { width: 390, height: 844 }, locale: 'fr-FR', modeste: true });
  await page.waitForFunction(() => document.documentElement.classList.contains('nuit-ok'), null, { timeout: 30000 }).catch(() => {});
  if (await page.evaluate(() => document.documentElement.classList.contains('film'))) {
    await page.waitForTimeout(2500);
    const a = await page.evaluate(() => [document.documentElement.classList.contains('leger'), document.querySelectorAll('.film-v').length, [...document.querySelectorAll('.film-i')].findIndex(v => v.classList.contains('on'))]);
    await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
    const fin = await page.waitForFunction(() => [...document.querySelectorAll('.film-i')].findIndex(v => v.classList.contains('on')) === 6 && document.querySelectorAll('.film-v').length === 0, null, { timeout: 10000 }).then(() => true, () => false);
    check(a[0] && a[1] === 0 && a[2] === 0 && fin, `mode léger : images fixes sans vidéo, de l’accueil au lever du soleil (${a.join(', ')}, fin ${fin})`);
    check(errors.length === 0, `mode léger : aucune erreur (${errors.join(' | ') || 'rien'})`);
  }
  await ctx.close();
}

// 1 ter. visuels : bandeau illustré et boucle animée de chaque fiche projet
{
  const { ctx, page, errors } = await open({ viewport: { width: 1440, height: 900 }, locale: 'fr-FR' });
  for (const [i, id] of [[0, 'vigie'], [1, 'silverfort'], [2, 'smsi'], [3, 'hackathon']]) {
    await page.evaluate(n => document.querySelector(`.pill-btn[data-open="${n}"]`).click(), i);
    const ok = await page.waitForFunction(n => { const a = document.getElementById('ov-art'), im = document.getElementById('ov-art-img'); return !a.hidden && a.classList.contains('on') && im.src.includes('/v/' + n) && im.naturalWidth >= 1200; }, id, { timeout: 8000 }).then(() => true, () => false);
    check(ok, `fiche ${id} : bandeau illustré affiché`);
    // boucle animée : seulement pour les fiches dont les fichiers vidéo sont dans v/ (les quatre : grand et petit écran, MP4 et WebM)
    if (existsSync(path.join(ROOT, 'v', id + '.mp4'))) {
      check(['.webm', '-s.mp4', '-s.webm'].every(x => existsSync(path.join(ROOT, 'v', id + x))), `fiche ${id} : les quatre fichiers de la boucle sont présents`);
      const joue = await page.waitForFunction(n => { const v = document.getElementById('ov-art-vid'); return document.getElementById('ov-art').classList.contains('play') && !v.paused && v.currentTime > 0.2 && v.videoWidth >= 1000 && v.currentSrc.includes('/v/' + n + '.'); }, id, { timeout: 12000 }).then(() => true, () => false);
      check(joue, `fiche ${id} : la boucle animée se lance`);
    }
    if (i === 0) await page.screenshot({ path: path.join(OUT, 'fiche-vigie.png') });
    await page.evaluate(() => document.getElementById('ov-close').click()); await page.waitForTimeout(300);
  }
  // la fermeture est animée : on attend son terme au lieu d'un délai fixe (le rendu logiciel des tests est lent)
  const ferme = await page.waitForFunction(() => document.getElementById('ov').hidden && document.getElementById('ov-art-vid').paused, null, { timeout: 9000 }).then(() => true, () => false);
  check(ferme, 'ouvrir puis fermer des fiches à la suite : tout se referme, la vidéo s’arrête');
  check(errors.length === 0, `visuels sans erreur (${errors.join(' | ') || 'rien'})`);
  await ctx.close();
}
// sur téléphone : la version légère de la boucle, et rien du tout si le visiteur a demandé moins d’animations
if (existsSync(path.join(ROOT, 'v', 'vigie.mp4'))) {
  const tel = await open({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, locale: 'fr-FR' });
  await tel.page.evaluate(() => document.querySelector('.pill-btn[data-open="0"]').click());
  const leger = await tel.page.waitForFunction(() => { const v = document.getElementById('ov-art-vid'); return document.getElementById('ov-art').classList.contains('play') && !v.paused && /\/v\/vigie-s\.(mp4|webm)$/.test(v.currentSrc); }, null, { timeout: 12000 }).then(() => true, () => false);
  check(leger, 'téléphone : la fiche Vigie joue la version légère de la boucle');
  check(tel.errors.length === 0, `boucle sur téléphone sans erreur (${tel.errors.join(' | ') || 'rien'})`);
  await tel.ctx.close();
  const calme = await open({ viewport: { width: 1440, height: 900 }, locale: 'fr-FR', reducedMotion: 'reduce' });
  await calme.page.evaluate(() => document.querySelector('.pill-btn[data-open="0"]').click()); await calme.page.waitForTimeout(3000);
  check(await calme.page.evaluate(() => { const a = document.getElementById('ov-art'), v = document.getElementById('ov-art-vid'); return a.classList.contains('on') && !a.classList.contains('play') && !v.firstChild; }), 'animations réduites : image fixe, aucune vidéo chargée');
  await calme.ctx.close();
}

// 1 quater. sans WebGL : la nuit reste, en version fixe (dégradé, phare dessiné), et rien ne casse
{
  const sans = await chromium.launch({ args: ['--disable-gpu', '--disable-webgl', '--disable-webgl2', '--disable-3d-apis'] });
  const { page, errors } = await open({ viewport: { width: 1440, height: 900 }, locale: 'fr-FR' }, '', sans);
  const repli = await page.waitForFunction(() => document.documentElement.classList.contains('nuit-sans') || document.documentElement.classList.contains('film'), null, { timeout: 20000 }).then(() => true, () => false);
  const filmSans = repli && await page.evaluate(() => document.documentElement.classList.contains('film'));
  if (filmSans) {
    check(await page.evaluate(() => document.querySelectorAll('.film-i').length === 7 && getComputedStyle(document.querySelector('.hero-name')).visibility === 'visible'), 'sans WebGL : le film ne dépend pas de la 3D, il est là');
    check(errors.length === 0, `sans WebGL : aucune erreur (${errors.join(' | ') || 'rien'})`);
  } else if (repli) {
    await page.waitForTimeout(1500);
    const e = await page.evaluate(() => [getComputedStyle(document.querySelector('.hero-name')).visibility, getComputedStyle(document.querySelector('.xp-media')).display, getComputedStyle(document.querySelector('.nuit-phare')).display, getComputedStyle(document.querySelector('.veille')).display]);
    check(e[0] === 'visible' && e[1] === 'none' && e[2] === 'block' && e[3] === 'none', `sans WebGL : nuit fixe, nom visible, phare dessiné, pas de compteur (${e.join(', ')})`);
    await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
    const h = await page.waitForFunction(() => /^0[5-7]:/.test(document.getElementById('hd-heure-t').textContent), null, { timeout: 10000 }).then(() => true, () => false);
    check(h, 'sans WebGL : l’heure du quart avance quand même avec le défilement');
    check(errors.length === 0, `sans WebGL : aucune erreur (${errors.join(' | ') || 'rien'})`);
    await page.evaluate(() => scrollTo(0, 0)); await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(OUT, 'accueil-sans-webgl.png') });
  } else console.log('--    WebGL impossible à couper sur cette machine (repli non vérifié ici)');
  await sans.close();
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
  const mlEn = await page.evaluate(() => { const m = document.getElementById('mentions'); return m ? m.innerText : ''; });
  check(/Legal notice/.test(mlEn) && /Host:/.test(mlEn) && /GitHub/.test(mlEn) && !/Hébergeur/.test(mlEn), 'les mentions légales sont traduites en anglais');
  { const dr = await page.evaluate(() => { const t = document.body.innerText + ' ' + [...document.querySelectorAll('[aria-label],[title]')].map(e => (e.getAttribute('aria-label') || '') + ' ' + (e.getAttribute('title') || '')).join(' '); const m = t.match(/.{0,30}\bdrone\b.{0,30}/i); return m ? m[0] : ''; });
    check(!dr, `anglais : le compagnon s’appelle Root partout dans le texte visible (${dr || 'aucun « drone »'})`); }
  await ctx.close();
}
// 3 ter. vitesse plafonnée de la molette (Chromium ; Firefox et WebKit plus bas)
await molette('Chromium');
// 3 bis. mentions légales : à la toute fin de la page, avec l’éditeur, l’hébergeur et l’adresse de contact
{
  const { ctx, page } = await open({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce', locale: 'fr-FR' });
  const ml = await page.evaluate(() => { const m = document.getElementById('mentions'); if (!m) return null; const r = m.getBoundingClientRect(), suite = [...document.querySelectorAll('main *')].filter(e => e.offsetHeight > 0 && !m.contains(e) && !e.contains(m) && (m.compareDocumentPosition(e) & Node.DOCUMENT_POSITION_FOLLOWING) && e.getBoundingClientRect().top >= r.bottom - 1 && e.innerText && e.innerText.trim());
    return { texte: m.innerText, mail: (document.getElementById('ml-mail') || {}).textContent || '', apres: suite.length }; });
  check(!!ml && /Mentions légales/.test(ml.texte) && /Éditeur/.test(ml.texte) && /Chahé Papazian/.test(ml.texte) && /Hébergeur/.test(ml.texte) && /GitHub, Inc\./.test(ml.texte) && /Données personnelles/.test(ml.texte), 'les mentions légales sont présentes (éditeur, hébergeur, données personnelles)');
  check(!!ml && /@/.test(ml.mail) && ml.apres === 0, `les mentions légales donnent une adresse de contact et ferment la page (${ml ? ml.apres : '?'} texte après elles)`);
  { const dr = await page.evaluate(() => { const t = document.body.innerText + ' ' + [...document.querySelectorAll('[aria-label],[title]')].map(e => (e.getAttribute('aria-label') || '') + ' ' + (e.getAttribute('title') || '')).join(' '); const m = t.match(/.{0,30}\bdrone\b.{0,30}/i); return m ? m[0] : ''; });
    check(!dr, `français : le compagnon s’appelle Root partout dans le texte visible (${dr || 'aucun « drone »'})`); }
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
  await page.click('.os-lk-tid');
  // on attend le déverrouillage réel plutôt qu’une durée fixe (les machines de test sont lentes)
  const ouvert = await page.waitForFunction(() => document.querySelector('.os-lock').classList.contains('gone'), null, { timeout: 10000 }).then(() => true, () => false);
  check(ouvert, 'ChahéOS : Touch ID déverrouille la session');
  await page.screenshot({ path: path.join(OUT, 'chaheos.png') });
  await page.click('.os-logo'); await page.click('.os-mb >> text=Verrouiller'); await page.waitForTimeout(600);
  await page.keyboard.press('Escape');
  // on attend la fin réelle de la fermeture plutôt qu’une durée fixe (le décor 3D en rendu logiciel ralentit les machines de test)
  const rendu = await page.waitForFunction(() => document.getElementById('rx').hidden && ![...document.body.children].some(e => e.inert), null, { timeout: 10000 }).then(() => true, () => false);
  check(rendu, 'ChahéOS fermé : le site redevient utilisable');
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

// 5 bis. décor vivant : le film reste attaché à la page (il ne finit seul qu'une arrivée toute proche), les boucles se relaient sans recharger,
// et le décor repart après un refus de lecture (iPhone en économie d'énergie) ou une coupure réseau
const allerA = (page, sel, decale = 0) => page.evaluate(([sel, decale]) => { const y = document.querySelector(sel).getBoundingClientRect().top + scrollY + decale * innerHeight; const l = window.__lenis; if (l && l.scrollTo) l.scrollTo(y, { immediate: true, force: true }); else scrollTo(0, y); }, [sel, decale]);
const boucleJoue = (page, k, ms) => page.waitForFunction(k => { const v = document.querySelector('.film-b.on'); return !!v && !v.paused && new RegExp(`boucle-${k}(-p)?\\.(webm|mp4)$`).test(v.currentSrc) && v.currentTime > .05; }, k, { timeout: ms }).then(() => true, () => false);
// Vitesse plafonnée : en insistant sur la molette pendant 2 s (80 crans de 120 px, soit 9 600 px demandés), la page avance sans dépasser une allure de lecture
// (un écran par seconde, entre 650 et 1100 px/s) ; un cran isolé, lui, défile comme avant. Les crans sont émis dans la page, à cadence exacte.
async function molette(nom, br = browser) {
  const { ctx, page } = await open({ viewport: { width: 1440, height: 900 }, locale: 'fr-FR', modeste: true }, '', br);
  await page.waitForTimeout(1500);
  if (!(await page.evaluate(() => !!window.Lenis && document.documentElement.classList.contains('lenis')))) { console.log(`--    ${nom} : pas de défilement fluide ici, vitesse plafonnée non contrôlée`); await ctx.close(); return; }
  const geste = (crans, dy, pas, attente) => page.evaluate(([crans, dy, pas, attente]) => new Promise(res => { const y0 = scrollY, t0 = performance.now(); let i = 0; const cible = document.elementFromPoint(700, 450) || document.body;
    const un = () => { cible.dispatchEvent(new WheelEvent('wheel', { deltaY: dy, deltaMode: 0, bubbles: true, cancelable: true, clientX: 700, clientY: 450 })); if (++i < crans) setTimeout(un, pas); else { const d = performance.now() - t0; setTimeout(() => res({ dist: Math.round(scrollY - y0), geste: Math.round(d) }), attente); } }; un(); }), [crans, dy, pas, attente]);
  const cran = await geste(1, 100, 25, 2200);
  check(cran.dist >= 55 && cran.dist <= 110, `${nom} : un cran de molette isolé défile comme avant (${cran.dist} px)`);
  await page.evaluate(() => scrollTo(0, 0)); await page.waitForTimeout(1200);
  const fort = await geste(80, 120, 25, 1500), plafond = Math.max(650, Math.min(1100, 900)), maxi = Math.round(plafond * (fort.geste / 1000 + .7) * 1.1);
  check(fort.dist >= 350 && fort.dist <= maxi, `${nom} : en insistant ${(fort.geste / 1000).toFixed(1)} s sur la molette, la page avance sans s'emballer (${fort.dist} px, plafond ${maxi} px ; sans plafond : environ 9 000 px)`);
  await ctx.close();
}
async function decorVivant(nom, br = browser) {
  const { ctx, page } = await open({ viewport: { width: 1440, height: 900 }, locale: 'fr-FR' }, '', br);
  if (!(await page.evaluate(() => document.documentElement.classList.contains('film') && !document.getElementById('film').classList.contains('leger')))) { console.log(`--    ${nom} : décor en images fixes ici, contrôles du film sautés`); await ctx.close(); return; }
  if (BOUCLES.includes(2)) {
    // LE FILM RESTE ATTACHÉ À LA PAGE. Arrêté au milieu du chapitre entre l'accueil et le Profil, il reste sur l'image que la page demande. (Avant, il partait seul jusqu'au
    // décor suivant ; à la reprise, le défilement ne changeait plus rien au décor tant que la page ne l'avait pas rattrapé : jusqu'à deux écrans « dans le vide ».)
    // Ensuite, en avançant par petits pas, chaque pas fait avancer le décor ; et quand la page se pose près du Profil, le film finit seul l'arrivée, sans jamais reculer.
    await page.evaluate(() => { const p = document.getElementById('profil').getBoundingClientRect().top + scrollY, y = (innerHeight * .82 + p - innerHeight * .62) / 2; const l = window.__lenis; if (l && l.scrollTo) l.scrollTo(y, { immediate: true, force: true }); else scrollTo(0, y); });
    const suivi = await page.evaluate(async () => { const filmT = () => { const c = document.getElementById('film'); const v = c && [...c.querySelectorAll('.film-v')].find(x => x.classList.contains('on')); const m = v && /film-(\d)/.exec(v.currentSrc || ''); return m ? +m[1] * 10 + v.currentTime : null; };
      const att = ms => new Promise(r => setTimeout(r, ms)), boucle = () => { const b = document.querySelector('.film-b.on'); return !!b && !b.paused && /boucle-2(-p)?\./.test(b.currentSrc) && b.currentTime > .05; };
      // (on laisse d'abord le film rejoindre la page : stable pendant 1,2 s, au plus 15 s d'attente)
      { let a = filmT(), n = 0; const d0 = performance.now(); while (n < 8 && performance.now() - d0 < 15000) { await att(150); const t = filmT(); n = t !== null && a !== null && Math.abs(t - a) < .02 ? n + 1 : 0; a = t; } }
      const t1 = filmT(); await att(4500); const t2 = filmT(), reste = t1 !== null && t2 !== null && Math.abs(t2 - t1) < .3 && !document.querySelector('.film-b.on');
      const p = document.getElementById('profil').getBoundingClientRect().top + scrollY, y0 = scrollY; let av = t2, recul = 0, morts = 0, pas = 0, ok = false, avant = false;
      for (let i = 1; i <= 16 && !ok; i++) { scrollTo(0, y0 + i * 60); pas = i; const d0 = performance.now(), ta = av; let bouge = false;
        while (performance.now() - d0 < 1700 && !ok) { await att(150); const t = filmT(); if (t !== null && av !== null && t < av - .3) recul++; if (t !== null && ta !== null && t > ta + .08) bouge = true; if (t !== null) av = t; if (boucle()) { ok = true; avant = p - scrollY > innerHeight * .46; } }
        if (!bouge && !ok) morts++; }
      const d1 = performance.now(); while (!ok && performance.now() - d1 < 20000) { await att(150); const t = filmT(); if (t !== null && av !== null && t < av - .3) recul++; if (t !== null) av = t; if (boucle()) ok = true; }
      return { reste, t1: t1 && +t1.toFixed(2), t2: t2 && +t2.toFixed(2), pas, morts, recul, ok, avant }; });
    check(suivi.reste, `${nom} : arrêté au milieu d'un chapitre, le film reste sur l'image de la page, il ne part plus seul en avant (${suivi.t1} s puis ${suivi.t2} s)`);
    check(suivi.morts === 0, `${nom} : à la reprise, chaque petit pas de 60 px fait avancer le décor, aucun défilement sans effet (${suivi.morts} pas sans effet sur ${suivi.pas})`);
    check(suivi.ok && suivi.recul === 0, `${nom} : posé près du Profil, le film finit seul l'arrivée puis sa boucle part, sans reculer (${JSON.stringify({ ok: suivi.ok, recul: suivi.recul, avantLePalier: suivi.avant })})`);
    // le tableau vivant (WebGL, sur la boucle) : à l'arrêt, l'image s'anime d'elle-même. Sur une machine trop lente (rendu logiciel), il se retire et laisse la boucle : c'est prévu.
    const tv = await page.evaluate(async () => { if (!document.createElement('canvas').getContext('webgl')) return { etat: 'sans WebGL' }; const c = document.querySelector('.film-eau'); if (!c) return { etat: 'pas de calque' };
      let vu = false, n0 = 0; const t0 = performance.now();
      while (performance.now() - t0 < 25000) { await new Promise(r => setTimeout(r, 150));
        if (c.classList.contains('plein') && c.classList.contains('on')) { if (!vu) { vu = true; n0 = c._n | 0; } else if ((c._n | 0) >= n0 + 2) return { etat: 'montré', vu, taille: c.width + 'x' + c.height, fondu: c.classList.contains('net') ? 'fondu court' : 'fondu long', err: c.getContext('webgl').getError() }; }
        if (c.dataset.vivant === 'retire') return { etat: vu ? 'montré, puis retiré (machine trop lente pour lui)' : 'retiré', vu, err: 0 }; }
      return { etat: 'jamais montré', vu, vivant: c.dataset.vivant, classes: c.className }; });
    if (tv.etat === 'sans WebGL') console.log(`--    ${nom} : pas de WebGL ici, tableau vivant non contrôlé`);
    else check(tv.vu && !tv.err, `${nom} : au Profil, le tableau vivant s'affiche et s'anime (${tv.etat}${tv.taille ? ', ' + tv.taille : ''}${tv.fondu ? ', ' + tv.fondu : ''})`);
    if (tv.vu) { const b = await page.evaluate(() => { const v = document.querySelector('.film-b.on'); return !!v && !v.paused; }); check(b, `${nom} : sous le tableau vivant, la boucle continue (elle reprend la main s'il se retire)`); }
    // un arrêt retient le film : en avançant la page par petits pas depuis le Profil, le décor reste d'abord sur l'arrêt, puis le quitte pour de bon.
    // (Avant, dès le premier pas hors du palier, le film avançait d'un souffle, s'arrêtait, puis revenait se reposer sur l'arrêt : le décor disparaissait et revenait.)
    await allerA(page, '#profil');
    if (await boucleJoue(page, 2, 20000)) {
      const pas = await page.evaluate(async () => { const surArret = () => { const b = document.querySelector('.film-b.on'); return !!b && /boucle-2(-p)?\./.test(b.currentSrc); }, att = ms => new Promise(r => setTimeout(r, ms));
        const y0 = scrollY; let parti = 0;
        for (let i = 1; i <= 20 && !parti; i++) { scrollTo(0, y0 + i * 30); const t0 = performance.now(); while (performance.now() - t0 < 2200) { await att(150); if (!surArret()) { parti = i * 30; break; } } }
        if (!parti) return { ok: false, raison: "le décor n'a jamais quitté l'arrêt en 600 px" };
        const t1 = performance.now(); while (performance.now() - t1 < 7000) { await att(150); if (surArret()) return { ok: false, parti, raison: `revenu sur l'arrêt ${Math.round(performance.now() - t1)} ms après l'avoir quitté` }; }
        return { ok: true, parti }; });
      check(pas.ok, `${nom} : par petits pas depuis le Profil, le décor quitte l'arrêt une seule fois, sans y revenir (${JSON.stringify(pas)})`);
    } else check(false, `${nom} : la boucle du Profil ne part pas (contrôle des petits pas impossible)`);
    if (BOUCLES.includes(3)) {
      // relais : la boucle du Parcours part, puis revenir au Profil retrouve sa boucle sans la recharger
      await allerA(page, '#profil'); await boucleJoue(page, 2, 20000);
      await allerA(page, '#parcours'); const b3 = await boucleJoue(page, 3, 20000);
      // la balise qui garde la boucle du Profil ne doit ni être vidée ni rechargée (les autres peuvent préparer l'arrêt suivant)
      await page.evaluate(() => { window.__vide = 0; window.__b2 = [...document.querySelectorAll('.film-b')].find(v => /boucle-2(-p)?\./.test(v.currentSrc)) || null; if (window.__b2) window.__b2.addEventListener('emptied', () => window.__vide++); });
      await allerA(page, '#profil'); const b2 = await boucleJoue(page, 2, 12000); const vide = await page.evaluate(() => window.__b2 && document.querySelector('.film-b.on') === window.__b2 ? window.__vide : 'autre balise');
      check(b3 && b2 && vide === 0, `${nom} : les boucles se relaient (Parcours puis retour au Profil) sans recharger la vidéo (${b3}, ${b2}, ${vide} rechargement(s))`);
    }
  }
  await ctx.close();
}
await decorVivant('film');
if (BOUCLES.includes(0)) {
  // lecture refusée jusqu'au premier geste (comme un iPhone en économie d'énergie) : au premier toucher, la boucle de l'accueil part
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'fr-FR' });
  if (CDN_LOCAL) await ctx.route('https://cdn.jsdelivr.net/npm/**', async route => { const rel = new URL(route.request().url()).pathname.replace('/npm/', ''); try { await route.fulfill({ body: await readFile(path.join(CDN_LOCAL, rel)), contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' } }); } catch { await route.abort(); } });
  await ctx.addInitScript(QUIET); await ctx.addInitScript(`try{Object.defineProperty(navigator,'hardwareConcurrency',{get:()=>8})}catch(e){}`);
  await ctx.addInitScript(() => { let geste = false; addEventListener('click', () => { geste = true; }, true); const p0 = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () { if (geste) return p0.call(this); return Promise.reject(new DOMException('refus simulé', 'NotAllowedError')); }; });
  const page = await ctx.newPage(); await page.goto(BASE); await page.waitForFunction(() => document.documentElement.classList.contains('ready'), null, { timeout: 45000 }); await page.waitForTimeout(5000);
  const avant = await page.evaluate(() => !!document.querySelector('.film-b.on'));
  await page.evaluate(() => document.body.dispatchEvent(new MouseEvent('click', { bubbles: true })));
  const apres = await boucleJoue(page, 0, 8000);
  check(!avant && apres, `film : lecture refusée jusqu'au premier geste, la boucle de l'accueil part au premier toucher (${avant} puis ${apres})`);
  await ctx.close();
}
if (BOUCLES.includes(2)) {
  // coupure réseau : la boucle du Profil échoue une première fois (WebM et MP4), le décor la relance tout seul
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'fr-FR' });
  if (CDN_LOCAL) await ctx.route('https://cdn.jsdelivr.net/npm/**', async route => { const rel = new URL(route.request().url()).pathname.replace('/npm/', ''); try { await route.fulfill({ body: await readFile(path.join(CDN_LOCAL, rel)), contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' } }); } catch { await route.abort(); } });
  await ctx.addInitScript(QUIET); await ctx.addInitScript(`try{Object.defineProperty(navigator,'hardwareConcurrency',{get:()=>8})}catch(e){}`);
  const vus = new Set(); await ctx.route(/\/v\/boucle-2\.(webm|mp4)$/, route => { const k = route.request().url().split('.').pop(); if (!vus.has(k)) { vus.add(k); return route.abort('connectionreset'); } return route.continue(); });
  const page = await ctx.newPage(); await page.goto(BASE); await page.waitForFunction(() => document.documentElement.classList.contains('ready'), null, { timeout: 45000 }); await page.waitForTimeout(2500);
  // (sur une machine très lente, la remise en haut de page du chargement peut arriver après ce saut : on le refait tant que la page n'y est pas)
  for (let i = 0; i < 5; i++) { await allerA(page, '#profil'); await page.waitForTimeout(900); if (await page.evaluate(() => scrollY > 200)) break; }
  const ok = await boucleJoue(page, 2, 25000);
  check(ok && vus.size > 0, `film : après une coupure réseau sur la boucle du Profil, le décor la relance tout seul (${ok}, ${[...vus].join('+') || 'aucune coupure'})`);
  await ctx.close();
}

// 6. autres moteurs : Firefox et WebKit (le moteur de Safari) — affichage, CSP, fiche projet (avec ou sans WebGL : le site doit tenir dans les deux cas)
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
    if (await page.evaluate(() => document.documentElement.classList.contains('film'))) {
      const im = await page.waitForFunction(() => { const i = document.querySelector('.film-i.on'); return i && i.complete && i.naturalWidth > 0; }, null, { timeout: 15000 }).then(() => true, () => false);
      check(im, `${nom} ${vp.width}px : l’image du film est affichée derrière le nom`);
    }
    await page.screenshot({ path: path.join(OUT, `${nom.split(' ')[0].toLowerCase()}-${vp.width}.png`) });
    if (!mob) {
      check(await page.evaluate(() => document.documentElement.dataset.theme) === 'dark', `${nom} : thème nuit`);
      await page.evaluate(() => document.querySelector('.pill-btn[data-open="1"]').click()); await page.waitForTimeout(1800);
      check(await page.evaluate(() => !document.getElementById('ov').hidden && /Silverfort/.test(document.getElementById('ov-title').textContent)), `${nom} : la fiche d’un projet s’ouvre`);
      await page.screenshot({ path: path.join(OUT, `${nom.split(' ')[0].toLowerCase()}-fiche.png`) });
    }
    await ctx.close();
  }
  await molette(nom, br);
  if (type === firefox) await decorVivant(nom, br);
  await br.close();
}

await browser.close(); server.close();
console.log(fails.length ? `\n${fails.length} vérification(s) en échec.` : '\nTout est bon.');
process.exit(fails.length ? 1 : 0);
