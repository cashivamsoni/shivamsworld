/* =========================================================
   Shivam's World — Firebase setup (shared by store + admin)
   Loads Firebase straight from Google's CDN, so no npm or
   build step is needed. The config below is public by design;
   your Firestore security rules are what protect the data.
   ========================================================= */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyCdGZKXmbe1yGOBvxg6xIm-U3CY0Swqtyg",
  authDomain: "shivam-s-world-store.firebaseapp.com",
  projectId: "shivam-s-world-store",
  storageBucket: "shivam-s-world-store.firebasestorage.app",
  messagingSenderId: "381937022136",
  appId: "1:381937022136:web:804d8e2171978fc3dbb04d"
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

// Re-exported so every page uses the same pinned SDK version
export {
  doc, setDoc, getDoc, updateDoc, deleteDoc, writeBatch, collection, query, where, orderBy, onSnapshot, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
export {
  GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
