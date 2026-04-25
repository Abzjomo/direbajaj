
const express = require("express");
const cors = require("cors");
const Database = require("better-sqlite3");

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

const db = new Database("direbajaj.db");

db.exec(`
  CREATE TABLE IF NOT EXISTS drivers (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    area TEXT NOT NULL,
    status TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS bookings (
    id INTEGER PRIMARY KEY,
    from_location TEXT NOT NULL,
    to_location TEXT NOT NULL,
    driver TEXT NOT NULL,
    driver_id INTEGER NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
`);

const driverCount = db.prepare(`SELECT COUNT(*) AS count FROM drivers`).get();

if (driverCount.count === 0) {
  const insertDriver = db.prepare(`
    INSERT INTO drivers (id, name, area, status)
    VALUES (?, ?, ?, ?)
  `);

  insertDriver.run(1, "Abdi", "Kezira", "available");
  insertDriver.run(2, "Hassan", "Megala", "available");
  insertDriver.run(3, "Musa", "Sabian", "available");
}

app.get("/", (req, res) => {
  res.send("DireBajaj backend is running 🚀");
});

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

app.get("/drivers", (req, res) => {
  const drivers = db.prepare(`
    SELECT * FROM drivers
    ORDER BY id ASC
  `).all();

  res.json(drivers);
});

app.post("/reset-drivers", (req, res) => {
  db.prepare(`
    UPDATE drivers
    SET status = 'available'
  `).run();

  res.json({ ok: true });
});

app.get("/reset-drivers-test", (req, res) => {
  db.prepare(`
    UPDATE drivers
    SET status = 'available'
  `).run();

  const drivers = db.prepare(`
    SELECT * FROM drivers
    ORDER BY id ASC
  `).all();

  res.json({ ok: true, drivers });
});

app.post("/book", (req, res) => {
  const { from, to, driverId } = req.body;

  if (!from || !to) {
    return res.status(400).json({ error: "From and To are required" });
  }

  let driver;

  if (driverId) {
    driver = db.prepare(`
      SELECT * FROM drivers
      WHERE id = ?
    `).get(Number(driverId));

    if (!driver) {
      return res.status(400).json({ error: "Driver not found" });
    }

    if (driver.status !== "available") {
      return res.status(400).json({ error: "Driver not available" });
    }
  } else {
    driver = db.prepare(`
      SELECT * FROM drivers
      WHERE status = 'available'
      ORDER BY id ASC
      LIMIT 1
    `).get();

    if (!driver) {
      return res.status(400).json({ error: "No drivers available" });
    }
  }

  db.prepare(`
    UPDATE drivers
    SET status = 'busy'
    WHERE id = ?
  `).run(driver.id);

  const bookingId = Date.now();
  const createdAt = new Date().toISOString();

  db.prepare(`
    INSERT INTO bookings (
      id,
      from_location,
      to_location,
      driver,
      driver_id,
      status,
      created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    bookingId,
    from,
    to,
    driver.name,
    driver.id,
    "assigned",
    createdAt
  );

  const booking = db.prepare(`
    SELECT
      id,
      from_location AS "from",
      to_location AS "to",
      driver,
      driver_id AS "driverId",
      status,
      created_at AS "createdAt"
    FROM bookings
    WHERE id = ?
  `).get(bookingId);

  res.json({
    ok: true,
    booking,
  });
});

app.get("/bookings", (req, res) => {
  const bookings = db.prepare(`
    SELECT
      id,
      from_location AS "from",
      to_location AS "to",
      driver,
      driver_id AS "driverId",
      status,
      created_at AS "createdAt"
    FROM bookings
    ORDER BY created_at DESC
  `).all();

  res.json(bookings);
});

app.post("/complete-booking/:id", (req, res) => {
  const id = Number(req.params.id);

  const booking = db.prepare(`
    SELECT
      id,
      from_location AS "from",
      to_location AS "to",
      driver,
      driver_id AS "driverId",
      status,
      created_at AS "createdAt"
    FROM bookings
    WHERE id = ?
  `).get(id);

  if (!booking) {
    return res.status(404).json({ error: "Booking not found" });
  }

  db.prepare(`
    UPDATE bookings
    SET status = 'completed'
    WHERE id = ?
  `).run(id);

  db.prepare(`
    UPDATE drivers
    SET status = 'available'
    WHERE id = ?
  `).run(booking.driverId);

  const updatedBooking = db.prepare(`
    SELECT
      id,
      from_location AS "from",
      to_location AS "to",
      driver,
      driver_id AS "driverId",
      status,
      created_at AS "createdAt"
    FROM bookings
    WHERE id = ?
  `).get(id);

  const driver = db.prepare(`
    SELECT * FROM drivers
    WHERE id = ?
  `).get(booking.driverId);

  res.json({
    ok: true,
    booking: updatedBooking,
    driver,
  });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});