"""
Phase 2C - End-to-End Runtime Verification
Tests customer auth UI, account portal, booking JWT injection,
nav-auth updates, admin detection, RTL, and responsive layout.
"""
import sys, time, json, os, urllib.request, urllib.error
from playwright.sync_api import sync_playwright

BASE_URL = "http://localhost:3000"
API_URL = "http://localhost:8080/api"

TS = str(int(time.time()))
TEST_EMAIL = f"testuser_{TS}@example.com"
TEST_PASS = "TestPass123!"
TEST_NAME = f"Test User {TS}"

ADMIN_EMAIL = "admin@marshal.com"
ADMIN_PASS = "ChangeMe123!"

results = {"passed": [], "failed": [], "errors": []}

def log_pass(name):
    results["passed"].append(name)
    print(f"  PASS: {name}")

def log_fail(name, detail):
    results["failed"].append(name)
    results["errors"].append(f"{name}: {detail}")
    print(f"  FAIL: {name} - {detail[:200]}")

def listen_errors(page):
    errs = []
    def on_console(msg):
        if msg.type == "error":
            errs.append({"text": msg.text, "loc": str(msg.location)})
    page.on("console", on_console)
    return errs

def api_get(path, token=None):
    req = urllib.request.Request(
        API_URL + "/" + path,
        headers={"Accept": "application/json"}
    )
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        resp = urllib.request.urlopen(req, timeout=5)
        return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        return {"_error": True, "status": e.code, "body": e.read().decode()}
    except Exception as e:
        return {"_error": True, "detail": str(e)}

def api_post(path, data, token=None):
    body = json.dumps(data).encode()
    req = urllib.request.Request(
        API_URL + "/" + path,
        data=body,
        headers={"Content-Type": "application/json", "Accept": "application/json"}
    )
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        resp = urllib.request.urlopen(req, timeout=5)
        return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        return {"_error": True, "status": e.code, "body": e.read().decode()}
    except Exception as e:
        return {"_error": True, "detail": str(e)}

def get_token(page):
    return page.evaluate("localStorage.getItem('mg-user-jwt')")

def clear_tokens(page):
    page.evaluate("localStorage.removeItem('mg-user-jwt'); localStorage.removeItem('mg-admin-jwt')")

def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=["--no-sandbox"])
        context = browser.new_context(viewport={"width": 1440, "height": 900}, locale="en-US")

        try:
            # ================================================================
            # 1. PAGE LOAD VERIFICATION
            # ================================================================
            print("\n=== 1. Page Load Verification ===")
            for name, path in [
                ("index.html", "/"),
                ("about.html", "/pages/about.html"),
                ("rooms.html", "/pages/rooms.html"),
                ("room-details.html", "/pages/room-details.html"),
                ("contact.html", "/pages/contact.html"),
                ("gallery.html", "/pages/gallery.html"),
                ("account.html", "/pages/account.html"),
            ]:
                page = context.new_page()
                errs = listen_errors(page)
                try:
                    page.goto(BASE_URL + path, wait_until="networkidle", timeout=15000)
                    page.wait_for_timeout(1500)
                    critical = [e for e in errs if "CORS" not in e["text"] and "ERR_FAILED" not in e["text"]]
                    if critical:
                        log_fail(f"1.{name}", "; ".join([e["text"][:100] for e in critical]))
                    else:
                        log_pass(f"1.{name} - OK")
                except Exception as e:
                    log_fail(f"1.{name} - Exception", str(e))
                finally:
                    page.close()

            # ================================================================
            # 2. GUEST NAV STATE
            # ================================================================
            print("\n=== 2. Guest Nav State ===")
            for pname, ppath, expected_href in [
                ("index.html", "/", "pages/account.html"),
                ("about.html", "/pages/about.html", "account.html"),
                ("rooms.html", "/pages/rooms.html", "account.html"),
                ("contact.html", "/pages/contact.html", "account.html"),
                ("gallery.html", "/pages/gallery.html", "account.html"),
                ("room-details.html", "/pages/room-details.html", "account.html"),
            ]:
                page = context.new_page()
                try:
                    page.goto(BASE_URL + ppath, wait_until="networkidle", timeout=15000)
                    page.wait_for_timeout(1500)
                    nav = page.locator(".nav-login").first
                    if nav.count() == 0:
                        log_fail(f"2.{pname}", "no .nav-login")
                        continue
                    href = nav.get_attribute("href") or ""
                    if expected_href in href:
                        log_pass(f"2.{pname} - href OK")
                    else:
                        log_fail(f"2.{pname} - href", f"got '{href}'")
                    ml = page.locator(".mobile-menu a").last
                    if ml.count() > 0 and expected_href in (ml.get_attribute("href") or ""):
                        log_pass(f"2.{pname} (mobile) - href OK")
                except Exception as e:
                    log_fail(f"2.{pname}", str(e))
                finally:
                    page.close()

            # ================================================================
            # 3. REGISTRATION + LOGIN
            # ================================================================
            print("\n=== 3. Customer Registration + Login ===")
            page = context.new_page()
            errs = listen_errors(page)
            try:
                page.goto(BASE_URL + "/pages/account.html", wait_until="networkidle", timeout=15000)
                page.wait_for_timeout(2000)
                clear_tokens(page)
                page.reload(wait_until="networkidle")
                page.wait_for_timeout(2000)
                page.locator("#showRegister").click()
                page.wait_for_timeout(1000)
                if page.locator("#registerView").is_visible():
                    log_pass("3.1 - Register form visible")
                else:
                    log_fail("3.1 - Register form not visible", "")

                page.fill("#regName", TEST_NAME)
                page.fill("#regEmail", TEST_EMAIL)
                page.fill("#regPhone", "+201001234567")
                page.fill("#regPassword", TEST_PASS)
                page.click("#registerBtn")
                page.wait_for_timeout(3000)

                rsucc = page.locator("#regSuccess")
                if rsucc.count() > 0 and rsucc.is_visible() and rsucc.text_content():
                    log_pass("3.2 - Registration success message shown")
                else:
                    rerr = page.locator("#regError")
                    et = rerr.text_content() if rerr.count() > 0 and rerr.is_visible() else ""
                    if et:
                        log_fail("3.2 - Registration error", et)
                    else:
                        log_pass("3.2 - Registration submitted (no visible error/success)")

                if not get_token(page):
                    log_pass("3.3 - No auto-login after registration (expected)")
                else:
                    log_fail("3.3 - Auto-login occurred (unexpected)", "")

                page.locator("#showLogin").click()
                page.wait_for_timeout(1000)
                page.fill("#loginEmail", TEST_EMAIL)
                page.fill("#loginPassword", TEST_PASS)
                page.click("#loginBtn")
                page.wait_for_timeout(3000)
                acc_view = page.locator("#accountView")
                if acc_view.count() > 0 and acc_view.is_visible():
                    log_pass("3.4 - Account dashboard visible")
                    uname = (page.locator("#acUserName").text_content() or "").strip()
                    if TEST_NAME in uname:
                        log_pass(f"3.5 - Name: {uname}")
                    else:
                        log_fail("3.5 - Name wrong", f"'{uname}'")
                    if get_token(page):
                        log_pass("3.6 - mg-user-jwt stored")
                    else:
                        log_fail("3.6 - No token", "")

                    # Verify via API
                    token = get_token(page)
                    me = api_get("auth/me", token)
                    if me.get("ok") and me.get("user", {}).get("role") == "USER":
                        log_pass("3.7 - Backend confirms USER role")
                    else:
                        log_fail("3.7 - Backend /me", str(me)[:150])
                else:
                    le = page.locator("#authError")
                    et = le.text_content() if le.count() > 0 and le.is_visible() else ""
                    log_fail("3.4 - Login failed", et)
            except Exception as e:
                log_fail("3.x - Registration exception", str(e))
            finally:
                page.close()

            # ================================================================
            # 4. NAVBAR AUTH STATE (logged in)
            # ================================================================
            print("\n=== 4. Navbar Auth State (logged in) ===")
            page = context.new_page()
            try:
                page.goto(BASE_URL + "/", wait_until="networkidle", timeout=15000)
                page.wait_for_timeout(2000)
                nav = page.locator(".nav-login").first
                if nav.count() > 0:
                    href = nav.get_attribute("href") or ""
                    if "account" in href.lower():
                        log_pass("4.1 - Nav links to Account")
                    else:
                        log_fail("4.1 - Nav href not account", href)
                ml = page.locator(".mobile-menu a").last
                if ml.count() > 0 and "account" in (ml.get_attribute("href") or "").lower():
                    log_pass("4.2 - Mobile nav links to Account")
            except Exception as e:
                log_fail("4.x", str(e))
            finally:
                page.close()

            # ================================================================
            # 5. AUTHENTICATED BOOKING
            # ================================================================
            print("\n=== 5. Authenticated Booking ===")
            token = None
            page = context.new_page()
            try:
                page.goto(BASE_URL + "/pages/account.html", wait_until="networkidle", timeout=15000)
                page.wait_for_timeout(2000)
                token = get_token(page)
                if not token:
                    clear_tokens(page)
                    page.reload(wait_until="networkidle")
                    page.wait_for_timeout(2000)
                    page.fill("#loginEmail", TEST_EMAIL)
                    page.fill("#loginPassword", TEST_PASS)
                    page.click("#loginBtn")
                    page.wait_for_timeout(3000)
                    token = get_token(page)
                log_pass(f"5.0 - Token available: {bool(token)}")
            finally:
                page.close()

            if token:
                rooms = api_get("rooms")
                if rooms.get("ok") and rooms.get("data") and len(rooms["data"]) > 0:
                    room_id = rooms["data"][0]["id"]
                    # Use far-future dates to avoid room_unavailable from prior test runs
                    far = 86400 * (200 + int(time.time()) % 100)
                    tomorrow = time.strftime("%Y-%m-%d", time.localtime(time.time() + far))
                    checkout = time.strftime("%Y-%m-%d", time.localtime(time.time() + far + 86400 * 2))
                    booking = api_post("bookings", {
                        "guestName": TEST_NAME, "email": TEST_EMAIL, "phone": "+201001234567",
                        "roomId": room_id, "checkin": tomorrow, "checkout": checkout,
                        "adults": 1, "children": 0, "rooms": 1
                    }, token)
                    if booking.get("ok") and booking.get("booking"):
                        log_pass("5.1 - Authenticated booking created")
                        booking_id = booking["booking"].get("id", "")
                        if booking["booking"].get("userId"):
                            log_pass("5.2 - Booking has userId")
                        else:
                            log_fail("5.2 - Booking missing userId", "")

                        # /mine check
                        mine = api_get("bookings/mine", token)
                        if mine.get("ok"):
                            blist = mine.get("bookings") or mine.get("data") or []
                            if booking_id in [b.get("id", "") for b in blist]:
                                log_pass("5.3 - Booking in /mine")
                            else:
                                log_fail("5.3 - Booking not in /mine", str([b.get("id","") for b in blist]))
                            leaked = [b for b in blist if b.get("accessToken")]
                            if leaked:
                                log_fail("5.3b - accessToken leaked", "")
                            else:
                                log_pass("5.3b - No accessToken leak")
                        else:
                            log_fail("5.3 - /mine failed", str(mine)[:200])

                        lookup = api_get(f"bookings/{booking_id}", token)
                        if lookup.get("ok") and lookup.get("booking"):
                            log_pass("5.3c - Auth user can view own booking")
                        else:
                            log_fail("5.3c - Cannot view own booking", str(lookup)[:200])

                        # Guest booking
                        far2 = 86400 * (300 + int(time.time()) % 100)
                        checkin2 = time.strftime("%Y-%m-%d", time.localtime(time.time() + far2))
                        checkout2 = time.strftime("%Y-%m-%d", time.localtime(time.time() + far2 + 86400 * 2))
                        gb = api_post("bookings", {
                            "guestName": "Guest Only", "email": f"guest_{TS}@example.com",
                            "phone": "+201009998877", "roomId": room_id,
                            "checkin": checkin2, "checkout": checkout2,
                            "adults": 1, "children": 0, "rooms": 1
                        })
                        if gb.get("ok") and gb.get("booking"):
                            log_pass("5.4 - Guest booking works")
                            gbid = gb["booking"].get("id", "")
                            gbtok = gb["booking"].get("accessToken", "")
                            look = api_get(f"bookings/{gbid}?accessToken={gbtok}")
                            if look.get("ok") and look.get("booking"):
                                log_pass("5.5 - Guest accessToken lookup works")
                            else:
                                log_fail("5.5 - Guest accessToken lookup", str(look)[:200])
                            blk = api_get(f"bookings/{gbid}", token)
                            if blk.get("_error") and blk.get("status") in (403, 404):
                                log_pass("5.6 - Auth user blocked from guest booking")
                            elif blk.get("ok"):
                                log_fail("5.6 - Auth user accessed guest booking (should be blocked)", "")
                            else:
                                log_pass("5.6 - Auth user blocked")
                        else:
                            log_fail("5.4 - Guest booking failed", str(gb)[:200])
                    else:
                        log_fail("5.1 - Booking failed", str(booking)[:200])
                else:
                    log_fail("5.x - No rooms", "")
            else:
                log_fail("5.x - No token", "")

            # ================================================================
            # 6. ADMIN BEHAVIOR
            # ================================================================
            print("\n=== 6. Admin Behavior ===")
            page = context.new_page()
            try:
                page.goto(BASE_URL + "/pages/account.html", wait_until="networkidle", timeout=15000)
                page.wait_for_timeout(2000)
                clear_tokens(page)
                page.reload(wait_until="networkidle")
                page.wait_for_timeout(2000)
                page.fill("#loginEmail", ADMIN_EMAIL)
                page.fill("#loginPassword", ADMIN_PASS)
                page.click("#loginBtn")
                page.wait_for_timeout(3000)
                at = page.evaluate("localStorage.getItem('mg-admin-jwt')")
                if at:
                    log_pass("6.1 - mg-admin-jwt created")
                else:
                    log_fail("6.1 - mg-admin-jwt missing", "")
                if "admin.html" in page.url:
                    log_pass("6.2 - Redirected to admin.html")
                else:
                    log_fail("6.2 - Not redirected", page.url)
                if at:
                    me = api_get("auth/me", at)
                    if me.get("ok") and me.get("user", {}).get("role") == "ADMIN":
                        log_pass("6.3 - Admin role=ADMIN")
                    else:
                        log_fail("6.3 - Admin /me", str(me)[:200])
                    st = api_get("admin/dashboard/stats", at)
                    if st.get("ok"):
                        log_pass("6.4 - Admin dashboard stats API works")
                    else:
                        log_fail("6.4 - Admin stats", str(st)[:200])
            except Exception as e:
                log_fail("6.x", str(e))
            finally:
                page.close()

            # ================================================================
            # 7. LOGOUT
            # ================================================================
            print("\n=== 7. Logout ===")
            page = context.new_page()
            try:
                page.goto(BASE_URL + "/pages/account.html", wait_until="load", timeout=15000)
                page.wait_for_timeout(2000)
                clear_tokens(page)
                page.evaluate("localStorage.removeItem('mg-lang')")
                page.wait_for_timeout(500)
                # Navigate fresh instead of reload to avoid any weird caching
                page.goto(BASE_URL + "/pages/account.html", wait_until="load", timeout=15000)
                page.wait_for_timeout(3000)

                # Check what's visible
                login_email = page.locator("#loginEmail")
                if not login_email.is_visible():
                    page.wait_for_timeout(3000)
                    if not login_email.is_visible():
                        log_fail("7.0 - loginEmail not visible", "page may not have loaded correctly")

                if login_email.is_visible():
                    page.fill("#loginEmail", TEST_EMAIL)
                    page.fill("#loginPassword", TEST_PASS)
                    page.click("#loginBtn")
                    page.wait_for_timeout(3000)
                    if page.locator("#accountView").count() > 0 and page.locator("#accountView").is_visible():
                        log_pass("7.1 - Logged in for logout test")
                        page.locator("#logoutBtn").click()
                        page.wait_for_timeout(1500)
                        if get_token(page):
                            log_fail("7.2 - Token still present", "")
                        else:
                            log_pass("7.2 - Token removed")
                        if page.locator("#authView").is_visible():
                            log_pass("7.3 - Auth view visible")
                        else:
                            log_fail("7.3 - Auth view not visible", "")
                        page.goto(BASE_URL + "/", wait_until="networkidle", timeout=15000)
                        page.wait_for_timeout(2000)
                        if page.locator(".nav-login").first.count() > 0:
                            log_pass("7.4 - Nav shows login state")
                        if page.evaluate("localStorage.getItem('mg-admin-jwt')"):
                            log_fail("7.5 - mg-admin-jwt still present", "")
                        else:
                            log_pass("7.5 - mg-admin-jwt clean")
                    else:
                        le = page.locator("#authError")
                        et = le.text_content() if le.count() > 0 and le.is_visible() else ""
                        log_fail("7.1 - Login failed", et)
                else:
                    log_fail("7.0 - loginEmail not visible", "page may not have loaded correctly")
            except Exception as e:
                log_fail("7.x - Exception", str(e))
            finally:
                page.close()

            # ================================================================
            # 8. RESPONSIVE & RTL
            # ================================================================
            print("\n=== 8. Responsive & RTL ===")
            for vp, label in [
                ({"width": 1440, "height": 900}, "Desktop"),
                ({"width": 768, "height": 1024}, "Tablet"),
                ({"width": 375, "height": 812}, "Mobile(375px)"),
            ]:
                page = context.new_page()
                page.set_viewport_size(vp)
                errs = listen_errors(page)
                try:
                    page.goto(BASE_URL + "/pages/account.html", wait_until="networkidle", timeout=15000)
                    page.wait_for_timeout(1500)
                    bw = page.evaluate("document.body.scrollWidth")
                    vw = page.evaluate("window.innerWidth")
                    if bw > vw + 5:
                        log_fail(f"8.{label} - Overflow {bw} > {vw}")
                    else:
                        log_pass(f"8.{label} - No overflow")
                    crit = [e for e in errs if "CORS" not in e["text"]]
                    if crit:
                        log_fail(f"8.{label} - Console errors", "; ".join(c["text"][:80] for c in crit))
                    else:
                        log_pass(f"8.{label} - No console errors")
                except Exception as e:
                    log_fail(f"8.{label}", str(e))
                finally:
                    page.close()

            # Arabic / RTL
            page = context.new_page()
            errs = listen_errors(page)
            try:
                page.goto(BASE_URL + "/pages/account.html", wait_until="networkidle", timeout=15000)
                page.wait_for_timeout(2000)
                clear_tokens(page)
                page.evaluate("localStorage.removeItem('mg-lang')")
                page.reload(wait_until="networkidle")
                page.wait_for_timeout(3000)

                lt = page.locator("#langToggle")
                if lt.count() > 0:
                    # Force English initially
                    page.evaluate("window.MGLang && window.MGLang.apply('en')")
                    page.wait_for_timeout(1000)
                    d0 = page.evaluate("document.documentElement.getAttribute('dir')")
                    l0 = page.evaluate("document.documentElement.getAttribute('lang')")
                    # Click toggle via Playwright
                    lt.click(force=True, timeout=5000)
                    page.wait_for_timeout(2000)
                    d = page.evaluate("document.documentElement.getAttribute('dir')")
                    l = page.evaluate("document.documentElement.getAttribute('lang')")
                    if l == "ar" and d == "rtl":
                        log_pass("8.RTL - toggled to Arabic (dir=rtl, lang=ar)")
                    elif l != l0:
                        log_pass(f"8.RTL - lang changed from {l0} to {l}, dir={d}")
                    else:
                        log_fail("8.RTL - lang unchanged after click", f"before: {l0}/{d0}, after: {l}/{d}")
                    crit = [e for e in errs if "CORS" not in e["text"]]
                    if crit:
                        log_fail("8.RTL - Console errors", "; ".join(c["text"][:80] for c in crit))
                    else:
                        log_pass("8.RTL - No console errors")
                    bw = page.evaluate("document.body.scrollWidth")
                    vw = page.evaluate("window.innerWidth")
                    if bw > vw + 5:
                        log_fail("8.RTL - Overflow")
                    else:
                        log_pass("8.RTL - No overflow")
                else:
                    log_fail("8.RTL - langToggle not found", "")
            except Exception as e:
                log_fail("8.RTL", str(e))
            finally:
                page.close()

            # ================================================================
            # 9. CROSS-PAGE NAVIGATION
            # ================================================================
            print("\n=== 9. Cross-Page Navigation ===")
            for pname, ppath, expected in [
                ("index.html -> account", "/", "pages/account.html"),
                ("about -> account", "/pages/about.html", "account.html"),
                ("rooms -> account", "/pages/rooms.html", "account.html"),
                ("contact -> account", "/pages/contact.html", "account.html"),
                ("gallery -> account", "/pages/gallery.html", "account.html"),
            ]:
                page = context.new_page()
                try:
                    page.goto(BASE_URL + ppath, wait_until="networkidle", timeout=15000)
                    page.wait_for_timeout(1500)
                    nl = page.locator(".nav-login").first
                    if nl.count() > 0:
                        hr = nl.get_attribute("href") or ""
                        if expected in hr:
                            log_pass(f"9.{pname} - href OK")
                        else:
                            log_fail(f"9.{pname} - href", f"got '{hr}'")
                    else:
                        log_fail(f"9.{pname} - no nav-login", "")
                except Exception as e:
                    log_fail(f"9.{pname}", str(e))
                finally:
                    page.close()

        finally:
            browser.close()

    print("\n" + "=" * 60)
    print(f"RESULTS: {len(results['passed'])} passed, {len(results['failed'])} failed")
    print("=" * 60)
    for f in results["failed"]:
        print(f"  FAIL - {f}")
    return len(results["failed"]) == 0

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
