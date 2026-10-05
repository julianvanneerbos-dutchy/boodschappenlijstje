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

try {
  getAnalytics(app);
} catch (e) {
  console.warn("Analytics kon niet gestart worden:", e);
}

const auth = getAuth(app);

// Veilig persistentie instellen zonder crash bij privacy-modes
try {
  setPersistence(auth, browserLocalPersistence).catch((e) => {
    console.warn("setPersistence fallback:", e);
  });
} catch (e) {
  console.warn("setPersistence niet ondersteund:", e);
}

let db;
try {
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager()
    })
  });
} catch (error) {
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

let currentTab = "lists";
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
    lockApp();
  }
});

function lockApp() {
  if (authView) authView.classList.remove("hidden");
  if (dashboardView) dashboardView.classList.add("hidden");
  if (detailView) detailView.classList.add("hidden");
  if (mealView) mealView.classList.add("hidden");
  if (bottomNav) bottomNav.classList.add("hidden");
}

function unlockApp() {
  if (authView) authView.classList.add("hidden");
  if (bottomNav) bottomNav.classList.remove("hidden");
  switchTab(currentTab || "lists");
  startDashboardListener();
}

// Inlog-afhandeling
const authForm = document.getElementById("auth-form");
if (authForm) {
  authForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const pin = pinInput ? pinInput.value.trim() : "";
    if (!pin) return;

    if (authError) authError.textContent = "Bezig met controleren...";

    try {
      await signInWithEmailAndPassword(auth, AUTH_EMAIL, pin);
      if (authError) authError.textContent = "";
      if (pinInput) pinInput.value = "";
    } catch (error) {
      console.error("Inlogfout:", error);
      if (authError) {
        if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
          authError.textContent = "Onjuiste pincode.";
        } else if (error.code === 'auth/too-many-requests') {
          authError.textContent = "Te vaak geprobeerd. Wacht heel even.";
        } else {
          authError.textContent = "Fout: " + (error.message || "Geen verbinding met server");
        }
      }
      if (pinInput) {
        pinInput.value = "";
        pinInput.focus();
      }
    }
  });
}

async function handleLogout() {
  if (unsubscribeLists) unsubscribeLists();
  if (unsubscribeItems) unsubscribeItems();
  if (unsubscribeActiveListDoc) unsubscribeActiveListDoc();
  if (unsubscribeMeals) unsubscribeMeals();
  await signOut(auth);
}

document.getElementById("btn-lock-app")?.addEventListener("click", handleLogout);
document.getElementById("btn-lock-app-meals")?.addEventListener("click", handleLogout);

function switchTab(tab) {
  currentTab = tab;
  if (tab === "lists") {
    navBtnLists?.classList.add("active");
    navBtnMeals?.classList.remove("active");
    mealView?.classList.add("hidden");
    if (activeListId) {
      detailView?.classList.remove("hidden");
      dashboardView?.classList.add("hidden");
    } else {
      dashboardView?.classList.remove("hidden");
      detailView?.classList.add("hidden");
    }
  } else {
    navBtnMeals?.classList.add("active");
    navBtnLists?.classList.remove("active");
    dashboardView?.classList.add("hidden");
    detailView?.classList.add("hidden");
    mealView?.classList.remove("hidden");
    initMealPlanner();
  }
}

navBtnLists?.addEventListener("click", () => switchTab("lists"));
navBtnMeals?.addEventListener("click", () => switchTab("meals"));

function openList(listId, listName) {
  activeListId = listId;
  activeListName = listName;
  const titleEl = document.getElementById("active-list-title");
  if (titleEl) titleEl.textContent = listName;

  dashboardView?.classList.add("hidden");
  mealView?.classList.add("hidden");
  detailView?.classList.remove("hidden");

  history.pushState({ view: "detail" }, "");
  listenToItems(listId);
  listenToActiveListDoc(listId);
}

function goBackToDashboard() {
  if (unsubscribeItems) unsubscribeItems();
  if (unsubscribeActiveListDoc) unsubscribeActiveListDoc();
  activeListId = null;
  detailView?.classList.add("hidden");
  if (currentTab === "lists") {
    dashboardView?.classList.remove("hidden");
  } else {
    mealView?.classList.remove("hidden");
  }
  
  document.getElementById("confirm-modal")?.classList.add("hidden");
  document.getElementById("prompt-modal")?.classList.add("hidden");
  document.getElementById("changelog-modal")?.classList.add("hidden");
  onConfirmCallback = null;
  onPromptCallback = null;
}

document.getElementById("btn-back-to-dashboard")?.addEventListener("click", () => {
  history.back();
});

window.addEventListener("popstate", () => {
  if (detailView && !detailView.classList.contains("hidden")) {
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

if (inputEl && suggestionsEl) {
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
}

// Dashboard functionaliteit
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

    if (listsEmpty) {
      if (currentLists.length === 0) listsEmpty.classList.remove("hidden");
      else listsEmpty.classList.add("hidden");
    }

    renderDashboardLists();
  });
}

function renderDashboardLists() {
  if (isDashboardDragging) return;

  const listsContainer = document.getElementById("lists-container");
  if (!listsContainer) return;
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

    li.querySelector(".btn-edit-card")?.addEventListener("click", (e) => {
      e.stopPropagation();
      openPromptModal("Lijstnaam aanpassen", data.name, null, async (newName) => {
        await updateDoc(doc(db, "lists", listId), { name: newName });
      });
    });

    li.querySelector(".btn-delete-card")?.addEventListener("click", (e) => {
      e.stopPropagation();
      openConfirmModal("Lijst verwijderen?", "Weet je het zeker? De hele lijst en alle producten worden gewist.", async () => {
        const snap = await getDocs(collection(db, "lists", listId, "items"));
        const batch = writeBatch(db);
        snap.forEach(d => batch.delete(d.ref));
        batch.delete(doc(db, "lists", listId));
        await batch.commit();
      });
    });

    attachDashboardTouch(li);
    attachDashboardMouseDrag(li);

    listsContainer.appendChild(li);
  });

  setupDashboardDropZone(listsContainer);
}

function attachDashboardTouch(li) {
  let pressTimer = null, startY = 0, startX = 0;

  li.addEventListener("touchstart", (e) => {
    if (e.target.closest(".card-actions")) return;
    startY = e.touches[0].clientY; startX = e.touches[0].clientX;
    pressTimer = setTimeout(() => {
      isDashboardDragging = true;
      if (navigator.vibrate) navigator.vibrate(40);
      li.classList.add("is-dragging");
      initDashboardTouchMove(li);
    }, 260);
  }, { passive: true });

  li.addEventListener("touchmove", (e) => {
    if (Math.abs(e.touches[0].clientX - startX) > 6 || Math.abs(e.touches[0].clientY - startY) > 6) {
      if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
    }
  }, { passive: true });

  li.addEventListener("touchend", () => { if (pressTimer) clearTimeout(pressTimer); });
  li.addEventListener("touchcancel", () => { if (pressTimer) clearTimeout(pressTimer); });
}

function initDashboardTouchMove(draggedCard) {
  const listEl = document.getElementById("lists-container");
  if (!listEl) return;
  const onMove = (e) => {
    if (!isDashboardDragging) return;
    const afterElement = getGenericDragAfterElement(listEl, "li.list-card:not(.is-dragging)", e.touches[0].clientY);
    if (afterElement == null) listEl.appendChild(draggedCard);
    else listEl.insertBefore(draggedCard, afterElement);
  };
  const onEnd = async () => {
    window.removeEventListener("touchmove", onMove); window.removeEventListener("touchend", onEnd);
    draggedCard.classList.remove("is-dragging"); isDashboardDragging = false;
    await saveDashboardOrder(listEl);
  };
  window.addEventListener("touchmove", onMove, { passive: false });
  window.addEventListener("touchend", onEnd);
}

function attachDashboardMouseDrag(li) {
  li.addEventListener("dragstart", (e) => {
    if (e.target.closest(".card-actions")) { e.preventDefault(); return; }
    isDashboardDragging = true; draggedDashboardCard = li; li.classList.add("is-dragging");
    e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", li.dataset.id);
  });
  li.addEventListener("dragend", async () => {
    li.classList.remove("is-dragging"); isDashboardDragging = false; draggedDashboardCard = null;
    const listEl = document.getElementById("lists-container");
    if (listEl) await saveDashboardOrder(listEl);
  });
}

function setupDashboardDropZone(container) {
  container.addEventListener("dragover", (e) => {
    e.preventDefault();
    if (!draggedDashboardCard) return;
    const afterElement = getGenericDragAfterElement(container, "li.list-card:not(.is-dragging)", e.clientY);
    if (afterElement == null) container.appendChild(draggedDashboardCard);
    else container.insertBefore(draggedDashboardCard, afterElement);
  });
}

async function saveDashboardOrder(container) {
  const cards = [...container.querySelectorAll("li.list-card")];
  const batch = writeBatch(db);
  cards.forEach((card, idx) => {
    batch.update(doc(db, "lists", card.dataset.id), { order: idx + 1 });
  });
  await batch.commit();
  renderDashboardLists();
}

document.getElementById("add-list-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = document.getElementById("new-list-name");
  const name = input ? input.value.trim() : "";
  if (!name) return;
  const nextOrder = currentLists.length > 0 ? Math.max(...currentLists.map(l => l.order ?? 0)) + 1 : 1;
  await addDoc(listsCol, { name: name, order: nextOrder, note: "", createdAt: serverTimestamp() });
  if (input) input.value = "";
});

// Items
function listenToItems(listId) {
  if (unsubscribeItems) unsubscribeItems();

  const itemsCol = collection(db, "lists", listId, "items");
  const qItems = query(itemsCol, orderBy("order", "asc"));
  const clearBtn = document.getElementById("btn-open-clear-items");
  const itemsEmpty = document.getElementById("items-empty");
  const summaryCard = document.getElementById("summary-container");
  const summaryTotal = document.getElementById("summary-total");
  const summaryToBuy = document.getElementById("summary-to-buy");
  const summaryInCart = document.getElementById("summary-in-cart");

  unsubscribeItems = onSnapshot(qItems, (snapshot) => {
    currentItems = [];
    let totalProducts = 0, toBuyProducts = 0, inCartProducts = 0;

    snapshot.forEach(docSnap => {
      const it = { id: docSnap.id, ...docSnap.data() };
      it.qty = it.qty ?? 1;
      currentItems.push(it);
      totalProducts++;
      if (it.completed) inCartProducts++; else toBuyProducts++;
    });

    if (clearBtn) clearBtn.disabled = currentItems.length === 0;

    if (currentItems.length === 0) {
      itemsEmpty?.classList.remove("hidden");
      summaryCard?.classList.add("hidden");
    } else {
      itemsEmpty?.classList.add("hidden");
      summaryCard?.classList.remove("hidden");
      if (summaryTotal) summaryTotal.textContent = totalProducts;
      if (summaryToBuy) summaryToBuy.textContent = toBuyProducts;
      if (summaryInCart) summaryInCart.textContent = inCartProducts;
    }
    renderItems();
  });
}

const noteInput = document.getElementById("list-note-input");
const saveNoteBtn = document.getElementById("btn-save-note");
const noteSavedIndicator = document.getElementById("note-saved-indicator");

function listenToActiveListDoc(listId) {
  if (unsubscribeActiveListDoc) unsubscribeActiveListDoc();

  unsubscribeActiveListDoc = onSnapshot(doc(db, "lists", listId), (docSnap) => {
    if (!docSnap.exists()) return;
    const data = docSnap.data();
    if (noteInput && document.activeElement !== noteInput) {
      noteInput.value = data.note || "";
    }
  });
}

async function saveActiveListNote() {
  if (!activeListId || !noteInput) return;
  const noteText = noteInput.value.trim();
  await updateDoc(doc(db, "lists", activeListId), { note: noteText });
  if (saveNoteBtn) saveNoteBtn.style.display = "none";
  if (noteSavedIndicator) {
    noteSavedIndicator.style.display = "inline";
    setTimeout(() => { noteSavedIndicator.style.display = "none"; }, 2000);
  }
}

noteInput?.addEventListener("input", () => {
