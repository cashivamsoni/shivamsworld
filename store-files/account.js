/* =========================================================
   Shivam's World — customer accounts (Google sign-in)
   Loaded on demand by store.js. Guests can still check out;
   an account just saves details and keeps orders together.
   ========================================================= */
import {
  auth, db,
  GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged,
  doc, getDoc, setDoc, collection, query, where, onSnapshot, serverTimestamp
} from "./firebase-init.js";

export function watchAuth(callback) {
  return onAuthStateChanged(auth, callback);
}

export function signInGoogle() {
  return signInWithPopup(auth, new GoogleAuthProvider());
}

export function signOutUser() {
  return signOut(auth);
}

// Saved name, phone, address and (optional) delivery pin
export async function loadProfile(uid) {
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() ? snap.data() : null;
}

// Replaces the whole profile, so leaving out `location` removes the saved pin
export function saveProfile(uid, p) {
  const data = {
    name: p.name || "",
    phone: p.phone || "",
    address: p.address || "",
    updatedAt: serverTimestamp()
  };
  if (p.location) data.location = { lat: p.location.lat, lng: p.location.lng };
  return setDoc(doc(db, "users", uid), data);
}

// Live list of this customer's own orders (no index needed: sorted in the browser)
export function watchMyOrders(uid, onData, onError) {
  const q = query(collection(db, "orders"), where("uid", "==", uid));
  return onSnapshot(
    q,
    (snap) => onData(snap.docs.map((d) => Object.assign({ id: d.id }, d.data()))),
    onError
  );
}

// Live view of one order (the rules only allow it if it belongs to the signed-in customer)
export function watchOrder(id, onData, onError) {
  return onSnapshot(
    doc(db, "orders", id),
    (snap) => onData(snap.exists() ? Object.assign({ id: snap.id }, snap.data()) : null),
    onError
  );
}
