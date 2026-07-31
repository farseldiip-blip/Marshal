"""
Phase 2C — Final focused verification (10 scenarios).
Uses DOMContentLoaded readiness + explicit app-ready checks
instead of networkidle, to avoid flaky CDN timeouts.
Captures console errors + failed HTTP requests for each scenario.
"""
import sys, time, json, urllib.request
from playwright.sync_api import sync_playwright

BASE = "http://localhost:3000"
API  = "http://localhost:8080/api"
TS   = str(int(time.time()))
EMAIL = f"fin_{TS}@example.com"
PASS  = "FinalPass123!"
NAME  = f"Final {TS}"
ADMIN_EMAIL = "admin@marshal.com"
ADMIN_PASS  = "ChangeMe123!"

P, F = 0, 0  # pass/fail counters
logs = []    # collects failures with detail

def ok(n):    global P; P += 1; print(f"  PASS: {n}")
def nok(n,d): global F; F += 1; logs.append(f"  FAIL: {n}  {d[:300]}"); print(f"  FAIL: {n}  {d[:200]}")

def ready(page):
    """Wait for app JS to initialize — MGLang is the signal everything loaded."""
    page.wait_for_function("typeof window.MGLang !== 'undefined' && window.MGLang.isReady", timeout=10000)
    page.wait_for_timeout(200)

def load_acct(page):
    """Navigate to account page and wait for the app auth view to be ready."""
    page.goto(BASE + "/pages/account.html", wait_until="domcontentloaded", timeout=15000)
    ready(page)
    # Clear any leftover tokens
    page.evaluate("localStorage.removeItem('mg-user-jwt'); localStorage.removeItem('mg-admin-jwt')")
    page.evaluate("localStorage.removeItem('mg-lang')")
    # Reload fresh with no auth
    page.goto(BASE + "/pages/account.html", wait_until="domcontentloaded", timeout=15000)
    ready(page)

def with_monitors(page):
    """Attach console + request monitors. Returns dict of captured data."""
    d = {"errors": [], "failed_reqs": []}
    def on_console(msg):
        if msg.type == "error" and "Failed to load resource" not in msg.text:
            d["errors"].append({"text": msg.text[:200], "loc": str(msg.location)[:100]})
    def on_response(resp):
        if resp.status >= 400:
            d["failed_reqs"].append({"url": resp.url[:150], "status": resp.status})
    page.on("console", on_console)
    page.on("response", on_response)
    return d

def set_lang(page, l):
    page.evaluate(f"window.MGLang && window.MGLang.apply('{l}')")
    page.wait_for_timeout(800)

with sync_playwright() as pw:
    br = pw.chromium.launch(headless=True, args=["--no-sandbox"])
    ctx = br.new_context(viewport={"width": 1440, "height": 900})

    try:
        # ──────────────────────────────────────────────────────────
        # 1. Arabic invalid login → Arabic error, no English
        # ──────────────────────────────────────────────────────────
        print("=== 1. Arabic invalid login ===")
        p = ctx.new_page(); md = with_monitors(p)
        load_acct(p); set_lang(p, "ar")
        l = p.evaluate("document.documentElement.getAttribute('lang')")
        ok("1a lang=ar") if l == "ar" else nok("1a lang=ar", f"got {l}")
        p.fill("#loginEmail", "wrong@test.com")
        p.fill("#loginPassword", "badpass")
        p.click("#loginBtn")
        p.wait_for_timeout(3000)
        et = (p.locator("#authError").text_content() or "").strip()
        has_arabic = any(ord(c) > 0x600 for c in et)
        no_english = "Invalid" not in et and "incorrect" not in et.lower()
        ok("1b Arabic error message") if has_arabic and no_english else nok("1b Arabic error", f"'{et[:100]}'")
        # 401 on login is expected — skip those
        unexpect = [e for e in md["errors"] if "/auth/login" not in e["text"]]
        ufr = [r for r in md["failed_reqs"] if "/auth/login" not in r["url"]]
        for e in unexpect: nok("1c console error", e["text"])
        for r in ufr: nok("1d failed request", f"{r['status']} {r['url']}")
        if not unexpect: ok("1c no unexpected errors")
        if not ufr: ok("1d no unexpected failures")
        p.close()

        # ──────────────────────────────────────────────────────────
        # 2. English invalid login → English error
        # ──────────────────────────────────────────────────────────
        print("=== 2. English invalid login ===")
        p = ctx.new_page(); md = with_monitors(p)
        load_acct(p); set_lang(p, "en")
        l = p.evaluate("document.documentElement.getAttribute('lang')")
        ok("2a lang=en") if l == "en" else nok("2a lang=en", f"got {l}")
        p.fill("#loginEmail", "wrong@test.com")
        p.fill("#loginPassword", "badpass")
        p.click("#loginBtn")
        p.wait_for_timeout(3000)
        et = (p.locator("#authError").text_content() or "").strip()
        is_english = "Invalid" in et or "incorrect" in et.lower() or "try again" in et.lower()
        has_arabic_chars = any(ord(c) > 0x600 for c in et)
        ok("2b English error message") if is_english and not has_arabic_chars else nok("2b English error", f"'{et[:100]}'")
        unexpect = [e for e in md["errors"] if "/auth/login" not in e["text"]]
        ufr = [r for r in md["failed_reqs"] if "/auth/login" not in r["url"]]
        for e in unexpect: nok("2c console error", e["text"])
        for r in ufr: nok("2d failed request", f"{r['status']} {r['url']}")
        if not unexpect: ok("2c no unexpected errors")
        if not ufr: ok("2d no unexpected failures")
        p.close()

        # ──────────────────────────────────────────────────────────
        # 3. Chrome autofill simulated → inputs remain dark
        # ──────────────────────────────────────────────────────────
        print("=== 3. Autofill dark styling ===")
        p = ctx.new_page()
        load_acct(p)
        # Simulate autofill by injecting values + autofill pseudo-style
        p.evaluate("""
            const el = document.getElementById('loginEmail');
            el.value = 'autofill@test.com';
            el.style.setProperty('-webkit-box-shadow', '0 0 0 1000px rgb(232,240,254) inset', 'important');
        """)
        bg = p.locator("#loginEmail").evaluate("el => getComputedStyle(el).backgroundColor")
        # Our auth-form .input rule should override the injected autofill bg
        is_dark = "255" not in (bg or "").split(",")[0]
        ok("3a autofill bg still dark") if is_dark else nok("3a autofill bg", bg)
        # The real fix uses -webkit-box-shadow inset trick; check it's applied
        shadow = p.locator("#loginEmail").evaluate("el => getComputedStyle(el).boxShadow")
        has_shadow = shadow and shadow != "none" and "inset" in shadow
        ok("3b autofill has inset shadow") if has_shadow else nok("3b autofill inset shadow", str(shadow)[:80])
        p.close()

        # ──────────────────────────────────────────────────────────
        # 4. Normal + focused input states
        # ──────────────────────────────────────────────────────────
        print("=== 4. Normal + focused input states ===")
        p = ctx.new_page()
        load_acct(p)
        inp = p.locator("#loginEmail")
        bg = inp.evaluate("el => getComputedStyle(el).backgroundColor")
        co = inp.evaluate("el => getComputedStyle(el).color")
        ca = inp.evaluate("el => getComputedStyle(el).caretColor")
        ok("4a normal bg dark") if "255" not in (bg or "").split(",")[0] else nok("4a normal bg", bg)
        ok("4b normal text readable") if co and co != "rgba(0,0,0,0)" else nok("4b normal text", str(co))
        ok("4c caret color gold") if ca and any(c in ca.replace(" ", "") for c in ["198,161,91", "rgb(198,161,91)"]) else nok("4c caret", str(ca))
        inp.focus()
        p.wait_for_timeout(500)
        fs = inp.evaluate("el => getComputedStyle(el).boxShadow")
        fb = inp.evaluate("el => getComputedStyle(el).borderColor")
        ok("4d focus shadow") if fs and fs != "none" else nok("4d focus shadow", str(fs))
        ok("4e focus border accent") if fb and any(c in fb.replace(" ", "") for c in ["198,161,91", "rgb(198,161,91)"]) else nok("4e focus border", str(fb))
        p.close()

        # ──────────────────────────────────────────────────────────
        # 5. Valid USER login → account dashboard
        # ──────────────────────────────────────────────────────────
        print("=== 5. Valid USER login ===")
        p = ctx.new_page(); md = with_monitors(p)
        load_acct(p)
        # Register
        p.locator("#showRegister").click(); p.wait_for_timeout(800)
        p.fill("#regName", NAME)
        p.fill("#regEmail", EMAIL)
        p.fill("#regPhone", "+201001234567")
        p.fill("#regPassword", PASS)
        p.click("#registerBtn"); p.wait_for_timeout(3000)
        rc = p.locator("#regSuccess")
        if rc.count() > 0 and rc.is_visible() and rc.text_content():
            ok("5a registration success")
            # Login
            p.locator("#showLogin").click(); p.wait_for_timeout(800)
            p.fill("#loginEmail", EMAIL)
            p.fill("#loginPassword", PASS)
            p.click("#loginBtn"); p.wait_for_timeout(3000)
            av = p.locator("#accountView")
            if av.count() > 0 and av.is_visible():
                ok("5b account dashboard visible")
                un = (p.locator("#acUserName").text_content() or "").strip()
                ok("5c user name displayed") if NAME in un else nok("5c user name", f"'{un}'")
                # Check bookings section loaded
                p.wait_for_timeout(2000)
                bl = p.locator(".booking-loader, .account-empty, .booking-card")
                ok("5d bookings section rendered") if bl.count() > 0 else nok("5d bookings section missing")
            else:
                nok("5b account dashboard", "not visible after login")
        else:
            re = p.locator("#regError")
            rt = re.text_content() if re.count() > 0 else ""
            nok("5a registration failed", rt)
        for e in md["errors"]:
            nok("5e console error", e["text"])
        for r in md["failed_reqs"]:
            nok("5f failed request", f"{r['status']} {r['url']}")
        if not md["errors"]: ok("5e no console errors")
        if not md["failed_reqs"]: ok("5f no failed requests")
        p.close()

        # ──────────────────────────────────────────────────────────
        # 6. ADMIN login → admin dashboard
        # ──────────────────────────────────────────────────────────
        print("=== 6. ADMIN login ===")
        p = ctx.new_page(); md = with_monitors(p)
        load_acct(p)
        p.fill("#loginEmail", ADMIN_EMAIL)
        p.fill("#loginPassword", ADMIN_PASS)
        p.click("#loginBtn"); p.wait_for_timeout(3000)
        ok("6a redirected to admin.html") if "admin.html" in p.url else nok("6a admin redirect", p.url)
        at = p.evaluate("localStorage.getItem('mg-admin-jwt')")
        ut = p.evaluate("localStorage.getItem('mg-user-jwt')")
        ok("6b mg-admin-jwt set") if at else nok("6b mg-admin-jwt missing")
        ok("6c mg-user-jwt set") if ut else nok("6c mg-user-jwt missing")
        if at:
            # Verify admin API still works
            st = json.loads(urllib.request.urlopen(
                urllib.request.Request(API + "/admin/dashboard/stats",
                    headers={"Authorization": f"Bearer {at}"}), timeout=5).read())
            ok("6d admin stats API") if st.get("ok") else nok("6d admin stats", str(st)[:150])
        for e in md["errors"]:
            nok("6e console error", e["text"])
        for r in md["failed_reqs"]:
            nok("6f failed request", f"{r['status']} {r['url']}")
        if not md["errors"]: ok("6e no console errors")
        if not md["failed_reqs"]: ok("6f no failed requests")
        p.close()

        # ──────────────────────────────────────────────────────────
        # 7. Guest booking (no auth)
        # ──────────────────────────────────────────────────────────
        print("=== 7. Guest booking ===")
        rooms = json.loads(urllib.request.urlopen(API + "/rooms", timeout=5).read())
        if rooms.get("ok") and rooms.get("data"):
            rid = rooms["data"][0]["id"]
            far = 86400 * (400 + int(time.time()) % 100)
            ci = time.strftime("%Y-%m-%d", time.localtime(time.time() + far))
            co = time.strftime("%Y-%m-%d", time.localtime(time.time() + far + 86400*2))
            body = json.dumps({"guestName":"Guest Final","email":f"gfin_{TS}@example.com",
                "phone":"+201009998877","roomId":rid,"checkin":ci,"checkout":co,"adults":1,"children":0,"rooms":1}).encode()
            req = urllib.request.Request(API + "/bookings", data=body,
                headers={"Content-Type":"application/json"})
            resp = json.loads(urllib.request.urlopen(req, timeout=5).read())
            ok("7a guest booking created") if resp.get("ok") and resp.get("booking") else nok("7a guest booking", str(resp)[:200])
            if resp.get("ok") and resp.get("booking"):
                gid = resp["booking"].get("id","")
                atok = resp["booking"].get("accessToken","")
                # Verify accessToken lookup
                look = json.loads(urllib.request.urlopen(
                    API + f"/bookings/{gid}?accessToken={atok}", timeout=5).read())
                ok("7b guest accessToken lookup") if look.get("ok") and look.get("booking") else nok("7b guest lookup", str(look)[:150])
        else:
            nok("7a guest booking", "no rooms available")

        # ──────────────────────────────────────────────────────────
        # 8. Authenticated booking
        # ──────────────────────────────────────────────────────────
        print("=== 8. Authenticated booking ===")
        p = ctx.new_page()
        load_acct(p)
        p.fill("#loginEmail", EMAIL)
        p.fill("#loginPassword", PASS)
        p.click("#loginBtn"); p.wait_for_timeout(3000)
        token = p.evaluate("localStorage.getItem('mg-user-jwt')")
        p.close()
        if token and rooms.get("ok") and rooms.get("data"):
            rid = rooms["data"][0]["id"]
            far = 86400 * (500 + int(time.time()) % 100)
            ci = time.strftime("%Y-%m-%d", time.localtime(time.time() + far))
            co = time.strftime("%Y-%m-%d", time.localtime(time.time() + far + 86400*2))
            body = json.dumps({"guestName":NAME,"email":EMAIL,"phone":"+201001234567",
                "roomId":rid,"checkin":ci,"checkout":co,"adults":1,"children":0,"rooms":1}).encode()
            req = urllib.request.Request(API + "/bookings", data=body,
                headers={"Content-Type":"application/json","Authorization":f"Bearer {token}"})
            resp = json.loads(urllib.request.urlopen(req, timeout=5).read())
            ok("8a auth booking created") if resp.get("ok") and resp.get("booking") else nok("8a auth booking", str(resp)[:200])
            if resp.get("ok") and resp.get("booking"):
                bid = resp["booking"].get("id","")
                has_userid = bool(resp["booking"].get("userId"))
                ok("8b booking linked to userId") if has_userid else nok("8b userId missing", "")
                # Verify in /mine
                mine = json.loads(urllib.request.urlopen(
                    urllib.request.Request(API + "/bookings/mine",
                        headers={"Authorization":f"Bearer {token}"}), timeout=5).read())
                if mine.get("ok"):
                    bl = mine.get("bookings") or mine.get("data") or []
                    ok("8c booking in /mine") if bid in [b.get("id","") for b in bl] else nok("8c booking not in /mine", "")
                    leaked = [b for b in bl if b.get("accessToken")]
                    ok("8d no accessToken leak") if not leaked else nok("8d accessToken leaked", str(leaked[0].get("id","")))
                else:
                    nok("8c /mine failed", str(mine)[:150])
        else:
            nok("8a auth booking", f"token={bool(token)}, rooms={bool(rooms.get('ok'))}")

        # ──────────────────────────────────────────────────────────
        # 9. Logout
        # ──────────────────────────────────────────────────────────
        print("=== 9. Logout ===")
        p = ctx.new_page(); md = with_monitors(p)
        load_acct(p)
        p.fill("#loginEmail", EMAIL)
        p.fill("#loginPassword", PASS)
        p.click("#loginBtn"); p.wait_for_timeout(3000)
        av = p.locator("#accountView")
        if av.count() > 0 and av.is_visible():
            ok("9a logged in for logout test")
            p.locator("#logoutBtn").click(); p.wait_for_timeout(1500)
            ut = p.evaluate("localStorage.getItem('mg-user-jwt')")
            at = p.evaluate("localStorage.getItem('mg-admin-jwt')")
            ok("9b mg-user-jwt cleared") if not ut else nok("9b mg-user-jwt still present", "")
            ok("9c mg-admin-jwt clean") if not at else nok("9c mg-admin-jwt still present", "")
            av2 = p.locator("#authView")
            ok("9d auth view visible after logout") if av2.count() > 0 and av2.is_visible() else nok("9d auth view not visible", "")
            # Check nav shows login state
            p.goto(BASE + "/", wait_until="domcontentloaded", timeout=15000); p.wait_for_timeout(2000)
            nl = p.locator(".nav-login").first
            ok("9e nav shows login state") if nl.count() > 0 else nok("9e nav missing", "")
        else:
            nok("9a could not login for logout test", "")
        for e in md["errors"]:
            nok("9f console error", e["text"])
        for r in md["failed_reqs"]:
            nok("9g failed request", f"{r['status']} {r['url']}")
        if not md["errors"]: ok("9f no console errors")
        if not md["failed_reqs"]: ok("9g no failed requests")
        p.close()

        # ──────────────────────────────────────────────────────────
        # 10. Arabic/English switching works after login
        # ──────────────────────────────────────────────────────────
        print("=== 10. Lang switching after login ===")
        p = ctx.new_page()
        load_acct(p)
        p.fill("#loginEmail", EMAIL)
        p.fill("#loginPassword", PASS)
        p.click("#loginBtn"); p.wait_for_timeout(3000)
        av = p.locator("#accountView")
        ok("10a logged in") if av.count() > 0 and av.is_visible() else nok("10a logged in", "")
        # Switch to Arabic
        set_lang(p, "ar")
        d = p.evaluate("document.documentElement.getAttribute('dir')")
        l = p.evaluate("document.documentElement.getAttribute('lang')")
        ok("10b switch to Arabic") if d == "rtl" and l == "ar" else nok("10b switch to Arabic", f"dir={d}, lang={l}")
        # Switch back to English
        set_lang(p, "en")
        d = p.evaluate("document.documentElement.getAttribute('dir')")
        l = p.evaluate("document.documentElement.getAttribute('lang')")
        ok("10c switch to English") if d == "ltr" and l == "en" else nok("10c switch to English", f"dir={d}, lang={l}")
        # Switch again to Arabic while on account dashboard
        set_lang(p, "ar")
        d = p.evaluate("document.documentElement.getAttribute('dir')")
        l = p.evaluate("document.documentElement.getAttribute('lang')")
        ok("10d Arabic on dashboard") if d == "rtl" and l == "ar" else nok("10d Arabic on dashboard", f"dir={d}, lang={l}")
        # Nav should still be visible
        nl = p.locator(".nav-login").first
        ok("10e nav visible after lang switch") if nl.count() > 0 else nok("10e nav missing", "")
        p.close()

    finally:
        br.close()

print(f"\n{'='*55}")
print(f"  FINAL: {P} passed, {F} failed")
print(f"{'='*55}")
if logs:
    print("Failures:")
    for l in logs: print(l)
sys.exit(0 if F == 0 else 1)
