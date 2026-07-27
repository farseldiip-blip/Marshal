/* =========================================================
   prisma/seed.js — Seed dev data (rooms, menu, gallery,
   reviews, amenities, hotel settings). Idempotent-ish for dev.
   ========================================================= */
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

async function main() {
  // Admin user (dev only). Override password via ADMIN_PASSWORD env.
  const adminEmail = process.env.ADMIN_EMAIL || "admin@marshal.com";
  const adminPassword = process.env.ADMIN_PASSWORD || "ChangeMe123!";
  const passwordHash = await bcrypt.hash(adminPassword, 10);
  await prisma.user.upsert({
    where: { email: adminEmail },
    update: { role: "ADMIN", passwordHash },
    create: { email: adminEmail, passwordHash, role: "ADMIN" }
  });
  console.log("Seeded admin user:", adminEmail);

  // Rooms (names here are dev seed only; admin can rename via dashboard)
  const rooms = [
    {
      name: "Deluxe Garden Room",
      type: "Deluxe Room",
      price: 420,
      description: "A serene retreat opening to private gardens.",
      images: ["https://images.unsplash.com/photo-1611892440504-42a792e24d32?auto=format&fit=crop&w=900&q=80"],
      amenities: ["King Bed", "Rain Shower", "Smart TV"],
      capacity: 2
    },
    {
      name: "Nile View Suite",
      type: "Suite",
      price: 780,
      description: "Floor-to-ceiling glass framing the river's slow light.",
      images: ["https://images.unsplash.com/photo-1582719508461-905c673771fd?auto=format&fit=crop&w=900&q=80"],
      amenities: ["Lounge", "Nile View", "Butler"],
      capacity: 3
    }
  ];
  for (const r of rooms) {
    const existing = await prisma.room.findFirst({ where: { name: r.name } });
    if (!existing) {
      await prisma.room.create({ data: r });
      console.log("Seeded room:", r.name);
    }
  }

  // Menu
  const menu = [
    { name: "Koshari", description: "Egyptian classic", price: 6, category: "Main", available: true, sortOrder: 1 },
    { name: "Tea", description: "Mint tea", price: 2, category: "Drinks", available: true, sortOrder: 2 }
  ];
  for (const m of menu) {
    const existing = await prisma.menuItem.findFirst({ where: { name: m.name } });
    if (!existing) {
      await prisma.menuItem.create({ data: m });
      console.log("Seeded menu:", m.name);
    }
  }

  // Gallery
  await prisma.galleryItem.upsert({
    where: { id: "seed-hero" },
    update: { image: "https://example.com/hero.jpg", title: "Lobby" },
    create: { id: "seed-hero", image: "https://example.com/hero.jpg", title: "Lobby", sortOrder: 1 }
  });

  // Amenities
  const amenities = ["WiFi", "Pool", "Restaurant", "Parking"];
  for (let i = 0; i < amenities.length; i++) {
    const name = amenities[i];
    const existing = await prisma.amenity.findFirst({ where: { name } });
    if (!existing) {
      await prisma.amenity.create({ data: { name, sortOrder: i + 1 } });
    }
  }

  // Hotel settings
  const settings = [
    { key: "hotelName", value: "Marshal Al-Gezira", label: "Hotel Name" },
    { key: "currency", value: "USD", label: "Default currency" },
    { key: "contactPhone", value: "+20000000000", label: "Contact phone" }
  ];
  for (const s of settings) {
    await prisma.hotelSetting.upsert({
      where: { key: s.key },
      update: { value: s.value, label: s.label },
      create: s
    });
  }

  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
