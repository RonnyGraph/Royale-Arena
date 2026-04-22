// ============================================================
// IMPORTS FIREBASE
// ============================================================
import { db } from './firebase-config.js';
import {
  collection,
  getDocs,
  doc,
  setDoc,
  onSnapshot,
  getDoc,
  updateDoc,  // manquait → pour finirMonTour, passerTourSuivant, dpenserPA
  addDoc,     // manquait → pour ajouterLog et envoyerMessage
  query,      // manquait → pour ecouterLogs et ecouterChat
  orderBy     // manquait → pour trier les logs/messages par timestamp
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";



// ============================================================
// IDENTIFIANTS DE LA PARTIE
// On récupère l'ID de la partie et le joueur depuis l'URL
// ex: game.html?partie=abc123&joueur=j1
// ============================================================
const params     = new URLSearchParams(window.location.search);
const PARTIE_ID  = params.get('partie');  // identifiant unique de la partie
const MON_ROLE   = params.get('joueur');  // "j1" ou "j2"
const ADVERSAIRE = MON_ROLE === 'j1' ? 'j2' : 'j1';


// ============================================================
// REFERENCES FIRESTORE
// ============================================================
const partieRef       = doc(db, 'parties', PARTIE_ID);
const selectionMoiRef = doc(db, 'parties', PARTIE_ID, 'selections', MON_ROLE);
const selectionAdvRef = doc(db, 'parties', PARTIE_ID, 'selections', ADVERSAIRE);


// ============================================================
// ETAT LOCAL DE LA SELECTION
// ============================================================
let cartesSelectionnees = [null, null, null]; // les 3 cartes choisies
let slotActif = 0; // quel slot on remplit (0, 1 ou 2)


// ============================================================
// CHARGEMENT DE LA GALERIE DEPUIS FIRESTORE
// Charge toutes les cartes et les affiche dans #galerieGrid
// ============================================================
async function chargerGalerie() {
  const grid = document.getElementById('galerieGrid');
  grid.innerHTML = '<em style="color:#aaa">Chargement...</em>';

  try {
    const snap = await getDocs(collection(db, 'cartes'));
    grid.innerHTML = '';

    snap.forEach(docSnap => {
      const carte = { id: docSnap.id, ...docSnap.data() };

      // Création de l'élément carte dans la galerie
      const div = document.createElement('div');
      div.className = 'galerie-carte';
      div.dataset.id = carte.id;
      div.innerHTML = `
        <img src="${carte.imageUrl}" alt="${carte.nom}">
        <span>${carte.nom}</span>
      `;

      // Clic sur une carte → ouvrir le pop-up de détail
      div.addEventListener('click', () => ouvrirPopupCarte(carte));

      grid.appendChild(div);
    });

  } catch (err) {
    grid.innerHTML = `<span style="color:#f88">Erreur : ${err.message}</span>`;
  }
}


// ============================================================
// RECHERCHE EN TEMPS REEL DANS LA GALERIE
// Filtre les cartes affichées selon le texte saisi
// ============================================================
document.getElementById('searchCartes').addEventListener('input', (e) => {
  const terme = e.target.value.toLowerCase();
  // On parcourt toutes les cartes affichées et on masque celles qui ne correspondent pas
  document.querySelectorAll('.galerie-carte').forEach(div => {
    const nom = div.querySelector('span').textContent.toLowerCase();
    div.style.display = nom.includes(terme) ? 'block' : 'none';
  });
});


// ============================================================
// POP-UP DE DETAIL D'UNE CARTE
// Affiche l'image, les stats, les statuts et les annexes
// ============================================================

// Création de la structure du popup (une seule fois dans le DOM)
const popup = document.createElement('div');
popup.id = 'popupCarte';
popup.innerHTML = `
  <div id="popupInner">

    <!-- Bouton fermer -->
    <button id="popupClose">✕</button>

    <!-- Image de la carte -->
    <div id="popupImage">
      <img id="popupImg" src="" alt="">
    </div>

    <!-- Infos de la carte -->
    <div id="popupInfos">
      <h2 id="popupNom"></h2>
      <p id="popupClasse"></p>

      <!-- Stats PV / DEF -->
      <div id="popupStats">
        <div class="stat-bloc">
          <span class="stat-label">❤️ PV</span>
          <span class="stat-val" id="popupPv"></span>
        </div>
        <div class="stat-bloc">
          <span class="stat-label">🛡️ DEF</span>
          <span class="stat-val" id="popupDef"></span>
        </div>
      </div>

      <!-- Extensions (PV séparés) -->
      <div id="popupExtensions"></div>

      <!-- Statuts que la carte peut émettre -->
      <div id="popupStatuts">
        <h4>🌀 Statuts émis</h4>
        <div id="popupStatutsList"></div>
      </div>

      <!-- Invocations / Annexes liées -->
      <div id="popupAnnexes">
        <h4>🧩 Invocations & Annexes</h4>
        <div id="popupAnnexesList"></div>
      </div>

      <!-- Bouton choisir cette carte -->
      <button id="popupChoisir">✅ Choisir cette carte</button>
    </div>

  </div>
`;
document.body.appendChild(popup);

// Fermer le popup en cliquant sur ✕ ou en dehors du contenu
document.getElementById('popupClose').addEventListener('click', fermerPopup);
popup.addEventListener('click', (e) => { if (e.target === popup) fermerPopup(); });


/**
 * Ouvre le popup et remplit les infos d'une carte
 * @param {object} carte - données Firestore de la carte
 */
async function ouvrirPopupCarte(carte) {
  // Infos de base
  document.getElementById('popupImg').src    = carte.imageUrl;
  document.getElementById('popupNom').textContent    = carte.nom;
  document.getElementById('popupClasse').textContent = `Classe : ${carte.classe}`;
  document.getElementById('popupPv').textContent  = carte.pv;
  document.getElementById('popupDef').textContent = carte.def;

  // Extensions (PV supplémentaires)
  const extDiv = document.getElementById('popupExtensions');
  extDiv.innerHTML = '';
  if (carte.extensions && carte.extensions.length > 0) {
    extDiv.innerHTML = '<h4>📦 Extensions</h4>';
    carte.extensions.forEach(ext => {
      const bloc = document.createElement('div');
      bloc.className = 'popup-extension';
      bloc.innerHTML = `
        <img src="${ext.imageUrl}" alt="${ext.nom}">
        <span>${ext.nom} — ❤️ ${ext.pv}</span>
      `;
      extDiv.appendChild(bloc);
    });
  }

  // Statuts émis (on charge chaque statut depuis Firestore par son ID)
  const statutsList = document.getElementById('popupStatutsList');
  statutsList.innerHTML = '';
  if (carte.statuts && carte.statuts.length > 0) {
    for (const statutId of carte.statuts) {
      try {
        const statutSnap = await getDoc(doc(db, 'statuts', statutId));
        if (statutSnap.exists()) {
          const s = statutSnap.data();
          const img = document.createElement('img');
          img.src = s.imageUrl;
          img.alt = s.nom;
          img.title = s.nom;
          img.className = 'popup-statut-icon';
          statutsList.appendChild(img);
        }
      } catch (_) {}
    }
  } else {
    statutsList.innerHTML = '<em style="color:#aaa;font-size:12px">Aucun</em>';
  }

  // Annexes liées (invocations, objets, traps...)
  const annexesList = document.getElementById('popupAnnexesList');
  annexesList.innerHTML = '';
  if (carte.annexes && carte.annexes.length > 0) {
    for (const annexeId of carte.annexes) {
      try {
        const annexeSnap = await getDoc(doc(db, 'annexes', annexeId));
        if (annexeSnap.exists()) {
          const a = annexeSnap.data();
          const div = document.createElement('div');
          div.className = 'popup-annexe';
          div.innerHTML = `
            <img src="${a.imageUrl}" alt="${a.nom}">
            <div>
              <strong>${a.nom}</strong>
              <em style="color:#aaa;font-size:11px"> (${a.type})</em>
              ${a.pv !== undefined ? `<br><small>❤️ ${a.pv}</small>` : ''}
            </div>
          `;
          annexesList.appendChild(div);
        }
      } catch (_) {}
    }
  } else {
    annexesList.innerHTML = '<em style="color:#aaa;font-size:12px">Aucune</em>';
  }

  // Bouton choisir : place la carte dans le slot actif
  document.getElementById('popupChoisir').onclick = () => choisirCarte(carte);

  // Afficher le popup
  popup.style.display = 'flex';
}


/**
 * Ferme le popup de détail
 */
function fermerPopup() {
  popup.style.display = 'none';
}


// ============================================================
// CHOIX D'UNE CARTE → place dans le slot actif
// ============================================================

/**
 * Place une carte dans le slot actif et passe au slot suivant
 * @param {object} carte - la carte choisie
 */
function choisirCarte(carte) {
  // On cherche un slot libre (on commence par le premier vide)
  const slotLibre = cartesSelectionnees.indexOf(null);
  if (slotLibre === -1) {
    // Les 3 slots sont remplis → on remplace le slot actif
    cartesSelectionnees[slotActif] = carte;
    mettreAJourSlots();
    fermerPopup();
    return;
  }

  cartesSelectionnees[slotLibre] = carte;
  slotActif = cartesSelectionnees.indexOf(null); // prochain slot vide

  mettreAJourSlots();
  fermerPopup();
}


/**
 * Met à jour l'affichage des 3 slots de sélection
 */
function mettreAJourSlots() {
  document.querySelectorAll('.selection-slot').forEach((slot, i) => {
    const carte = cartesSelectionnees[i];
    if (carte) {
      // Slot rempli → afficher l'image et le nom
      slot.classList.add('rempli');
      slot.innerHTML = `
        <div style="position:relative;width:100%;height:100%">
          <img src="${carte.imageUrl}" alt="${carte.nom}"
               style="width:100%;height:100%;object-fit:cover;border-radius:8px">
          <span style="position:absolute;bottom:4px;left:0;right:0;
                       text-align:center;font-size:10px;
                       background:rgba(0,0,0,0.7);padding:2px">
            ${carte.nom}
          </span>
          <!-- Clic sur le ✕ pour retirer la carte du slot -->
          <button class="slot-remove" data-index="${i}">✕</button>
        </div>
      `;
      // Bouton supprimer du slot
      slot.querySelector('.slot-remove').addEventListener('click', (e) => {
        e.stopPropagation();
        cartesSelectionnees[i] = null;
        mettreAJourSlots();
      });
    } else {
      // Slot vide
      slot.classList.remove('rempli');
      slot.innerHTML = `<span>Carte ${i + 1}</span>`;
    }
  });

  // Activer le bouton "Prêt" seulement si les 3 slots sont remplis
  document.getElementById('btnPret').disabled =
    cartesSelectionnees.some(c => c === null);
}


// ============================================================
// BOUTON "JE SUIS PRET"
// Sauvegarde la sélection dans Firestore et attend l'adversaire
// ============================================================
document.getElementById('btnPret').addEventListener('click', async () => {
  document.getElementById('btnPret').disabled = true;
  document.getElementById('btnPret').textContent = '⏳ En attente de l\'adversaire...';

  // On ne sauvegarde que les IDs et infos essentielles (pas tout l'objet)
  const selection = cartesSelectionnees.map(c => ({
    id:       c.id,
    nom:      c.nom,
    imageUrl: c.imageUrl,
    pv:       c.pv,
    def:      c.def,
    extensions: c.extensions || [],
    annexes:  c.annexes  || [],
    statuts:  c.statuts  || [],
    variantes: c.variantes || [],
    classe:   c.classe
  }));

  // Sauvegarde dans selections/{monRole}
  await setDoc(selectionMoiRef, { cartes: selection, pret: true });

  // Ecoute en temps réel : dès que l'adversaire est aussi prêt → démarrer
  onSnapshot(selectionAdvRef, (snap) => {
    if (snap.exists() && snap.data().pret === true) {
      demarrerPartie();
    }
  });
});




  // → Étape 3 : initialiser le terrain avec ces données

// ============================================================
// ETAT GLOBAL DE LA PARTIE
// Contient toutes les données du jeu en temps réel
// ============================================================
const ETAT = {
  phase: 'placement',      // "placement" | "jeu"
  tourActuel: null,        // "j1" | "j2"
  numeroTour: 1,
  paRestants: 0,           // Points d'Action restants ce tour

  // Terrain local (mis à jour depuis Firestore)
  terrain: {
    j1: { combattants: [null, null, null], invocations: [null,null,null,null,null], banc: [null,null] },
    j2: { combattants: [null, null, null], invocations: [null,null,null,null,null], banc: [null,null] }
  },

  monEquipe:  [],   // les 3 cartes qu'on a choisies (données complètes)
  equipeAdv:  [],   // les 3 cartes adverses (révélées progressivement)
};


// ============================================================
// CONSTANTES DE REGLES
// ============================================================
const PA_TOUR_1_PREMIER  = 1;  // PA du 1er joueur au tour 1
const PA_TOUR_1_SECOND   = 2;  // PA du 2e joueur au tour 1
const PA_NORMAL          = 3;  // PA à partir du tour 2


// ============================================================
// 3A - INITIALISATION DU TERRAIN
// Appelée depuis demarrerPartie() avec les équipes récupérées
// ============================================================

/**
 * Initialise le terrain après la phase de sélection
 * @param {Array} monEquipe  - mes 3 cartes
 * @param {Array} equipeAdv  - les 3 cartes adverses
 */
function initialiserTerrain(monEquipe, equipeAdv) {
  ETAT.monEquipe = monEquipe;
  ETAT.equipeAdv = equipeAdv;

  // Remplir le banc local avec mes 3 cartes (toutes sur le banc au départ)
  ETAT.terrain[MON_ROLE].banc = [
    creerCarteEtat(monEquipe[0], 0),
    creerCarteEtat(monEquipe[1], 1),
    creerCarteEtat(monEquipe[2], 2),
  ];

  // Pareil pour l'adversaire
  ETAT.terrain[ADVERSAIRE].banc = [
    creerCarteEtat(equipeAdv[0], 0),
    creerCarteEtat(equipeAdv[1], 1),
    creerCarteEtat(equipeAdv[2], 2),
  ];

  // Rendu visuel initial
  rendreTerrainComplet();

  // Remplir le tiroir avec mes cartes (banc accessible)
  remplirTiroir();

  // Mise à jour du compteur de tour
  mettreAJourCompteur();
}


/**
 * Crée un objet "état carte" à partir des données Firestore
 * Cet objet suit les PV actuels, statuts, etc. pendant la partie
 * @param {object} carte    - données brutes de la carte
 * @param {number} position - index dans l'équipe (0/1/2)
 * @returns {object}
 */
function creerCarteEtat(carte, position) {
  return {
    // --- Identité ---
    id:       carte.id,
    nom:      carte.nom,
    imageUrl: carte.imageUrl,
    classe:   carte.classe,
    position,

    // --- Stats actuelles (peuvent changer en cours de partie) ---
    pvMax:  carte.pv,
    pvActuels: carte.pv,
    defBase:   carte.def,
    defActuelle: carte.def,

    // --- Extensions (items avec PV propres) ---
    extensions: (carte.extensions || []).map(ext => ({
      ...ext,
      pvActuels: ext.pv
    })),

    // --- Annexes et statuts ---
    annexes:  carte.annexes  || [],
    statuts:  carte.statuts  || [],
    variantes: carte.variantes || [],

    // --- Statuts actifs en jeu ---
    statutsActifs: [],   // ex: ["brule", "glace"]

    // --- Flags de jeu ---
    aAttaque:     false,   // a déjà attaqué ce tour
    estSurTerrain: false,  // est sur le terrain (pas sur le banc)
    ko:           false,
  };
}


// ============================================================
// 3A - RENDU VISUEL DU TERRAIN
// ============================================================

/**
 * Redessine tout le terrain (les 2 côtés)
 * Appelée à chaque changement d'état
 */
function rendreTerrainComplet() {
  rendreLigne('combattants', MON_ROLE);
  rendreLigne('combattants', ADVERSAIRE);
  rendreLigne('invocations', MON_ROLE);
  rendreLigne('invocations', ADVERSAIRE);
  rendreBanc(MON_ROLE);
  rendreBanc(ADVERSAIRE);
}


/**
 * Rend une ligne de combattants ou d'invocations pour un joueur
 * @param {string} type   - "combattants" | "invocations"
 * @param {string} joueur - "j1" | "j2"
 */
function rendreLigne(type, joueur) {
  // Sélection de la bonne ligne dans le DOM
  // Les IDs sont construits comme "combattants-j1", "invocations-j2", etc.
  const ligne = document.getElementById(`${type}-${joueur}`);
  if (!ligne) return;

  const cases = ligne.querySelectorAll('.case');
  const donnees = ETAT.terrain[joueur][type];

  cases.forEach((caseEl, i) => {
    caseEl.innerHTML = '';          // on vide la case
    const carteEtat = donnees[i];   // carte présente à cet index (ou null)

    if (carteEtat) {
      // Il y a une carte → on crée son rendu
      caseEl.appendChild(creerElementCarte(carteEtat, joueur, type, i));
    }
  });
}


/**
 * Rend le banc d'un joueur
 * @param {string} joueur - "j1" | "j2"
 */
function rendreBanc(joueur) {
  const banc = document.getElementById(`banc-${joueur}`);
  if (!banc) return;

  const cases = banc.querySelectorAll('.case');
  const donnees = ETAT.terrain[joueur].banc;

  cases.forEach((caseEl, i) => {
    caseEl.innerHTML = '';
    const carteEtat = donnees[i];

    if (carteEtat) {
      // Sur le banc de l'adversaire, on masque l'image (dos de carte)
      const masquer = (joueur === ADVERSAIRE);
      caseEl.appendChild(creerElementCarte(carteEtat, joueur, 'banc', i, masquer));
    }
  });
}


/**
 * Crée l'élément HTML d'une carte sur le terrain
 * @param {object}  carteEtat - état de la carte
 * @param {string}  joueur    - "j1" | "j2"
 * @param {string}  zone      - "combattants" | "invocations" | "banc"
 * @param {number}  index     - position dans la ligne
 * @param {boolean} masquer   - true = dos de carte (adverse sur banc)
 * @returns {HTMLElement}
 */
function creerElementCarte(carteEtat, joueur, zone, index, masquer = false) {
  const div = document.createElement('div');
  div.className = 'carte-terrain';
  div.dataset.joueur = joueur;
  div.dataset.zone   = zone;
  div.dataset.index  = index;
  div.dataset.id     = carteEtat.id;

  // Si c'est une carte KO
  if (carteEtat.ko) div.classList.add('carte-ko');

  // Si c'est ma carte, elle est draggable
  if (joueur === MON_ROLE && !carteEtat.ko) div.draggable = true;

  // Construction du HTML interne
  div.innerHTML = `
    <!-- Image de la carte (ou dos si masquée) -->
    <div class="carte-image-wrap">
      <img src="${masquer ? 'assets/dos-carte.png' : carteEtat.imageUrl}"
           alt="${masquer ? '???' : carteEtat.nom}"
           class="carte-img">
    </div>

    <!-- Barre de PV (masquée si carte adverse sur banc) -->
    ${!masquer ? `
      <div class="carte-pv-bar">
        <div class="carte-pv-fill"
             style="width:${Math.round((carteEtat.pvActuels / carteEtat.pvMax) * 100)}%">
        </div>
      </div>
      <div class="carte-pv-texte">${carteEtat.pvActuels}/${carteEtat.pvMax}</div>
    ` : ''}

    <!-- Statuts actifs -->
    <div class="carte-statuts">
      ${carteEtat.statutsActifs.map(s =>
        `<img src="assets/statuts/${s}.png" class="statut-icon" title="${s}">`
      ).join('')}
    </div>

    <!-- Nom (affiché sous la carte) -->
    ${!masquer ? `<div class="carte-nom">${carteEtat.nom}</div>` : ''}
  `;

  return div;
}


// ============================================================
// 3A - REMPLISSAGE DU TIROIR
// Le tiroir affiche les cartes de MON banc que je peux jouer
// ============================================================

/**
 * Remplit le tiroir (banc accessible) avec mes cartes sur le banc
 */
function remplirTiroir() {
  // On cherche le conteneur du tiroir (onglet "Banc")
  const conteneur = document.getElementById('tiroir-banc');
  if (!conteneur) return;
  conteneur.innerHTML = '';

  ETAT.terrain[MON_ROLE].banc.forEach((carteEtat, i) => {
    if (!carteEtat || carteEtat.ko) return; // on skip les vides et les KO

    const div = document.createElement('div');
    div.className = 'tiroir-item';
    div.draggable = true;
    div.dataset.source = 'banc';
    div.dataset.index  = i;
    div.innerHTML = `
      <img src="${carteEtat.imageUrl}" alt="${carteEtat.nom}">
      <span>${carteEtat.nom}</span>
    `;
    conteneur.appendChild(div);
  });
}


// ============================================================
// 3A - COMPTEUR DE TOUR ET PA
// ============================================================

/**
 * Met à jour l'affichage du compteur de tour et des PA
 */
function mettreAJourCompteur() {
  const labelTour   = document.getElementById('labelTour');
  const labelJoueur = document.getElementById('labelJoueur');
  const btnFin      = document.getElementById('btnFinTour');

  // Phase placement → texte spécifique
  if (ETAT.phase === 'placement') {
    labelTour.textContent   = '🏗️ Phase de Placement';
    labelJoueur.textContent = ETAT.tourActuel === MON_ROLE
      ? '➡️ C\'est votre tour de placer une carte'
      : '⏳ L\'adversaire place une carte...';
    btnFin.style.display = ETAT.tourActuel === MON_ROLE ? 'block' : 'none';
    return;
  }

  // Phase de jeu normale
  labelTour.textContent = `⚔️ Tour ${ETAT.numeroTour}`;

  if (ETAT.tourActuel === MON_ROLE) {
    labelJoueur.textContent = `🎮 Votre tour — PA : ${ETAT.paRestants}`;
    btnFin.style.display = 'block';
  } else {
    labelJoueur.textContent = '⏳ Tour adverse...';
    btnFin.style.display = 'none';
  }
}


// ============================================================
// MISE A JOUR DE demarrerPartie() pour brancher 3A
// (remplace le console.log de l'étape 2)
// ============================================================

/**
 * Override de demarrerPartie : on branche l'initialisation du terrain
 */
async function demarrerPartie() {
  document.getElementById('overlaySelection').style.display = 'none';

  const moiSnap = await getDoc(selectionMoiRef);
  const advSnap = await getDoc(selectionAdvRef);

  const monEquipe = moiSnap.data().cartes;
  const equipeAdv = advSnap.data().cartes;

  // Lance l'initialisation du terrain avec les 2 équipes
  initialiserTerrain(monEquipe, equipeAdv);
}
// ============================================================
// 3B - DRAG & DROP
// Permet de déplacer les cartes depuis le tiroir ou le terrain
// vers les slots du terrain (banc, combattants, invocations)
// ============================================================

/**
 * Rend un élément carte "draggable"
 * @param {HTMLElement} el     - l'élément DOM à rendre draggable
 * @param {string} carteId     - l'id de la carte
 * @param {string} origine     - "tiroir" | "banc" | "combattant" | "invocation"
 * @param {number} origineIndex - index du slot d'origine (si terrain)
 */
function rendreCardDraggable(el, carteId, origine, origineIndex = null) {
  el.setAttribute('draggable', true);

  // ---- DEBUT DU DRAG ----
  el.addEventListener('dragstart', (e) => {
    // On stocke les infos dans le dataTransfer pour les récupérer au drop
    e.dataTransfer.setData('carteId',      carteId);
    e.dataTransfer.setData('origine',      origine);
    e.dataTransfer.setData('origineIndex', origineIndex ?? '');
    el.classList.add('dragging'); // opacité réduite pendant le drag
  });

  // ---- FIN DU DRAG ----
  el.addEventListener('dragend', () => {
    el.classList.remove('dragging');
  });
}


/**
 * Rend un slot "droppable"
 * @param {HTMLElement} slotEl   - le slot DOM cible
 * @param {string} typeSlot      - "banc" | "combattant" | "invocation"
 * @param {string} joueur        - "j1" | "j2"
 * @param {number} index         - index du slot
 */
function rendreSlotDroppable(slotEl, typeSlot, joueur, index) {

  // Autoriser le drop en annulant le comportement par défaut
  slotEl.addEventListener('dragover', (e) => {
    e.preventDefault();
    slotEl.classList.add('drop-survol'); // highlight visuel
  });

  slotEl.addEventListener('dragleave', () => {
    slotEl.classList.remove('drop-survol');
  });

  // ---- DROP ----
  slotEl.addEventListener('drop', (e) => {
    e.preventDefault();
    slotEl.classList.remove('drop-survol');

    // Récupérer les données du drag
    const carteId      = e.dataTransfer.getData('carteId');
    const origine      = e.dataTransfer.getData('origine');
    const origineIndex = e.dataTransfer.getData('origineIndex');

    // On ne peut déplacer que ses propres cartes
    if (joueur !== MON_ROLE) {
      afficherNotif("❌ Vous ne pouvez pas déplacer les cartes adverses !");
      return;
    }

    // Vérifier que le slot cible est vide
    if (ETAT.terrain[joueur][typeSlot === 'banc' ? 'banc' : 
        typeSlot === 'combattant' ? 'combattants' : 'invocations'][index] !== null) {
      afficherNotif("❌ Ce slot est déjà occupé !");
      return;
    }

    // Appliquer le déplacement
    deplacerCarte(carteId, origine, origineIndex, typeSlot, index);
  });
}


/**
 * Déplace une carte d'un emplacement à un autre
 * Met à jour l'état local ET Firestore
 * @param {string} carteId       - id de la carte déplacée
 * @param {string} origine       - emplacement source
 * @param {number} origineIndex  - index source
 * @param {string} destination   - emplacement cible
 * @param {number} destIndex     - index cible
 */
async function deplacerCarte(carteId, origine, origineIndex, destination, destIndex) {

  // ---- Récupérer la carte depuis l'état ----
  const cle = {
    banc:       'banc',
    combattant: 'combattants',
    invocation: 'invocations'
  };

  const tableauSource = ETAT.terrain[MON_ROLE][cle[origine]];
  const carte = tableauSource[origineIndex];

  if (!carte) return; // sécurité

  // ---- Retirer de la source ----
  tableauSource[origineIndex] = null;

  // ---- Placer dans la destination ----
  ETAT.terrain[MON_ROLE][cle[destination]][destIndex] = carte;

  // ---- Mettre à jour Firestore ----
  await syncTerrainFirestore();

  // ---- Re-rendre le terrain visuellement ----
  rendreTerrainComplet();

  // ---- Log ----
  ajouterLog(
    `🔀 ${carte.nom} déplacé${carte.nom.endsWith('e') ? 'e' : ''} ` +
    `de ${origine} vers ${destination} (slot ${destIndex + 1})`
  );
}


/**
 * Synchronise l'état local du terrain vers Firestore
 * pour que l'adversaire voie les changements en temps réel
 */
async function syncTerrainFirestore() {
  try {
    await setDoc(
      doc(db, 'parties', PARTIE_ID, 'terrains', MON_ROLE),
      {
        banc:        ETAT.terrain[MON_ROLE].banc,
        combattants: ETAT.terrain[MON_ROLE].combattants,
        invocations: ETAT.terrain[MON_ROLE].invocations,
        updatedAt:   Date.now()
      }
    );
  } catch (err) {
    console.error('Erreur sync terrain :', err);
  }
}


/**
 * Écoute en temps réel le terrain adverse depuis Firestore
 * et met à jour l'affichage dès qu'il change
 */
function ecouterTerrainAdverse() {
  const terrainAdvRef = doc(db, 'parties', PARTIE_ID, 'terrains', ADVERSAIRE);

  onSnapshot(terrainAdvRef, (snap) => {
    if (!snap.exists()) return;

    const data = snap.data();

    // Mettre à jour l'état local avec les données adverses
    ETAT.terrain[ADVERSAIRE].banc        = data.banc        ?? [null, null, null];
    ETAT.terrain[ADVERSAIRE].combattants = data.combattants ?? [null, null, null];
    ETAT.terrain[ADVERSAIRE].invocations = data.invocations ?? Array(12).fill(null);

    // Re-rendre uniquement le terrain adverse
    rendreLigne('banc',        ADVERSAIRE, 'banc-slot',    'banc');
    rendreLigne('combattants', ADVERSAIRE, 'combat-slot',  'combattant');
    rendreLigne('invocations', ADVERSAIRE, 'invoc-cell',   'invocation');
  });
}


// ============================================================
// HIGHLIGHT DES SLOTS VALIDES PENDANT LE DRAG
// On allume uniquement les slots où la carte peut aller
// ============================================================

/**
 * Active le highlight sur tous les slots droppables du joueur
 */
function activerHighlightSlots() {
  document.querySelectorAll(
    `.banc-slot[data-joueur="${MON_ROLE}"],
     .combat-slot[data-joueur="${MON_ROLE}"],
     .invoc-cell[data-joueur="${MON_ROLE}"]`
  ).forEach(slot => slot.classList.add('slot-highlight'));
}

/**
 * Désactive tous les highlights
 */
function desactiverHighlightSlots() {
  document.querySelectorAll('.slot-highlight')
    .forEach(slot => slot.classList.remove('slot-highlight'));
}

// On branche les highlights sur les events globaux de drag
document.addEventListener('dragstart', activerHighlightSlots);
document.addEventListener('dragend',   desactiverHighlightSlots);

// ============================================================
// 3C - FIREBASE TEMPS REEL
// Synchronisation complète de la partie entre les 2 joueurs
// ============================================================


// ============================================================
// INITIALISATION DE LA PARTIE COMPLETE
// Point d'entrée appelé après la sélection d'équipe
// ============================================================

/**
 * Démarre la synchronisation complète de la partie
 * Appelée une fois que les 2 joueurs sont prêts
 */
async function demarrerSyncPartie() {
  console.log(`🎮 Démarrage partie ${PARTIE_ID} en tant que ${MON_ROLE}`);

  // 1. Écouter l'état global de la partie (tour, PA, phase)
  ecouterEtatPartie();

  // 2. Écouter le terrain adverse en temps réel
  ecouterTerrainAdverse();

  // 3. Écouter le chat
  ecouterChat();

  // 4. Écouter les logs
  ecouterLogs();

  // 5. Si J1, initialiser l'état de la partie dans Firestore
  if (MON_ROLE === 'j1') {
    await initialiserEtatFirestore();
  }
}


/**
 * Initialise le document de la partie dans Firestore (fait par J1 uniquement)
 * Crée la structure de base si elle n'existe pas encore
 */
async function initialiserEtatFirestore() {
  const partieRef = doc(db, 'parties', PARTIE_ID);
  const snap = await getDoc(partieRef);

  // Ne pas écraser une partie déjà en cours
  if (snap.exists() && snap.data().phase === 'jeu') return;

  await setDoc(partieRef, {
    phase:       'placement',  // "placement" | "jeu"
    tourActuel:  'j1',         // qui joue en ce moment
    numeroTour:  1,
    paJ1:        PA_TOUR_1_PREMIER,
    paJ2:        PA_TOUR_1_SECOND,
    finTourJ1:   false,        // J1 a-t-il fini son tour ?
    finTourJ2:   false,        // J2 a-t-il fini son tour ?
    createdAt:   Date.now()
  });

  console.log('✅ État Firestore initialisé par J1');
}


// ============================================================
// ECOUTE DE L'ETAT GLOBAL DE LA PARTIE
// ============================================================

/**
 * Écoute en temps réel le document principal de la partie
 * Met à jour l'UI dès qu'un changement est détecté
 */
function ecouterEtatPartie() {
  const partieRef = doc(db, 'parties', PARTIE_ID);

  onSnapshot(partieRef, (snap) => {
    if (!snap.exists()) return;
    const data = snap.data();

    // Mettre à jour l'état local
    ETAT.phase       = data.phase;
    ETAT.tourActuel  = data.tourActuel;
    ETAT.numeroTour  = data.numeroTour;
    ETAT.paRestants  = MON_ROLE === 'j1' ? data.paJ1 : data.paJ2;

    // Mettre à jour l'affichage du compteur
    mettreAJourCompteur();

    // Activer/désactiver le bouton fin de tour
    const cEstMonTour = data.tourActuel === MON_ROLE;
    document.getElementById('btnFinTour').disabled = !cEstMonTour;

    // Vérifier si les 2 joueurs ont fini leur tour
    if (data.finTourJ1 && data.finTourJ2) {
      passerTourSuivant();
    }
  });
}


// ============================================================
// GESTION DES TOURS
// ============================================================

/**
 * Appelée quand le joueur clique sur "Fin de tour"
 * Marque son tour comme terminé dans Firestore
 */
async function finirMonTour() {
  const partieRef = doc(db, 'parties', PARTIE_ID);

  // Marquer ce joueur comme ayant fini
  await updateDoc(partieRef, {
    [`finTour${MON_ROLE.toUpperCase()}`]: true
  });

  // Désactiver le bouton pour éviter double-clic
  document.getElementById('btnFinTour').disabled = true;

  ajouterLog(`⏹️ ${MON_ROLE.toUpperCase()} a terminé son tour`);
}


/**
 * Passe au tour suivant (déclenché quand les 2 finTour sont true)
 * Exécuté uniquement par J1 pour éviter les doublons
 */
async function passerTourSuivant() {
  // Seul J1 écrit le nouveau tour dans Firestore
  if (MON_ROLE !== 'j1') return;

  const partieRef = doc(db, 'parties', PARTIE_ID);
  const snap = await getDoc(partieRef);
  const data = snap.data();

  const nouveauTour = data.numeroTour + 1;

  await updateDoc(partieRef, {
    numeroTour:  nouveauTour,
    tourActuel:  'j1',             // J1 commence toujours le nouveau tour
    paJ1:        PA_NORMAL,        // 3 PA à partir du tour 2
    paJ2:        PA_NORMAL,
    finTourJ1:   false,            // reset les flags
    finTourJ2:   false,
    phase:       'jeu'
  });

  console.log(`⏭️ Tour ${nouveauTour} commencé`);
}


/**
 * Dépense un PA pour une action
 * @param {number} cout - nombre de PA à dépenser (1 ou 2)
 * @returns {boolean} - true si l'action est autorisée
 */
async function dpenserPA(cout = 1) {
  // Vérifier qu'il reste assez de PA
  if (ETAT.paRestants < cout) {
    afficherNotif(`❌ Pas assez de PA ! (il vous en reste ${ETAT.paRestants})`);
    return false;
  }

  // Mettre à jour dans Firestore
  const partieRef = doc(db, 'parties', PARTIE_ID);
  await updateDoc(partieRef, {
    [`pa${MON_ROLE.toUpperCase()}`]: ETAT.paRestants - cout
  });

  return true;
}


// ============================================================
// CHAT EN TEMPS REEL
// ============================================================

/**
 * Envoie un message dans le chat
 */
async function envoyerMessage() {
  const champ = document.getElementById('chatField');
  const texte = champ.value.trim();
  if (!texte) return;

  // Ajouter le message dans la sous-collection "chat" de la partie
  await addDoc(
    collection(db, 'parties', PARTIE_ID, 'chat'),
    {
      auteur:    MON_ROLE,
      texte:     texte,
      timestamp: Date.now()
    }
  );

  champ.value = ''; // vider le champ
}

/**
 * Écoute les nouveaux messages en temps réel
 */
function ecouterChat() {
  const chatRef = collection(db, 'parties', PARTIE_ID, 'chat');

  // On trie par timestamp pour avoir les messages dans l'ordre
  onSnapshot(query(chatRef, orderBy('timestamp')), (snap) => {
    snap.docChanges().forEach((change) => {
      if (change.type !== 'added') return;

      const msg = change.doc.data();
      const div = document.createElement('div');
      div.className = 'chat-message';

      // Mise en forme : "J1 : bonjour !"
      div.innerHTML = `
        <span class="auteur">${msg.auteur.toUpperCase()}</span> : ${msg.texte}
      `;

      document.getElementById('chatMessages').appendChild(div);

      // Auto-scroll vers le bas
      const container = document.getElementById('chatMessages');
      container.scrollTop = container.scrollHeight;
    });
  });
}

// Brancher le bouton envoyer et la touche Entrée
document.getElementById('btnEnvoyer').addEventListener('click', envoyerMessage);
document.getElementById('chatField').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') envoyerMessage();
});


// ============================================================
// LOGS EN TEMPS REEL
// ============================================================

/**
 * Ajoute un log dans Firestore (visible par les 2 joueurs)
 * @param {string} texte - le message de log
 */
async function ajouterLog(texte) {
  await addDoc(
    collection(db, 'parties', PARTIE_ID, 'logs'),
    {
      texte:     texte,
      timestamp: Date.now()
    }
  );
}

/**
 * Écoute les nouveaux logs en temps réel
 */
function ecouterLogs() {
  const logsRef = collection(db, 'parties', PARTIE_ID, 'logs');

  onSnapshot(query(logsRef, orderBy('timestamp')), (snap) => {
    snap.docChanges().forEach((change) => {
      if (change.type !== 'added') return;

      const log = change.doc.data();
      const div = document.createElement('div');
      div.className = 'log-entry';
      div.textContent = log.texte;

      document.getElementById('logs').appendChild(div);

      // Auto-scroll
      const container = document.getElementById('logs');
      container.scrollTop = container.scrollHeight;
    });
  });
}


// ============================================================
// NOTIFICATIONS TEMPORAIRES
// Petit toast qui disparaît après 2.5s
// ============================================================

/**
 * Affiche une notification temporaire à l'écran
 * @param {string} texte - le message à afficher
 */
function afficherNotif(texte) {
  // Créer l'élément toast
  const toast = document.createElement('div');
  toast.className = 'toast-notif';
  toast.textContent = texte;
  document.body.appendChild(toast);

  // Apparition
  requestAnimationFrame(() => toast.classList.add('visible'));

  // Disparition après 2.5s
  setTimeout(() => {
    toast.classList.remove('visible');
    setTimeout(() => toast.remove(), 300);
  }, 2500);
}


// ============================================================
// BRANCHEMENT DU BOUTON FIN DE TOUR
// ============================================================
document.getElementById('btnFinTour').addEventListener('click', finirMonTour);


// ============================================================
// LANCEMENT AU CHARGEMENT
// On démarre la sync dès que la page est prête
// ============================================================
demarrerSyncPartie();

// ============================================================
// INITIALISATION AU CHARGEMENT
// ============================================================
chargerGalerie();

// Le bouton Prêt est désactivé tant que les 3 slots ne sont pas remplis
document.getElementById('btnPret').disabled = true;
