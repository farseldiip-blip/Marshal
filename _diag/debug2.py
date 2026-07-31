import sys, os, time
from playwright.sync_api import sync_playwright

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def main():
    import subprocess
    server = subprocess.Popen(
        [sys.executable, "-m", "http.server", "8768"],
        cwd=BASE, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
    )
    time.sleep(1)
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            ctx = browser.new_context(viewport={"width":1280,"height":900})
            page = ctx.new_page()
            page.on("console", lambda msg: print(f"[{msg.type}] {msg.text[:200]}"))
            page.on("pageerror", lambda err: print(f"[PAGE_ERR] {err}"))

            page.add_init_script("""
                localStorage.clear();
                sessionStorage.clear();
                window.MGApiConfig = { baseUrl: "" };
            """)

            page.goto("http://localhost:8768/admin.html", wait_until="networkidle")
            time.sleep(1)
            page.screenshot(path=os.path.join(BASE,"_diag","step1.png"), full_page=True)

            lf = page.locator("#loginForm")
            print(f"Login form: {lf.count()}")
            if lf.count() == 0:
                print("NO LOGIN FORM — checking page content...")
                print(page.content()[:2000])
                browser.close()
                return

            page.fill('[name="email"]', "admin@test.com")
            page.fill('[name="pass"]', "password")
            page.click("#loginForm button[type='submit']")
            time.sleep(4)
            page.screenshot(path=os.path.join(BASE,"_diag","step2.png"), full_page=True)

            page.wait_for_timeout(2000)
            errors = page.locator("#dashError")
            if errors.count() > 0:
                print(f"DASH ERROR: {errors.text_content()}")
            for sel in ["#dashTitle", ".dash-cards", ".dash-login", "#dash"]:
                el = page.locator(sel)
                print(f"'{sel}': count={el.count()}")
                if el.count() > 0 and el.first.is_visible():
                    print(f"  visible, text: {(el.text_content() or '')[:100]}")
                elif el.count() > 0:
                    print(f"  exists but not visible")

            browser.close()
    finally:
        server.terminate()
        server.wait()

if __name__ == "__main__":
    main()
