/* =========================================================
   Shivam's World — orders in Firestore (store side)
   Loaded on demand by store.js. If Firebase is unreachable the
   store still works: the order also goes to WhatsApp.
   ========================================================= */
import { db, doc, writeBatch, getDoc, serverTimestamp } from "./firebase-init.js";

// Saves the private order and its public tracking record together.
export function saveOrder(o) {
  const batch = writeBatch(db);
  const order = {
    orderId: o.id,
    name: o.name,
    phone: o.phone,
    address: o.address,
    note: o.note || "",
    items: o.items.map(function (it) {
      return { name: it.name, qty: it.qty, price: it.price };
    }),
    subtotal: o.subtotal,
    deliveryCharge: o.deliveryCharge,
    discount: o.discount || 0,
    total: o.total,
    utr: o.utr,
    status: "pending",
    createdAt: serverTimestamp()
  };
  if (o.couponCode) order.couponCode = o.couponCode;
  if (o.couponKey) order.couponKey = o.couponKey;
  if (o.location) order.location = { lat: o.location.lat, lng: o.location.lng };
  batch.set(doc(db, "orders", o.id), order);
  if (o.couponKey) {
    // Marks the coupon as used for this customer. It fails if it was already used.
    batch.set(doc(db, "couponUses", o.couponKey), {
      code: o.couponCode,
      orderId: o.id,
      usedAt: serverTimestamp()
    });
  }
  batch.set(doc(db, "tracking", o.id), {
    orderId: o.id,
    status: "pending",
    note: "",
    updatedAt: serverTimestamp()
  });
  return batch.commit();
}

// Returns { status, note, updatedAt } or null if there is no such order.
export async function getTracking(id) {
  const snap = await getDoc(doc(db, "tracking", id));
  return snap.exists() ? snap.data() : null;
}

// True if this coupon was already used by the customer with this fingerprint.
export async function isCouponUsed(key) {
  const snap = await getDoc(doc(db, "couponUses", key));
  return snap.exists();
}
