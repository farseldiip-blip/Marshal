import sys, os, time
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from playwright.sync_api import sync_playwright

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def main():
    import subprocess
    server_proc = subprocess.Popen(
        [sys.executable, "-m", "http.server", "8766"],
        cwd=BASE,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL
    )
    time.sleep(1)
    
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page(viewport={"width": 1280, "height": 900})
            page.on("console", lambda msg: print(f"[CONSOLE] [{msg.type}] {msg.text}"))
            page.on("pageerror", lambda err: print(f"[PAGE ERROR] {err}"))
            
            page.goto("http://localhost:8766/admin.html", wait_until="networkidle")
            time.sleep(2)
            
            # Take screenshot of whatever is shown
            page.screenshot(path=os.path.join(BASE, "_diag", "initial.png"), full_page=True)
            content = page.content()
            print(f"Page title: {page.title()}")
            print(f"Content length: {len(content)}")
            
            # Check if login form exists
            login_form = page.locator("#loginForm")
            print(f"Login form found: {login_form.count()}")
            
            if login_form.count() > 0:
                # Try login
                page.fill('[name="email"]', "admin@test.com")
                page.fill('[name="pass"]', "password")
                page.click("#loginForm button[type='submit']")
                time.sleep(3)
                
                # Check what's on the page now
                page.screenshot(path=os.path.join(BASE, "_diag", "after_login.png"), full_page=True)
                
                # Check for errors
                error_div = page.locator("#dashError")
                if error_div.count() > 0:
                    print(f"ERROR DIV: {error_div.text_content()}")
                
                # Check elements
                for sel in ["#dashTitle", "#dash", ".dash-cards", ".dash-login", ".bk-row", ".dash-table"]:
                    el = page.locator(sel)
                    print(f"'{sel}': count={el.count()}")
                    if el.count() > 0 and sel != "#dash":
                        print(f"  text: {el.text_content()[:80] if el.text_content() else 'empty'}")
            
            browser.close()
    finally:
        server_proc.terminate()
        server_proc.wait()

if __name__ == "__main__":
    main()
