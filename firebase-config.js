// Configuration Firebase
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDwwHpkHaTlHw1JptFXCytAVHfv25_J-jM",
  authDomain: "royalearena-4b69a.firebaseapp.com",
  storageBucket: "royalearena-4b69a.firebasestorage.app",
  projectId: "royalearena-4b69a",
  messagingSenderId: "33775249550",
  appId: "1:33775249550:web:a54024f7d9042eb23e01df"
};

// Initialisation Firebase + export de l'app ET de la base Firestore
// (app est exportée pour pouvoir initialiser d'autres modules comme l'Auth dans lobby.html)
export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
