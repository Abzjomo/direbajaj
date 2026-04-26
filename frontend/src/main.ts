import QRCode from "qrcode";

const apiBase = "https://direbajaj.onrender.com";
const publicBookingUrl = `${window.location.origin}/?view=customer`;

const root = document.getElementById("app") || document.getElementById("root");

function getView() {
  const url = new URL(window.location.href);
  return url.searchParams.get("view") || "customer";
}

function setView(view: string) {
  const url = new URL(window.location.href);

  if (view === "admin" && !isAdminLoggedIn()) {
    url.searchParams.set("view", "admin-login");
  } else {
    url.searchParams.set("view", view);
  }

  window.history.pushState({}, "", url.toString());
  load();
}

function getAdminToken() {
  return localStorage.getItem("adminToken") || "";
}

function setAdminToken(token: string) {
  localStorage.setItem("adminToken", token);
}

function isAdminLoggedIn() {
  return !!getAdminToken();
}

function logoutAdmin() {
  localStorage.removeItem("adminToken");
}

function getDriverToken() {
  return localStorage.getItem("driverToken") || "";
}

function setDriverToken(token: string) {
  localStorage.setItem("driverToken", token);
}

function logoutDriver() {
  localStorage.removeItem("driverToken");
}

async function adminFetch(url: string, options: RequestInit = {}) {
  const token = getAdminToken();

  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
    Authorization: `Bearer ${token}`,
  };

  const res = await fetch(url, {
    ...options,
    headers,
  });

  if (res.status === 401 || res.status === 403) {
    logoutAdmin();
    setView("admin");
    throw new Error("Admin session expired or unauthorized");
  }

  return res;
}

async function driverFetch(url: string, options: RequestInit = {}) {
  const token = getDriverToken();

  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
    Authorization: `Bearer ${token}`,
  };

  const res = await fetch(url, {
    ...options,
    headers,
  });

  if (res.status === 401 || res.status === 403) {
    logoutDriver();
    throw new Error("Driver session expired or unauthorized");
  }

  return res;
}

function navHtml(activeView: string) {
  const actualActiveView = activeView === "admin-login" ? "admin" : activeView;

  const item = (view: string, label: string) => `
    <button
      onclick="changeView('${view}')"
      style="
        padding:10px 14px;
        border:none;
        border-radius:10px;
        cursor:pointer;
        background:${actualActiveView === view ? "#111" : "#e9e9e9"};
        color:${actualActiveView === view ? "white" : "#111"};
        font-weight:600;
      "
    >
      ${label}
    </button>
  `;

  return `
    <div style="display:flex; gap:10px; flex-wrap:wrap; margin-bottom:20px;">
      ${item("customer", "Customer")}
      ${item("driver", "Driver")}
      ${item("admin", "Admin")}
    </div>
  `;
}

function layout(inner: string, backendOk: boolean) {
  return `
    <div style="font-family: Arial; background:#f5f5f5; min-height:100vh; padding:20px;">
      <div style="max-width:760px; margin:0 auto;">
        <h1 style="text-align:center; margin-bottom:20px;">🚀 DireBajaj</h1>
        ${navHtml(getView())}
        ${inner}
        <p style="text-align:center; margin-top:20px;">
          Backend: <strong>${backendOk ? "Running" : "Error"}</strong>
        </p>
      </div>
    </div>
  `;
}

function card(title: string, body: string) {
  return `
    <div style="background:white; padding:20px; border-radius:14px; margin-top:20px; box-shadow:0 1px 4px rgba(0,0,0,0.08);">
      <h3 style="margin-top:0;">${title}</h3>
      ${body}
    </div>
  `;
}

async function load() {
  if (!root) return;

  try {
    const healthRes = await fetch(`${apiBase}/health`);
    const healthData = await healthRes.json();

    const view = getView();

    if (view === "customer") {
      root.innerHTML = layout(renderCustomerView(), !!healthData.ok);
      await renderQrCode();
      await loadCustomerDrivers();
      await loadCustomerBookings();
    } else if (view === "driver") {
      root.innerHTML = layout(renderDriverView(), !!healthData.ok);
      await loadDriverLoginOptions();
      await loadLoggedInDriverPanel();
    } else if (view === "admin-login") {
      root.innerHTML = layout(renderAdminLoginView(), !!healthData.ok);
    } else if (view === "admin") {
      if (!isAdminLoggedIn()) {
        root.innerHTML = layout(renderAdminLoginView(), !!healthData.ok);
        return;
      }

      root.innerHTML = layout(renderAdminView(), !!healthData.ok);
      await loadAdminBookings();
      await loadAdminDrivers();
    } else {
      root.innerHTML = layout(renderCustomerView(), !!healthData.ok);
      await renderQrCode();
      await loadCustomerDrivers();
      await loadCustomerBookings();
    }
  } catch (error) {
    if (!root) return;
    root.innerHTML = `
      <div style="font-family: Arial; padding: 40px;">
        <h1>DireBajaj 🚀</h1>
        <p style="color:red;">Could not load app.</p>
      </div>
    `;
  }
}

function renderCustomerView() {
  return `
    ${card(
      "Public Booking QR",
      `
        <p>Scan this QR to open customer booking page:</p>
        <div style="display:flex; justify-content:center; margin:20px 0;">
          <canvas id="qrCanvas"></canvas>
        </div>
        <div style="padding:12px; background:#f0f0f0; border-radius:8px; word-break:break-all;">
          ${publicBookingUrl}
        </div>
        <button onclick="copyBookingLink()" style="margin-top:10px; padding:10px 14px;">Copy booking link</button>
        <p id="copyMessage" style="margin-top:10px;"></p>
      `
    )}

    ${card(
      "Book Ride",
      `
        <input id="from" placeholder="From" style="width:100%; padding:12px; margin-bottom:10px;" />
        <input id="to" placeholder="To" style="width:100%; padding:12px; margin-bottom:10px;" />

        <select id="driverSelect" style="width:100%; padding:12px; margin-bottom:10px;">
          <option value="">Auto assign driver</option>
        </select>

        <button onclick="bookRide()" style="width:100%; padding:15px; background:black; color:white; border:none; border-radius:8px;">
          Book Now
        </button>

        <p id="message" style="margin-top:10px;"></p>
      `
    )}

    ${card("Recent Bookings", `<ul id="customerBookings"></ul>`)}
  `;
}

function renderDriverView() {
  return `
    ${card(
      "Driver Login",
      `
        <select id="driverLoginSelect" style="width:100%; padding:12px; margin-bottom:10px;">
          <option value="">Choose driver</option>
        </select>

        <input
          id="driverPassword"
          type="password"
          placeholder="Driver password"
          style="width:100%; padding:12px; margin-bottom:10px;"
        />

        <div style="display:flex; gap:10px; flex-wrap:wrap;">
          <button onclick="loginDriver()" style="padding:10px 14px;">Login</button>
          <button onclick="logoutDriverPanel()" style="padding:10px 14px;">Logout</button>
        </div>

        <p id="loginMessage" style="margin-top:12px;"></p>
      `
    )}

    ${card("Your Bookings", `<ul id="driverBookings"></ul>`)}
  `;
}

function renderAdminLoginView() {
  return `
    ${card(
      "Admin Login",
      `
        <input
          id="adminPassword"
          type="password"
          placeholder="Enter admin password"
          style="width:100%; padding:12px; margin-bottom:10px;"
        />

        <div style="display:flex; gap:10px; flex-wrap:wrap;">
          <button
            onclick="loginAdmin()"
            style="padding:10px 14px; background:black; color:white; border:none; border-radius:8px;"
          >
            Login
          </button>

          <button
            onclick="changeView('customer')"
            style="padding:10px 14px;"
          >
            Cancel
          </button>
        </div>

        <p id="adminLoginMessage" style="margin-top:12px;"></p>
      `
    )}
  `;
}

function renderAdminView() {
  return `
    ${card(
      "Admin Panel",
      `
        <div style="display:flex; justify-content:flex-end;">
          <button onclick="logoutAdminPanel()" style="padding:10px 14px;">Logout admin</button>
        </div>
      `
    )}

    ${card("All Bookings", `<ul id="adminBookings"></ul>`)}

    ${card(
      "Drivers",
      `
        <ul id="adminDrivers"></ul>
        <button onclick="resetDrivers()" style="margin-top:10px; padding:10px 14px;">Reset drivers</button>
        <p id="adminMessage" style="margin-top:10px;"></p>
      `
    )}
  `;
}

async function renderQrCode() {
  const canvas = document.getElementById("qrCanvas") as HTMLCanvasElement | null;
  if (!canvas) return;

  await QRCode.toCanvas(canvas, publicBookingUrl, {
    width: 220,
    margin: 2,
  });
}

async function loadCustomerDrivers() {
  const res = await fetch(`${apiBase}/drivers`);
  const drivers = await res.json();

  const select = document.getElementById("driverSelect") as HTMLSelectElement | null;
  if (!select) return;

  select.innerHTML =
    `<option value="">Auto assign driver</option>` +
    drivers
      .filter((d: any) => d.status === "available")
      .map((d: any) => `<option value="${d.id}">${d.name} - ${d.area}</option>`)
      .join("");
}

async function loadCustomerBookings() {
  const res = await fetch(`${apiBase}/bookings`);
  const bookings = await res.json();

  const list = document.getElementById("customerBookings");
  if (!list) return;

  list.innerHTML = bookings.length
    ? bookings
        .slice(0, 8)
        .map(
          (b: any) => `
            <li style="margin-bottom:10px;">
              ${b.from} → ${b.to} (${b.driver || "none"}) [${b.status}]
            </li>
          `
        )
        .join("")
    : "<li>No bookings yet</li>";
}

async function loadAdminBookings() {
  const list = document.getElementById("adminBookings");
  if (!list) return;

  try {
    const res = await fetch(`${apiBase}/bookings`);
    const bookings = await res.json();

    list.innerHTML = bookings.length
      ? bookings
          .map(
            (b: any) => `
              <li style="margin-bottom:10px;">
                ${b.from} → ${b.to} (Driver: ${b.driver || "none"}) [${b.status}]
                ${
                  b.status !== "completed"
                    ? `<button onclick="completeBooking('${b.id}')" style="margin-left:10px;">Complete</button>`
                    : ""
                }
              </li>
            `
          )
          .join("")
      : "<li>No bookings yet</li>";
  } catch {
    list.innerHTML = "<li>Could not load bookings</li>";
  }
}

async function loadAdminDrivers() {
  const list = document.getElementById("adminDrivers");
  if (!list) return;

  try {
    const res = await fetch(`${apiBase}/drivers`);
    const drivers = await res.json();

    list.innerHTML = drivers.length
      ? drivers
          .map((d: any) => `<li style="margin-bottom:8px;">${d.name} - ${d.area} (${d.status})</li>`)
          .join("")
      : "<li>No drivers found</li>";
  } catch {
    list.innerHTML = "<li>Could not load drivers</li>";
  }
}

async function loadDriverLoginOptions() {
  const res = await fetch(`${apiBase}/drivers`);
  const drivers = await res.json();

  const select = document.getElementById("driverLoginSelect") as HTMLSelectElement | null;
  if (!select) return;

  select.innerHTML =
    `<option value="">Choose driver</option>` +
    drivers.map((d: any) => `<option value="${d.id}">${d.name} - ${d.area}</option>`).join("");
}

async function loadLoggedInDriverPanel() {
  const list = document.getElementById("driverBookings");
  const loginMessage = document.getElementById("loginMessage");

  const token = getDriverToken();

  if (!token) {
    if (list) list.innerHTML = "";
    if (loginMessage) loginMessage.innerHTML = "No driver logged in";
    return;
  }

  try {
    const checkRes = await driverFetch(`${apiBase}/driver-check`);
    const checkData = await checkRes.json();

    if (loginMessage && checkData.driver) {
      loginMessage.innerHTML = `Logged in as ${checkData.driver.name} (${checkData.driver.status})`;
    }

    const bookingsRes = await driverFetch(`${apiBase}/driver-bookings`);
    const bookings = await bookingsRes.json();

    if (list) {
      list.innerHTML = bookings.length
        ? bookings
            .map(
              (b: any) => `
                <li style="margin-bottom:10px;">
                  ${b.from} → ${b.to} [${b.status}]
                  ${
                    b.status !== "completed"
                      ? `<button onclick="driverCompleteBooking('${b.id}')" style="margin-left:10px;">Complete</button>`
                      : ""
                  }
                </li>
              `
            )
            .join("")
        : "<li>No bookings for this driver</li>";
    }
  } catch {
    logoutDriver();
    if (list) list.innerHTML = "";
    if (loginMessage) loginMessage.innerHTML = "Driver session expired";
  }
}

(window as any).changeView = function (view: string) {
  setView(view);
};

(window as any).copyBookingLink = async function () {
  const msg = document.getElementById("copyMessage");
  try {
    await navigator.clipboard.writeText(publicBookingUrl);
    if (msg) msg.innerHTML = "✅ Booking link copied";
  } catch {
    if (msg) msg.innerHTML = "❌ Could not copy link";
  }
};

(window as any).bookRide = async function () {
  const from = (document.getElementById("from") as HTMLInputElement).value;
  const to = (document.getElementById("to") as HTMLInputElement).value;
  const driverId = (document.getElementById("driverSelect") as HTMLSelectElement).value;
  const message = document.getElementById("message");

  try {
    const res = await fetch(`${apiBase}/book`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, driverId }),
    });

    const data = await res.json();

    if (data.ok) {
      if (message) message.innerHTML = `✅ Booking saved (Driver: ${data.booking.driver})`;
      await loadCustomerBookings();
      await loadCustomerDrivers();
    } else {
      if (message) message.innerHTML = `❌ ${data.error || "Error"}`;
    }
  } catch {
    if (message) message.innerHTML = `❌ Could not connect to backend`;
  }
};

(window as any).loginDriver = async function () {
  const id = (document.getElementById("driverLoginSelect") as HTMLSelectElement).value;
  const password = (document.getElementById("driverPassword") as HTMLInputElement).value;
  const loginMessage = document.getElementById("loginMessage");

  if (!id || !password) {
    if (loginMessage) loginMessage.innerHTML = "❌ Choose driver and enter password";
    return;
  }

  try {
    const res = await fetch(`${apiBase}/driver-login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        driverId: id,
        password: password,
      }),
    });

    const data = await res.json();

    if (data.ok) {
      setDriverToken(data.token);

      if (loginMessage) {
        loginMessage.innerHTML = `✅ Logged in as ${data.driver.name}`;
      }

      await loadLoggedInDriverPanel();
    } else {
      if (loginMessage) {
        loginMessage.innerHTML = `❌ ${data.error || "Login failed"}`;
      }
    }
  } catch {
    if (loginMessage) {
      loginMessage.innerHTML = "❌ Could not connect to backend";
    }
  }
};

(window as any).logoutDriverPanel = async function () {
  logoutDriver();
  await loadLoggedInDriverPanel();
  await loadDriverLoginOptions();
};

(window as any).driverCompleteBooking = async function (id: string) {
  const loginMessage = document.getElementById("loginMessage");

  try {
    await driverFetch(`${apiBase}/driver-complete-booking/${id}`, {
      method: "POST",
    });

    await loadLoggedInDriverPanel();
    await loadCustomerBookings();
    await loadCustomerDrivers();

    if (loginMessage) {
      loginMessage.innerHTML = "✅ Booking completed";
    }
  } catch {
    if (loginMessage) {
      loginMessage.innerHTML = "❌ Could not complete booking";
    }
  }
};

(window as any).loginAdmin = async function () {
  const password = (document.getElementById("adminPassword") as HTMLInputElement)?.value || "";
  const msg = document.getElementById("adminLoginMessage");

  try {
    const res = await fetch(`${apiBase}/admin-login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });

    const data = await res.json();

    if (data.ok && data.token) {
      setAdminToken(data.token);
      if (msg) msg.innerHTML = "✅ Login successful";
      setView("admin");
    } else {
      if (msg) msg.innerHTML = `❌ ${data.error || "Login failed"}`;
    }
  } catch {
    if (msg) msg.innerHTML = "❌ Could not connect to backend";
  }
};

(window as any).logoutAdminPanel = function () {
  logoutAdmin();
  setView("customer");
};

(window as any).resetDrivers = async function () {
  const msg = document.getElementById("adminMessage");

  try {
    const res = await adminFetch(`${apiBase}/reset-drivers`, {
      method: "POST",
    });

    const data = await res.json();

    if (data.ok) {
      if (msg) msg.innerHTML = "✅ Drivers reset";
    } else {
      if (msg) msg.innerHTML = `❌ ${data.error || "Error"}`;
    }

    if (getView() === "admin") {
      await loadAdminDrivers();
    }
    if (getView() === "customer") {
      await loadCustomerDrivers();
    }
    if (getView() === "driver") {
      await loadDriverLoginOptions();
      await loadLoggedInDriverPanel();
    }
  } catch {
    if (msg) msg.innerHTML = "❌ Admin authorization failed";
  }
};

(window as any).completeBooking = async function (id: string) {
  try {
    await adminFetch(`${apiBase}/complete-booking/${id}`, {
      method: "POST",
    });

    if (getView() === "admin") {
      await loadAdminBookings();
      await loadAdminDrivers();
    }
    if (getView() === "driver") {
      await loadLoggedInDriverPanel();
    }
    if (getView() === "customer") {
      await loadCustomerBookings();
      await loadCustomerDrivers();
    }
  } catch {
    alert("Admin authorization failed");
  }
};

window.addEventListener("popstate", () => {
  load();
});

load();