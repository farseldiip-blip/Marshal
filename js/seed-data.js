/* =========================================================
   seed-data.js — Canonical demo/mock dataset (single source).
   ---------------------------------------------------------
   Used by BOTH the admin dashboard (dashboard.js) and the
   public site data layer (site-data.js) so there is ONE
   mock dataset instead of three divergent copies.
   This is the offline/demo fallback.
   ========================================================= */
(function () {
  "use strict";

  const seed = () => ({
    rooms: [
      { id: "r1", name: "Deluxe Garden Room", name_ar: "غرفة حديقة ديلوكس", type: "Deluxe Room", price: 420, size: "42m²", desc: "A serene retreat opening to private gardens.", desc_ar: "ملاذ هادئ يطل على الحدائق الخاصة.", amenities: ["King Bed", "Rain Shower", "Smart TV"], image: "https://images.unsplash.com/photo-1611892440504-42a792e24d32?auto=format&fit=crop&w=900&q=80", featured: true },
      { id: "r2", name: "Nile View Suite", name_ar: "جناح إطلالة النيل", type: "Nile View Suite", price: 780, size: "70m²", desc: "Floor-to-ceiling glass framing the river's slow light.", desc_ar: "زجاج بارتفاع كامل يؤطر ضوء النيل الهادئ.", amenities: ["Lounge", "Nile View", "Butler"], image: "https://images.unsplash.com/photo-1582719508461-905c673771fd?auto=format&fit=crop&w=900&q=80", featured: true },
      { id: "r3", name: "Presidential Villa", name_ar: "الفيلا الرئاسية", type: "Presidential Villa", price: 2400, size: "240m²", desc: "A private two-bedroom sanctuary with rooftop plunge.", desc_ar: "ملاذ خاص بغرفتي نوم مع مغطس على السطح.", amenities: ["Private Pool", "Chef", "Rooftop"], image: "https://images.unsplash.com/photo-1578683010236-d716f9a3f461?auto=format&fit=crop&w=900&q=80", featured: false }
    ],
    // Booking schema (single source of truth, Firestore `bookings`):
    //   guestName, email, phone, roomId, roomName, roomType,
    //   checkin, checkout, adults, children, rooms, nights, total,
    //   status (Pending|Confirmed|Checked In|Checked Out|Cancelled),
    //   paymentStatus (Unpaid|Pending|Paid|Failed|Refunded), created
    // Backward-compatible aliases (guest/room/guests/revenue) kept for
    // the admin dashboard CRUD.
    bookings: [
      { id: "b1", guestName: "Layla M.", guest: "Layla M.", email: "layla@example.com", phone: "+971 50 000 0000", roomId: "r2", roomName: "Nile View Suite", room: "Nile View Suite", roomType: "Nile View Suite", checkin: "2026-08-01", checkout: "2026-08-05", adults: 2, children: 0, rooms: 1, guests: 2, nights: 4, total: 3900, revenue: 3900, status: "Confirmed", paymentStatus: "Paid", created: "2026-07-01T10:00:00.000Z" },
      { id: "b2", guestName: "James R.", guest: "James R.", email: "james@example.com", phone: "+44 20 0000", roomId: "r1", roomName: "Deluxe Garden Room", room: "Deluxe Garden Room", roomType: "Deluxe Room", checkin: "2026-08-03", checkout: "2026-08-06", adults: 1, children: 0, rooms: 1, guests: 1, nights: 3, total: 1260, revenue: 1260, status: "Pending", paymentStatus: "Unpaid", created: "2026-07-02T10:00:00.000Z" },
      { id: "b3", guestName: "Sara K.", guest: "Sara K.", email: "sara@example.com", phone: "+20 100 0000", roomId: "r3", roomName: "Presidential Villa", room: "Presidential Villa", roomType: "Presidential Villa", checkin: "2026-09-10", checkout: "2026-09-14", adults: 4, children: 0, rooms: 1, guests: 4, nights: 4, total: 9600, revenue: 9600, status: "Confirmed", paymentStatus: "Paid", created: "2026-07-03T10:00:00.000Z" }
    ],
    customers: [
      { id: "c1", name: "Layla M.", email: "layla@example.com", phone: "+971 50 000 0000", country: "UAE", visits: 3 },
      { id: "c2", name: "James R.", email: "james@example.com", phone: "+44 20 0000", country: "UK", visits: 1 }
    ],
    reviews: [
      { id: "v1", author: "Layla M.", rating: 5, text: "The most calm I've felt in a hotel. Light, linen, silence — perfect.", location: "Dubai", status: "Published" },
      { id: "v2", author: "James R.", rating: 5, text: "Service that anticipates without intruding. A masterclass in restraint.", location: "London", status: "Published" },
      { id: "v3", author: "Sara K.", rating: 5, text: "The Nile Suite at sunrise is a memory I'll keep for years.", location: "Mansoura", status: "Published" },
      { id: "v4", author: "Omar T.", rating: 5, text: "Every detail intentional. This is what luxury should feel like.", location: "Paris", status: "Pending" }
    ],
    gallery: [
      { id: "g1", url: "https://images.unsplash.com/photo-1564501049412-61c2a3083791?auto=format&fit=crop&w=900&q=80", title: "Lobby" },
      { id: "g2", url: "https://images.unsplash.com/photo-1571896349842-33c89424de2d?auto=format&fit=crop&w=900&q=80", title: "Suite" }
    ],
    menu: [
      { id: "m1", name: "Lumen", category: "Levantine", desc: "modern Levantine, courtyard seating", price: "$$$" },
      { id: "m2", name: "Kawa", category: "Café", desc: "all-day café & patisserie", price: "$$" },
      { id: "m3", name: "Sato", category: "Omakase", desc: "omakase counter, 10 seats", price: "$$$$" }
    ],
    amenities: [
      { id: "a1", name: "Spa & Wellness", desc: "Hammam rituals and river-facing treatment suites." },
      { id: "a2", name: "Rooftop Pool", desc: "Infinity edge above the city skyline." }
    ],
    hotel: { name: "Marshal Al-Gezira", tagline: "A Quiet Luxury on the Nile's Edge", email: "stay@marshalgezira.concept", phone: "+20 2 000 0000", address: "Mansoura, Dakahlia, Egypt", about: "A premium concept redesign." },
    settings: { theme: "light", currency: "USD", lang: "en" }
  });

  window.__mgSeed = seed;
})();
