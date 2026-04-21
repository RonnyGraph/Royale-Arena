// ============================================================
// galerie.js — Logique de la galerie des cartes
// Chargé dynamiquement par lobby.html après injection du HTML
// ============================================================

import { db } from './firebase-config.js';
import {
  collection, getDocs
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

// ── Cache local ──
let toutesLesCartes  = [];  // Tableau { id, ...data }
let tousLesStatuts   = {};  // Map id → { nom, imageUrl }
let toutesLesAnnexes = {};  // Map id → { nom, imageUrl, type, pv }

// ── État des filtres ──
let filtreClasse    = '';
let filtreRecherche = '';

// ── Flag : données déjà chargées depuis Firestore ? ──
let dejaCharge = false;

// ==========================================================
// POINT D'ENTRÉE
// ==========================================================
export async function initGalerie() {

  if (dejaCharge) {
    // Données déjà en mémoire, on réaffiche juste
    afficherCartes();
    return;
  }

  const zone = document.getElementById('galerie-contenu');
  if (zone) zone.innerHTML = '<div class="galerie-loader">⏳ Chargement...</div>';

  try {
    // ── 1. Statuts ──
    const snapStatuts = await getDocs(collection(db, "statuts"));
    snapStatuts.forEach(d => { tousLesStatuts[d.id] = d.data(); });

    // ── 2. Annexes ──
    const snapAnnexes = await getDocs(collection(db, "annexes"));
    snapAnnexes.forEach(d => { toutesLesAnnexes[d.id] = d.data(); });

    // ── 3. Cartes (reset du tableau pour éviter les doublons) ──
    toutesLesCartes = [];
    const snapCartes = await getDocs(collection(db, "cartes"));
    snapCartes.forEach(d => { toutesLesCartes.push({ id: d.id, ...d.data() }); });

    // Tri alphabétique par nom
    toutesLesCartes.sort((a, b) => a.nom.localeCompare(b.nom));

    dejaCharge = true;

    console.log(`✅ Galerie : ${toutesLesCartes.length} cartes chargées`);
    if (toutesLesCartes.length > 0) console.log('📋 Exemple carte :', toutesLesCartes[0]);

    afficherCartes();

  } catch (err) {
    if (zone) zone.innerHTML = `<div class="galerie-vide">❌ Erreur : ${err.message}</div>`;
    console.error('Erreur galerie :', err);
  }
}

// ==========================================================
// AFFICHAGE DE LA GRILLE
// ==========================================================
function afficherCartes() {
  const zone = document.getElementById('galerie-contenu');
  if (!zone) return;

  // Applique les deux filtres (classe + recherche texte)
  const cartesFiltrees = toutesLesCartes.filter(c => {
    const okClasse    = !filtreClasse    || c.classe === filtreClasse;
    const okRecherche = !filtreRecherche || c.nom.toLowerCase().includes(filtreRecherche.toLowerCase());
    return okClasse && okRecherche;
  });

  if (cartesFiltrees.length === 0) {
    zone.innerHTML = '<div class="galerie-vide">Aucune carte trouvée.</div>';
    return;
  }

  // On n'affiche que les cartes parentes (pas les variantes)
  // Les variantes sont accessibles depuis la modal de leur carte parente
  const cartesParentes = cartesFiltrees.filter(c => !c.estVariante);

  zone.innerHTML = `
    <div class="galerie-grid">
      ${cartesParentes.map(c => `
        <div class="carte-item" onclick="ouvrirCarteModal('${c.id}')">
          <img
            src="${c.imageUrl || ''}"
            alt="${c.nom}"
            loading="lazy"
            onerror="this.style.background='#0f3460';this.style.minHeight='120px';"
          >
          <div class="carte-nom">${c.nom}</div>
          <div class="carte-classe">${c.classe || ''}</div>
        </div>
      `).join('')}
    </div>
  `;
}

// ==========================================================
// FILTRES
// ==========================================================

/** Filtre la grille par classe */
window.galerieFiltrer = function(classe) {
  filtreClasse = classe;

  // Met "actif" sur le bon bouton de filtre
  document.querySelectorAll('.filtre-btn').forEach(btn => {
    btn.classList.toggle('actif', btn.textContent.trim() === (classe || 'Toutes'));
  });

  afficherCartes();
};

/** Filtre la grille par texte de recherche */
window.galerieRecherche = function(texte) {
  filtreRecherche = texte;
  afficherCartes();
};

// ==========================================================
// MODAL DÉTAIL
// ==========================================================

/**
 * Ouvre la modal de détail d'une carte
 * @param {string} id - ID Firestore de la carte
 */
window.ouvrirCarteModal = function(id) {
  const carte = toutesLesCartes.find(c => c.id === id);
  if (!carte) return;

  // ── Image principale cliquable pour zoom ──
  const modalImg = document.getElementById('modal-img');
  modalImg.src          = carte.imageUrl || '';
  modalImg.style.cursor = 'pointer';
  modalImg.onclick      = () => ouvrirZoomImage(carte.imageUrl, carte.nom);

  // ── Stats de base ──
  document.getElementById('modal-nom').textContent    = carte.nom    || '';
  document.getElementById('modal-classe').textContent = carte.classe || '—';
  document.getElementById('modal-pv').textContent     = carte.pv     ?? '—';
  document.getElementById('modal-def').textContent    = carte.def    ?? '—';

  let bodyHTML = '';

  // ── Description / Capacité ──
  if (carte.description) {
    bodyHTML += `
      <h3>📜 Capacité</h3>
      <p style="font-size:0.85em;color:#ccccee;line-height:1.5;">${carte.description}</p>
    `;
  }

  // ── Extensions (objets embarqués directement dans la carte) ──
  if ((carte.extensions || []).length > 0) {
    const extHTML = carte.extensions.map(e => `
      <div class="ext-item">
        <img
          src="${e.imageUrl || ''}"
          alt="${e.nom}"
          class="annexe-img"
          onclick="ouvrirZoomImage('${e.imageUrl}', '${e.nom}')"
          onerror="this.style.display='none';"
        >
        <span>
          <b>${e.nom}</b>
          ${e.pv  ? ` — ${e.pv} PV`   : ''}
          ${e.def ? ` — ${e.def} DEF`  : ''}
        </span>
      </div>
    `).join('');
    bodyHTML += `<h3>🔩 Extensions</h3><div class="ext-list">${extHTML}</div>`;
  }

  // ── Annexes (IDs résolus depuis la collection Firestore "annexes") ──
  if ((carte.annexes || []).length > 0) {
    const annexesHTML = carte.annexes.map(annexeId => {
      const a = toutesLesAnnexes[annexeId];
      if (!a) {
        console.warn(`⚠️ Annexe introuvable : ${annexeId}`);
        return `<div class="ext-item"><span>❓ ${annexeId}</span></div>`;
      }
      return `
        <div class="ext-item">
          <img
            src="${a.imageUrl || ''}"
            alt="${a.nom}"
            class="annexe-img"
            onclick="ouvrirZoomImage('${a.imageUrl}', '${a.nom}')"
            onerror="this.style.display='none';"
          >
          <span>
            <b>${a.nom}</b> — ${a.type || ''}
            ${a.pv  ? ` — ${a.pv} PV`   : ''}
            ${a.def ? ` — ${a.def} DEF`  : ''}
          </span>
        </div>
      `;
    }).join('');
    bodyHTML += `<h3>🧩 Annexes</h3><div class="ext-list">${annexesHTML}</div>`;
  }

  // ── Statuts émis par la carte ──
  if ((carte.statuts || []).length > 0) {
    const statutsHTML = carte.statuts.map(statutId => {
      const s = tousLesStatuts[statutId];
      if (!s) {
        console.warn(`⚠️ Statut introuvable : ${statutId}`);
        return '';
      }
      return `
        <div class="statut-badge">
          <img src="${s.imageUrl}" alt="${s.nom}">
          <span>${s.nom}</span>
        </div>
      `;
    }).join('');
    bodyHTML += `<h3>💥 Statuts émis</h3><div class="statuts-list-modal">${statutsHTML}</div>`;
  }

  // ── Variantes / Phases ──
  if ((carte.variantes || []).length > 0) {

    // Miniature de la carte PARENTE en première position pour pouvoir y revenir
    const parentThumb = `
      <div class="variante-thumb actif-variante"
           onclick="changerImageModal('${carte.imageUrl}', '${carte.id}')">
        <img src="${carte.imageUrl || ''}" alt="${carte.nom}">
        <p>⭐ ${carte.nom}</p>
      </div>
    `;

    const variantesHTML = carte.variantes.map(varianteId => {

      // Cas 1 : ID string → on résout depuis toutesLesCartes
      if (typeof varianteId === 'string') {
        const v = toutesLesCartes.find(c => c.id === varianteId);
        if (!v) {
          console.warn(`⚠️ Variante introuvable : ${varianteId}`);
          return '';
        }
        return `
          <div class="variante-thumb" onclick="changerImageModal('${v.imageUrl}', '${v.id}')">
            <img src="${v.imageUrl || ''}" alt="${v.nom}">
            <p>${v.nom}</p>
          </div>
        `;
      }

      // Cas 2 : objet embarqué { imageUrl, nom } (ancienne structure)
      if (typeof varianteId === 'object' && varianteId?.imageUrl) {
        return `
          <div class="variante-thumb"
               onclick="changerImageModal('${varianteId.imageUrl}', null)">
            <img src="${varianteId.imageUrl}" alt="${varianteId.nom || ''}">
            <p>${varianteId.nom || ''}</p>
          </div>
        `;
      }

      return '';
    }).join('');

    if (variantesHTML.trim()) {
      bodyHTML += `
        <h3>🎨 Variantes / Phases</h3>
        <div class="variantes-list">${parentThumb}${variantesHTML}</div>
      `;
    }
  }

  document.getElementById('modal-body').innerHTML = bodyHTML;
  document.getElementById('carte-modal-overlay').classList.add('visible');
};

/**
 * Change l'image principale + met à jour les stats (clic sur une variante ou la parente)
 * @param {string}      imageUrl   - URL de la nouvelle image à afficher
 * @param {string|null} varianteId - ID Firestore de la carte (null = objet embarqué sans ID)
 */
window.changerImageModal = function(imageUrl, varianteId) {
  const modalImg   = document.getElementById('modal-img');
  modalImg.src     = imageUrl;

  // L'image reste zoomable après le switch
  modalImg.style.cursor = 'pointer';
  modalImg.onclick      = () => ouvrirZoomImage(imageUrl, varianteId || '');

  // Met à jour les stats si on a un ID Firestore valide
  if (varianteId) {
    const v = toutesLesCartes.find(c => c.id === varianteId);
    if (v) {
      document.getElementById('modal-pv').textContent  = v.pv  ?? '—';
      document.getElementById('modal-def').textContent = v.def ?? '—';
    }
  }
};

/**
 * Ferme la modal détail carte
 * @param {Event} [event] - Si présent, vérifie que le clic est bien sur l'overlay
 */
window.fermerCarteModal = function(event) {
  if (event && event.target !== document.getElementById('carte-modal-overlay')) return;
  document.getElementById('carte-modal-overlay').classList.remove('visible');
};

// ==========================================================
// ZOOM IMAGE (pop-up plein écran sur clic d'une image)
// ==========================================================

/**
 * Ouvre un overlay plein écran pour zoomer sur une image
 * @param {string} imageUrl - URL de l'image à zoomer
 * @param {string} nom      - Nom affiché sous l'image
 */
window.ouvrirZoomImage = function(imageUrl, nom) {

  // Crée l'overlay une seule fois et le réutilise ensuite
  let zoomOverlay = document.getElementById('zoom-overlay');
  if (!zoomOverlay) {
    zoomOverlay = document.createElement('div');
    zoomOverlay.id = 'zoom-overlay';
    // Ferme au clic n'importe où sur l'overlay
    zoomOverlay.onclick = () => zoomOverlay.classList.remove('visible');
    zoomOverlay.innerHTML = `
      <div class="zoom-container">
        <img id="zoom-img" src="" alt="">
        <p id="zoom-nom"></p>
      </div>
    `;
    document.body.appendChild(zoomOverlay);
  }

  // Remplit et affiche
  document.getElementById('zoom-img').src         = imageUrl;
  document.getElementById('zoom-nom').textContent = nom;
  zoomOverlay.classList.add('visible');
};
