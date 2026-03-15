import {
  auth,
  signInGoogle,
  signOutGoogle,
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

import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

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

// New Elements for Audio
const checkConvert = document.getElementById('check-convert');
const convertContainer = document.getElementById('convert-container');

// State
let currentUser = null;
let videos = [];
let filtered = [];
let tempFile = null;
let tempExt = 'mp4';

// Auth UI
btnGoogle.addEventListener('click', async () => {
  try { await signInGoogle(); } catch (err) { alert('Login gagal.'); }
});

btnLogout.addEventListener('click', async () => {
  try { await signOutGoogle(); } catch (err) { alert('Logout gagal.'); }
});

// Auth state
onAuthStateChanged(auth, (user) => {
  if (user) {
    currentUser = user;
    pageLogin.classList.add('hidden');
    pageHome.classList.remove('hidden');
    loadList();
  } else {
    currentUser = null;
    pageLogin.classList.remove('hidden');
    pageHome.classList.add('hidden');
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

  // Jika fail asal memang audio, sorokkan pilihan convert
  if (file.type.includes('audio')) {
    convertContainer.classList.add('hidden');
  } else {
    convertContainer.classList.remove('hidden');
  }

  const url = URL.createObjectURL(file);
  previewVideo.src = url;
  previewTitle.value = file.name.replace(/\.[^/.]+$/, '');
  previewSection.classList.remove('hidden');
  hideProgress();
});

btnSaveUpload.addEventListener('click', async () => {
  if (!currentUser || !tempFile) return;

  const id = crypto.randomUUID();
  const uid = currentUser.uid;
  let fileToUpload = tempFile;
  let finalExt = tempExt;
  let title = (previewTitle.value || 'Fail baru').trim();

  try {
    btnSaveUpload.disabled = true;
    showProgress();

    // LOGIK CONVERT: Jika tick, proses audio extraction
    if (checkConvert.checked && tempFile.type.includes('video')) {
      uploadLabel.textContent = "Mengekstrak audio...";
      fileToUpload = await extractAudio(tempFile);
      finalExt = 'mp3';
      title += " (Audio)";
    }

    const storageRef = storageRefFor(uid, id, finalExt);
    const task = uploadBytesResumable(storageRef, fileToUpload);

    task.on('state_changed',
      (snap) => {
        const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
        uploadBar.style.width = pct + '%';
        uploadLabel.textContent = 'Upload: ' + pct + '%';
      },
      (err) => { throw err; },
      async () => {
        const url = await getDownloadURL(storageRef);
        const docData = {
          id, title, url, ext: finalExt,
          sizeBytes: fileToUpload.size,
          createdAt: Date.now()
        };
        await setDoc(userVideoDoc(uid, id), docData);
        resetUploadPreview();
      }
    );
  } catch (err) {
    alert('Proses gagal.');
    console.error(err);
    btnSaveUpload.disabled = false;
  }
});

// Fungsi untuk mengekstrak audio menggunakan Web Audio API
async function extractAudio(file) {
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const arrayBuffer = await file.arrayBuffer();
  const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
  const offlineCtx = new OfflineAudioContext(audioBuffer.numberOfChannels, audioBuffer.length, audioBuffer.sampleRate);
  const source = offlineCtx.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(offlineCtx.destination);
  source.start();
  const renderedBuffer = await offlineCtx.startRendering();
  
  // Convert AudioBuffer to Wav/Mp3 Blob
  const wavBlob = audioBufferToWav(renderedBuffer);
  return new File([wavBlob], "audio.mp3", { type: 'audio/mp3' });
}

// Helper: AudioBuffer to Wav
function audioBufferToWav(buffer) {
  let numOfChan = buffer.numberOfChannels,
      length = buffer.length * numOfChan * 2 + 44,
      bufferArr = new ArrayBuffer(length),
      view = new DataView(bufferArr),
      channels = [], i, sample, offset = 0, pos = 0;

  const setU32 = (d) => { view.setUint32(pos, d, true); pos += 4; };
  const setU16 = (d) => { view.setUint16(pos, d, true); pos += 2; };

  setU32(0x46464952); setU32(length - 8); setU32(0x45564157);
  setU32(0x20746d66); setU32(16); setU16(1); setU16(numOfChan);
  setU32(buffer.sampleRate); setU32(buffer.sampleRate * 2 * numOfChan);
  setU16(numOfChan * 2); setU16(16); setU32(0x61746164); setU32(length - pos - 4);

  for (i = 0; i < numOfChan; i++) channels.push(buffer.getChannelData(i));
  while (pos < length) {
    for (i = 0; i < numOfChan; i++) {
      sample = Math.max(-1, Math.min(1, channels[i][offset]));
      sample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
      view.setInt16(pos, sample, true); pos += 2;
    }
    offset++;
  }
  return new Blob([bufferArr], { type: 'audio/wav' });
}

// Gallery & Player (Kekal asal)
function loadList() {
  if (!currentUser) return;
  unsubscribe = subscribeVideos(currentUser.uid, (snap) => {
    videos = [];
    snap.forEach((doc) => videos.push(doc.data()));
    renderList();
  });
}

let unsubscribe = null;
function teardownList() { if (unsubscribe) unsubscribe(); videos = []; gallery.innerHTML = ''; }

function renderList() {
  const q = (searchInput.value || '').toLowerCase().trim();
  filtered = !q ? videos : videos.filter(v => (v.title || '').toLowerCase().includes(q));
  gallery.innerHTML = '';
  if (!filtered.length) {
    gallery.innerHTML = `<div class="card"><p class="card-sub">Tiada fail ditemui.</p></div>`;
    return;
  }
  filtered.forEach(item => {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <h4 class="card-title">${escapeHtml(item.title || 'Rakaman')}</h4>
      <p class="card-sub">${item.ext.toUpperCase()} • ${(item.sizeBytes/1024/1024).toFixed(2)} MB</p>
      <div class="card-actions">
        <button class="btn-primary" data-id="${item.id}" data-action="play">Main</button>
        <button class="btn-ghost" data-id="${item.id}" data-action="delete">Padam</button>
      </div>`;
    gallery.appendChild(card);
  });
}

gallery.addEventListener('click', async (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  const id = btn.dataset.id;
  const action = btn.dataset.action;
  const item = videos.find(v => v.id === id);
  if (action === 'play') openPlayer(item);
  if (action === 'delete') {
    if (confirm('Padam fail?')) {
      await deleteObject(storageRefFor(currentUser.uid, id, item.ext));
      await deleteDoc(userVideoDoc(currentUser.uid, id));
    }
  }
});

function openPlayer(item) {
  playerModal.classList.remove('hidden');
  playerTitle.textContent = item.title;
  player.src = item.url;
  player.play().catch(() => {});
}

btnClosePlayer.onclick = () => { player.pause(); player.src = ''; playerModal.classList.add('hidden'); };
playbackRate.onchange = () => player.playbackRate = playbackRate.value;
btnSkipBack.onclick = () => player.currentTime -= 10;
btnSkipForward.onclick = () => player.currentTime += 10;
searchInput.oninput = () => renderList();
btnCancelUpload.onclick = resetUploadPreview;

function showProgress() { uploadProgress.classList.remove('hidden'); }
function hideProgress() { uploadProgress.classList.add('hidden'); }
function resetUploadPreview() {
  previewSection.classList.add('hidden');
  previewVideo.src = '';
  tempFile = null;
  checkConvert.checked = false;
  btnSaveUpload.disabled = false;
  hideProgress();
}
function escapeHtml(s) { return s.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
