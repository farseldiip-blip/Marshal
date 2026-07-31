import sys, os, time
from playwright.sync_api import sync_playwright

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def main():
    import subprocess
    server = subprocess.Popen(
        [sys.executable, "-m", "http.server", "8769"],
        cwd=BASE, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
    )
    time.sleep(1)
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            ctx = browser.new_context(viewport={"width":1280,"height":900})
            page = ctx.new_page()
            page.on("console", lambda msg: print(f"[{msg.type}] {msg.text[:300]}"))
            page.on("pageerror", lambda err: print(f"[PAGE_ERR] {err}"))

            # Use route interception to block all requests to localhost:8080
            page.route("**", lambda route, request: (
                route.abort() if "localhost:8080" in request.url 
                else route.continue_()
            ))

            page.goto("http://localhost:8769/admin.html", wait_until="networkidle")
            time.sleep(2)

            page.screenshot(path=os.path.join(BASE,"_diag","s1.png"), full_page=True)

            lf = page.locator("#loginForm")
            print(f"Login form: {lf.count()}")
            if lf.count() == 0:
                print("Content:", page.content()[:2000])
                browser.close()
                return

            # Check MGApiConfig state in the page
            cfg = page.evaluate("window.MGApiConfig")
            print(f"MGApiConfig: {cfg}")
            live = page.evaluate("window.MGApiClient && window.MGApiClient.isLive()")
            print(f"MGApiClient.isLive(): {live}")

            page.fill('[name="email"]', "admin@test.com")
            page.fill('[name="pass"]', "password")
            page.click("#loginForm button[type='submit']")
            time.sleep(5)

            page.screenshot(path=os.path.join(BASE,"_diag","s2.png"), full_page=True)

            # Check state after login
            title = page.locator("#dashTitle")
            print(f"#dashTitle count: {title.count()}")
            if title.count() > 0:
                print(f"Title: {title.text_content()}")
            else:
                errors = page.locator("#dashError")
                if errors.count() > 0:
                    print(f"DASH ERROR: {errors.text_content()}")
                hints = page.locator("#loginHint")
                if hints.count() > 0 and hints.text_content():
                    print(f"Login hint: {hints.text_content()}")

            browser.close()
    finally:
        server.terminate()
        server.wait()

if __name__ == "__main__":
    main()
