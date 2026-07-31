import sys, os, time, json
from playwright.sync_api import sync_playwright

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

SELECTORS = [
    ".bk-row",
    ".bk-row__guest",
    ".bk-row__guest-name",
    ".bk-row__guest-email",
    ".bk-row__room",
    ".bk-row__stay",
    ".bk-row__stay-dates",
    ".bk-row__stay-arrow",
    ".bk-row__guests",
    ".bk-row__total",
    ".bk-row__statuses",
    ".bk-row__statuses > .tag",
    ".tag",
    ".bk-row__actions",
]

PROPS = [
    "display","flex-direction","flex-wrap","justify-content","align-items",
    "gap","flex","flex-grow","flex-shrink","flex-basis",
    "margin-left","margin-right","margin-inline-start","margin-inline-end",
    "padding-left","padding-right","padding-inline-start","padding-inline-end",
    "width","min-width","max-width","height","min-height",
    "direction","text-align","unicode-bidi",
    "overflow-x","overflow","white-space","overflow-wrap","word-break",
    "position","left","right","inset-inline-start","inset-inline-end",
    "order","box-sizing","float","clear",
]

def get_computed(page, selector, props):
    try:
        if "::" in selector:
            raw_sel = selector.replace("::before","").replace("::after","")
            pseudo = "before" if "::before" in selector else "after"
            el = page.locator(raw_sel)
            if el.count() == 0:
                return {"selector": selector, "error": "not found"}
            handle = el.first.evaluate_handle(f"el => window.getComputedStyle(el, '{pseudo}')")
        else:
            el = page.locator(selector)
            if el.count() == 0:
                return {"selector": selector, "error": "not found"}
            handle = el.first.evaluate_handle("el => window.getComputedStyle(el)")

        result = {"selector": selector}
        for prop in props:
            val = handle.evaluate(f"cs => cs.getPropertyValue('{prop}')")
            result[prop] = val

        if "::" not in selector:
            box = el.first.bounding_box()
            if box:
                result["bbox"] = {k: round(v,1) for k,v in box.items()}

        handle.dispose()
        return result
    except Exception as e:
        return {"selector": selector, "error": str(e)}

def audit_bk_row(page, label):
    print(f"\n=== {label} ===")
    results = {}
    for sel in SELECTORS:
        data = get_computed(page, sel, PROPS)
        results[sel] = data
        bbox = data.get("bbox","")
        if bbox:
            print(f"  {sel:42s} | {data.get('display','?'):12s} | "
                  f"w={bbox['width']:5.0f} h={bbox['height']:5.0f} "
                  f"x={bbox['x']:6.0f} y={bbox['y']:6.0f}")
        elif "error" in data:
            print(f"  {sel:42s} | ERROR: {data['error']}")
        else:
            print(f"  {sel:42s} | {data.get('display','?'):12s}")
    return results

def compare(en, ar):
    print("\n=== LAYOUT DIFFERENCES (EN → AR) ===")
    diffs = []
    for sel in SELECTORS:
        e = en.get(sel,{}); a = ar.get(sel,{})
        if "error" in e or "error" in a:
            continue
        eb = e.get("bbox"); ab = a.get("bbox")
        if eb and ab:
            for k in eb:
                d = abs(eb[k] - ab[k])
                if d > 1:
                    diffs.append((sel, k, eb[k], ab[k], d))
        for p in PROPS:
            ev = e.get(p); av = a.get(p)
            if ev != av and (ev or av):
                diffs.append((sel, p, ev, av, None))
    for sel, p, ev, av, d in diffs:
        if d is not None:
            print(f"  {sel:42s} | {p:30s} | EN={ev} AR={av} (d={d})")
        else:
            print(f"  {sel:42s} | {p:30s} | EN='{ev}' → AR='{av}'")
    return diffs

def main():
    import subprocess

    server = subprocess.Popen(
        [sys.executable, "-m", "http.server", "8770"],
        cwd=BASE, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
    )
    time.sleep(1)

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            ctx = browser.new_context(viewport={"width":1280,"height":900})
            page = ctx.new_page()
            page.on("pageerror", lambda e: print(f"[PAGE_ERR] {e}"))

            # Intercept api-config.js to force empty baseUrl (demo mode)
            def handle_route(route, request):
                if request.url.endswith("/api-config.js"):
                    route.fulfill(
                        status=200,
                        content_type="application/javascript",
                        body='window.MGApiConfig = { baseUrl: "" };'
                    )
                else:
                    route.continue_()

            page.route("**/*", handle_route)

            page.goto("http://localhost:8770/admin.html", wait_until="networkidle")
            time.sleep(2)

            # Verify demo mode
            live = page.evaluate("window.MGApiClient && window.MGApiClient.isLive()")
            print(f"MGApiClient.isLive() = {live}")

            # Login — demo mode
            page.fill('[name="email"]', "admin@test.com")
            page.fill('[name="pass"]', "password")
            page.click("#loginForm button[type='submit']")
            page.wait_for_selector("#dashTitle", timeout=15000)
            page.wait_for_timeout(3000)

            title = page.locator("#dashTitle").text_content()
            print(f"Dashboard: '{title}'")

            # Navigate to Bookings page to get .bk-row elements
            bk_link = page.locator('[data-section="bookings"]')
            if bk_link.count() > 0:
                bk_link.first.click()
                page.wait_for_timeout(2000)
                page.wait_for_load_state("networkidle")

            page.wait_for_selector(".bk-row", timeout=10000)
            n = page.locator(".bk-row").count()
            print(f"Bookings rows: {n}")

            page.screenshot(path=os.path.join(BASE,"_diag","en_bookings.png"), full_page=True)
            en = audit_bk_row(page, "ENGLISH (LTR)")

            # Switch to Arabic
            lang_btn = page.locator("#dashLangToggle")
            if lang_btn.count() > 0:
                lang_btn.click()
                page.wait_for_timeout(3000)
                page.wait_for_load_state("networkidle")

                title_ar = page.locator("#dashTitle").text_content()
                print(f"Arabic title: '{title_ar}'")

                page.screenshot(path=os.path.join(BASE,"_diag","ar_bookings.png"), full_page=True)
                ar = audit_bk_row(page, "ARABIC (RTL)")

                diffs = compare(en, ar)
                print(f"\nTotal diffs: {len(diffs)}")

                json.dump({"en": en, "ar": ar, "diffs": diffs},
                    open(os.path.join(BASE,"_diag","audit.json"), "w", encoding="utf-8"),
                    ensure_ascii=False, indent=2)
            else:
                print("ERROR: Lang toggle not found")
            browser.close()
    finally:
        server.terminate()
        server.wait()

if __name__ == "__main__":
    main()
