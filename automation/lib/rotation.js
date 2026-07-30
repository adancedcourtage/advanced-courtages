// lib/rotation.js
// Gère la rotation des thèmes pour éviter toute répétition sur 8 semaines.
// L'historique est stocké dans .rotation-history.json (créé automatiquement).

import { readFileSync, writeFileSync, existsSync } from "node:fs";

const HISTORY_PATH = new URL("../.rotation-history.json", import.meta.url);
const NO_REPEAT_WEEKS = 8;

function loadHistory() {
  if (!existsSync(HISTORY_PATH)) return [];
  try {
    const raw = readFileSync(HISTORY_PATH, "utf-8");
    const data = JSON.parse(raw);
    return Array.isArray(data.history) ? data.history : [];
  } catch {
    return [];
  }
}

function saveHistory(history) {
  writeFileSync(
    HISTORY_PATH,
    JSON.stringify({ history }, null, 2),
    "utf-8"
  );
}

// Renvoie la liste des slugs "brûlés" (utilisés dans les 8 dernières semaines).
function recentlyUsedSlugs(history) {
  const cutoff = Date.now() - NO_REPEAT_WEEKS * 7 * 24 * 60 * 60 * 1000;
  return new Set(
    history
      .filter((entry) => new Date(entry.date).getTime() >= cutoff)
      .map((entry) => entry.slug)
  );
}

/**
 * Sélectionne `count` thèmes non utilisés depuis 8 semaines.
 * Si tous les thèmes ont été utilisés récemment (banque trop petite),
 * on repart des plus anciennement utilisés.
 */
export function pickThemes(allThemes, count) {
  const history = loadHistory();
  const burned = recentlyUsedSlugs(history);

  let candidates = allThemes.filter((t) => !burned.has(t.slug));

  // Filet de sécurité : si pas assez de thèmes "frais", on complète en
  // reprenant les thèmes utilisés il y a le plus longtemps.
  if (candidates.length < count) {
    const lastUsedAt = new Map();
    for (const entry of history) {
      lastUsedAt.set(entry.slug, new Date(entry.date).getTime());
    }
    const fallback = allThemes
      .filter((t) => burned.has(t.slug))
      .sort(
        (a, b) => (lastUsedAt.get(a.slug) || 0) - (lastUsedAt.get(b.slug) || 0)
      );
    candidates = [...candidates, ...fallback];
  }

  return candidates.slice(0, count);
}

/**
 * Enregistre les thèmes produits dans l'historique (avec la date du jour).
 */
export function recordUsage(themes) {
  const history = loadHistory();
  const today = new Date().toISOString().slice(0, 10);
  for (const t of themes) {
    history.push({ slug: t.slug, date: today });
  }
  saveHistory(history);
}
