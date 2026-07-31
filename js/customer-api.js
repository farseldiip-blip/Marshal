(function () {
  "use strict";

  var TOKEN_KEY = "mg-user-jwt";

  function base() {
    return (window.MGApiConfig && window.MGApiConfig.baseUrl) || "";
  }

  function getToken() { return localStorage.getItem(TOKEN_KEY) || ""; }
  function setToken(t) { localStorage.setItem(TOKEN_KEY, t || ""); }
  function clearToken() { localStorage.removeItem(TOKEN_KEY); }

  function apiFetch(method, path, body, useAuth) {
    var url = base() + "/" + path;
    if (!url || url === "/") return Promise.resolve({ status: 0, json: null });
    var headers = { "Content-Type": "application/json", Accept: "application/json" };
    if (useAuth !== false) {
      var tok = getToken();
      if (tok) headers["Authorization"] = "Bearer " + tok;
    }
    var opts = { method: method, headers: headers };
    if (body !== undefined && body !== null) opts.body = JSON.stringify(body);
    return fetch(url, opts).then(function (res) {
      return res.json().then(function (json) {
        return { status: res.status, json: json };
      }).catch(function () {
        return { status: res.status, json: null };
      });
    }).catch(function () {
      return { status: 0, json: null };
    });
  }

  function register(data) {
    return apiFetch("POST", "auth/register", data, false).then(function (res) {
      if (res.status === 0) throw new Error("Cannot connect to server");
      if (res.json && res.json.error) throw new Error(res.json.error.message || "Registration failed");
      if (!res.json || !res.json.ok) throw new Error("Registration failed (HTTP " + res.status + ")");
      return res.json;
    });
  }

  function login(email, password) {
    return apiFetch("POST", "auth/login", { email: email, password: password }, false).then(function (res) {
      if (res.status === 0) throw new Error("Cannot connect to server");
      if (res.json && res.json.error) throw new Error(res.json.error.message || "Login failed");
      if (!res.json || !res.json.ok) throw new Error("Login failed (HTTP " + res.status + ")");
      setToken(res.json.token);
      return res.json;
    });
  }

  function me() {
    return apiFetch("GET", "auth/me").then(function (res) {
      if (!res.json || !res.json.ok) throw new Error("AUTH_FAILED");
      return res.json.user;
    });
  }

  function getMyBookings() {
    return apiFetch("GET", "bookings/mine").then(function (res) {
      if (!res.json || !res.json.ok) return [];
      return res.json.bookings || [];
    });
  }

  function logout() {
    clearToken();
    return Promise.resolve();
  }

  function isLoggedIn() {
    return !!getToken();
  }

  window.MGCustomerApi = {
    getToken: getToken,
    setToken: setToken,
    clearToken: clearToken,
    register: register,
    login: login,
    me: me,
    getMyBookings: getMyBookings,
    logout: logout,
    isLoggedIn: isLoggedIn
  };
})();
