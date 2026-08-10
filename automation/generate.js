// generate.js
// ─────────────────────────────────────────────────────────────
// Machine à contenu TNS Conseils — Phase 2
//
// Ce que fait ce script à chaque lancement :
//   1. Lit la banque de thèmes (config/themes.json)
//   2. Choisit automatiquement N thèmes non utilisés depuis 8 semaines
//   3. Pour chaque thème, appelle l'API Google Gemini et génère 3 formats :
//      - Post LinkedIn
//      - Article de blog SEO
//      - Script vidéo courte (Darija)
//      en respectant le ton défini dans config/tone.md
//   4. Sauvegarde tout dans content-output/[date]/[theme-slug]/
//   5. Génère un summary.md récapitulatif à relire avant publication
//
// AUCUNE publication automatique. Tout est en fichiers Markdown à relire.
//
// Lancement :  node generate.js
// Options   :  node generate.js --themes 3   (forcer le nombre de thèmes)
//              node generate.js --theme delai-carence-arret-maladie  (thème précis)
//
// MODE LOCAL (SEO géolocalisé — article blog par ville, pointe vers /simulateur) :
//   node generate.js --local --zone pau            (1 ville × N thèmes)
//   node generate.js --local --all-zones           (toutes les zones × N thèmes)
//   node generate.js --local --max-zones 3          (3 villes les moins récentes — rythme "qualité")
//   node generate.js --local --zone dax --linkedin (ajoute aussi le post LinkedIn)
//   node generate.js --local --zone pau --theme delai-carence-arret-maladie
// ─────────────────────────────────────────────────────────────

import "dotenv/config";
import { GoogleGenAI } from "@google/genai";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { pickThemes, recordUsage } from "./lib/rotation.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Config & garde-fous ──────────────────────────────────────
const API_KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_MODEL || "gemini-flash-latest";
const THEMES_PER_RUN = parseInt(process.env.THEMES_PER_RUN || "2", 10);
const SIMULATOR_URL =
  process.env.SIMULATOR_URL || "https://tnsconseils.com/simulateur";

if (!API_KEY || API_KEY.includes("colle-ta-cle")) {
  console.error(
    "\n❌ Clé API manquante.\n" +
      "   1. Copie le fichier .env.example en .env\n" +
      "   2. Colle ta clé Google Gemini dans GEMINI_API_KEY=\n" +
      "   (clé gratuite sur https://aistudio.google.com/apikey)\n"
  );
  process.exit(1);
}

const genai = new GoogleGenAI({ apiKey: API_KEY });

// ── Petits helpers ───────────────────────────────────────────
function readConfigFile(relPath) {
  return readFileSync(join(__dirname, relPath), "utf-8");
}

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {
    count: THEMES_PER_RUN,
    only: null,
    local: false,
    zone: null,
    allZones: false,
    maxZones: null,
    linkedin: false,
  };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--themes" && args[i + 1]) {
      out.count = parseInt(args[i + 1], 10) || THEMES_PER_RUN;
      i++;
    } else if (args[i] === "--theme" && args[i + 1]) {
      out.only = args[i + 1];
      i++;
    } else if (args[i] === "--local") {
      out.local = true;
    } else if (args[i] === "--zone" && args[i + 1]) {
      out.zone = args[i + 1];
      i++;
    } else if (args[i] === "--all-zones") {
      out.allZones = true;
    } else if (args[i] === "--max-zones" && args[i + 1]) {
      out.maxZones = parseInt(args[i + 1], 10) || null;
      i++;
    } else if (args[i] === "--linkedin") {
      out.linkedin = true;
    }
  }
  return out;
}

// Les 3 formats à produire : clé de fichier + fichier prompt.
const FORMATS = [
  { key: "linkedin", label: "Post LinkedIn", promptFile: "prompts/linkedin_post.md", outFile: "linkedin.md" },
  { key: "blog", label: "Article de blog", promptFile: "prompts/blog_article.md", outFile: "blog.md" },
  { key: "video", label: "Script vidéo (Darija)", promptFile: "prompts/video_script.md", outFile: "video-script.md" },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Appel API pour un (thème × format), avec zone optionnelle ─
async function generateOne(theme, format, tone, zone = null) {
  const formatPrompt = readConfigFile(format.promptFile);

  const systemPrompt = [
    "Tu es le rédacteur de contenu de la marque TNS Conseils (Advanced Courtages Consulting), courtier en assurance santé/prévoyance pour travailleurs non salariés.",
    "Tu respectes STRICTEMENT le ton de marque et les garde-fous de conformité ci-dessous.",
    "Tu produis un contenu prêt à publier, sans jamais inventer de chiffres présentés comme certains.",
    "",
    "═══ TON DE MARQUE ═══",
    tone,
  ].join("\n");

  // Bloc de localisation (SEO local) injecté uniquement en mode --local.
  const zoneBlock = zone
    ? [
        "",
        "═══ LOCALISATION (SEO LOCAL) ═══",
        `Zone ciblée : ${zone.ville} (${zone.departement}, ${zone.code_dept}), région ${zone.region}.`,
        `Référence locale à citer : ${zone.reference_locale}.`,
        `Spécificité du tissu TNS local : ${zone.note_secteur}.`,
        "CONSIGNES DE LOCALISATION :",
        "- Le fond (problème, mécanisme, solution) reste 100% générique et exact : NE JAMAIS inventer de règle d'assurance, de chiffre ou d'aide propres à cette ville.",
        `- Mentionne « ${zone.ville} » dans le titre H1, dès le premier paragraphe, et dans au moins un intertitre H2.`,
        `- Fais du mot-clé principal une expression locale (ex. « prévoyance TNS ${zone.ville} » ou « mutuelle indépendant ${zone.ville} »).`,
        `- Cite naturellement la référence locale (${zone.reference_locale}) et, si c'est pertinent et exact, un clin d'œil au tissu économique local — sans inventer de statistique locale.`,
        "- Reste factuel et conforme : aucune promesse chiffrée garantie, toujours « selon votre contrat ».",
      ]
    : [];

  const userPrompt = [
    "═══ INSTRUCTIONS DE FORMAT ═══",
    formatPrompt,
    "",
    "═══ THÈME À TRAITER ═══",
    `Titre : ${theme.titre}`,
    `Douleur du TNS : ${theme.douleur}`,
    `Angle à adopter : ${theme.angle}`,
    `Mots-clés SEO à intégrer : ${(theme.mots_cles_seo || []).join(", ")}`,
    ...zoneBlock,
    "",
    "═══ VARIABLE ═══",
    `URL du lead magnet (à utiliser telle quelle dans le CTA) : ${SIMULATOR_URL}`,
  ].join("\n");

  // Retry : quota (429) OU coupure réseau passagère ("fetch failed", timeout…).
  const MAX_RETRIES = 4;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await genai.models.generateContent({
        model: MODEL,
        contents: userPrompt,
        config: {
          systemInstruction: systemPrompt,
          maxOutputTokens: 8192,
          temperature: 0.9,
        },
      });
      const text = (response.text || "").trim();
      if (!text) throw new Error("réponse vide du modèle");
      return text;
    } catch (err) {
      const msg = err.message || "";
      const is429 = /429|quota|rate/i.test(msg);
      const isNet = /fetch failed|network|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|socket|timeout/i.test(msg);
      if ((is429 || isNet) && attempt < MAX_RETRIES) {
        const wait = is429 ? attempt * 20 : attempt * 8; // réseau : 8s, 16s, 24s
        process.stdout.write(`(${is429 ? "quota" : "réseau"}, pause ${wait}s) `);
        await sleep(wait * 1000);
        continue;
      }
      throw err;
    }
  }
}

// ── Programme principal (mode normal) ────────────────────────
async function main(args) {
  const { count, only } = args;
  const tone = readConfigFile("config/tone.md");
  const themesData = JSON.parse(readConfigFile("config/themes.json"));
  const allThemes = themesData.themes;

  // Sélection des thèmes
  let selected;
  if (only) {
    const found = allThemes.find((t) => t.slug === only);
    if (!found) {
      console.error(`❌ Thème introuvable : "${only}". Slugs disponibles :`);
      console.error(allThemes.map((t) => "   - " + t.slug).join("\n"));
      process.exit(1);
    }
    selected = [found];
  } else {
    selected = pickThemes(allThemes, count);
  }

  const dateStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const runDir = join(__dirname, "content-output", dateStr);
  mkdirSync(runDir, { recursive: true });

  console.log(`\n🗂  Machine à contenu TNS — ${dateStr}`);
  console.log(`   Modèle : ${MODEL}`);
  console.log(`   Thèmes à produire : ${selected.map((t) => t.slug).join(", ")}\n`);

  const summaryLines = [
    `# Récapitulatif de production — ${dateStr}`,
    "",
    `**Modèle :** ${MODEL}`,
    `**Lead magnet (CTA) :** ${SIMULATOR_URL}`,
    "",
    "> ⚠️ Relire chaque contenu avant publication. Aucune publication automatique.",
    "",
    `## Thèmes produits (${selected.length})`,
    "",
  ];

  for (const theme of selected) {
    const themeDir = join(runDir, theme.slug);
    mkdirSync(themeDir, { recursive: true });
    console.log(`▶ Thème : ${theme.titre}`);

    summaryLines.push(`### ${theme.titre}`);
    summaryLines.push(`- Slug : \`${theme.slug}\``);
    summaryLines.push(`- Dossier : \`content-output/${dateStr}/${theme.slug}/\``);

    for (const format of FORMATS) {
      process.stdout.write(`   • ${format.label}… `);
      try {
        const content = await generateOne(theme, format, tone);
        const outPath = join(themeDir, format.outFile);
        const header = `<!-- Thème : ${theme.titre} | Format : ${format.label} | Généré le ${dateStr} -->\n\n`;
        writeFileSync(outPath, header + content + "\n", "utf-8");
        console.log("✓");
        summaryLines.push(`  - ✅ ${format.label} → \`${format.outFile}\``);
      } catch (err) {
        console.log("✗ ERREUR");
        console.error(`     ${err.message}`);
        summaryLines.push(`  - ❌ ${format.label} — échec : ${err.message}`);
      }
    }
    summaryLines.push("");
  }

  // Écriture du summary
  writeFileSync(join(runDir, "summary.md"), summaryLines.join("\n"), "utf-8");

  // On n'enregistre la rotation que pour une génération "normale" (pas --theme forcé)
  if (!only) recordUsage(selected);

  console.log(`\n✅ Terminé.`);
  console.log(`   → Contenus : content-output/${dateStr}/`);
  console.log(`   → À relire : content-output/${dateStr}/summary.md\n`);
}

// ── Mode local (SEO géolocalisé) ─────────────────────────────
// Rotation anti-répétition sur la PAIRE zone+thème (8 semaines),
// historique séparé dans .rotation-history-local.json.
const LOCAL_HISTORY_PATH = join(__dirname, ".rotation-history-local.json");

function loadLocalHistory() {
  if (!existsSync(LOCAL_HISTORY_PATH)) return [];
  try {
    const data = JSON.parse(readFileSync(LOCAL_HISTORY_PATH, "utf-8"));
    return Array.isArray(data.history) ? data.history : [];
  } catch {
    return [];
  }
}

function recentLocalKeys(history) {
  const cutoff = Date.now() - 8 * 7 * 24 * 60 * 60 * 1000;
  return new Set(
    history
      .filter((e) => new Date(e.date).getTime() >= cutoff)
      .map((e) => e.key)
  );
}

// Date de dernière production par zone (timestamp), pour prioriser
// les villes les moins récemment traitées (rotation --max-zones).
function zoneLastUsed(history) {
  const map = new Map();
  for (const e of history) {
    const zoneSlug = String(e.key).split("__")[0];
    const t = new Date(e.date).getTime();
    if (!map.has(zoneSlug) || t > map.get(zoneSlug)) map.set(zoneSlug, t);
  }
  return map;
}

// Pour une zone donnée, pioche `count` thèmes dont la paire zone+thème
// n'a pas été produite depuis 8 semaines.
function pickThemesForZone(allThemes, zone, count, burned) {
  let candidates = allThemes.filter(
    (t) => !burned.has(`${zone.slug}__${t.slug}`)
  );
  if (candidates.length < count) {
    // filet de sécurité : on complète avec les thèmes déjà utilisés
    candidates = [...candidates, ...allThemes];
  }
  return candidates.slice(0, count);
}

function recordLocalUsage(pairs) {
  const history = loadLocalHistory();
  const today = new Date().toISOString().slice(0, 10);
  for (const p of pairs) history.push({ key: p, date: today });
  writeFileSync(
    LOCAL_HISTORY_PATH,
    JSON.stringify({ history }, null, 2),
    "utf-8"
  );
}

async function mainLocal(args) {
  const { count, zone: zoneArg, allZones, maxZones, only, linkedin } = args;
  const tone = readConfigFile("config/tone.md");
  const allThemes = JSON.parse(readConfigFile("config/themes.json")).themes;

  const zonesData = JSON.parse(readConfigFile("config/zones.json")).zones;
  if (!zonesData || zonesData.length === 0) {
    console.error("❌ Aucune zone dans config/zones.json.");
    process.exit(1);
  }

  // Quelles zones traiter ?
  let zones;
  if (zoneArg) {
    const z = zonesData.find((x) => x.slug === zoneArg);
    if (!z) {
      console.error(`❌ Zone introuvable : "${zoneArg}". Slugs disponibles :`);
      console.error(zonesData.map((x) => "   - " + x.slug).join("\n"));
      process.exit(1);
    }
    zones = [z];
  } else if (allZones || maxZones) {
    zones = zonesData;
  } else {
    console.error(
      "❌ En mode --local, précise : --zone <slug>, --all-zones, ou --max-zones N\n" +
        "   Zones disponibles :\n" +
        zonesData.map((x) => "   - " + x.slug).join("\n")
    );
    process.exit(1);
  }

  // --max-zones N : garde les N villes les MOINS récemment traitées (rotation).
  if (maxZones && zones.length > maxZones) {
    const lastUsed = zoneLastUsed(loadLocalHistory());
    zones = [...zones]
      .sort((a, b) => (lastUsed.get(a.slug) || 0) - (lastUsed.get(b.slug) || 0))
      .slice(0, maxZones);
  }

  // Formats : blog en priorité pour le SEO local, LinkedIn optionnel.
  const localFormats = FORMATS.filter(
    (f) => f.key === "blog" || (linkedin && f.key === "linkedin")
  );

  const dateStr = new Date().toISOString().slice(0, 10);
  const runDir = join(__dirname, "content-output", dateStr, "local");
  mkdirSync(runDir, { recursive: true });

  console.log(`\n🗺  Machine à contenu TNS — LOCAL — ${dateStr}`);
  console.log(`   Modèle : ${MODEL}`);
  console.log(
    `   Zones : ${zones.map((z) => z.slug).join(", ")} | Formats : ${localFormats
      .map((f) => f.key)
      .join(", ")}\n`
  );

  const burned = recentLocalKeys(loadLocalHistory());
  const producedPairs = [];
  const summaryLines = [
    `# Récapitulatif LOCAL — ${dateStr}`,
    "",
    `**Modèle :** ${MODEL}`,
    `**Lead magnet (CTA) :** ${SIMULATOR_URL}`,
    "",
    "> ⚠️ Relire chaque contenu avant publication. Aucune publication automatique.",
    "",
  ];

  for (const zone of zones) {
    const themes = only
      ? [allThemes.find((t) => t.slug === only)].filter(Boolean)
      : pickThemesForZone(allThemes, zone, count, burned);

    console.log(`▶ Zone : ${zone.ville} (${zone.code_dept})`);
    summaryLines.push(`## ${zone.ville} (${zone.departement}, ${zone.code_dept})`);

    for (const theme of themes) {
      const pairSlug = `${zone.slug}-${theme.slug}`;
      const pairDir = join(runDir, pairSlug);
      mkdirSync(pairDir, { recursive: true });
      summaryLines.push(`### ${theme.titre}`);
      summaryLines.push(`- Dossier : \`content-output/${dateStr}/local/${pairSlug}/\``);

      let pairOk = false; // au moins un format généré avec succès ?
      for (const format of localFormats) {
        process.stdout.write(`   • ${zone.slug} × ${theme.slug} — ${format.label}… `);
        try {
          const content = await generateOne(theme, format, tone, zone);
          const header = `<!-- Zone : ${zone.ville} (${zone.code_dept}) | Thème : ${theme.titre} | Format : ${format.label} | Généré le ${dateStr} -->\n\n`;
          writeFileSync(join(pairDir, format.outFile), header + content + "\n", "utf-8");
          console.log("✓");
          summaryLines.push(`  - ✅ ${format.label} → \`${format.outFile}\``);
          pairOk = true;
        } catch (err) {
          console.log("✗ ERREUR");
          console.error(`     ${err.message}`);
          summaryLines.push(`  - ❌ ${format.label} — échec : ${err.message}`);
        }
      }
      // Marque la paire comme produite UNIQUEMENT si la génération a réussi
      // (sinon la ville échouée revient au prochain run au lieu d'être sautée 8 semaines).
      if (!only && pairOk) producedPairs.push(`${zone.slug}__${theme.slug}`);
      summaryLines.push("");
    }
  }

  writeFileSync(join(runDir, "summary.md"), summaryLines.join("\n"), "utf-8");
  if (producedPairs.length) recordLocalUsage(producedPairs);

  console.log(`\n✅ Terminé (local).`);
  console.log(`   → Contenus : content-output/${dateStr}/local/`);
  console.log(`   → À relire : content-output/${dateStr}/local/summary.md\n`);
}

// ── Routeur de lancement ─────────────────────────────────────
const ARGS = parseArgs();
(ARGS.local ? mainLocal(ARGS) : main(ARGS)).catch((err) => {
  console.error("\n❌ Erreur inattendue :", err.message);
  process.exit(1);
});
