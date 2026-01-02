// Firebase setup untuk projek StudyWithLive
// Authentication (Google), Firestore, dan Storage mesti diaktifkan dalam Firebase Console

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  onAuthStateChanged,
  signOut,
  setPersistence,
  browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import {
  getStorage,
  ref,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";

// Config yang kamu beri
const firebaseConfig = {
  apiKey: "AIzaSyC-cY0ZAwrW9EOcaWeZupli693qs9T1j-0",
  authDomain: "studywithlive.firebaseapp.com",
  projectId: "studywithlive",
  storageBucket: "studywithlive.firebasestorage.app",
  messagingSenderId: "850295583492",
  appId: "1:850295583492:web:21f3b09fa1635309649651",
  measurementId: "G-3G1L59CF5C"
};

// Init Firebase
export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const provider = new GoogleAuthProvider();
export const db = getFirestore(app);
export const storage = getStorage(app);

// Kekalkan sesi walaupun refresh (tiada auto-logout)
await setPersistence(auth, browserLocalPersistence);

export const signInGoogle = () => signInWithPopup(auth, provider);
export const signOutGoogle = () => signOut(auth);

// Firestore helpers
export const userVideosCol = (uid) => collection(db, `users/${uid}/videos`);
export const userVideoDoc = (uid, id) => doc(db, `users/${uid}/videos/${id}`);

// Storage path: users/{uid}/videos/{id}.{ext}
export const storageRefFor = (uid, id, ext = "mp4") =>
  ref(storage, `users/${uid}/videos/${id}.${ext}`);

// Subscribe (order desc)
export const subscribeVideos = (uid, callback) => {
  const q = query(userVideosCol(uid), orderBy("createdAt", "desc"));
  return onSnapshot(q, callback);
};
