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
  setDoc,
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
  signOut,
  setPersistence,
  browserLocalPersistence
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
const analytics = getAnalytics(app);
const auth = getAuth(app);

// Forceer permanente opslag van de inlogsessie op het apparaat
setPersistence(auth, browserLocalPersistence).catch((err) => {
  console.warn("Kon browserLocalPersistence niet instellen:", err);
});

let db;
try {
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager()
    })
  });
} catch (error) {
  console.warn("Offline-cache kon niet worden ingeschakeld:", error);
  db = getFirestore(app);
}

const listsCol = collection(db, "lists");
const mealsCol = collection(db, "meals");

const authView = document.getElementById("view-auth");
const dashboardView = document.getElementById("view-dashboard");
const detailView = document.getElementById("view-list-detail");
const mealView = document.getElementById("view-mealplanner");
const bottomNav = document.getElementById("bottom-nav");
const pinInput = document.getElementById("auth-pin");
const authError = document.getElementById("auth-error");

const navBtnLists = document.getElementById("nav-btn-lists");
const navBtnMeals = document.getElementById("nav-btn-meals");

let currentTab = "lists"; // "lists" of "meals"
let activeListId = null;
let activeListName = "";
let currentLists = [];
let currentItems = [];
let unsubscribeLists = null;
let unsubscribeItems = null;
let unsubscribeActiveListDoc = null;
let unsubscribeMeals = null;

const SVG_EDIT = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>`;
const SVG_TRASH = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;

onAuthStateChanged(auth, (user) => {
  if (user) {
    unlockApp();
  } else {
    authView.classList.remove("hidden");
    dashboardView.classList.add("hidden");
    detailView.classList.add("hidden");
    mealView.classList.add("hidden");
    bottomNav?.classList.add("hidden");
  }
});

document.getElementById("auth-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const getyptePin = pinInput.value;

  try {
    await signInWithEmailAndPassword(auth, AUTH_EMAIL, getyptePin);
    authError.textContent = "";
    pinInput.value = "";
  } catch (error) {
    authError.textContent = "Onjuiste toegangscode of geen verbinding.";
    pinInput.value = "";
    pinInput.focus();
  }
});

async function handleLogout() {
  if (unsubscribeLists) unsubscribeLists();
  if (unsubscribeItems) unsubscribeItems();
  if (unsubscribeActiveListDoc) unsubscribeActiveListDoc();
  if (unsubscribeMeals) unsubscribeMeals();
  await signOut(auth);
}

document.getElementById("btn-lock-app")?.addEventListener("click", handleLogout);
document
