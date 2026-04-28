require("dotenv").config();
const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const JWT_SECRET = process.env.JWT_SECRET;
const MONGODB_URI = process.env.MONGODB_URI;

if (!ADMIN_PASSWORD || !JWT_SECRET || !MONGODB_URI) {
  console.error("Missing required environment variables.");
  process.exit(1);
}

/* =========================
   SCHEMAS
========================= */

const driverSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true },
    area: { type: String, required: true },
    status: { type: String, enum: ["available", "busy"], default: "available" },
    passwordHash: { type: String, required: true },
  },
  { timestamps: true }
);

const bookingSchema = new mongoose.Schema(
  {
    from: { type: String, required: true },
    to: { type: String, required: true },
    driverId: { type: mongoose.Schema.Types.ObjectId, ref: "Driver", required: true },
    driver: { type: String, required: true },
    status: { type: String, enum: ["assigned", "completed"], default: "assigned" },
  },
  { timestamps: true }
);

const Driver = mongoose.model("Driver", driverSchema);
const Booking = mongoose.model("Booking", bookingSchema);

/* =========================
   TOKENS
========================= */

function createAdminToken() {
  return jwt.sign({ role: "admin" }, JWT_SECRET, { expiresIn: "8h" });
}

function createDriverToken(driver) {
  return jwt.sign(
    {
      role: "driver",
      driverId: String(driver._id),
      name: driver.name,
    },
    JWT_SECRET,
    { expiresIn: "8h" }
  );
}

/* =========================
   MIDDLEWARE
========================= */

function verifyAdmin(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ ok: false, error: "Missing admin token" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    if (decoded.role !== "admin") {
      return res.status(403).json({ ok: false, error: "Not authorized" });
    }

    req.admin = decoded;
    next();
  } catch {
    return res.status(401).json({ ok: false, error: "Invalid or expired token" });
  }
}

function verifyDriver(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ ok: false, error: "Missing driver token" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    if (decoded.role !== "driver") {
      return res.status(403).json({ ok: false, error: "Not authorized" });
    }

    req.driver = decoded;
    next();
  } catch {
    return res.status(401).json({ ok: false, error: "Invalid or expired token" });
  }
}

/* =========================
   SEED
========================= */

async function seedDriversIfEmpty() {
  const count = await Driver.countDocuments();

  if (count === 0) {
    const defaultPassword = await bcrypt.hash("123456", 10);

    await Driver.insertMany([
      { name: "Abdi", area: "Kezira", status: "available", passwordHash: defaultPassword },
      { name: "Hassan", area: "Megala", status: "available", passwordHash: defaultPassword },
      { name: "Musa", area: "Sabian", status: "available", passwordHash: defaultPassword },
    ]);

    console.log("Default drivers seeded (password: 123456)");
  }
}

/* =========================
   ROUTES
========================= */

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

/* ADMIN LOGIN */
app.post("/admin-login", (req, res) => {
  const { password } = req.body || {};

  if (!password) {
    return res.status(400).json({ ok: false, error: "Password is required" });
  }

  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ ok: false, error: "Wrong password" });
  }

  res.json({ ok: true, token: createAdminToken() });
});

/* DRIVER LOGIN */
app.post("/driver-login", async (req, res) => {
  try {
    const { driverId, password } = req.body || {};

    if (!driverId || !password) {
      return res.status(400).json({ ok: false, error: "Driver and password required" });
    }

    const driver = await Driver.findById(driverId);
    if (!driver) {
      return res.status(404).json({ ok: false, error: "Driver not found" });
    }

    const ok = await bcrypt.compare(password, driver.passwordHash);
    if (!ok) {
      return res.status(401).json({ ok: false, error: "Wrong driver password" });
    }

    res.json({
      ok: true,
      token: createDriverToken(driver),
      driver: {
        id: driver._id,
        name: driver.name,
        area: driver.area,
        status: driver.status,
      },
    });
  } catch {
    res.status(500).json({ ok: false, error: "Login failed" });
  }
});

/* CHANGE DRIVER PASSWORD */
app.post("/driver-change-password", verifyDriver, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body || {};

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ ok: false, error: "Both passwords required" });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ ok: false, error: "Min 6 characters" });
    }

    const driver = await Driver.findById(req.driver.driverId);

    const ok = await bcrypt.compare(currentPassword, driver.passwordHash);
    if (!ok) {
      return res.status(401).json({ ok: false, error: "Wrong current password" });
    }

    driver.passwordHash = await bcrypt.hash(newPassword, 10);
    await driver.save();

    res.json({ ok: true });
  } catch {
    res.status(500).json({ ok: false, error: "Could not update password" });
  }
});

/* DATA */
app.get("/drivers", async (req, res) => {
  const drivers = await Driver.find();
  res.json(drivers.map(d => ({
    id: d._id,
    name: d.name,
    area: d.area,
    status: d.status
  })));
});

app.get("/bookings", async (req, res) => {
  const bookings = await Booking.find().sort({ createdAt: -1 });
  res.json(bookings.map(b => ({
    id: b._id,
    from: b.from,
    to: b.to,
    driverId: b.driverId,
    driver: b.driver,
    status: b.status
  })));
});

/* CREATE BOOKING */
app.post("/book", async (req, res) => {
  const { from, to, driverId } = req.body;

  if (!from || !to) {
    return res.status(400).json({ ok: false });
  }

  let driver = null;

  if (driverId) {
    driver = await Driver.findOne({ _id: driverId, status: "available" });
  } else {
    driver = await Driver.findOne({ status: "available" });
  }

  if (!driver) {
    return res.status(400).json({ ok: false });
  }

  driver.status = "busy";
  await driver.save();

  const booking = await Booking.create({
    from,
    to,
    driverId: driver._id,
    driver: driver.name
  });

  res.json({ ok: true, booking });
});

/* COMPLETE */
app.post("/driver-complete-booking/:id", verifyDriver, async (req, res) => {
  const booking = await Booking.findById(req.params.id);

  booking.status = "completed";
  await booking.save();

  const driver = await Driver.findById(req.driver.driverId);
  driver.status = "available";
  await driver.save();

  res.json({ ok: true });
});

app.post("/complete-booking/:id", verifyAdmin, async (req, res) => {
  const booking = await Booking.findById(req.params.id);

  booking.status = "completed";
  await booking.save();

  const driver = await Driver.findById(booking.driverId);
  driver.status = "available";
  await driver.save();

  res.json({ ok: true });
});

/* RESET */
app.post("/reset-drivers", verifyAdmin, async (req, res) => {
  await Driver.updateMany({}, { status: "available" });
  res.json({ ok: true });
});

/* =========================
   START
========================= */

async function start() {
  await mongoose.connect(MONGODB_URI);
  console.log("Connected to MongoDB");

  await seedDriversIfEmpty();

  app.listen(PORT, () => {
    console.log("Server running on port " + PORT);
  });
}

start();