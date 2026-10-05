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

const inputEl = document.getElementById("item-input");
const suggestionsEl = document.getElementById("suggestions");

inputEl.addEventListener("input", () => {
  const val = inputEl.value.toLowerCase().trim();
  suggestionsEl.innerHTML = "";
  if (val.length < 1) { suggestionsEl.style.display = "none"; return; }

  const matches = commonGroceries.filter(item => typeof item === "string" && item.toLowerCase().includes(val)).slice(0, 6);
  if (matches.length === 0) { suggestionsEl.style.display = "none"; return; }

  matches.forEach(item => {
    const li = document.createElement("li");
    li.textContent = item;
    li.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      inputEl.value = item;
      suggestionsEl.style.display = "none";
      inputEl.focus();
    });
    suggestionsEl.appendChild(li);
  });
  suggestionsEl.style.display = "block";
});

document.addEventListener("pointerdown", (e) => {
  if (!inputEl.contains(e.target) && !suggestionsEl.contains(e.target)) {
    suggestionsEl.style.display = "none";
  }
});

// Dashboard & Lijsten
let isDashboardDragging = false;
let draggedDashboardCard = null;

function startDashboardListener() {
  if (unsubscribeLists) return;

  const listsEmpty = document.getElementById("lists-empty");
  const qLists = query(listsCol);

  unsubscribeLists = onSnapshot(qLists, (snapshot) => {
    currentLists = [];
    snapshot.forEach(docSnap => {
      const d = docSnap.data();
      currentLists.push({
        id: docSnap.id,
        ...d,
        order: d.order ?? 9999
      });
    });

    if (currentLists.length === 0) listsEmpty.classList.remove("hidden");
    else listsEmpty.classList.add("hidden");

    renderDashboardLists();
  });
}

function renderDashboardLists() {
  if (isDashboardDragging) return;

  const listsContainer = document.getElementById("lists-container");
  listsContainer.innerHTML = "";

  const sorted = [...currentLists].sort((a, b) => {
    if ((a.order ?? 9999) !== (b.order ?? 9999)) return (a.order ?? 9999) - (b.order ?? 9999);
    const aTime = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
    const bTime = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
    return aTime - bTime;
  });

  sorted.forEach((data) => {
    const listId = data.id;
    const li = document.createElement("li");
    li.className = "list-card";
    li.dataset.id = listId;
    li.draggable = true;
    
    li.innerHTML = `
      <div class="card-info">
        <h3>${data.name}</h3>
        <span id="count-${listId}">Laden...</span>
      </div>
      <div class="card-actions">
        <button class="btn-action-icon btn-edit-card" title="Lijst hernoemen">${SVG_EDIT}</button>
        <button class="btn-action-icon danger btn-delete-card" title="Lijst verwijderen">${SVG_TRASH}</button>
      </div>
    `;

    const itemsRef = collection(db, "lists", listId, "items");
    onSnapshot(itemsRef, (itemSnap) => {
      let openProducts = 0;
      itemSnap.forEach(d => { if (!d.data().completed) openProducts++; });
      const countEl = document.getElementById(`count-${listId}`);
      if (countEl) {
        if (itemSnap.empty) countEl.textContent = "Geen producten";
        else if (openProducts === 0) countEl.textContent = "Alles gehaald! 🎉";
        else countEl.textContent = `${openProducts} te halen`;
      }
    });

    li.addEventListener("click", () => openList(listId, data.name));
    li.addEventListener("contextmenu", (e) => e.preventDefault());

    li.querySelector(".btn-edit-card").addEventListener("click", (e) => {
      e.stopPropagation();
      openPromptModal("Lijstnaam aanpassen", data.name, null
