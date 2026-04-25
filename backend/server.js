const express = require("express");
const cors = require("cors");
const Database = require("better-sqlite3");

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

const db = new Database("direbajaj.db");

// CREATE TABLES
db.exec(`
  CREATE TABLE IF NOT EXISTS drivers (
    id INTEGER PRIMARY KEY,
    name TEXT,
    area TEXT,
    status TEXT
  );

  CREATE TABLE IF NOT EXISTS bookings (
    id INTEGER PRIMARY KEY,
    from_location TEXT,
    to_location TEXT,
    driver TEXT,
    driver_id INTEGER,
    status TEXT,
    created_at TEXT
  );
`);

// SEED DRIVERS
const count = db.prepare("SELECT COUNT(*) as c FROM drivers").get();

if (count.c === 0) {
  db.prepare("INSERT INTO drivers VALUES (1,'Abdi','Kezira','available')").run();
  db.prepare("INSERT INTO drivers VALUES (2,'Hassan','Megala','available')").run();
  db.prepare("INSERT INTO drivers VALUES (3,'Musa','Sabian','available')").run();
}

// ROUTES

app.get("/", (req, res) => {
  res.send("DireBajaj backend running 🚀");
});

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

app.get("/drivers", (req, res) => {
  const drivers = db.prepare("SELECT * FROM drivers").all();
  res.json(drivers);
});

app.post("/reset-drivers", (req, res) => {
  db.prepare("UPDATE drivers SET status='available'").run();
  res.json({ ok: true });
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

app.post("/book", (req, res) => {
  const { from, to, driverId } = req.body;

  if (!from || !to) {
    return res.status(400).json({ error: "Missing data" });
  }

  let driver;

  if (driverId) {
    driver = db.prepare("SELECT * FROM drivers WHERE id=?").get(Number(driverId));
    if (!driver || driver.status !== "available") {
      return res.status(400).json({ error: "Driver not available" });
    }
  } else {
    driver = db.prepare("SELECT * FROM drivers WHERE status='available' LIMIT 1").get();
    if (!driver) {
      return res.status(400).json({ error: "No drivers" });
    }
  }

  db.prepare("UPDATE drivers SET status='busy' WHERE id=?").run(driver.id);

  const id = Date.now();
  const createdAt = new Date().toISOString();

  db.prepare(`
    INSERT INTO bookings VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, from, to, driver.name, driver.id, "assigned", createdAt);

  const booking = db.prepare(`
    SELECT 
      id,
      from_location AS "from",
      to_location AS "to",
      driver,
      driver_id AS "driverId",
      status,
      created_at AS "createdAt"
    FROM bookings WHERE id=?
  `).get(id);

  res.json({ ok: true, booking });
});

app.post("/complete-booking/:id", (req, res) => {
  const id = Number(req.params.id);

  const booking = db.prepare("SELECT * FROM bookings WHERE id=?").get(id);

  if (!booking) {
    return res.status(404).json({ error: "Not found" });
  }

  db.prepare("UPDATE bookings SET status='completed' WHERE id=?").run(id);
  db.prepare("UPDATE drivers SET status='available' WHERE id=?").run(booking.driver_id);

  res.json({ ok: true });
});

// IMPORTANT FOR RENDER
app.listen(PORT, "0.0.0.0", () => {
  console.log("Server running on port " + PORT);
});