# Automatisation — Contenu local SEO (100% autonome)

Cette chaîne tourne **dans le cloud (GitHub Actions), sans ton ordinateur**. Chaque semaine, elle :
1. génère des articles de blog localisés (départements 64 et 40) via Gemini ;
2. les convertit en pages HTML au design du site ;
3. applique un **garde-fou conformité** (tout article contenant une formulation interdite est **ignoré**, jamais publié) ;
4. les publie dans `blog/` → GitHub Pages republie → Google indexe → les visiteurs cliquent vers `/simulateur` → **tu reçois les leads par email**.

## Activation — 4 étapes, une seule fois (dans l'interface GitHub)

1. **Clé API** : dépôt → **Settings → Secrets and variables → Actions → New repository secret**
   - Nom : `GEMINI_API_KEY`
   - Valeur : ta clé Gemini (celle de `aistudio.google.com/apikey`)
2. **Droits d'écriture** : **Settings → Actions → General → Workflow permissions** → coche **« Read and write permissions »** → Save.
3. **Vérifier** : onglet **Actions** → workflow **« Contenu local TNS (SEO auto) »**.
4. **Tester tout de suite** (optionnel) : clique **Run workflow**. Sinon il part seul chaque lundi 07:00 UTC.

## Régler le volume / la fréquence

Dans `.github/workflows/content-local.yml` :
- Fréquence : ligne `cron: "0 7 * * 1"` (lundi 7h). Ex. tous les 1er du mois : `0 7 1 * *`.
- Périmètre : ligne `node generate.js --local --all-zones --themes 1`
  - `--all-zones` = toutes les villes de `config/zones.json` (16). Pour démarrer plus doucement, remplace par `--zone pau` (une ville).
  - `--themes 1` = 1 thème par ville et par run (la rotation évite les répétitions sur 8 semaines).

## Modifier les zones ou les thèmes
- Villes/départements : `automation/config/zones.json`
- Sujets : `automation/config/themes.json`
- Ton de marque / garde-fous : `automation/config/tone.md`

## ⚠️ Important — publication sans relecture
Le brief initial prévoyait une relecture humaine avant publication. Cette chaîne **publie automatiquement**. Le garde-fou conformité bloque les formulations à risque évidentes, mais il ne remplace pas ton œil. Recommandé : **jette un coup d'œil au blog de temps en temps**. Pour tout mettre en pause : onglet Actions → le workflow → **Disable workflow**.
