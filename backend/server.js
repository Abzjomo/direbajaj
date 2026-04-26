require("dotenv").config();
const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const JWT_SECRET = process.env.JWT_SECRET;

let drivers = [
  { id: 1, name: "Abdi", area: "Kezira", status: "available" },
  { id: 2, name: "Hassan", area: "Megala", status: "available" },
  { id: 3, name: "Musa", area: "Sabian", status: "available" },
];

let bookings = [];
let bookingIdCounter = 1;

function createAdminToken() {
  return jwt.sign({ role: "admin" }, JWT_SECRET, { expiresIn: "8h" });
}

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
  } catch (error) {
    return res.status(401).json({ ok: false, error: "Invalid or expired token" });
  }
}

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

app.post("/admin-login", (req, res) => {
  const { password } = req.body || {};

  if (!password) {
    return res.status(400).json({ ok: false, error: "Password is required" });
  }

  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ ok: false, error: "Wrong password" });
  }

  const token = createAdminToken();

  res.json({
    ok: true,
    token,
  });
});

app.get("/admin-check", verifyAdmin, (req, res) => {
  res.json({ ok: true, admin: true });
});

app.get("/drivers", (req, res) => {
  res.json(drivers);
});

app.get("/bookings", (req, res) => {
  res.json(bookings);
});

app.post("/book", (req, res) => {
  const { from, to, driverId } = req.body || {};

  if (!from || !to) {
    return res.status(400).json({ ok: false, error: "From and To are required" });
  }

  let selectedDriver = null;

  if (driverId) {
    selectedDriver = drivers.find((d) => String(d.id) === String(driverId) && d.status === "available");
    if (!selectedDriver) {
      return res.status(400).json({ ok: false, error: "Selected driver not available" });
    }
  } else {
    selectedDriver = drivers.find((d) => d.status === "available");
    if (!selectedDriver) {
      return res.status(400).json({ ok: false, error: "No available drivers" });
    }
  }

  selectedDriver.status = "busy";

  const booking = {
    id: bookingIdCounter++,
    from,
    to,
    driverId: selectedDriver.id,
    driver: selectedDriver.name,
    status: "assigned",
  };

  bookings.unshift(booking);

  res.json({
    ok: true,
    booking,
  });
});

app.post("/complete-booking/:id", verifyAdmin, (req, res) => {
  const id = Number(req.params.id);
  const booking = bookings.find((b) => b.id === id);

  if (!booking) {
    return res.status(404).json({ ok: false, error: "Booking not found" });
  }

  booking.status = "completed";

  const driver = drivers.find((d) => d.id === booking.driverId);
  if (driver) {
    driver.status = "available";
  }

  res.json({ ok: true, booking });
});

app.post("/reset-drivers", verifyAdmin, (req, res) => {
  drivers = drivers.map((d) => ({
    ...d,
    status: "available",
  }));

  res.json({ ok: true, drivers });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});