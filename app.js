import { 
  auth, signInGoogle, signOutGoogle, db, 
  storageRefFor, userVideoDoc, subscribeVideos 
} from "./firebase.js";

import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { setDoc, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { uploadBytesResumable, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";

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
const checkConvert = document.getElementById('check-convert');
const convertContainer = document.getElementById('convert-container');
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
let tempFile = null;
let tempExt = 'mp4';

// Auth logic
onAuthStateChanged(auth, (user) => {
  if (user) { currentUser = user; pageLogin.classList.add('hidden'); pageHome.classList.remove('hidden'); loadList(); } 
  else { currentUser = null; pageLogin.classList.remove('hidden'); pageHome.classList.add('hidden'); teardownList(); }
});
btnGoogle.onclick = () => signInGoogle();
btnLogout.onclick = () => signOutGoogle();

// File Selection
btnUpload.onclick = () => fileInput.click();
fileInput.onchange = () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  tempFile = file;
  tempExt = file.name.split('.').pop().toLowerCase();
  
  // Sembunyikan option convert jika fail asal memang sudah audio/mp3
  if (file.type.includes('audio')) {
    convertContainer.classList.add('hidden');
    checkConvert.checked = false;
  } else {
    convertContainer.classList.remove('hidden');
  }

  previewVideo.src = URL.createObjectURL(file);
  previewTitle.value = file.name.replace(/\.[^/.]+$/, '');
  previewSection.classList.remove('hidden');
};

// Upload & Convert Logic
btnSaveUpload.onclick = async () => {
  if (!currentUser || !tempFile) return;
  btnSaveUpload.disabled = true;
  let fileToUpload = tempFile;
  let finalExt = tempExt;
  let title = previewTitle.value || 'Tanpa Tajuk';

  showProgress();

  // Jika user nak convert video -> mp3
  if (checkConvert.checked && tempFile.type.includes('video')) {
    uploadLabel.textContent = "Mengekstrak Audio (Sila Tunggu)...";
    try {
      fileToUpload = await extractAudio(tempFile);
      finalExt = 'mp3';
      title += " (Audio)";
    } catch (e) {
      alert("Gagal tukar ke audio. Fail asal akan digunakan.");
    }
  }

  const id = crypto.randomUUID();
  const storageRef = storageRefFor(currentUser.uid, id, finalExt);
  const task = uploadBytesResumable(storageRef, fileToUpload);

  task.on('state_changed', 
    (s) => {
      const p = Math.round((s.bytesTransferred / s.totalBytes) * 100);
      uploadBar.style.width = p + '%';
      uploadLabel.textContent = `Muat Naik: ${p}%`;
    },
    (e) => { alert("Gagal!"); btnSaveUpload.disabled = false; },
    async () => {
      const url = await getDownloadURL(storageRef);
      await setDoc(userVideoDoc(currentUser.uid, id), {
        id, title, url, ext: finalExt, sizeBytes: fileToUpload.size, createdAt: Date.now()
      });
      resetUploadPreview();
    }
  );
};

// --- Fungsi Core Audio Extractor ---
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
  return new File([audioBufferToWav(renderedBuffer)], "audio.mp3", { type: 'audio/mp3' });
}

function audioBufferToWav(buffer) {
  let numOfChan = buffer.numberOfChannels, length = buffer.length * numOfChan * 2 + 44, bufferArr = new ArrayBuffer(length), view = new DataView(bufferArr), pos = 0, offset = 0;
  const setU32 = (d) => { view.setUint32(pos, d, true); pos += 4; }, setU16 = (d) => { view.setUint16(pos, d, true); pos += 2; };
  setU32(0x46464952); setU32(length - 8); setU32(0x45564157); setU32(0x20746d66); setU32(16); setU16(1); setU16(numOfChan);
  setU32(buffer.sampleRate); setU32(buffer.sampleRate * 2 * numOfChan); setU16(numOfChan * 2); setU16(16); setU32(0x61746164); setU32(length - pos - 4);
  while (pos < length) {
    for (let i = 0; i < numOfChan; i++) {
      let s = Math.max(-1, Math.min(1, buffer.getChannelData(i)[offset]));
      view.setInt16(pos, s < 0 ? s * 0x8000 : s * 0x7FFF, true); pos += 2;
    }
    offset++;
  }
  return new Blob([bufferArr], { type: 'audio/wav' });
}

// Gallery & Player Helpers
function loadList() {
  subscribeVideos(currentUser.uid, (snap) => {
    videos = []; snap.forEach(d => videos.push(d.data()));
    renderList();
  });
}
function renderList() {
  const q = searchInput.value.toLowerCase();
  gallery.innerHTML = '';
  videos.filter(v => v.title.toLowerCase().includes(q)).forEach(v => {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <h4 class="card-title">${v.title}</h4>
      <p class="card-sub">${v.ext.toUpperCase()} • ${(v.sizeBytes/1024/1024).toFixed(2)} MB</p>
      <div class="card-actions">
        <button class="btn-primary" onclick="window.playVideo('${v.url}', '${v.title}')">Main</button>
        <button class="btn-ghost" onclick="window.deleteVideo('${v.id}', '${v.ext}')">Padam</button>
      </div>`;
    gallery.appendChild(card);
  });
}

window.playVideo = (url, title) => {
  player.src = url; playerTitle.textContent = title;
  playerModal.classList.remove('hidden'); player.play();
};
window.deleteVideo = async (id, ext) => {
  if (confirm("Padam fail ini?")) {
    await deleteObject(storageRefFor(currentUser.uid, id, ext));
    await deleteDoc(userVideoDoc(currentUser.uid, id));
  }
};

btnClosePlayer.onclick = () => { player.pause(); player.src = ""; playerModal.classList.add('hidden'); };
playbackRate.onchange = () => player.playbackRate = playbackRate.value;
btnSkipBack.onclick = () => player.currentTime -= 10;
btnSkipForward.onclick = () => player.currentTime += 10;
searchInput.oninput = () => renderList();
btnCancelUpload.onclick = resetUploadPreview;
function showProgress() { uploadProgress.classList.remove('hidden'); }
function resetUploadPreview() { 
  previewSection.classList.add('hidden'); fileInput.value = ''; 
  btnSaveUpload.disabled = false; uploadProgress.classList.add('hidden'); 
}
function teardownList() { gallery.innerHTML = ''; }
