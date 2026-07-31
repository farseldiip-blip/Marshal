import sys, json, os
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
from playwright.sync_api import sync_playwright

JS = """
() => {
    const dash = document.getElementById("dash");
    const side = document.getElementById("dashSide");
    const brand = side.querySelector(".dash-brand");
    const nav = side.querySelector(".dash-nav");
    const toggle = side.querySelector(".dash-toggle");
    const firstLink = nav ? nav.querySelector(".dash-link") : null;

    function rect(el) {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { top: r.top, bottom: r.bottom, height: r.height };
    }
    function get(el, props) {
        if (!el) return null;
        const cs = getComputedStyle(el);
        const r = {};
        for (const p of props) r[p] = cs[p];
        const r2 = el.getBoundingClientRect();
        r.rectTop = r2.top;
        r.rectHeight = r2.height;
        return r;
    }

    return {
        dir: document.documentElement.getAttribute("dir"),
        collapsed: dash.classList.contains("collapsed"),
        side: get(side, ["paddingTop","paddingBottom","display","flexDirection","gap","height","justifyContent","alignItems","overflow"]),
        brand: get(brand, ["paddingTop","paddingBottom","marginTop","marginBottom","fontSize","lineHeight","display","textAlign"]),
        brandMarshal: get(brand ? brand.querySelector("span:first-child") : null, ["display","fontSize","lineHeight","marginTop","marginBottom","opacity","width","height"]),
        brandSub: get(brand ? brand.querySelector("span:last-child") : null, ["display","fontSize","lineHeight","marginTop","marginBottom","opacity","width","height","overflow"]),
        nav: get(nav, ["marginTop","paddingTop","flex","display","flexDirection","gap","justifyContent"]),
        firstLink: get(firstLink, ["display","paddingTop","paddingBottom","marginTop","marginBottom","gap","justifyContent","height","minHeight","lineHeight"]),
        firstLinkIcon: get(firstLink ? firstLink.querySelector("span") : null, ["display","width","height","opacity","fontSize"]),
        firstLinkLabel: get(firstLink ? firstLink.querySelector("span[data-i18n]") : null, ["display","opacity","width","maxWidth","margin","overflow","pointerEvents"]),
        toggle: get(toggle, ["display","marginTop","paddingTop","paddingBottom","justifyContent","gap"]),
    };
}
"""

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1280, "height": 900})
    abs_path = os.path.abspath("admin.html").replace("\\", "/")
    page.goto(f"file:///{abs_path}")
    page.evaluate("""() => {
        sessionStorage.clear();
        localStorage.removeItem("mg-theme");
        localStorage.removeItem("mg-auth");
        localStorage.removeItem("dash-collapsed");
        sessionStorage.setItem("mg-auth", "demo");
    }""")
    page.reload()
    page.wait_for_timeout(3000)

    results = {}

    # LTR Expanded
    results["LTR_expanded"] = page.evaluate(JS)

    # LTR Collapsed
    page.evaluate("() => document.getElementById('dashToggle').click()")
    page.wait_for_timeout(500)
    results["LTR_collapsed"] = page.evaluate(JS)
    page.evaluate("() => document.getElementById('dashToggle').click()")
    page.wait_for_timeout(500)

    # RTL Expanded
    page.evaluate("() => { if(window.MGLang) window.MGLang.apply('ar'); }")
    page.wait_for_timeout(2000)
    results["RTL_expanded"] = page.evaluate(JS)

    # RTL Collapsed
    page.evaluate("() => document.getElementById('dashToggle').click()")
    page.wait_for_timeout(500)
    results["RTL_collapsed"] = page.evaluate(JS)

    print(json.dumps(results, indent=2, ensure_ascii=False))
    browser.close()
