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
const BOUCLES = (() => { try { const m = /const FILM_BOUCLES ?= ?\[([\d, ]*)\]/.exec(readFileSync(path.join(ROOT, 'index.html'), 'utf8')); return m ? m[1].split(',').map(x => x.trim()).filter(Boolean).map(Number) : []; } catch { return []; } })();
await mkdir(OUT, { recursive: true });
// WebGL logiciel : les machines de test n’ont pas de carte graphique, le décor 3D doit quand même tourner
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

// la visite guidée et l’écran de chargement ne gênent pas les tests
// (window.__glLogiciel : ces contrôles tournent sans vraie carte graphique ; sans ce repère, la page ne créerait pas la toile du décor et on ne vérifierait plus rien d'elle)
const QUIET = "window.__glLogiciel=true;try{sessionStorage.setItem('ld-skip','1');localStorage.setItem('tour-offer','no')}catch(e){}";
// pour contrôler l'ouverture : la page la joue (pas de « ld-skip »), et un témoin note ce qui s'est montré (faisceau, éclat, place de la lampe, durée)
const AVEC_OUVERTURE = "window.__glLogiciel=true;try{localStorage.setItem('tour-offer','no')}catch(e){};window.__ouv={vu:false,iMax:0,lampe:null,t0:0,t1:0,n:0,u0:9,u1:-9,v0:9,v1:-9,w0:1e9,w1:0,h1:0};new MutationObserver(()=>{const o=window.__ouv,f=document.querySelector('.allum-f'),d=document.querySelector('.allum-l.phare');if(f){if(!o.vu){o.vu=true;o.t0=performance.now()}o.iMax=Math.max(o.iMax,+f.style.opacity||0)}if(d&&!o.lampe){const b=d.getBoundingClientRect();o.lampe={x:Math.round(b.left+b.width/2),y:Math.round(b.top+b.height/2)}}if(d&&f){const im=document.querySelector('.film-i.on')||document.querySelector('.film-i'),r=im&&im.getBoundingClientRect();if(r&&r.width>50){const b=d.getBoundingClientRect(),u=(b.left+b.width/2-r.left)/r.width,v=(b.top+b.height/2-r.top)/r.height;o.n++;o.u0=Math.min(o.u0,u);o.u1=Math.max(o.u1,u);o.v0=Math.min(o.v0,v);o.v1=Math.max(o.v1,v);o.w0=Math.min(o.w0,r.width);o.w1=Math.max(o.w1,r.width);o.h1=Math.max(o.h1,r.height)}}if(o.vu&&!f&&!o.t1)o.t1=performance.now()}).observe(document,{childList:true,subtree:true,attributes:true,attributeFilter:['style']})";
const CSP_SPY = "window.__csp=[];document.addEventListener('securitypolicyviolation',e=>window.__csp.push(e.violatedDirective+' '+e.blockedURI))";

// hors ligne : CDN_LOCAL=<dossier> sert les bibliothèques npm exactes depuis le disque (mêmes octets, mêmes empreintes)
const CDN_LOCAL = process.env.CDN_LOCAL;
async function open(opts, query = '', br = browser) {
  const ctx = await br.newContext(opts);
  if (CDN_LOCAL) await ctx.route('https://cdn.jsdelivr.net/npm/**', async route => {
    const rel = new URL(route.request().url()).pathname.replace('/npm/', '');
    try { await route.fulfill({ body: await readFile(path.join(CDN_LOCAL, rel)), contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' } }); } catch { await route.abort(); }
  });
  await ctx.addInitScript(opts.intro ? AVEC_OUVERTURE : QUIET); await ctx.addInitScript(CSP_SPY);
  if (opts.calme) await ctx.addInitScript("try{localStorage.setItem('calm','1')}catch(e){}");
  await ctx.addInitScript(`try{Object.defineProperty(navigator,'hardwareConcurrency',{get:()=>${opts.modeste ? 2 : 8}});Object.defineProperty(navigator,'deviceMemory',{get:()=>${opts.modeste ? 2 : 8}})}catch(e){}`);
  const page = await ctx.newPage(); const errors = [];
  // LENT=n : processeur ralenti n fois (Chromium seulement), pour rejouer ici une machine d'essai très lente avant de publier
  if (process.env.LENT && br === browser) { try { const cdp = await ctx.newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: +process.env.LENT }); } catch {} }
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
    // (sur une machine trop lente pour elle, le régulateur de cadence éteint la toile du décor, donc son faisceau : il n'y a alors rien à contrôler ici.
    //  On ne l'admet qu'après avoir attendu le faisceau douze secondes, et seulement si la toile est bien au repos.)
    const toileEteinte = !lit && film && await page.evaluate(() => { const t = document.querySelector('.film-eau'); return !!t && t.classList.contains('repos'); });
    if (toileEteinte) console.log('--    nuit de veille : machine trop lente ici, toile du décor éteinte par le régulateur ; faisceau sur le nom non contrôlé');
    else check(lit, 'nuit de veille : le faisceau éclaire les lettres du nom, pas tout le nom d’un coup');
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
// 3 quater. L'OUVERTURE : le phare ouvre le site. À l'entrée, sa lampe s'allume sur la lanterne de l'image d'accueil, son faisceau fait le tour de l'écran et le noir se retire
// derrière lui ; à la fin rien ne reste par-dessus la page, et le texte d'accueil est en place. (Tout en CSS : contrôlé sur les trois moteurs et sur téléphone.)
async function ouverture(nom, br = browser, tel = false) {
  const { ctx, page, errors } = await open(tel ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2, locale: 'fr-FR', intro: true } : { viewport: { width: 1440, height: 900 }, locale: 'fr-FR', intro: true }, '', br);
  const fini = await page.waitForFunction(() => document.getElementById('loader').classList.contains('done'), null, { timeout: 30000 }).then(() => true, () => false);
  await page.waitForTimeout(1800);
  const r = await page.evaluate(() => { const o = window.__ouv || {}, h = document.documentElement, sum = document.querySelector('.hero-sum'), n = document.querySelector('.hero-name');
    return { film: h.classList.contains('film'), vu: !!o.vu, iMax: +(o.iMax || 0).toFixed(2), lampe: o.lampe, suivi: { n: o.n | 0, dx: +((o.u1 - o.u0) * o.w1).toFixed(1), dy: +((o.v1 - o.v0) * o.h1).toFixed(1), zoom: o.w0 > 0 && o.w0 < 1e8 ? +((o.w1 / o.w0 - 1) * 100).toFixed(1) : 0 }, duree: o.t1 && o.t0 ? Math.round(o.t1 - o.t0) : -1, reste: !!document.querySelector('.allum-f, .allum-l.phare'), ldOn: h.classList.contains('ld-on') || h.classList.contains('ld-pre'),
      sum: sum ? +(+getComputedStyle(sum).opacity).toFixed(2) : -1, nom: !!n && n.getBoundingClientRect().height > 20, w: innerWidth, hh: innerHeight }; });
  if (!r.film) { console.log(`--    ${nom} : pas de film ici, ouverture au phare non contrôlée`); await ctx.close(); return; }
  check(fini && r.vu && r.iMax > .9 && !!r.lampe && r.lampe.x > 0 && r.lampe.x < r.w && r.lampe.y > 0 && r.lampe.y < r.hh * .6, `${nom} : à l'entrée, la lampe du phare s'allume et son faisceau fait le tour de l'écran (lampe en ${r.lampe ? r.lampe.x + ', ' + r.lampe.y : '?'}, éclat ${r.iMax}, ${r.duree} ms)`);
  // la lampe reste sur la lanterne : le décor fait un zoom arrière pendant l'ouverture, et la lampe doit garder exactement la même place DANS l'image d'accueil
  // (avant, elle était posée une fois pour toutes : elle finissait à 18 px de la lanterne sur un écran d'ordinateur, 31 px sur un écran très large)
  check(r.suivi.n >= 5 && r.suivi.dx <= 2.5 && r.suivi.dy <= 2.5, `${nom} : pendant l'ouverture, la lampe reste posée sur la lanterne pendant que le décor recule (écart au pire ${r.suivi.dx} px en largeur, ${r.suivi.dy} px en hauteur, sur ${r.suivi.n} relevés ; le décor a reculé de ${r.suivi.zoom} %)`);
  check(fini && !r.reste && !r.ldOn && r.sum > .9 && r.nom && !errors.length, `${nom} : après l'ouverture, rien ne reste par-dessus la page et le texte d'accueil est en place (${JSON.stringify({ reste: r.reste, ecranEntree: r.ldOn, paragraphe: r.sum, nom: r.nom, erreurs: errors.slice(0, 2) })})`);
  await ctx.close();
}
await ouverture('Chromium'); await ouverture('téléphone', browser, true);
// « Cliquer pour passer » : on passe l'ouverture d'un clic en plein tour, puis d'une touche juste avant le relais. Elle s'accélère, ne part qu'une fois, ne laisse rien
// par-dessus la page ; le nom et le texte sont en place et la page défile.
for (const [quand, geste, attente] of [['en plein tour', 'clic', 900], ['juste avant le relais', 'touche', 2300]]) {
  const { ctx, page, errors } = await open({ viewport: { width: 1440, height: 900 }, locale: 'fr-FR', intro: true });
  const vu = await page.waitForFunction(() => window.__ouv && window.__ouv.vu, null, { timeout: 30000, polling: 'raf' }).then(() => true, () => false);
  if (!vu) { console.log(`--    ouverture passée ${quand} : pas de faisceau d'ouverture ici, non contrôlé`); await ctx.close(); continue; }
  await page.waitForTimeout(attente); if (geste === 'clic') await page.mouse.click(700, 500); else await page.keyboard.press('Space');
  const fini = await page.waitForFunction(() => document.getElementById('loader').classList.contains('done'), null, { timeout: 30000 }).then(() => true, () => false);
  await page.waitForTimeout(2200);
  const r = await page.evaluate(async () => { const h = document.documentElement, sum = document.querySelector('.hero-sum'), ch = [...document.querySelectorAll('.hero-name .ch')];
    const nom = ch.length > 0 && ch.every(c => { const b = c.getBoundingClientRect(), p = c.parentElement.getBoundingClientRect(); return b.height > 8 && b.top < p.bottom - 2; });
    scrollTo(0, 300); await new Promise(r => setTimeout(r, 500)); const dy = Math.round(scrollY); scrollTo(0, 0);
    return { reste: document.querySelectorAll('.allum-f, .allum-l.phare').length, ecranEntree: h.classList.contains('ld-on') || h.classList.contains('ld-pre'), nom, paragraphe: sum ? +(+getComputedStyle(sum).opacity).toFixed(2) : -1, defile: dy }; });
  check(fini && r.reste === 0 && !r.ecranEntree && r.nom && r.paragraphe > .9 && r.defile > 200 && !errors.length, `ouverture passée d'${geste === 'clic' ? 'un clic' : 'une touche'} ${quand} : rien ne reste par-dessus la page, le nom et le texte sont en place, la page défile (${JSON.stringify({ ...r, erreurs: errors.slice(0, 2) })})`);
  await ctx.close();
}
// en mode calme (réglage gardé d'une visite à l'autre), pas de faisceau qui tourne à l'entrée : le noir se lève simplement
{ const { ctx, page, errors } = await open({ viewport: { width: 1440, height: 900 }, locale: 'fr-FR', intro: true, calme: true });
  const fini = await page.waitForFunction(() => document.getElementById('loader').classList.contains('done'), null, { timeout: 30000 }).then(() => true, () => false);
  await page.waitForTimeout(800);
  const r = await page.evaluate(() => ({ calme: document.documentElement.classList.contains('calm'), vu: !!(window.__ouv && window.__ouv.vu), reste: !!document.querySelector('.allum-f, .allum-l.phare'), ldOn: document.documentElement.classList.contains('ld-on') }));
  check(fini && r.calme && !r.vu && !r.reste && !r.ldOn && !errors.length, `mode calme : à l'entrée, pas de faisceau qui tourne, le noir se lève simplement (${JSON.stringify(r)}${errors.length ? ', ' + errors[0] : ''})`);
  await ctx.close(); }
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

// 5 bis. décor vivant : le film ne se fige pas (il continue seul jusqu'à l'arrêt suivant), les boucles se relaient sans recharger,
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
    // arrêté entre l'accueil et le Profil : le film continue seul, sans jamais reculer, jusqu'à l'arrêt du Profil, dont la boucle part
    // au milieu du chapitre entre l'accueil et le Profil (le film y est à mi-chemin entre deux arrêts, quel que soit le navigateur)
    await page.evaluate(() => { const p = document.getElementById('profil').getBoundingClientRect().top + scrollY, y = (innerHeight * .82 + p - innerHeight * .62) / 2; const l = window.__lenis; if (l && l.scrollTo) l.scrollTo(y, { immediate: true, force: true }); else scrollTo(0, y); });
    const suivi = await page.evaluate(async () => { const filmT = () => { const c = document.getElementById('film'); const v = c && [...c.querySelectorAll('.film-v')].find(x => x.classList.contains('on')); const m = v && /film-(\d)/.exec(v.currentSrc || ''); return m ? +m[1] * 10 + v.currentTime : null; }; let av = null, recul = 0; const t0 = performance.now();
      while (performance.now() - t0 < 30000) { await new Promise(r => setTimeout(r, 150)); const t = filmT(); if (t !== null && av !== null && t < av - .3) recul++; if (t !== null) av = t;   // (un recalcul des repères des chapitres peut déplacer le film de 0,2 s : ce n'est pas un recul)
        const b = document.querySelector('.film-b.on'); if (b && !b.paused && /boucle-2(-p)?\./.test(b.currentSrc) && b.currentTime > .05) return { ok: true, recul, t: av }; }
      return { ok: false, recul, t: av }; });
    check(suivi.ok && suivi.recul === 0, `${nom} : arrêté entre deux chapitres, le film continue seul jusqu'au Profil puis sa boucle part, sans reculer (${JSON.stringify(suivi)})`);
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
    // le régulateur de cadence : on reste 22 s sur l'arrêt. Soit la toile tient (elle dessine, à un niveau quelconque), soit la machine est trop lente pour elle et elle
    // s'éteint : alors elle ne dessine plus du tout, ne couvre plus rien, et la boucle vidéo continue seule. (Avant, « retirée », elle effaçait et présentait encore une
    // image à chaque tour : sur une machine sans carte graphique, la page restait quatre fois plus lente.)
    if (tv.vu) { const rg = await page.evaluate(async () => { const att = ms => new Promise(r => setTimeout(r, ms)), c = document.querySelector('.film-eau'); await att(22000);
        const n0 = c._n | 0, repos = c.classList.contains('repos'); let ips = 0, on = true; const f = () => { ips++; if (on) requestAnimationFrame(f); }; requestAnimationFrame(f); await att(3000); on = false;
        const b = document.querySelector('.film-b.on'); return { niveau: c.dataset.qualite ?? '2', repos, reposFin: c.classList.contains('repos'), dessins: (c._n | 0) - n0, visible: getComputedStyle(c).visibility, boucle: !!b && !b.paused, ips: +(ips / 3).toFixed(1),
          detail: [...document.querySelectorAll('.film-b')].map(v => [...v.classList].filter(x => /^(on|net|coupe)$/.test(x)).join('.') + (v.paused ? ' en pause' : ' en lecture') + ' état ' + v.readyState + ' à ' + v.currentTime.toFixed(1) + ' s').join(' | ') + ' ; y ' + Math.round(scrollY) }; });
      check(rg.repos && rg.reposFin ? rg.dessins === 0 && rg.visible === 'hidden' && rg.boucle : rg.repos !== rg.reposFin || rg.dessins > 0, `${nom} : le régulateur de cadence règle la toile sur la machine (${rg.repos && rg.reposFin ? 'trop lente ici : toile éteinte (' + rg.visible + '), ' + rg.dessins + ' dessin en 3 s, boucle ' + (rg.boucle ? 'en lecture' : 'ARRÊTÉE OU ABSENTE : ' + rg.detail) : 'niveau ' + rg.niveau + ', ' + (rg.dessins / 3).toFixed(0) + ' dessins/s'} ; page à ${rg.ips} images/s)`); }
    // un arrêt retient le film : en avançant la page par petits pas depuis la fin du Profil, le décor reste d'abord sur l'arrêt, puis le quitte pour de bon.
    // (Le Profil se lit en entier sur son décor : on part donc de 150 px avant l'endroit où le film commence son trajet vers le Parcours.)
    // (Avant, dès le premier pas hors du palier, le film avançait d'un souffle, s'arrêtait, puis revenait se reposer sur l'arrêt : le décor disparaissait et revenait.)
    await allerA(page, '#profil');
    if (await boucleJoue(page, 2, 20000)) {
      const pas = await page.evaluate(async () => { const surArret = () => { const b = document.querySelector('.film-b.on'); return !!b && /boucle-2(-p)?\./.test(b.currentSrc); }, att = ms => new Promise(r => setTimeout(r, ms));
        const pf = document.querySelector('#profil'), yFin = Math.round(document.querySelector('#parcours').getBoundingClientRect().top + scrollY - (parseFloat(getComputedStyle(pf).paddingBottom) || 0) - innerHeight * .45);
        scrollTo(0, yFin - 150); await att(1500); if (!surArret()) return { ok: false, raison: "150 px avant la fin du Profil, le décor n'est déjà plus sur son arrêt", yFin };
        const y0 = scrollY; let parti = 0;
        for (let i = 1; i <= 20 && !parti; i++) { scrollTo(0, y0 + i * 30); const t0 = performance.now(); while (performance.now() - t0 < 2200) { await att(150); if (!surArret()) { parti = i * 30; break; } } }
        if (!parti) return { ok: false, raison: "le décor n'a jamais quitté l'arrêt en 600 px" };
        const t1 = performance.now(); while (performance.now() - t1 < 7000) { await att(150); if (surArret()) return { ok: false, parti, raison: `revenu sur l'arrêt ${Math.round(performance.now() - t1)} ms après l'avoir quitté` }; }
        return { ok: true, parti }; });
      check(pas.ok, `${nom} : par petits pas depuis la fin du Profil, le décor quitte l'arrêt une seule fois, sans y revenir (${JSON.stringify(pas)})`);
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

// 5 ter. JAMAIS D'IMAGE FIXE, JAMAIS DE DÉFILEMENT DANS LE VIDE. Entre deux chapitres, il y a un écran sans contenu. Si on s'y arrête, le film continue (vraies images, puis
// décor animé) et la page l'accompagne jusqu'au chapitre suivant : on ne reste pas sur une image fixe, et on n'a pas à traverser ensuite un écran où rien ne répond.
// Un geste rend la main. Avec du texte à l'écran, la page ne bouge jamais seule (mais le décor, lui, continue de vivre).
async function ecransVides(nom, br = browser, tel = false) {
  const { ctx, page } = await open(tel ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2, locale: 'fr-FR' } : { viewport: { width: 1440, height: 900 }, locale: 'fr-FR' }, '', br);
  if (!(await page.evaluate(() => { const h = document.documentElement; return h.classList.contains('film') && !h.classList.contains('leger') && !!document.querySelector('#film video'); }))) { console.log(`--    ${nom} : pas de film ici, écrans vides non contrôlés`); await ctx.close(); return; }
  // (les gestes du doigt : de vrais événements tactiles quand le moteur sait en fabriquer, sinon des événements qui en ont la forme)
  const OUTILS = `window.__ev = { att: ms => new Promise(r => setTimeout(r, ms)),
    images(n, ms) { const t0 = performance.now(); return new Promise(r => { let k = 0; const f = () => { if (++k >= n && performance.now() - t0 >= ms) r(); else requestAnimationFrame(f); }; requestAnimationFrame(f); }); },   // au moins n images de la page ET ms millisecondes
    doigt(type) { const el = document.body, fin = type === 'touchend'; let ev;
      try { const pt = new Touch({ identifier: 1, target: el, clientX: 190, clientY: 420 }); ev = new TouchEvent(type, { bubbles: true, cancelable: true, touches: fin ? [] : [pt], targetTouches: fin ? [] : [pt], changedTouches: [pt] }); }
      catch (e) { const pt = { identifier: 1, target: el, clientX: 190, clientY: 420, pageX: 190, pageY: 420 + scrollY }; ev = new Event(type, { bubbles: true, cancelable: true }); for (const [k, v] of [['touches', fin ? [] : [pt]], ['targetTouches', fin ? [] : [pt]], ['changedTouches', [pt]]]) Object.defineProperty(ev, k, { value: v }); }
      el.dispatchEvent(ev); },
    filmT() { const c = document.getElementById('film'), v = c && [...c.querySelectorAll('.film-v')].find(x => x.classList.contains('on')), m = v && /film-(\\d)/.exec(v.currentSrc || ''); return m ? +m[1] * 10 + v.currentTime : null; },
    boucle() { const b = document.querySelector('.film-b.on'); return b && !b.paused && b.currentTime > .05 ? (/boucle-(\\d)/.exec(b.currentSrc) || [0, '?'])[1] : ''; },
    vide() { const h = innerHeight, a = h * .2, b = h * .8; for (const el of document.querySelectorAll('main h1, main h2, main h3, main h4, main p, main li, main a, main button, main img, main svg, main canvas, main video, main .pc-card, main .fc, main .stat, main .chips, main .mail, footer p, footer a')) { const r = el.getBoundingClientRect(); if (r.width > 2 && r.height > 2 && r.bottom > a && r.top < b) { const c = getComputedStyle(el); if (c.visibility !== 'hidden' && +c.opacity > .05) return false; } } return true; },
    // on arrive à y en descendant, comme quelqu'un qui fait défiler puis s'arrête (le film continue dans le sens où l'on allait)
    aller(y) { try { if (typeof lenis !== 'undefined' && lenis && lenis.scrollTo) { lenis.scrollTo(y, { immediate: true, force: true }); return; } } catch (e) {} scrollTo(0, y); },   // (un saut direct pendant que le défilement doux anime encore une molette serait annulé)
    // (la position est relue juste après le saut : sur une machine lente, le temps de laisser passer quelques images, la page a déjà commencé à accompagner le film)
    async venir(y, d = -260) { let ici = -1; for (let k = 0; k < 3; k++) { this.aller(y + d); await this.images(6, 450); this.aller(y); await this.images(1, 60); ici = Math.round(scrollY); if (Math.abs(ici - y) <= 20) break; await this.att(1500); } await this.images(4, 340); return ici; } };`;   // (si une molette précédente s'achève encore, on attend qu'elle soit finie et on recommence)
  await page.evaluate(OUTILS);
  if (!(await page.waitForFunction(() => window.__ev.boucle() !== '', null, { timeout: 15000 }).then(() => true, () => false))) { console.log(`--    ${nom} : les vidéos ne se lisent pas ici, écrans vides non contrôlés`); await ctx.close(); return; }
  // l'écran vide entre le Parcours et les Projets. Il finit quand le premier contenu des Projets entre dans la bande centrale de l'écran (à 80 % de sa hauteur) : on le
  // calcule sur la mise en page, sans faire défiler, et on s'arrête 200 px avant (l'écran vide fait au moins 500 px). Avant, on le cherchait en balayant la page : une
  // machine lente prenait pour « vide » un passage du Parcours dont les cartes n'avaient pas fini d'apparaître, et le contrôle s'arrêtait au mauvais endroit.
  // (Le début de l'écran vide, lui, ne se calcule pas ainsi : la frise du Parcours change de place en défilant.) On vérifie ensuite, sur place, que l'écran est bien vide.
  const zone = await page.evaluate(() => { let h = 1e9; for (const el of document.querySelectorAll('#projets :is(h1, h2, h3, h4, p, li, a, button, img, svg, canvas, video, .pc-card, .fc, .stat, .chips, .mail)')) { const r = el.getBoundingClientRect(); if (r.width > 2 && r.height > 2 && getComputedStyle(el).visibility !== 'hidden') h = Math.min(h, r.top + scrollY); }
    return { b: Math.round(h - innerHeight * .8) }; });
  if (!(zone.b > 1500 && zone.b < 1e8)) { check(false, `${nom} : écran vide entre le Parcours et les Projets introuvable (${JSON.stringify(zone)})`); await ctx.close(); return; }
  const ym = zone.b - 200;
  const r = await page.evaluate(async ym => { const E = window.__ev, y0 = await E.venir(ym), videIci = E.vide() || scrollY > ym + 30; await E.att(1100); const t1 = E.filmT(); await E.att(2500); const t2 = E.filmT(), b2 = E.boucle();
    let vivant = !!b2 || (t1 !== null && t2 !== null && Math.abs(t2 - t1) > .5), arrive = false, y = scrollY, calme = 0; const d0 = performance.now();
    // (arrivée : la boucle des Projets tourne, il y a du contenu à l'écran, et la page n'a plus bougé pendant trois relevés de suite)
    while (performance.now() - d0 < 45000) { await E.images(2, 250); const yn = scrollY, tn = E.filmT(); if (E.boucle() || (t1 !== null && tn !== null && Math.abs(tn - t1) > .5)) vivant = true; calme = Math.abs(yn - y) < 1 ? calme + 1 : 0; if (E.boucle() && !E.vide() && calme >= 3) { arrive = true; break; } y = yn; }
    return { ym, y0, videIci, y1: Math.round(scrollY), vivant, t1: t1 && +t1.toFixed(2), t2: t2 && +t2.toFixed(2), arrive, boucle: E.boucle(), vide: E.vide() }; }, ym);
  check(Math.abs(r.y0 - ym) < 40 && r.videIci && r.vivant && r.y1 - ym > 60 && r.arrive && r.boucle === '4', `${nom} : arrêté dans un écran vide, le décor continue de vivre et la page l'accompagne jusqu'aux Projets (${JSON.stringify(r)})`);
  // un geste rend la main : on revient dans l'écran vide, on attend que la page se remette à suivre, puis on remonte d'un geste ; la page ne repart pas vers le bas
  const g = await page.evaluate(async ([ym, tel]) => { const E = window.__ev, y0 = await E.venir(ym); let parti = false; const d0 = performance.now();
    while (performance.now() - d0 < 20000) { await E.att(100); if (scrollY - y0 > 30) { parti = true; break; } }
    if (!parti) return { parti, y0, y: Math.round(scrollY) };
    if (tel) { E.doigt('touchstart'); scrollBy(0, -40); E.doigt('touchmove'); } else document.body.dispatchEvent(new WheelEvent('wheel', { deltaY: -120, deltaMode: 0, bubbles: true, cancelable: true, clientX: 700, clientY: 450 }));
    const ya = scrollY; await E.att(240); const yb = scrollY; if (tel) E.doigt('touchend');
    return { parti, ya: Math.round(ya), yb: Math.round(yb) }; }, [ym, tel]);
  check(g.parti && g.yb <= g.ya + 3, `${nom} : pendant que la page accompagne le film, un geste rend la main tout de suite (${JSON.stringify(g)})`);
  // une fenêtre ouverte (la fiche d'un projet) : arrêté dans l'écran vide, la page ne glisse pas derrière elle, et le décor continue de vivre
  const f = await page.evaluate(async ym => { const E = window.__ev, y0 = await E.venir(ym); document.querySelector('.pill-btn[data-open="1"]').click(); await E.images(4, 600); const ouverte = !document.getElementById('ov').hidden, ya = scrollY; await E.images(16, 6000); const dy = Math.round(scrollY - ya);
    document.getElementById('ov-close').click(); await E.att(1800); return { y0, ouverte, dy, fermee: document.getElementById('ov').hidden }; }, ym);
  check(Math.abs(f.y0 - ym) < 40 && f.ouverte && Math.abs(f.dy) <= 2 && f.fermee, `${nom} : une fiche ouverte dans un écran vide, la page ne glisse pas derrière elle (${JSON.stringify(f)})`);
  // en remontant : arrêté dans l'écran vide, la page ne recule jamais toute seule (le film, lui, finit seul vers le décor d'avant)
  const h = await page.evaluate(async ym => { const E = window.__ev, y0 = await E.venir(ym, 260); await E.images(20, 7000); return { y0, dy: Math.round(scrollY - y0) }; }, ym);
  check(Math.abs(h.y0 - ym) < 40 && Math.abs(h.dy) <= 2, `${nom} : arrêté dans un écran vide en remontant, la page ne recule pas toute seule (${JSON.stringify(h)})`);
  // avec du texte à l'écran (au milieu du Profil), la page ne bouge pas seule, et le décor reste celui du Profil, animé (le film ne part plus vers le Parcours pendant qu'on lit)
  const t = await page.evaluate(async () => { const E = window.__ev, cible = Math.round(document.querySelector('#profil').getBoundingClientRect().top + scrollY + innerHeight * .45), ya = await E.venir(cible);
    // (on laisse au film le temps de rejoindre la page : il vient de loin, et sur une machine très lente il lui faut de longues secondes)
    { const d0 = performance.now(); while (E.boucle() !== '2' && performance.now() - d0 < 45000) await E.att(300); }
    await E.images(4, 1200); const y0 = scrollY, vide = E.vide(); await E.images(16, 6000); return { cible, ya, vide, dy: Math.round(scrollY - y0), boucle: E.boucle() }; });
  check(Math.abs(t.ya - t.cible) < 40 && !t.vide && Math.abs(t.dy) <= 2 && t.boucle === '2', `${nom} : au milieu du Profil, la page ne bouge pas toute seule et le décor du Profil reste animé pendant qu'on lit (${JSON.stringify(t)})`);
  await ctx.close();
}
await ecransVides('ordinateur'); await ecransVides('téléphone', browser, true);

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
  await ouverture(nom, br);
  if (type === firefox) { await decorVivant(nom, br); await ecransVides(nom, br); }
  if (type === webkit) await ecransVides(nom + ' téléphone', br, true);   // (la demande venait d'un iPhone : le moteur de Safari, en format téléphone)
  await br.close();
}

await browser.close(); server.close();
console.log(fails.length ? `\n${fails.length} vérification(s) en échec.` : '\nTout est bon.');
process.exit(fails.length ? 1 : 0);
