// Register SW dengan path relatif
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

/* ... (semua kod app.js sama seperti versi sebelum ini) ... */

import {
  auth,
  signInGoogle,
  signOutGoogle
} from "./firebase.js";

import {
  db,
  storageRefFor,
  userVideoDoc,
  subscribeVideos
} from "./firebase.js";

import {
  setDoc,
  updateDoc,
  deleteDoc
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

import {
  uploadBytesResumable,
  getDownloadURL,
  deleteObject
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";

// Register SW
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}

// Elements
const pageLogin = document.getElementById('page-login');
const pageHome = document.getElementById('page-home');

const btnGoogle = document.getElementById('btn-google');
const btnLogout = document.getElementById('btn-logout');

const searchInput = document.getElementById('search');
const btnUpload = document.getElementById('btn-upload');
const fileInput = document.getElementById('file-input');

const previewSection = document.getElementById('upload-preview');
const previewVideo = document.getElementById('preview-video');
const previewTitle = document.getElementById('preview-title');
const btnSaveUpload = document.getElementById('btn-save-upload');
const btnCancelUpload = document.getElementById('btn-cancel-upload');
const uploadProgress = document.getElementById('upload-progress');
const uploadBar = document.getElementById('upload-bar');
const uploadLabel = document.getElementById('upload-label');

const gallery = document.getElementById('gallery');

const playerModal = document.getElementById('player-modal');
const playerTitle = document.getElementById('player-title');
const player = document.getElementById('player');
const btnClosePlayer = document.getElementById('btn-close-player');
const playbackRate = document.getElementById('playback-rate');
const btnSkipBack = document.getElementById('btn-skip-back');
const btnSkipForward = document.getElementById('btn-skip-forward');

// State
let currentUser = null;
let videos = [];
let filtered = [];
let tempFile = null;
let tempExt = 'mp4';

// Auth UI
btnGoogle.addEventListener('click', async () => {
  try {
    await signInGoogle();
  } catch (err) {
    alert('Login gagal. Cuba lagi.');
    console.error(err);
  }
});

btnLogout.addEventListener('click', async () => {
  try {
    await signOutGoogle();
  } catch (err) {
    alert('Logout gagal. Cuba lagi.');
    console.error(err);
  }
});

// Page switch
function showLogin() {
  pageLogin.classList.remove('hidden');
  pageHome.classList.add('hidden');
}
function showHome() {
  pageLogin.classList.add('hidden');
  pageHome.classList.remove('hidden');
}

// Auth state
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
onAuthStateChanged(auth, (user) => {
  if (user) {
    currentUser = user;
    showHome();
    loadList();
  } else {
    currentUser = null;
    showLogin();
    teardownList();
  }
});

// Upload flow
btnUpload.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0];
  if (!file) return;

  tempFile = file;
  tempExt = (file.name.split('.').pop() || 'mp4').toLowerCase();

  const url = URL.createObjectURL(file);
  previewVideo.src = url;
  previewVideo.load();

  previewTitle.value = file.name.replace(/\.[^/.]+$/, '');
  previewSection.classList.remove('hidden');
  hideProgress();
});

btnCancelUpload.addEventListener('click', () => {
  resetUploadPreview();
});

btnSaveUpload.addEventListener('click', async () => {
  if (!currentUser || !tempFile) return;

  const id = crypto.randomUUID();
  const uid = currentUser.uid;
  const title = (previewTitle.value || 'Rakaman baru').trim();

  try {
    const storageRef = storageRefFor(uid, id, tempExt);
    const task = uploadBytesResumable(storageRef, tempFile);

    btnSaveUpload.disabled = true;
    btnSaveUpload.textContent = 'Memuat naik...';
    showProgress();

    await new Promise((resolve, reject) => {
      task.on('state_changed',
        (snap) => {
          const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
          uploadBar.style.width = pct + '%';
          uploadLabel.textContent = pct + '%';
        },
        reject,
        resolve
      );
    });

    const url = await getDownloadURL(storageRef);

    const docData = {
      id,
      title,
      url,
      ext: tempExt,
      sizeBytes: tempFile.size,
      createdAt: Date.now()
    };

    await setDoc(userVideoDoc(uid, id), docData);
    resetUploadPreview();
  } catch (err) {
    alert('Muat naik gagal. Cuba lagi.');
    console.error(err);
    btnSaveUpload.disabled = false;
    btnSaveUpload.textContent = 'Simpan ke Cloud';
    showProgress(); // keep visible for context
  }
});

function showProgress() {
  uploadProgress.classList.remove('hidden');
  uploadBar.style.width = '0%';
  uploadLabel.textContent = '0%';
}
function hideProgress() {
  uploadProgress.classList.add('hidden');
}

// Helpers
function resetUploadPreview() {
  previewSection.classList.add('hidden');
  previewVideo.src = '';
  previewTitle.value = '';
  btnSaveUpload.disabled = false;
  btnSaveUpload.textContent = 'Simpan ke Cloud';
  fileInput.value = '';
  tempFile = null;
  hideProgress();
}

// Gallery subscription
let unsubscribe = null;
function loadList() {
  if (!currentUser) return;
  if (unsubscribe) unsubscribe();
  unsubscribe = subscribeVideos(currentUser.uid, (snap) => {
    videos = [];
    snap.forEach((doc) => videos.push(doc.data()));
    renderList();
  });
}

function teardownList() {
  if (unsubscribe) unsubscribe();
  unsubscribe = null;
  videos = [];
  filtered = [];
  gallery.innerHTML = '';
}

// Render
function renderList() {
  const q = (searchInput.value || '').toLowerCase().trim();
  filtered = !q ? videos : videos.filter(v => (v.title || '').toLowerCase().includes(q));
  gallery.innerHTML = '';

  if (!filtered.length) {
    const empty = document.createElement('div');
    empty.className = 'card';
    empty.innerHTML = `<p class="card-sub">Tiada video ditemui. Tambah fail untuk mula menyimpan rakaman.</p>`;
    gallery.appendChild(empty);
    return;
  }

  for (const item of filtered) {
    const card = document.createElement('div');
    card.className = 'card';
    const created = new Date(item.createdAt).toLocaleString();
    const sizeMb = (item.sizeBytes/1024/1024).toFixed(2);
    card.innerHTML = `
      <h4 class="card-title">${escapeHtml(item.title || 'Rakaman')}</h4>
      <p class="card-sub">${created} • ${sizeMb} MB</p>
      <div class="card-actions">
        <button class="btn-primary" data-id="${item.id}" data-action="play">Mainkan</button>
        <button class="btn-ghost" data-id="${item.id}" data-action="rename">Tukar nama</button>
        <button class="btn-ghost" data-id="${item.id}" data-action="delete">Padam</button>
      </div>
    `;
    gallery.appendChild(card);
  }
}

// Search
searchInput.addEventListener('input', () => renderList());

// Card actions
gallery.addEventListener('click', async (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  const id = btn.dataset.id;
  const action = btn.dataset.action;
  const item = videos.find(v => v.id === id);
  if (!item) return;

  if (action === 'play') {
    openPlayer(item);
  } else if (action === 'rename') {
    const newTitle = prompt('Nama baru video:', item.title || '');
    if (!newTitle || !currentUser) return;
    try {
      await updateDoc(userVideoDoc(currentUser.uid, id), { title: newTitle });
    } catch (err) {
      alert('Gagal menukar nama.');
      console.error(err);
    }
  } else if (action === 'delete') {
    if (!confirm('Padam video ini?')) return;
    if (!currentUser) return;
    try {
      const ref = storageRefFor(currentUser.uid, id, item.ext || 'mp4');
      await deleteObject(ref);
      await deleteDoc(userVideoDoc(currentUser.uid, id));
    } catch (err) {
      alert('Padam gagal.');
      console.error(err);
    }
  }
});

// Player modal
function openPlayer(item) {
  playerModal.classList.remove('hidden');
  playerTitle.textContent = item.title || 'Rakaman';
  player.src = item.url;
  player.load();
  player.playbackRate = parseFloat(playbackRate.value || '1');
  player.play().catch(() => {});
}
btnClosePlayer.addEventListener('click', () => {
  player.pause();
  player.src = '';
  playerModal.classList.add('hidden');
});
playbackRate.addEventListener('change', () => {
  player.playbackRate = parseFloat(playbackRate.value);
});
btnSkipBack.addEventListener('click', () => {
  player.currentTime = Math.max(0, player.currentTime - 10);
});
btnSkipForward.addEventListener('click', () => {
  player.currentTime = Math.min(player.duration || player.currentTime + 10, player.currentTime + 10);
});

// Escape HTML
function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (m) => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
  }[m]));
}
