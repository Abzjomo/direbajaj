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

const customerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    phone: { type: String, required: true, unique: true },
    passwordHash: { type: String, required: true },
  },
  { timestamps: true }
);

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

    customerId: { type: mongoose.Schema.Types.ObjectId, ref: "Customer", default: null },
    customerName: { type: String, default: null },
    customerPhone: { type: String, default: null },

    status: { type: String, enum: ["assigned", "completed"], default: "assigned" },
  },
  { timestamps: true }
);

const Customer = mongoose.model("Customer", customerSchema);
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

function createCustomerToken(customer) {
  return jwt.sign(
    {
      role: "customer",
      customerId: String(customer._id),
      name: customer.name,
      phone: customer.phone,
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

function verifyCustomer(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ ok: false, error: "Missing customer token" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    if (decoded.role !== "customer") {
      return res.status(403).json({ ok: false, error: "Not authorized" });
    }

    req.customer = decoded;
    next();
  } catch {
    return res.status(401).json({ ok: false, error: "Invalid or expired token" });
  }
}

function optionalCustomer(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    req.customer = null;
    return next();
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.role === "customer") {
      req.customer = decoded;
    } else {
      req.customer = null;
    }
  } catch {
    req.customer = null;
  }

  next();
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
   BASIC
========================= */

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

/* =========================
   ADMIN
========================= */

app.post("/admin-login", (req, res) => {
  const { password } = req.body || {};

  if (!password) {
    return res.status(400).json({ ok: false, error: "Password is required" });
  }

  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ ok: false, error: "Wrong password" });
  }

  res.json({
    ok: true,
    token: createAdminToken(),
  });
});

app.get("/admin-check", verifyAdmin, (req, res) => {
  res.json({ ok: true, admin: true });
});

/* =========================
   DRIVER
========================= */

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

    const passwordOk = await bcrypt.compare(password, driver.passwordHash);

    if (!passwordOk) {
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
    res.status(500).json({ ok: false, error: "Could not log in driver" });
  }
});

app.get("/driver-check", verifyDriver, async (req, res) => {
  try {
    const driver = await Driver.findById(req.driver.driverId);

    if (!driver) {
      return res.status(404).json({ ok: false, error: "Driver not found" });
    }

    res.json({
      ok: true,
      driver: {
        id: driver._id,
        name: driver.name,
        area: driver.area,
        status: driver.status,
      },
    });
  } catch {
    res.status(500).json({ ok: false, error: "Could not verify driver" });
  }
});

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

    if (!driver) {
      return res.status(404).json({ ok: false, error: "Driver not found" });
    }

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

app.get("/driver-bookings", verifyDriver, async (req, res) => {
  try {
    const bookings = await Booking.find({ driverId: req.driver.driverId }).sort({ createdAt: -1 });

    res.json(
      bookings.map((b) => ({
        id: b._id,
        from: b.from,
        to: b.to,
        driverId: b.driverId,
        driver: b.driver,
        customerId: b.customerId,
        customerName: b.customerName,
        customerPhone: b.customerPhone,
        status: b.status,
      }))
    );
  } catch {
    res.status(500).json({ ok: false, error: "Could not load driver bookings" });
  }
});

app.post("/driver-complete-booking/:id", verifyDriver, async (req, res) => {
  try {
    const booking = await Booking.findOne({
      _id: req.params.id,
      driverId: req.driver.driverId,
    });

    if (!booking) {
      return res.status(404).json({ ok: false, error: "Booking not found" });
    }

    booking.status = "completed";
    await booking.save();

    const driver = await Driver.findById(req.driver.driverId);
    if (driver) {
      driver.status = "available";
      await driver.save();
    }

    res.json({ ok: true });
  } catch {
    res.status(500).json({ ok: false, error: "Could not complete booking" });
  }
});

/* =========================
   CUSTOMER
========================= */

app.post("/customer-register", async (req, res) => {
  try {
    const { name, phone, password } = req.body || {};

    if (!name || !phone || !password) {
      return res.status(400).json({ ok: false, error: "Name, phone and password are required" });
    }

    if (password.length < 6) {
      return res.status(400).json({ ok: false, error: "Password must be at least 6 characters" });
    }

    const existing = await Customer.findOne({ phone });
    if (existing) {
      return res.status(400).json({ ok: false, error: "Customer already exists" });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const customer = await Customer.create({
      name,
      phone,
      passwordHash,
    });

    res.json({
      ok: true,
      token: createCustomerToken(customer),
      customer: {
        id: customer._id,
        name: customer.name,
        phone: customer.phone,
      },
    });
  } catch {
    res.status(500).json({ ok: false, error: "Could not register customer" });
  }
});

app.post("/customer-login", async (req, res) => {
  try {
    const { phone, password } = req.body || {};

    if (!phone || !password) {
      return res.status(400).json({ ok: false, error: "Phone and password are required" });
    }

    const customer = await Customer.findOne({ phone });

    if (!customer) {
      return res.status(404).json({ ok: false, error: "Customer not found" });
    }

    const ok = await bcrypt.compare(password, customer.passwordHash);

    if (!ok) {
      return res.status(401).json({ ok: false, error: "Wrong customer password" });
    }

    res.json({
      ok: true,
      token: createCustomerToken(customer),
      customer: {
        id: customer._id,
        name: customer.name,
        phone: customer.phone,
      },
    });
  } catch {
    res.status(500).json({ ok: false, error: "Could not log in customer" });
  }
});

app.get("/customer-check", verifyCustomer, async (req, res) => {
  try {
    const customer = await Customer.findById(req.customer.customerId);

    if (!customer) {
      return res.status(404).json({ ok: false, error: "Customer not found" });
    }

    res.json({
      ok: true,
      customer: {
        id: customer._id,
        name: customer.name,
        phone: customer.phone,
      },
    });
  } catch {
    res.status(500).json({ ok: false, error: "Could not verify customer" });
  }
});

app.get("/customer-bookings", verifyCustomer, async (req, res) => {
  try {
    const bookings = await Booking.find({ customerId: req.customer.customerId }).sort({ createdAt: -1 });

    res.json(
      bookings.map((b) => ({
        id: b._id,
        from: b.from,
        to: b.to,
        driverId: b.driverId,
        driver: b.driver,
        customerId: b.customerId,
        customerName: b.customerName,
        customerPhone: b.customerPhone,
        status: b.status,
      }))
    );
  } catch {
    res.status(500).json({ ok: false, error: "Could not load customer bookings" });
  }
});

/* =========================
   DATA
========================= */

app.get("/drivers", async (req, res) => {
  try {
    const drivers = await Driver.find().sort({ createdAt: 1 });

    res.json(
      drivers.map((d) => ({
        id: d._id,
        name: d.name,
        area: d.area,
        status: d.status,
      }))
    );
  } catch {
    res.status(500).json({ ok: false, error: "Could not load drivers" });
  }
});

app.get("/bookings", async (req, res) => {
  try {
    const bookings = await Booking.find().sort({ createdAt: -1 });

    res.json(
      bookings.map((b) => ({
        id: b._id,
        from: b.from,
        to: b.to,
        driverId: b.driverId,
        driver: b.driver,
        customerId: b.customerId,
        customerName: b.customerName,
        customerPhone: b.customerPhone,
        status: b.status,
      }))
    );
  } catch {
    res.status(500).json({ ok: false, error: "Could not load bookings" });
  }
});

/* =========================
   BOOKING
========================= */

app.post("/book", optionalCustomer, async (req, res) => {
  try {
    const { from, to, driverId } = req.body || {};

    if (!from || !to) {
      return res.status(400).json({ ok: false, error: "From and To are required" });
    }

    let selectedDriver = null;

    if (driverId) {
      selectedDriver = await Driver.findOne({
        _id: driverId,
        status: "available",
      });

      if (!selectedDriver) {
        return res.status(400).json({ ok: false, error: "Selected driver not available" });
      }
    } else {
      selectedDriver = await Driver.findOne({ status: "available" }).sort({ createdAt: 1 });

      if (!selectedDriver) {
        return res.status(400).json({ ok: false, error: "No available drivers" });
      }
    }

    selectedDriver.status = "busy";
    await selectedDriver.save();

    let customerId = null;
    let customerName = null;
    let customerPhone = null;

    if (req.customer?.customerId) {
      const customer = await Customer.findById(req.customer.customerId);
      if (customer) {
        customerId = customer._id;
        customerName = customer.name;
        customerPhone = customer.phone;
      }
    }

    const booking = await Booking.create({
      from,
      to,
      driverId: selectedDriver._id,
      driver: selectedDriver.name,
      customerId,
      customerName,
      customerPhone,
      status: "assigned",
    });

    res.json({
      ok: true,
      booking: {
        id: booking._id,
        from: booking.from,
        to: booking.to,
        driverId: booking.driverId,
        driver: booking.driver,
        customerId: booking.customerId,
        customerName: booking.customerName,
        customerPhone: booking.customerPhone,
        status: booking.status,
      },
    });
  } catch {
    res.status(500).json({ ok: false, error: "Could not create booking" });
  }
});

/* =========================
   ADMIN ACTIONS
========================= */

app.post("/complete-booking/:id", verifyAdmin, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);

    if (!booking) {
      return res.status(404).json({ ok: false, error: "Booking not found" });
    }

    booking.status = "completed";
    await booking.save();

    const driver = await Driver.findById(booking.driverId);
    if (driver) {
      driver.status = "available";
      await driver.save();
    }

    res.json({ ok: true });
  } catch {
    res.status(500).json({ ok: false, error: "Could not complete booking" });
  }
});

app.post("/reset-drivers", verifyAdmin, async (req, res) => {
  try {
    await Driver.updateMany({}, { $set: { status: "available" } });

    const drivers = await Driver.find().sort({ createdAt: 1 });

    res.json({
      ok: true,
      drivers: drivers.map((d) => ({
        id: d._id,
        name: d.name,
        area: d.area,
        status: d.status,
      })),
    });
  } catch {
    res.status(500).json({ ok: false, error: "Could not reset drivers" });
  }
});

/* =========================
   START
========================= */

async function start() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log("Connected to MongoDB");

    await seedDriversIfEmpty();

    app.listen(PORT, () => {
      console.log("Server running on port " + PORT);
    });
  } catch (error) {
    console.error("MongoDB connection failed:", error.message);
    process.exit(1);
  }
}

start();