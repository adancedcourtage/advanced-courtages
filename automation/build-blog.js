// build-blog.js
// ─────────────────────────────────────────────────────────────
// Convertit les articles Markdown localisés (content-output/.../local/)
// en pages HTML au design du site tnsconseils.com, écrites dans blog/,
// et (re)génère blog/index.html. Applique un GARDE-FOU CONFORMITÉ :
// tout article contenant une formulation interdite est IGNORÉ (non publié)
// et listé dans le rapport — la machine ne publie jamais un contenu à risque.
//
// Lancement : node build-blog.js
// Chemins (relatifs à ce fichier) :
//   - Entrée : ./content-output/<derniere-date>/local/<ville-theme>/blog.md
//   - Sortie : ../blog/<ville-theme>.html  +  ../blog/index.html
// (Pensé pour tourner depuis un sous-dossier "automation/" du dépôt du site.)
// ─────────────────────────────────────────────────────────────

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { marked } from "marked";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = join(__dirname, "content-output");
const BLOG_DIR = join(__dirname, "..", "blog");        // blog/ à la racine du dépôt site
const SIMULATOR_PATH = "/simulateur";                  // lien du lead magnet

// ── Garde-fou conformité : motifs interdits (secteur assurance) ──
// Si l'un est détecté SANS nuance, l'article n'est pas publié.
const FORBIDDEN = [
  /rembours[ée]s?\s+à\s+100\s*%/i,          // "remboursé à 100%" sans nuance
  /garanti[e]?\s+(?:sans condition|à vie|à 100)/i,
  /(?:le|la)\s+meilleur[e]?\b/i,             // superlatif absolu
  /\bn°?\s*1\b/i,                            // "n°1"
  /\bimbattable\b/i,
  /\brévolutionnaire\b/i,
  /\bgain garanti\b/i,
];
// Nuances qui "rachètent" une occurrence de 100% (contexte 100% Santé, etc.)
const SOFTENERS = /selon (?:votre|le) contrat|100\s*%\s*santé|dispositif 100\s*%/i;

function checkCompliance(md) {
  const issues = [];
  for (const rx of FORBIDDEN) {
    const m = md.match(rx);
    if (m) {
      // tolérance si une nuance est présente dans la même phrase-ish
      if (rx.source.includes("100") && SOFTENERS.test(md)) continue;
      issues.push(m[0]);
    }
  }
  return issues;
}

// ── Parsing d'un article Markdown généré ────────────────────────
function parseArticle(md) {
  // retire le commentaire HTML d'en-tête éventuel
  md = md.replace(/^<!--[\s\S]*?-->\s*/, "").trim();
  const lines = md.split("\n");

  // Titre H1
  const h1Index = lines.findIndex((l) => /^#\s+/.test(l));
  const title = h1Index >= 0 ? lines[h1Index].replace(/^#\s+/, "").trim() : "Article TNS Conseils";

  // Méta-description
  let metaDesc = "";
  const metaIdx = lines.findIndex((l) => /méta-description/i.test(l));
  if (metaIdx >= 0) {
    metaDesc = lines[metaIdx].replace(/.*méta-description[^:]*:\s*/i, "").replace(/\*/g, "").trim();
    if (!metaDesc && lines[metaIdx + 1]) metaDesc = lines[metaIdx + 1].replace(/\*/g, "").trim();
  }

  // Corps = tout sauf le H1, la ligne méta, et les hr "---"
  const bodyLines = [];
  let chapo = "";
  for (let i = 0; i < lines.length; i++) {
    if (i === h1Index) continue;
    if (metaIdx >= 0 && (i === metaIdx || i === metaIdx + 1)) continue;
    const l = lines[i];
    if (/^-{3,}\s*$/.test(l)) continue;              // séparateurs
    if (!chapo && l.trim() && !/^#{1,6}\s/.test(l)) chapo = l.trim(); // 1er paragraphe = chapô
    bodyLines.push(l);
  }

  if (!metaDesc) metaDesc = chapo.slice(0, 155);
  const bodyHtml = marked.parse(bodyLines.join("\n"));
  return { title, metaDesc, chapo, bodyHtml };
}

// ── Gabarit HTML (repris du design des articles existants) ──────
function renderPage({ title, metaDesc, chapo, bodyHtml, related = [] }) {
  const relatedHtml = related.length
    ? `<div class="mt-14 border-t border-slate-300 pt-8"><p class="text-xs font-black uppercase tracking-[.2em] text-[#a87c2f]">À lire aussi</p><ul class="mt-4 grid gap-2 list-none pl-0">${related
        .map(
          (r) =>
            `<li><a href="${r.file}" class="text-slate-800 underline decoration-[#d2ad63] underline-offset-4">${escapeHtml(r.title)}</a></li>`
        )
        .join("")}</ul></div>`
    : "";
  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="description" content="${escapeAttr(metaDesc)}" />
  <title>${escapeHtml(title)} | TNS Conseils</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
  <script src="https://cdn.tailwindcss.com"></script>
  <style>body{margin:0;background:#050b14;color:#eef3f8;font-family:Inter,sans-serif}.serif{font-family:Cormorant Garamond,serif}.article p{line-height:1.9;color:#475569;margin-top:1.1rem}.article h2{font-family:Cormorant Garamond,serif;font-size:2.4rem;line-height:1.05;margin-top:2.6rem;color:#0f172a}.article h3{font-weight:800;color:#0f172a;margin-top:1.8rem}.article ul,.article ol{margin-top:1rem;display:grid;gap:.75rem;color:#475569;padding-left:0}.article li{border-left:2px solid #d2ad63;padding-left:1rem;list-style:none}.article a{color:#a87c2f;font-weight:600}</style>
</head>
<body>
  <header class="border-b border-white/10 bg-[#050b14] px-5 py-5"><div class="mx-auto flex max-w-5xl items-center justify-between"><a href="../index.html" class="text-sm font-black uppercase tracking-[.24em] text-[#f4dfb2]">TNS Conseils</a><a href="${SIMULATOR_PATH}" class="bg-[#d2ad63] px-5 py-3 text-xs font-black uppercase tracking-[.18em] text-[#050b14]">Check-up gratuit</a></div></header>
  <main>
    <section class="relative overflow-hidden bg-[#071426] px-5 py-20"><div class="mx-auto max-w-5xl"><p class="text-xs font-black uppercase tracking-[.34em] text-[#d2ad63]">Prévoyance TNS</p><h1 class="serif mt-5 max-w-4xl text-4xl font-semibold leading-none md:text-6xl">${escapeHtml(title)}</h1><p class="mt-7 max-w-2xl text-lg leading-8 text-white/68">${escapeHtml(chapo)}</p></div></section>
    <article class="article bg-[#f6f0e5] px-5 py-16 text-slate-950"><div class="mx-auto max-w-3xl">
      ${bodyHtml}
      ${relatedHtml}
      <div class="mt-12 bg-[#071426] p-8 text-white"><p class="serif text-3xl font-semibold">Votre couverture est-elle vraiment adaptée&nbsp;?</p><a href="${SIMULATOR_PATH}" class="mt-6 inline-flex bg-[#d2ad63] px-6 py-4 text-xs font-black uppercase tracking-[.2em] text-[#071426]">Faire mon check-up gratuit</a></div>
    </div></article>
  </main>
</body>
</html>
`;
}

function escapeHtml(s = "") { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function escapeAttr(s = "") { return escapeHtml(s).replace(/"/g, "&quot;"); }

// ── Index du blog (liste tous les .html du dossier blog) ────────
function buildIndex() {
  const files = readdirSync(BLOG_DIR).filter((f) => f.endsWith(".html") && f !== "index.html");
  const cards = files.map((f) => {
    const html = readFileSync(join(BLOG_DIR, f), "utf-8");
    const t = (html.match(/<title>([^<]*)<\/title>/) || [])[1] || f;
    const d = (html.match(/name="description" content="([^"]*)"/) || [])[1] || "";
    const title = t.replace(/\s*\|\s*TNS Conseils\s*$/, "");
    return `<a href="${f}" class="block border border-white/10 bg-[#071426] p-6 transition hover:border-[#d2ad63]/50"><h2 class="serif text-2xl font-semibold text-white">${escapeHtml(title)}</h2><p class="mt-3 text-sm leading-6 text-white/60">${escapeHtml(d)}</p></a>`;
  });
  const page = `<!doctype html>
<html lang="fr">
<head>
  <meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="description" content="Le blog TNS Conseils : prévoyance, mutuelle et protection sociale des travailleurs non salariés, par ville et par département." />
  <title>Blog prévoyance TNS par ville | TNS Conseils</title>
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
  <script src="https://cdn.tailwindcss.com"></script>
  <style>body{margin:0;background:#050b14;color:#eef3f8;font-family:Inter,sans-serif}.serif{font-family:Cormorant Garamond,serif}</style>
</head>
<body>
  <header class="border-b border-white/10 bg-[#050b14] px-5 py-5"><div class="mx-auto flex max-w-5xl items-center justify-between"><a href="../index.html" class="text-sm font-black uppercase tracking-[.24em] text-[#f4dfb2]">TNS Conseils</a><a href="${SIMULATOR_PATH}" class="bg-[#d2ad63] px-5 py-3 text-xs font-black uppercase tracking-[.18em] text-[#050b14]">Check-up gratuit</a></div></header>
  <main class="mx-auto max-w-5xl px-5 py-16">
    <p class="text-xs font-black uppercase tracking-[.34em] text-[#d2ad63]">Ressources</p>
    <h1 class="serif mt-4 text-5xl font-semibold md:text-6xl">Prévoyance & protection des TNS</h1>
    <p class="mt-6 max-w-2xl text-lg leading-8 text-white/68">Nos analyses pour les indépendants, par ville et par département. Faites le point sur votre couverture en 2 minutes.</p>
    <div class="mt-12 grid gap-5 sm:grid-cols-2">${cards.join("")}</div>
  </main>
</body>
</html>
`;
  writeFileSync(join(BLOG_DIR, "index.html"), page, "utf-8");
  return files.length;
}

const SITE = "https://tnsconseils.com";

// Titre lisible d'un article publié (depuis sa balise <title>).
function articleTitle(file) {
  const html = readFileSync(join(BLOG_DIR, file), "utf-8");
  const t = (html.match(/<title>([^<]*)<\/title>/) || [])[1] || file;
  return t.replace(/\s*\|\s*TNS Conseils\s*$/, "");
}

// Liste des articles du blog (hors index) : { file, title }.
function existingArticles() {
  return readdirSync(BLOG_DIR)
    .filter((f) => f.endsWith(".html") && f !== "index.html")
    .map((f) => ({ file: f, title: articleTitle(f) }));
}

// sitemap.xml (racine du dépôt) + robots.txt si absent → indexation plus rapide.
function buildSitemap() {
  const REPO_ROOT = join(__dirname, "..");
  const urls = new Set([`${SITE}/`, `${SITE}/simulateur/`, `${SITE}/blog/`]);
  for (const f of readdirSync(REPO_ROOT)) {
    // pages HTML de la racine, en excluant les sauvegardes "index-old…"
    if (f.endsWith(".html") && !/^index[ -]/.test(f) && f !== "index.html")
      urls.add(`${SITE}/${f}`);
  }
  for (const f of readdirSync(BLOG_DIR)) {
    if (f.endsWith(".html") && f !== "index.html") urls.add(`${SITE}/blog/${f}`);
  }
  const today = new Date().toISOString().slice(0, 10);
  const body = [...urls]
    .map((u) => `  <url><loc>${u}</loc><lastmod>${today}</lastmod></url>`)
    .join("\n");
  writeFileSync(
    join(REPO_ROOT, "sitemap.xml"),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`,
    "utf-8"
  );
  // robots.txt : ne crée que s'il n'existe pas (on ne touche pas à d'éventuelles règles).
  const robots = join(REPO_ROOT, "robots.txt");
  if (!existsSync(robots)) {
    writeFileSync(robots, `User-agent: *\nAllow: /\nSitemap: ${SITE}/sitemap.xml\n`, "utf-8");
  }
  return urls.size;
}

// Prend jusqu'à `n` articles au hasard parmi `list`, en excluant `selfFile`.
function pickRelated(list, selfFile, n = 3) {
  const pool = list.filter((a) => a.file !== selfFile);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, n);
}

// ── Trouve le dernier dossier de production local ───────────────
function latestLocalDir() {
  if (!existsSync(CONTENT_DIR)) return null;
  const dates = readdirSync(CONTENT_DIR).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort().reverse();
  for (const d of dates) {
    const local = join(CONTENT_DIR, d, "local");
    if (existsSync(local)) return local;
  }
  return null;
}

// ── Programme principal ─────────────────────────────────────────
function main() {
  const localDir = latestLocalDir();
  if (!localDir) {
    console.log("Aucun contenu local à publier (lance d'abord: node generate.js --local ...).");
    return;
  }
  if (!existsSync(BLOG_DIR)) mkdirSync(BLOG_DIR, { recursive: true });

  const pairs = readdirSync(localDir).filter((f) => statSync(join(localDir, f)).isDirectory());
  let published = 0;
  const skipped = [];
  const articles = existingArticles(); // pour le maillage interne (s'enrichit au fil des publications)

  for (const pair of pairs) {
    const mdPath = join(localDir, pair, "blog.md");
    if (!existsSync(mdPath)) continue;
    const md = readFileSync(mdPath, "utf-8");

    const issues = checkCompliance(md);
    if (issues.length) {
      skipped.push({ pair, issues });
      console.log(`⛔ IGNORÉ (conformité) : ${pair} → ${issues.join(", ")}`);
      continue;
    }

    const parsed = parseArticle(md);
    const outFile = `${pair}.html`;
    const related = pickRelated(articles, outFile, 3);
    writeFileSync(join(BLOG_DIR, outFile), renderPage({ ...parsed, related }), "utf-8");
    if (!articles.some((a) => a.file === outFile))
      articles.push({ file: outFile, title: parsed.title });
    console.log(`✅ Publié : blog/${outFile}`);
    published++;
  }

  const total = buildIndex();
  const sm = buildSitemap();
  console.log(`\n📄 ${published} article(s) publié(s), ${skipped.length} ignoré(s). Index: ${total} articles. Sitemap: ${sm} URLs.`);
  if (skipped.length) {
    console.log("À relire manuellement (bloqués par le garde-fou conformité) :");
    skipped.forEach((s) => console.log(`  - ${s.pair} : ${s.issues.join(", ")}`));
  }
}

main();
