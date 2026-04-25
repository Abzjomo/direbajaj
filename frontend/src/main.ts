import QRCode from "qrcode";

const apiBase = "http://localhost:3001";
const publicBookingUrl = window.location.origin;

const root = document.getElementById("app") || document.getElementById("root");

function getLoggedInDriverId() {
  return localStorage.getItem("driverId") || "";
}

function setDriver(id: string) {
  localStorage.setItem("driverId", id);
}

function logout() {
  localStorage.removeItem("driverId");
}

async function load() {
  if (!root) return;

  const healthRes = await fetch(`${apiBase}/health`);
  const healthData = await healthRes.json();

  root.innerHTML = `
    <div style="font-family: Arial; background:#f5f5f5; min-height:100vh; padding:20px; max-width:700px; margin:0 auto;">
      
      <h1 style="text-align:center;">🚀 DireBajaj</h1>

      <div style="background:white; padding:20px; border-radius:12px; margin-top:20px;">
        <h3>Public Booking QR</h3>
        <p>Scan this QR to open booking page:</p>
        <div style="display:flex; justify-content:center; margin:20px 0;">
          <canvas id="qrCanvas"></canvas>
        </div>
        <div style="padding:12px; background:#f0f0f0; border-radius:8px; word-break:break-all;">
          ${publicBookingUrl}
        </div>
        <button onclick="copyBookingLink()" style="margin-top:10px; padding:10px;">
          Copy booking link
        </button>
        <p id="copyMessage" style="margin-top:10px;"></p>
      </div>

      <div style="background:white; padding:20px; border-radius:12px; margin-top:20px;">
        <h3>Book Ride</h3>

        <input id="from" placeholder="From" style="width:100%; padding:12px; margin-bottom:10px;" />
        <input id="to" placeholder="To" style="width:100%; padding:12px; margin-bottom:10px;" />

        <select id="driverSelect" style="width:100%; padding:12px; margin-bottom:10px;">
          <option value="">Auto assign driver</option>
        </select>

        <button onclick="book()" style="width:100%; padding:15px; background:black; color:white; border:none; border-radius:8px;">
          Book Now
        </button>

        <p id="message" style="margin-top:10px;"></p>
      </div>

      <div style="background:white; padding:20px; border-radius:12px; margin-top:20px;">
        <h3>Bookings</h3>
        <ul id="list"></ul>
      </div>

      <div style="background:white; padding:20px; border-radius:12px; margin-top:20px;">
        <h3>Drivers</h3>
        <ul id="drivers"></ul>

        <button onclick="resetDrivers()" style="margin-top:10px; padding:10px;">
          Reset drivers
        </button>
      </div>

      <div style="background:white; padding:20px; border-radius:12px; margin-top:20px;">
        <h3>Driver Login</h3>

        <select id="driverLoginSelect" style="width:100%; padding:12px; margin-bottom:10px;">
          <option value="">Choose driver</option>
        </select>

        <button onclick="loginDriver()" style="padding:10px;">Login</button>
        <button onclick="logoutDriverPanel()" style="padding:10px; margin-left:10px;">Logout</button>

        <p id="loginMessage"></p>

        <h4>Your bookings</h4>
        <ul id="driverBookings"></ul>
      </div>

      <p style="text-align:center; margin-top:20px;">
        Backend: ${healthData.ok ? "Running" : "Error"}
      </p>

    </div>
  `;

  await renderQrCode();
  await loadBookings();
  await loadDrivers();
  await loadLoggedInDriverPanel();
}

async function renderQrCode() {
  const canvas = document.getElementById("qrCanvas") as HTMLCanvasElement | null;
  if (!canvas) return;

  await QRCode.toCanvas(canvas, publicBookingUrl, {
    width: 220,
    margin: 2,
  });
}

async function loadBookings() {
  const res = await fetch(`${apiBase}/bookings`);
  const bookings = await res.json();
  const list = document.getElementById("list");

  if (!list) return;

  list.innerHTML = bookings.length
    ? bookings
        .map((b: any) => `
          <li style="margin-bottom:10px;">
            ${b.from} → ${b.to} (${b.driver}) [${b.status}]
            ${b.status !== "completed" ? `<button onclick="completeBooking(${b.id})">✔</button>` : ""}
          </li>
        `)
        .join("")
    : "<li>No bookings yet</li>";
}

async function loadDrivers() {
  const res = await fetch(`${apiBase}/drivers`);
  const drivers = await res.json();

  const list = document.getElementById("drivers");
  const select = document.getElementById("driverSelect") as HTMLSelectElement | null;
  const loginSelect = document.getElementById("driverLoginSelect") as HTMLSelectElement | null;

  if (list) {
    list.innerHTML = drivers.length
      ? drivers.map((d: any) => `<li>${d.name} (${d.status})</li>`).join("")
      : "<li>No drivers found</li>";
  }

  if (select) {
    select.innerHTML =
      `<option value="">Auto assign</option>` +
      drivers
        .filter((d: any) => d.status === "available")
        .map((d: any) => `<option value="${d.id}">${d.name}</option>`)
        .join("");
  }

  if (loginSelect) {
    const currentValue = getLoggedInDriverId();
    loginSelect.innerHTML =
      `<option value="">Choose driver</option>` +
      drivers.map((d: any) => `<option value="${d.id}">${d.name}</option>`).join("");
    loginSelect.value = currentValue;
  }
}

async function loadLoggedInDriverPanel() {
  const driverId = getLoggedInDriverId();
  const list = document.getElementById("driverBookings");
  const loginMessage = document.getElementById("loginMessage");

  if (!driverId) {
    if (list) list.innerHTML = "";
    if (loginMessage) loginMessage.innerHTML = "No driver logged in";
    return;
  }

  const driversRes = await fetch(`${apiBase}/drivers`);
  const drivers = await driversRes.json();
  const driver = drivers.find((d: any) => String(d.id) === driverId);

  if (loginMessage && driver) {
    loginMessage.innerHTML = `Logged in as ${driver.name} (${driver.status})`;
  }

  const res = await fetch(`${apiBase}/bookings`);
  const bookings = await res.json();

  const mine = bookings.filter((b: any) => String(b.driverId) === driverId);

  if (list) {
    list.innerHTML = mine.length
      ? mine.map((b: any) => `<li>${b.from} → ${b.to} (${b.status})</li>`).join("")
      : "<li>No bookings for this driver</li>";
  }
}

(window as any).copyBookingLink = async function () {
  const msg = document.getElementById("copyMessage");
  try {
    await navigator.clipboard.writeText(publicBookingUrl);
    if (msg) msg.innerHTML = "✅ Booking link copied";
  } catch {
    if (msg) msg.innerHTML = "❌ Could not copy link";
  }
};

(window as any).loginDriver = async function () {
  const id = (document.getElementById("driverLoginSelect") as HTMLSelectElement).value;
  const loginMessage = document.getElementById("loginMessage");

  if (!id) {
    if (loginMessage) loginMessage.innerHTML = "❌ Choose driver first";
    return;
  }

  setDriver(id);
  await loadLoggedInDriverPanel();
};

(window as any).logoutDriverPanel = async function () {
  logout();
  await loadLoggedInDriverPanel();
  await loadDrivers();
};

(window as any).book = async function () {
  const from = (document.getElementById("from") as HTMLInputElement).value;
  const to = (document.getElementById("to") as HTMLInputElement).value;
  const driverId = (document.getElementById("driverSelect") as HTMLSelectElement).value;
  const message = document.getElementById("message");

  const res = await fetch(`${apiBase}/book`, {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({ from, to, driverId }),
  });

  const data = await res.json();

  if (data.ok) {
    if (message) message.innerHTML = `✅ Booking saved (Driver: ${data.booking.driver})`;
    await load();
  } else {
    if (message) message.innerHTML = `❌ ${data.error}`;
  }
};

(window as any).resetDrivers = async function () {
  await fetch(`${apiBase}/reset-drivers`, { method: "POST" });
  await load();
};

(window as any).completeBooking = async function (id: number) {
  await fetch(`${apiBase}/complete-booking/${id}`, { method: "POST" });
  await load();
};

load();