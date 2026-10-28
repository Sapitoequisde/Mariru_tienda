"""Prueba el botón real del panel con Firebase aislado; no escribe en la nube."""
import json
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(tempfile.gettempdir()) / "mariru-audit-playwright"))
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
MOCK = (ROOT / "tests/production/firebase_mock.js").read_text(encoding="utf-8") + """
export const app = {};
export function getStorage() { return storage; }
export async function runTransaction(_db, callback) {
  return callback({get: getDoc, set: (r,d)=>setDoc(r,d), update: (r,d)=>updateDoc(r,d)});
}
"""

with sync_playwright() as p:
    browser = p.chromium.launch(
        headless=True,
        executable_path=str(Path.home() / "AppData/Local/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-win64/chrome-headless-shell.exe"),
    )
    context = browser.new_context(viewport={"width": 1440, "height": 1000}, reduced_motion="reduce")
    initial = {
        "user": {"uid": "qa-admin", "email": "qa@example.test"},
        "docs": {"usuarios/qa-admin": {"admin": True}, "productos/existente": {"nombre": "Conservar", "stock": 3, "precio": 20, "categoria": "ropa"}},
        "counter": 0, "writes": [], "uploads": [], "mediaDeletes": [], "failSave": False,
    }
    context.add_init_script("window.__qa=" + json.dumps(initial))
    context.route("**/qa/mock-firebase.js", lambda r: r.fulfill(content_type="application/javascript", body=MOCK))
    context.route("**/js/services/firebase.js*", lambda r: r.fulfill(content_type="application/javascript", body="export {app,auth,db,storage} from '/qa/mock-firebase.js'"))
    for name in ["auth", "firestore", "storage"]:
        context.route(f"**/node_modules/.vite/deps/firebase_{name}.js*", lambda r: r.fulfill(content_type="application/javascript", body="export * from '/qa/mock-firebase.js'"))
    # Las direcciones simuladas de Storage nunca llegan a servicios externos.
    context.route("https://example.test/**", lambda r: r.abort())
    errors = []
    page = context.new_page()
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto("http://127.0.0.1:5183/admin.html", wait_until="domcontentloaded")
    button = page.locator("#btnCargarCatalogoPrueba")
    expect(button).to_be_enabled()
    button.click()
    expect(page.locator("#adminDemoEstado")).to_contain_text("15 productos agregados", timeout=120000)
    expect(button).to_be_enabled()
    assert page.evaluate("window.__qa.writes.length") == 15
    assert page.evaluate("window.__qa.uploads.length") == 60
    assert page.evaluate("window.__qa.docs['productos/existente'].stock") == 3
    button.click()
    expect(page.locator("#adminDemoEstado")).to_contain_text("0 productos agregados", timeout=15000)
    assert page.evaluate("window.__qa.writes.length") == 15
    assert page.evaluate("window.__qa.uploads.length") == 60
    assert not errors, errors
    page.set_viewport_size({"width": 390, "height": 844})
    assert not page.evaluate("document.documentElement.scrollWidth > innerWidth + 1")
    print("PASS: panel real, 15 documentos, 30 PNG + 30 miniaturas, reintento sin duplicados, inventario existente intacto y móvil sin desbordamiento")
    browser.close()
