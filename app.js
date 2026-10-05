import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
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
  appId: "1:188911309446:web:3283e385fc23f2ee65f707"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// Blijf ingelogd op mobiel
setPersistence(auth, browserLocalPersistence).catch((err) => {
  console.warn("Kon persistentie niet forceren:", err);
});

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
let unsubscribeSubcounts = {};

const SVG_EDIT = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>`;
const SVG_TRASH = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;

onAuthStateChanged(auth, (user) => {
  if (user) {
    unlockApp();
  } else {
    stopAllListeners();
    authView?.classList.remove("hidden");
    dashboardView?.classList.add("hidden");
    detailView?.classList.add("hidden");
    mealView?.classList.add("hidden");
    bottomNav?.classList.add("hidden");
  }
});

function stopAllListeners() {
  if (unsubscribeLists) { unsubscribeLists(); unsubscribeLists = null; }
  if (unsubscribeItems) { unsubscribeItems(); unsubscribeItems = null; }
  if (unsubscribeActiveListDoc) { unsubscribeActiveListDoc(); unsubscribeActiveListDoc = null; }
  if (unsubscribeMeals) { unsubscribeMeals(); unsubscribeMeals = null; }
  Object.keys(unsubscribeSubcounts).forEach((id) => {
    if (typeof unsubscribeSubcounts[id] === "function") unsubscribeSubcounts[id]();
  });
  unsubscribeSubcounts = {};
}

document.getElementById("auth-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const getyptePin = pinInput?.value.trim() || "";

  try {
    await signInWithEmailAndPassword(auth, AUTH_EMAIL, getyptePin);
    if (authError) authError.textContent = "";
    if (pinInput) pinInput.value = "";
  } catch (error) {
    if (authError) authError.textContent = "Onjuiste toegangscode of geen verbinding.";
    if (pinInput) {
      pinInput.value = "";
      pinInput.focus();
    }
  }
});

async function handleLogout() {
  stopAllListeners();
  try {
    await signOut(auth);
  } catch (err) {
    console.warn("Fout bij uitloggen:", err);
  }
}

document.getElementById("btn-lock-app")?.addEventListener("click", handleLogout);
document.getElementById("btn-lock-app-meals")?.addEventListener("click", handleLogout);

function unlockApp() {
  authView?.classList.add("hidden");
  bottomNav?.classList.remove("hidden");
  switchTab(currentTab || "lists");
  startDashboardListener();
}

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
  if (unsubscribeItems) { unsubscribeItems(); unsubscribeItems = null; }
  if (unsubscribeActiveListDoc) { unsubscribeActiveListDoc(); unsubscribeActiveListDoc = null; }
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

  unsubscribeLists = onSnapshot(
    qLists,
    (snapshot) => {
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
    },
    (error) => {
      if (error.code !== "permission-denied") console.error("Fout bij lijsten:", error);
    }
  );
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

    if (unsubscribeSubcounts[listId]) unsubscribeSubcounts[listId]();

    const itemsRef = collection(db, "lists", listId, "items");
    unsubscribeSubcounts[listId] = onSnapshot(
      itemsRef,
      (itemSnap) => {
        let openProducts = 0;
        itemSnap.forEach(d => { if (!d.data().completed) openProducts++; });
        const countEl = document.getElementById(`count-${listId}`);
        if (countEl) {
          if (itemSnap.empty) countEl.textContent = "Geen producten";
          else if (openProducts === 0) countEl.textContent = "Alles gehaald! 🎉";
          else countEl.textContent = `${openProducts} te halen`;
        }
      },
      (error) => {
        if (error.code !== "permission-denied") console.error("Fout bij telling:", error);
      }
    );

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
  if (unsubscribeItems) { unsubscribeItems(); unsubscribeItems = null; }

  const itemsCol = collection(db, "lists", listId, "items");
  const qItems = query(itemsCol, orderBy("order", "asc"));
  const clearBtn = document.getElementById("btn-open-clear-items");
  const itemsEmpty = document.getElementById("items-empty");
  const summaryCard = document.getElementById("summary-container");
  const summaryTotal = document.getElementById("summary-total");
  const summaryToBuy = document.getElementById("summary-to-buy");
  const summaryInCart = document.getElementById("summary-in-cart");

  unsubscribeItems = onSnapshot(
    qItems,
    (snapshot) => {
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
    },
    (error) => {
      if (error.code !== "permission-denied") console.error("Fout bij items:", error);
    }
  );
}

// Opmerkingen
const noteInput = document.getElementById("list-note-input");
const saveNoteBtn = document.getElementById("btn-save-note");
const noteSavedIndicator = document.getElementById("note-saved-indicator");

function listenToActiveListDoc(listId) {
  if (unsubscribeActiveListDoc) { unsubscribeActiveListDoc(); unsubscribeActiveListDoc = null; }

  unsubscribeActiveListDoc = onSnapshot(
    doc(db, "lists", listId),
    (docSnap) => {
      if (!docSnap.exists()) return;
      const data = docSnap.data();
      if (noteInput && document.activeElement !== noteInput) {
        noteInput.value = data.note || "";
      }
    },
    (error) => {
      if (error.code !== "permission-denied") console.error("Fout bij notitie:", error);
    }
  );
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
  if (saveNoteBtn) saveNoteBtn.style.display = "inline-block";
});

noteInput?.addEventListener("blur", () => {
  saveActiveListNote();
});

saveNoteBtn?.addEventListener("click", () => {
  saveActiveListNote();
});

let isDraggingActive = false;
let draggedElement = null;

function renderItems() {
  if (isDraggingActive) return;

  const listEl = document.getElementById("items-list");
  if (!listEl) return;
  listEl.innerHTML = "";

  const sorted = [...currentItems].sort((a, b) => {
    if (a.completed === b.completed) return (a.order ?? 0) - (b.order ?? 0);
    return a.completed ? 1 : -1;
  });

  sorted.forEach((item) => {
    const li = document.createElement("li");
    li.className = `item-row ${item.completed ? 'is-done' : ''}`;
    li.dataset.id = item.id;
    if (!item.completed) li.draggable = true;

    li.innerHTML = `
      <button class="checkbox-btn" title="${item.completed ? 'Weer toevoegen' : 'Afvinken'}">
        <div class="custom-checkbox">
          <svg viewBox="0 0 24 24" fill="none"><polyline points="20 6 9 17 4 12"></polyline></svg>
        </div>
      </button>
      <div class="item-content">
        <span class="item-name ${item.completed ? "done" : ""}">${item.name}</span>
        ${(item.qty ?? 1) > 1 ? `<span class="item-qty-badge">${item.qty}x</span>` : ''}
      </div>
      <div class="item-actions">
        <button class="btn-action-icon btn-item-edit" title="Bewerken">${SVG_EDIT}</button>
        <button class="btn-action-icon danger btn-delete-item" title="Verwijderen">${SVG_TRASH}</button>
      </div>
    `;

    li.addEventListener("contextmenu", (e) => { if (!item.completed) e.preventDefault(); });

    li.querySelector(".checkbox-btn")?.addEventListener("click", (e) => {
      e.stopPropagation();
      updateDoc(doc(db, "lists", activeListId, "items", item.id), { completed: !item.completed });
    });

    attachTouchInteractions(li, item);
    attachDesktopDrag(li, item);

    li.querySelector(".btn-item-edit")?.addEventListener("click", (e) => {
      e.stopPropagation();
      openPromptModal("Product aanpassen", item.name, item.qty ?? 1, async (newName, newQty) => {
        await updateDoc(doc(db, "lists", activeListId, "items", item.id), { name: newName, qty: newQty });
      });
    });

    li.querySelector(".btn-delete-item")?.addEventListener("click", (e) => {
      e.stopPropagation();
      deleteDoc(doc(db, "lists", activeListId, "items", item.id));
    });

    listEl.appendChild(li);
  });
  setupListDropZone(listEl);
}

function attachTouchInteractions(li, item) {
  let pressTimer = null, startY = 0, startX = 0;

  li.addEventListener("touchstart", (e) => {
    if (e.target.closest(".item-actions") || e.target.closest(".checkbox-btn")) return;
    startY = e.touches[0].clientY; startX = e.touches[0].clientX;
    pressTimer = setTimeout(() => {
      if (item.completed) return;
      isDraggingActive = true;
      if (navigator.vibrate) navigator.vibrate(40);
      li.classList.add("is-dragging");
      initMobileTouchMove(li);
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

function initMobileTouchMove(draggedLi) {
  const listEl = document.getElementById("items-list");
  if (!listEl) return;
  const onMove = (e) => {
    if (!isDraggingActive) return;
    const afterElement = getGenericDragAfterElement(listEl, "li.item-row:not(.is-dragging):not(.is-done)", e.touches[0].clientY);
    if (afterElement == null) {
      const firstDone = listEl.querySelector("li.item-row.is-done");
      if (firstDone) listEl.insertBefore(draggedLi, firstDone); else listEl.appendChild(draggedLi);
    } else listEl.insertBefore(draggedLi, afterElement);
  };
  const onEnd = async () => {
    window.removeEventListener("touchmove", onMove); window.removeEventListener("touchend", onEnd);
    draggedLi.classList.remove("is-dragging"); isDraggingActive = false;
    await saveNewOrder(listEl);
  };
  window.addEventListener("touchmove", onMove, { passive: false });
  window.addEventListener("touchend", onEnd);
}

function attachDesktopDrag(li, item) {
  if (item.completed) return;
  li.addEventListener("dragstart", (e) => {
    if (e.target.closest(".item-actions") || e.target.closest(".checkbox-btn")) { e.preventDefault(); return; }
    isDraggingActive = true; draggedElement = li; li.classList.add("is-dragging");
    e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", item.id);
  });
  li.addEventListener("dragend", async () => {
    li.classList.remove("is-dragging"); isDraggingActive = false; draggedElement = null;
    const listEl = document.getElementById("items-list");
    if (listEl) await saveNewOrder(listEl);
  });
}

function setupListDropZone(listEl) {
  listEl.addEventListener("dragover", (e) => {
    e.preventDefault();
    if (!draggedElement) return;
    const afterElement = getGenericDragAfterElement(listEl, "li.item-row:not(.is-dragging):not(.is-done)", e.clientY);
    if (afterElement == null) {
      const firstDone = listEl.querySelector("li.item-row.is-done");
      if (firstDone) listEl.insertBefore(draggedElement, firstDone); else listEl.appendChild(draggedElement);
    } else listEl.insertBefore(draggedElement, afterElement);
  });
}

function getGenericDragAfterElement(container, selector, y) {
  return [...container.querySelectorAll(selector)].reduce((closest, child) => {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closest.offset) return { offset: offset, element: child };
    else return closest;
  }, { offset: Number.NEGATIVE_INFINITY }).element;
}

async function saveNewOrder(listEl) {
  const rows = [...listEl.querySelectorAll("li.item-row:not(.is-done)")];
  const batch = writeBatch(db);
  rows.forEach((row, idx) => { batch.update(doc(db, "lists", activeListId, "items", row.dataset.id), { order: idx + 1 }); });
  await batch.commit(); renderItems();
}

document.getElementById("add-item-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = inputEl ? inputEl.value.trim() : "";
  if (!name || !activeListId) return;
  const nextOrder = currentItems.length > 0 ? Math.max(...currentItems.map(i => i.order ?? 0)) + 1 : 1;
  await addDoc(collection(db, "lists", activeListId, "items"), { name: name, qty: 1, completed: false, order: nextOrder, createdAt: serverTimestamp() });
  if (inputEl) inputEl.value = ""; 
  if (suggestionsEl) suggestionsEl.style.display = "none";
});

document.getElementById("btn-open-clear-items")?.addEventListener("click", () => {
  openConfirmModal("Lijst leegmaken?", `Weet je zeker dat je alle producten van '${activeListName}' wilt wissen?`, async () => {
    if (!activeListId || currentItems.length === 0) return;
    const batch = writeBatch(db);
    currentItems.forEach(item => { batch.delete(doc(db, "lists", activeListId, "items", item.id)); });
    await batch.commit();
  });
});

// Modals
const confirmModalEl = document.getElementById("confirm-modal");
let onConfirmCallback = null;
function openConfirmModal(title, message, onConfirm) {
  const t = document.getElementById("modal-title");
  const m = document.getElementById("modal-message");
  if (t) t.textContent = title;
  if (m) m.textContent = message;
  onConfirmCallback = onConfirm;
  confirmModalEl?.classList.remove("hidden");
}
document.getElementById("btn-modal-cancel")?.addEventListener("click", () => { confirmModalEl?.classList.add("hidden"); onConfirmCallback = null; });
document.getElementById("btn-modal-confirm")?.addEventListener("click", async () => { confirmModalEl?.classList.add("hidden"); if (onConfirmCallback) await onConfirmCallback(); onConfirmCallback = null; });

const promptModalEl = document.getElementById("prompt-modal");
const promptInput = document.getElementById("prompt-input");
const promptQtyInput = document.getElementById("prompt-qty-input");
let onPromptCallback = null;
function openPromptModal(title, currentName, currentQty, onSave) {
  const t = document.getElementById("prompt-title");
  if (t) t.textContent = title;
  if (promptInput) promptInput.value = currentName;
  const qtyWrapper = document.getElementById("prompt-qty-wrapper");
  if (qtyWrapper) {
    if (currentQty !== null) { qtyWrapper.style.display = "block"; if (promptQtyInput) promptQtyInput.value = currentQty; } 
    else qtyWrapper.style.display = "none";
  }
  onPromptCallback = onSave;
  promptModalEl?.classList.remove("hidden");
  setTimeout(() => { if (promptInput) { promptInput.focus(); promptInput.select(); } }, 50);
}
document.getElementById("btn-prompt-cancel")?.addEventListener("click", () => { promptModalEl?.classList.add("hidden"); onPromptCallback = null; });
document.getElementById("btn-prompt-confirm")?.addEventListener("click", async () => {
  const val = promptInput ? promptInput.value.trim() : ""; if (!val) return;
  promptModalEl?.classList.add("hidden");
  if (onPromptCallback) await onPromptCallback(val, promptQtyInput ? (parseInt(promptQtyInput.value, 10) || 1) : 1);
  onPromptCallback = null;
});

// Changelog
const changelogModalEl = document.getElementById("changelog-modal");
const changelogListEl = document.getElementById("changelog-list");

async function loadChangelog() {
  if (!changelogListEl) return;
  changelogListEl.innerHTML = `<div class="changelog-loading">Laden...</div>`;
  try {
    const res = await fetch('changelog.json?v=' + Date.now());
    if (!res.ok) throw new Error("Changelog kon niet worden geladen");
    const entries = await res.json();
    
    changelogListEl.innerHTML = "";
    entries.forEach(entry => {
      const div = document.createElement("div");
      div.className = "changelog-entry";
      div.innerHTML = `
        <div class="changelog-entry-header">
          <span class="changelog-badge">${entry.version}</span>
          <span class="changelog-date">${entry.date}</span>
        </div>
        <ul>
          ${entry.changes.map(ch => `<li>${ch}</li>`).join("")}
        </ul>
      `;
      changelogListEl.appendChild(div);
    });
  } catch (err) {
    changelogListEl.innerHTML = `<div style="text-align: center; color: var(--danger); padding: 1rem; font-size: 0.85rem;">Kon de changelog niet laden. Controleer of changelog.json bestaat op GitHub.</div>`;
  }
}

document.getElementById("btn-open-changelog")?.addEventListener("click", () => {
  changelogModalEl?.classList.remove("hidden");
  loadChangelog();
});
document.getElementById("btn-close-changelog")?.addEventListener("click", () => {
  changelogModalEl?.classList.add("hidden");
});
document.getElementById("btn-close-changelog-x")?.addEventListener("click", () => {
  changelogModalEl?.classList.add("hidden");
});

// ==========================================
// WEEKMENU LOGICA
// ==========================================
const DAYS_OF_WEEK = [
  { id: "mon", name: "Maandag" },
  { id: "tue", name: "Dinsdag" },
  { id: "wed", name: "Woensdag" },
  { id: "thu", name: "Donderdag" },
  { id: "fri", name: "Vrijdag" },
  { id: "sat", name: "Zaterdag" },
  { id: "sun", name: "Zondag" }
];

let selectedWeekOffset = 0;
let currentMealsData = {};

function getWeekKey(offsetWeeks = 0) {
  const now = new Date();
  now.setDate(now.getDate() + (offsetWeeks * 7));
  
  const target = new Date(now.valueOf());
  const dayNr = (now.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = target.valueOf();
  target.setMonth(0, 1);
  if (target.getDay() !== 4) {
    target.setMonth(0, 1 + ((4 - target.getDay()) + 7) % 7);
  }
  const weekNum = 1 + Math.ceil((firstThursday - target) / 604800000);
  return `${now.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

const tabPrevWeek = document.getElementById("tab-prev-week");
const tabThisWeek = document.getElementById("tab-this-week");
const tabNextWeek = document.getElementById("tab-next-week");

function updateActiveWeekTab(activeTab) {
  [tabPrevWeek, tabThisWeek, tabNextWeek].forEach(btn => btn?.classList.remove("active"));
  activeTab?.classList.add("active");
}

tabPrevWeek?.addEventListener("click", () => {
  selectedWeekOffset = -1;
  updateActiveWeekTab(tabPrevWeek);
  listenToMeals();
});

tabThisWeek?.addEventListener("click", () => {
  selectedWeekOffset = 0;
  updateActiveWeekTab(tabThisWeek);
  listenToMeals();
});

tabNextWeek?.addEventListener("click", () => {
  selectedWeekOffset = 1;
  updateActiveWeekTab(tabNextWeek);
  listenToMeals();
});

function initMealPlanner() {
  listenToMeals();
}

function listenToMeals() {
  if (unsubscribeMeals) {
    unsubscribeMeals();
    unsubscribeMeals = null;
  }
  const weekKey = getWeekKey(selectedWeekOffset);
  const mealsDocRef = doc(mealsCol, weekKey);

  unsubscribeMeals = onSnapshot(
    mealsDocRef,
    (docSnap) => {
      currentMealsData = docSnap.exists() ? docSnap.data() : {};
      renderMealDays();
    },
    (error) => {
      if (error.code !== "permission-denied") console.error("Fout bij ophalen weekmenu:", error);
    }
  );
}

function renderMealDays() {
  const container = document.getElementById("meals-container");
  if (!container) return;
  container.innerHTML = "";

  const today = new Date();
  const todayDayIndex = (today.getDay() + 6) % 7;
  const isPastWeek = selectedWeekOffset === -1;

  DAYS_OF_WEEK.forEach((day, index) => {
    const isToday = (selectedWeekOffset === 0 && index === todayDayIndex);
    const card = document.createElement("div");
    card.className = "meal-day-card";
    
    const mealText = currentMealsData[day.id] || "";

    card.innerHTML = `
      <div class="meal-day-header">
        <span class="meal-day-name ${isToday ? 'is-today' : ''}">
          ${day.name} ${isToday ? '• Vandaag' : ''}
        </span>
        <div style="display: flex; align-items: center; gap: 0.4rem;">
          ${isPastWeek && mealText ? `<button type="button" class="btn-action-icon btn-copy-meal" title="Kopieer naar deze week" style="font-size: 0.72rem; padding: 0.1rem 0.35rem; font-weight: 600; color: var(--primary);">Kopieer ↷</button>` : ''}
          <span id="saved-${day.id}" class="meal-saved-pill">Opgeslagen ✓</span>
        </div>
      </div>
      <input type="text" class="meal-input" id="input-${day.id}" placeholder="${isPastWeek ? 'Niets geregistreerd' : 'Wat eten we?'}" value="${mealText}">
    `;

    const input = card.querySelector(`#input-${day.id}`);
    const savedPill = card.querySelector(`#saved-${day.id}`);
    const copyBtn = card.querySelector('.btn-copy-meal');

    input?.addEventListener("blur", async () => {
      const val = input.value.trim();
      const weekKey = getWeekKey(selectedWeekOffset);
      await setDoc(doc(mealsCol, weekKey), { [day.id]: val }, { merge: true });
      if (savedPill) {
        savedPill.style.display = "inline";
        setTimeout(() => { savedPill.style.display = "none"; }, 1800);
      }
    });

    input?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        input.blur();
      }
    });

    if (copyBtn) {
      copyBtn.addEventListener("click", async () => {
        const thisWeekKey = getWeekKey(0);
        await setDoc(doc(mealsCol, thisWeekKey), { [day.id]: mealText }, { merge: true });
        copyBtn.textContent = "Gekopieerd ✓";
        setTimeout(() => { copyBtn.textContent = "Kopieer ↷"; }, 1500);
      });
    }

    container.appendChild(card);
  });
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(e => console.log(e));
}
