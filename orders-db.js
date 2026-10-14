/* =========================================================
   Shivam's World — save an order to Firestore
   Loaded on demand by store.js. If Firebase is unreachable the
   store still works: the order also goes to WhatsApp.
   ========================================================= */
import { db, doc, setDoc, serverTimestamp } from "./firebase-init.js";

export function saveOrder(o) {
  return setDoc(doc(db, "orders", o.id), {
    orderId: o.id,
    name: o.name,
    phone: o.phone,
    address: o.address,
    note: o.note || "",
    items: o.items.map(function (it) {
      return { name: it.name, qty: it.qty, price: it.price };
    }),
    total: o.total,
    utr: o.utr,
    status: "pending",
    createdAt: serverTimestamp()
  });
}
