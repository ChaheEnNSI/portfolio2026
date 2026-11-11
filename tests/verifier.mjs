// Vérifications automatiques du portfolio, lancées à chaque envoi sur GitHub (voir .github/workflows/qualite.yml).
// Sert le dépôt comme GitHub Pages (sous /portfolio2026/), puis contrôle dans Chromium :
// erreurs JavaScript, règle de sécurité (CSP), accessibilité (axe), décor 3D « nuit de veille », partage, ChahéOS, fichiers annexes ;
// puis un passage rapide dans Firefox et WebKit (Safari) quand ils sont installés (toujours en CI).
// Usage local : npm i --no-save playwright axe-core && npx playwright install chromium firefox webkit && node tests/verifier.mjs
import http from 'node:http';
import { readFile, mkdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
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
  check(nuit, 'nuit de veille : le décor 3D est actif');
  const t1 = await page.evaluate(() => [document.documentElement.dataset.theme, getComputedStyle(document.body).backgroundColor, document.getElementById('nuit').width > 300]);
  check(t1[0] === 'dark' && t1[1] === 'rgb(7, 12, 28)' && t1[2], `nuit de veille : fond de nuit pour tous, même si l’appareil préfère le clair (${t1.join(', ')})`);
  if (nuit) {
    for (const x of [300, 360, 420, 480]) { await page.mouse.move(x, 300); await page.waitForTimeout(350); }
    const tenu = await page.waitForFunction(() => /Vous tenez|You hold/.test(document.getElementById('veille-t').textContent), null, { timeout: 8000 }).then(() => true, () => false);
    check(tenu, 'nuit de veille : la souris prend le faisceau en main');
    const lit = await page.waitForFunction(() => { const c = [...document.querySelectorAll('.hero-name .ch')].map(e => parseFloat(e.style.getPropertyValue('--l'))); return c.some(v => v > .6) && c.some(v => v < .4); }, null, { timeout: 12000 }).then(() => true, () => false);
    check(lit, 'nuit de veille : le faisceau éclaire les lettres du nom, pas tout le nom d’un coup');
    await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
    const h = await page.waitForFunction(() => /^0[5-7]:/.test(document.getElementById('hd-heure-t').textContent), null, { timeout: 15000 }).then(() => true, () => false);
    check(h, `nuit de veille : l’heure du quart avance avec le défilement (${await page.textContent('#hd-heure-t')})`);
    check((await page.textContent('#bilan')).length > 20, 'nuit de veille : bilan du quart affiché au contact');
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
  const repli = await page.waitForFunction(() => document.documentElement.classList.contains('nuit-sans'), null, { timeout: 20000 }).then(() => true, () => false);
  if (repli) {
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
    await page.screenshot({ path: path.join(OUT, `${nom.split(' ')[0].toLowerCase()}-${vp.width}.png`) });
    if (!mob) {
      check(await page.evaluate(() => document.documentElement.dataset.theme) === 'dark', `${nom} : thème nuit`);
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
