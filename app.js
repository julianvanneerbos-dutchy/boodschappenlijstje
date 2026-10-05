import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-analytics.js";
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  collection,
  addDoc,
  onSnapshot,
  doc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  serverTimestamp,
  writeBatch,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import { 
  getAuth, 
  signInWithEmailAndPassword, 
  onAuthStateChanged, 
  signOut 
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const AUTH_EMAIL = "julian.vanneerbos@gmail.com"; 

const firebaseConfig = {
  apiKey: "AIzaSyDK3TfrCTrpEXgDeG7eD2_B2KEDwPmqWQE",
  authDomain: "onze-boodschappenlijst.firebaseapp.com",
  projectId: "onze-boodschappenlijst",
  storageBucket: "onze-boodschappenlijst.firebasestorage.app",
  messagingSenderId: "188911309446",
  appId: "1:188911309446:web:3283e385fc23f2ee65f707",
  measurementId: "G-DD8RZY54ZE"
};

const app = initializeApp(firebaseConfig);
let analytics;
try {
  analytics = getAnalytics(app);
} catch (e) {
  console.warn("Analytics niet beschikbaar:", e);
}

const auth = getAuth(app);

let db;
try {
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager()
    })
  });
} catch (error) {
  console.warn("Offline cache fallback:", error);
  db = getFirestore(app);
}

const listsCol = collection(db, "lists");

const authView = document.getElementById("view-auth");
const dashboardView = document.getElementById("view-dashboard");
const detailView = document.getElementById("view-list-detail");
const pinInput = document.getElementById("auth-pin");
const authError = document.getElementById("auth-error");

let activeListId = null;
let activeListName = "";
let currentLists = [];
let currentItems = [];
let unsubscribeLists = null;
let unsubscribeItems = null;
let unsubscribeActiveListDoc = null;

const SVG_EDIT = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>`;
const SVG_TRASH = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;

onAuthStateChanged(auth, (user) => {
  if (user) {
    unlockApp();
  } else {
    authView.classList.remove("hidden");
    dashboardView.classList.add("hidden");
    detailView.classList.add("hidden");
  }
});

document.getElementById("auth-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const getyptePin = pinInput.value.trim();

  // Test-alert 1: Controleert of de browser het nieuwe script laadt
  alert("1. Knop reageert! Ingevoerde pin: " + getyptePin);

  try {
    await signInWithEmailAndPassword(auth, AUTH_EMAIL, getyptePin);
    alert("2. Inloggen geslaagd bij Firebase!");
    authError.textContent = "";
    pinInput.value = "";
  } catch (error) {
    alert("Fout van Firebase: " + error.code + " - " + error.message);
    authError.textContent = "Onjuiste toegangscode of geen verbinding.";
    pinInput.value = "";
    pinInput.focus();
  }
});

document.getElementById("btn-lock-app").addEventListener("click", async () => {
  if (unsubscribeLists) unsubscribeLists();
  if (unsubscribeItems) unsubscribeItems();
  if (unsubscribeActiveListDoc) unsubscribeActiveListDoc();
  await signOut(auth);
});

function unlockApp() {
  authView.classList.add("hidden");
  dashboardView.classList.remove("hidden");
  detailView.classList.add("hidden");
  startDashboardListener();
}

function openList(listId, listName) {
  activeListId = listId;
  activeListName = listName;
  document.getElementById("active-list-title").textContent = listName;

  dashboardView.classList.add("hidden");
  detailView.classList.remove("hidden");

  history.pushState({ view: "detail" }, "");
  listenToItems(listId);
  listenToActiveListDoc(listId);
}

function goBackToDashboard() {
  if (unsubscribeItems) unsubscribeItems();
  if (unsubscribeActiveListDoc) unsubscribeActiveListDoc();
  activeListId = null;
  detailView.classList.add("hidden");
  dashboardView.classList.remove("hidden");
  
  document.getElementById("confirm-modal").classList.add("hidden");
  document.getElementById("prompt-modal").classList.add("hidden");
  document.getElementById("changelog-modal").classList.add("hidden");
  onConfirmCallback = null;
  onPromptCallback = null;
}

document.getElementById("btn-back-to-dashboard").addEventListener("click", () => {
  history.back();
});

window.addEventListener("popstate", () => {
  if (!detailView.classList.contains("hidden")) {
    goBackToDashboard();
  }
});

// Autocomplete
let commonGroceries = [];
fetch('products.json?v=' + Date.now())
  .then(res => res.ok ? res.json() : [])
  .then(data => { commonGroceries = data; })
  .catch(() => {
    commonGroceries = ["Banaan", "Bananen", "Brood", "Melk", "Tomaten", "Appels", "Eieren", "Kaas"];
  });

const inputEl = document.getElementById("item-input
