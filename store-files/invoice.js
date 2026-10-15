/* =========================================================
   Shivam's World — PDF invoice
   Used by the admin page (any order) and by customers (their own
   paid orders). The PDF libraries load from cdnjs only when an
   invoice is requested.

   The invoice is drawn as a page first and then saved in the PDF
   as a high-resolution picture, so the ₹ sign and Hindi names or
   addresses print correctly. (The text is part of the picture, so
   it can't be selected or copied.)
   ========================================================= */

// Edit these to change the seller details printed on every invoice
const SELLER = {
  brand: "Shivam's World",
  tagline: "Handmade creations with love",
  owner: "Shivam Soni",
  phone: "+91 90053 25544",
  site: "shivams-world.vercel.app"
};

const JSPDF_URL = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
const HTML2CANVAS_URL = "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";

const STATUS_TEXT = {
  pending: "Payment being verified",
  confirmed: "Payment confirmed",
  packed: "Packed",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled"
};

const loaded = {};
function loadScript(src) {
  if (!loaded[src]) {
    loaded[src] = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.onload = resolve;
      s.onerror = () => { delete loaded[src]; reject(new Error("Could not load " + src)); };
      document.head.appendChild(s);
    });
  }
  return loaded[src];
}

const money = (n) => "\u20B9" + Number(n || 0).toLocaleString("en-IN");

// Older orders may lack the breakdown fields, so work them out
function normalize(o) {
  const items = (o.items || []).map((it) => ({ name: it.name, qty: it.qty, price: it.price }));
  const subtotal = o.subtotal !== undefined ? o.subtotal : items.reduce((s, it) => s + it.price * it.qty, 0);
  const discount = o.discount || 0;
  const delivery = o.deliveryCharge !== undefined ? o.deliveryCharge : Math.max(0, (o.total || 0) - subtotal + discount);
  return { items, subtotal, discount, delivery, total: o.total !== undefined ? o.total : subtotal - discount + delivery };
}

// Small helper: element with inline styles (the page's own stylesheets are not used)
function h(tag, style, text) {
  const node = document.createElement(tag);
  if (style) node.style.cssText = style;
  if (text !== undefined) node.textContent = text;
  return node;
}

function buildInvoice(o) {
  const n = normalize(o);
  const date = o.createdAt && o.createdAt.toDate ? o.createdAt.toDate() : new Date();
  const dateText = date.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
  const id = o.orderId || o.id;

  const page = h("div",
    "position:fixed;left:-10000px;top:0;width:794px;background:#fff;color:#1b1230;" +
    "font-family:Inter,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;font-size:14px;line-height:1.45;");

  // ---- header band ----
  const band = h("div", "display:flex;justify-content:space-between;align-items:center;padding:30px 40px;" +
    "color:#fff;background:linear-gradient(90deg,#6f00ff,#b10fc7 55%,#ff4f9a);");
  const brand = h("div");
  brand.appendChild(h("div", "font-family:'DM Serif Display',Georgia,serif;font-size:32px;line-height:1.1;", SELLER.brand));
  brand.appendChild(h("div", "margin-top:4px;font-size:13px;opacity:.9;", SELLER.tagline));
  const title = h("div", "text-align:right;");
  title.appendChild(h("div", "font-size:26px;font-weight:700;letter-spacing:.18em;", "INVOICE"));
  title.appendChild(h("div", "margin-top:4px;font-size:13px;opacity:.95;", "No. " + id));
  band.appendChild(brand);
  band.appendChild(title);
  page.appendChild(band);

  const body = h("div", "padding:30px 40px 34px;");
  page.appendChild(body);

  // ---- billed to / details ----
  const info = h("div", "display:flex;justify-content:space-between;gap:30px;");
  const left = h("div", "flex:1;min-width:0;");
  left.appendChild(h("div", "font-size:11px;font-weight:700;letter-spacing:.12em;color:#6f00ff;margin-bottom:6px;", "BILLED TO"));
  left.appendChild(h("div", "font-size:16px;font-weight:700;", o.name || ""));
  left.appendChild(h("div", "margin-top:2px;", o.phone ? "Phone: " + o.phone : ""));
  left.appendChild(h("div", "margin-top:2px;white-space:pre-wrap;overflow-wrap:anywhere;", o.address || ""));
  if (o.location && typeof o.location.lat === "number") {
    left.appendChild(h("div", "margin-top:2px;color:#555;font-size:12px;",
      "Pinned location: " + o.location.lat.toFixed(5) + ", " + o.location.lng.toFixed(5)));
  }
  const right = h("div", "width:280px;flex:none;");
  const detail = (label, value) => {
    const row = h("div", "display:flex;justify-content:space-between;gap:12px;margin-bottom:5px;");
    row.appendChild(h("span", "color:#6b5f80;white-space:nowrap;", label));
    row.appendChild(h("span", "font-weight:600;text-align:right;overflow-wrap:anywhere;", value));
    right.appendChild(row);
  };
  right.appendChild(h("div", "font-size:11px;font-weight:700;letter-spacing:.12em;color:#6f00ff;margin-bottom:6px;", "DETAILS"));
  detail("Invoice date", dateText);
  detail("Order status", STATUS_TEXT[o.status] || STATUS_TEXT.pending);
  detail("Payment", "UPI");
  if (o.utr) detail("UPI ref (UTR)", o.utr);
  info.appendChild(left);
  info.appendChild(right);
  body.appendChild(info);

  // ---- items ----
  const table = h("table", "width:100%;border-collapse:collapse;margin-top:28px;");
  const cols = [["#", "width:34px;text-align:left;"], ["Item", "text-align:left;"], ["Qty", "width:50px;text-align:center;"],
                ["Rate", "width:90px;text-align:right;"], ["Amount", "width:100px;text-align:right;"]];
  const headRow = h("tr", "background:#f3eaff;");
  cols.forEach(([label, style]) => headRow.appendChild(h("th", "padding:10px 10px;font-size:12px;color:#4b0091;" + style, label)));
  const thead = h("thead");
  thead.appendChild(headRow);
  table.appendChild(thead);
  const tbody = h("tbody");
  n.items.forEach((it, i) => {
    const tr = h("tr", "border-bottom:1px solid #eadfff;");
    tr.appendChild(h("td", "padding:11px 10px;vertical-align:top;color:#6b5f80;", String(i + 1)));
    tr.appendChild(h("td", "padding:11px 10px;vertical-align:top;overflow-wrap:anywhere;", it.name));
    tr.appendChild(h("td", "padding:11px 10px;vertical-align:top;text-align:center;", String(it.qty)));
    tr.appendChild(h("td", "padding:11px 10px;vertical-align:top;text-align:right;", money(it.price)));
    tr.appendChild(h("td", "padding:11px 10px;vertical-align:top;text-align:right;font-weight:600;", money(it.price * it.qty)));
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  body.appendChild(table);

  // ---- totals ----
  const totals = h("div", "width:290px;margin:18px 0 0 auto;");
  const line = (label, value, style) => {
    const row = h("div", "display:flex;justify-content:space-between;padding:5px 10px;" + (style || ""));
    row.appendChild(h("span", "", label));
    row.appendChild(h("span", "font-weight:600;", value));
    totals.appendChild(row);
  };
  line("Items subtotal", money(n.subtotal));
  if (n.discount > 0) line("Coupon" + (o.couponCode ? " (" + o.couponCode + ")" : ""), "\u2212" + money(n.discount), "color:#0b6b52;");
  line("Delivery charge", money(n.delivery));
  const grand = h("div", "display:flex;justify-content:space-between;align-items:center;margin-top:8px;padding:12px 14px;" +
    "border-radius:12px;color:#fff;background:linear-gradient(90deg,#6f00ff,#5500cc);font-size:17px;font-weight:700;");
  grand.appendChild(h("span", "", "Total"));
  grand.appendChild(h("span", "", money(n.total)));
  totals.appendChild(grand);
  body.appendChild(totals);

  // ---- footer ----
  const foot = h("div", "margin-top:40px;padding-top:16px;border-top:1px solid #eadfff;text-align:center;color:#6b5f80;font-size:12px;");
  foot.appendChild(h("div", "color:#4b0091;font-size:15px;font-weight:700;margin-bottom:4px;", "Thank you for shopping with " + SELLER.brand + "!"));
  foot.appendChild(h("div", "", SELLER.owner + " \u00B7 " + SELLER.phone + " \u00B7 " + SELLER.site));
  foot.appendChild(h("div", "margin-top:4px;", "This is a computer-generated invoice and needs no signature."));
  body.appendChild(foot);

  return page;
}

// Builds the invoice, turns it into a PDF and downloads it
export async function downloadInvoice(order) {
  await Promise.all([loadScript(JSPDF_URL), loadScript(HTML2CANVAS_URL)]);
  if (document.fonts && document.fonts.ready) { try { await document.fonts.ready; } catch (e) { /* ignore */ } }

  const node = buildInvoice(order);
  document.body.appendChild(node);
  try {
    // Draw at up to 4x for sharp text (about 380 dpi on paper). Phones limit how big a canvas can be
    // (about 16 million pixels), so long invoices are drawn a little smaller to stay under that.
    const scale = Math.max(2, Math.min(4, Math.sqrt(14e6 / (794 * node.offsetHeight))));
    const canvas = await window.html2canvas(node, { scale, backgroundColor: "#ffffff", useCORS: true, logging: false });
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ unit: "mm", format: "a4", compress: true });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const sliceH = Math.floor(canvas.width * pageH / pageW); // canvas pixels that fit on one page

    for (let y = 0, page = 0; y < canvas.height; y += sliceH, page++) {
      const h2 = Math.min(sliceH, canvas.height - y);
      const slice = document.createElement("canvas");
      slice.width = canvas.width;
      slice.height = h2;
      const ctx = slice.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, slice.width, slice.height);
      ctx.drawImage(canvas, 0, y, canvas.width, h2, 0, 0, canvas.width, h2);
      if (page > 0) pdf.addPage();
      pdf.addImage(slice.toDataURL("image/jpeg", 0.98), "JPEG", 0, 0, pageW, h2 * pageW / canvas.width);
    }
    pdf.save("Invoice-" + (order.orderId || order.id) + ".pdf");
  } finally {
    node.remove();
  }
}
