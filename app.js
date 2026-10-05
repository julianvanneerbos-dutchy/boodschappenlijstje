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
try {
  getAnalytics(app);
} catch (e) {}

const auth = getAuth(app);

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
      openPromptModal("Lijstnaam aanpassen", data.name, null, async (newName) => {
        await updateDoc(doc(db, "lists", listId), { name: newName });
      });
    });

    li.querySelector(".btn-delete-card").addEventListener("click", (e) => {
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
    await saveDashboardOrder(document.getElementById("lists-container"));
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

document.getElementById("add-list-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = document.getElementById("new-list-name");
  const name = input.value.trim();
  if (!name) return;
  const nextOrder = currentLists.length > 0 ? Math.max(...currentLists.map(l => l.order ?? 0)) + 1 : 1;
  await addDoc(listsCol, { name: name, order: nextOrder, note: "", createdAt: serverTimestamp() });
  input.value = "";
});

// Items & Producten
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

    clearBtn.disabled = currentItems.length === 0;

    if (currentItems.length === 0) {
      itemsEmpty.classList.remove("hidden");
      summaryCard.classList.add("hidden");
    } else {
      itemsEmpty.classList.add("hidden");
      summaryCard.classList.remove("hidden");
      summaryTotal.textContent = totalProducts;
      summaryToBuy.textContent = toBuyProducts;
      summaryInCart.textContent = inCartProducts;
    }
    renderItems();
  });
}

// Opmerkingen
const noteInput = document.getElementById("list-note-input");
const saveNoteBtn = document.getElementById("btn-save-note");
const noteSavedIndicator = document.getElementById("note-saved-indicator");

function listenToActiveListDoc(listId) {
  if (unsubscribeActiveListDoc) unsubscribeActiveListDoc();

  unsubscribeActiveListDoc = onSnapshot(doc(db, "lists", listId), (docSnap) => {
    if (!docSnap.exists()) return;
    const data = docSnap.data();
    if (document.activeElement !== noteInput) {
      noteInput.value = data.note || "";
    }
  });
}

async function saveActiveListNote() {
  if (!activeListId) return;
  const noteText = noteInput.value.trim();
  await updateDoc(doc(db, "lists", activeListId), { note: noteText });
  saveNoteBtn.style.display = "none";
  noteSavedIndicator.style.display = "inline";
  setTimeout(() => { noteSavedIndicator.style.display = "none"; }, 2000);
}

noteInput.addEventListener("input", () => {
  saveNoteBtn.style.display = "inline-block";
});

noteInput.addEventListener("blur", () => {
  saveActiveListNote();
});

saveNoteBtn.addEventListener("click", () => {
  saveActiveListNote();
});

let isDraggingActive = false;
let draggedElement = null;

function renderItems() {
  if (isDraggingActive) return;

  const listEl = document.getElementById("items-list");
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

    li.querySelector(".checkbox-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      updateDoc(doc(db, "lists", activeListId, "items", item.id), { completed: !item.completed });
    });

    attachTouchInteractions(li, item);
    attachDesktopDrag(li, item);

    li.querySelector(".btn-item-edit").addEventListener("click", (e) => {
      e.stopPropagation();
      openPromptModal("Product aanpassen", item.name, item.qty ?? 1, async (newName, newQty) => {
        await updateDoc(doc(db, "lists", activeListId, "items", item.id), { name: newName, qty: newQty });
      });
    });

    li.querySelector(".btn-delete-item").addEventListener("click", (e) => {
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
    await saveNewOrder(document.getElementById("items-list"));
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

document.getElementById("add-item-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = inputEl.value.trim();
  if (!name || !activeListId) return;
  const nextOrder = currentItems.length > 0 ? Math.max(...currentItems.map(i => i.order ?? 0)) + 1 : 1;
  await addDoc(collection(db, "lists", activeListId, "items"), { name: name, qty: 1, completed: false, order: nextOrder, createdAt: serverTimestamp() });
  inputEl.value = ""; suggestionsEl.style.display = "none";
});

document.getElementById("btn-open-clear-items").addEventListener("click", () => {
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
  document.getElementById("modal-title").textContent = title;
  document.getElementById("modal-message").textContent = message;
  onConfirmCallback = onConfirm;
  confirmModalEl.classList.remove("hidden");
}
document.getElementById("btn-modal-cancel").addEventListener("click", () => { confirmModalEl.classList.add("hidden"); onConfirmCallback = null; });
document.getElementById("btn-modal-confirm").addEventListener("click", async () => { confirmModalEl.classList.add("hidden"); if (onConfirmCallback) await onConfirmCallback(); onConfirmCallback = null; });

const promptModalEl = document.getElementById("prompt-modal");
const promptInput = document.getElementById("prompt-input");
const promptQtyInput = document.getElementById("prompt-qty-input");
let onPromptCallback = null;
function openPromptModal(title, currentName, currentQty, onSave) {
  document.getElementById("prompt-title").textContent = title;
  promptInput.value = currentName;
  if (currentQty !== null) { document.getElementById("prompt-qty-wrapper").style.display = "block"; promptQtyInput.value = currentQty; } 
  else document.getElementById("prompt-qty-wrapper").style.display = "none";
  onPromptCallback = onSave;
  promptModalEl.classList.remove("hidden");
  setTimeout(() => { promptInput.focus(); promptInput.select(); }, 50);
}
document.getElementById("btn-prompt-cancel").addEventListener("click", () => { promptModalEl.classList.add("hidden"); onPromptCallback = null; });
document.getElementById("btn-prompt-confirm").addEventListener("click", async () => {
  const val = promptInput.value.trim(); if (!val) return;
  promptModalEl.classList.add("hidden");
  if (onPromptCallback) await onPromptCallback(val, parseInt(promptQtyInput.value, 10) || 1);
  onPromptCallback = null;
});

// Changelog
const changelogModalEl = document.getElementById("changelog-modal");
const changelogListEl = document.getElementById("changelog-list");

async function loadChangelog() {
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

document.getElementById("btn-open-changelog").addEventListener("click", () => {
  changelogModalEl.classList.remove("hidden");
  loadChangelog();
});
document.getElementById("btn-close-changelog").addEventListener("click", () => {
  changelogModalEl.classList.add("hidden");
});
document.getElementById("btn-close-changelog-x").addEventListener("click", () => {
  changelogModalEl.classList.add("hidden");
});

if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(e => console.log(e));
