"""Real public UI, read-only Firebase. All order submissions are intercepted."""
import json, sys, tempfile
from pathlib import Path
sys.path.insert(0, str(Path(tempfile.gettempdir()) / 'mariru-audit-playwright'))
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'reports/full-test-2026-10-25'
OUT.mkdir(parents=True, exist_ok=True)
RESULTS = []
ERRORS = []
BASE = 'http://127.0.0.1:4179'

def case(ident, title, fn, pending=None):
    try:
        fn()
        RESULTS.append(dict(id=ident, title=title, status='PASS', environment='REAL_PUBLIC_UI'))
    except Exception as exc:
        RESULTS.append(dict(id=ident, title=title, status='FAIL', environment='REAL_PUBLIC_UI', pending=pending, detail=str(exc)[:700]))

def check(condition, message='Assertion failed'):
    if not condition:
        raise AssertionError(message)

def ready(page):
    page.locator('#productGrid .product-card:not(.skeleton-card)').first.wait_for(timeout=30000)

with sync_playwright() as pw:
    browser = pw.chromium.launch(headless=True, executable_path=str(Path.home() / 'AppData/Local/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-win64/chrome-headless-shell.exe'))
    context = browser.new_context(viewport={'width': 1440, 'height': 1000}, reduced_motion='reduce')
    context.route('**/*cloudfunctions.net/**', lambda route: route.abort())
    page = context.new_page()
    page.on('pageerror', lambda error: ERRORS.append(str(error)))
    page.goto(BASE + '/inicio.html', wait_until='domcontentloaded')
    case('U01', 'First visit shows purchase note', lambda: expect(page.locator('.compra-nota-overlay')).to_be_visible(timeout=20000))
    def close_note():
        page.locator('.compra-nota-aceptar').click()
        expect(page.locator('.compra-nota-flotante')).to_be_visible()
    case('U02', 'Close note leaves small post-it', close_note)
    def reopen_note():
        page.locator('.compra-nota-flotante').click()
        expect(page.locator('#compraNotaTexto')).to_be_visible()
        expect(page.locator('.compra-nota-dialogo .compra-nota-tachuela')).to_be_visible()
        page.locator('.compra-nota-aceptar').click()
    case('U03', 'Post-it reopens readable content with pin', reopen_note)
    def persistent_note():
        page.reload(wait_until='domcontentloaded'); ready(page)
        expect(page.locator('.compra-nota-overlay')).not_to_be_visible()
    case('U04', 'Read note stays minimized after reload', persistent_note)
    case('U05', 'Catalog loads actual Firebase product, not skeleton', lambda: ready(page))
    def image_complete():
        page.wait_for_function("[...document.querySelectorAll('#productGrid img')].every(i=>i.complete&&i.naturalWidth>0)")
        check(page.locator('#productGrid img').count() > 0)
    case('U06', 'Product image loads', image_complete)
    name = page.locator('.product-name').first.inner_text()
    def search():
        page.locator('#searchInput').fill(name)
        expect(page.locator('#productGrid .product-name').first).to_have_text(name)
        page.wait_for_function("new URL(location.href).searchParams.has('q')")
    case('U07', 'Search updates catalog and URL', search)
    def no_results():
        page.locator('#searchInput').fill('qa-no-product-9fc62')
        expect(page.locator('.catalogo-sin-resultados')).to_be_visible()
        page.locator('#searchInput').fill(''); ready(page)
    case('U08', 'Unknown search has empty state and can recover', no_results)
    def sorting():
        page.locator('#ordenCatalogo').select_option('precio-asc')
        page.wait_for_function("new URL(location.href).searchParams.get('orden')==='precio-asc'")
        page.reload(wait_until='domcontentloaded'); ready(page)
        expect(page.locator('#ordenCatalogo')).to_have_value('precio-asc')
    case('U09', 'Sorting survives reload through URL', sorting)
    page.screenshot(path=str(OUT / 'public-desktop.png'), full_page=True)
    def detail():
        page.locator('#productGrid .product-card:not(.skeleton-card)').first.click()
        page.wait_for_url('**/producto.html?*')
        expect(page.locator('#productoNombre')).to_have_text(name, timeout=20000)
        check(page.locator('#productoImagen img').evaluate("img=>getComputedStyle(img).objectFit") == 'contain')
    case('U10', 'Product detail matches product and contains whole image', detail)
    def favorite():
        initial = page.locator('#btnFavorite').inner_text()
        page.locator('#btnFavorite').click()
        expected = page.locator('#btnFavorite').inner_text()
        check(initial != expected)
        page.reload(wait_until='domcontentloaded')
        expect(page.locator('#btnFavorite')).to_have_text(expected, timeout=20000)
    case('U11', 'Favorite toggle persists', favorite)
    def add_cart():
        if page.locator('.talla-btn').count(): page.locator('.talla-btn').first.click()
        page.locator('#btnAgregar').click()
        check(page.evaluate("JSON.parse(localStorage.getItem('carritoMariru')||'[]').length") > 0)
    case('U12', 'Add product to browser cart', add_cart)
    def cart():
        page.goto(BASE + '/carrito.html', wait_until='domcontentloaded')
        expect(page.locator('.carrito-item').first).to_be_visible(timeout=20000)
        check(page.locator('#carritoTotal').inner_text().startswith('$'))
    case('U13', 'Cart shows current product and total', cart)
    def quantity():
        plus = page.get_by_role('button', name='Aumentar cantidad')
        if plus.is_enabled():
            plus.click(); expect(page.locator('.carrito-item-cant-num')).to_have_text('2')
            page.get_by_role('button', name='Reducir cantidad').click()
        expect(page.locator('.carrito-item-cant-num')).to_have_text('1')
    case('U14', 'Quantity controls respect lower bound', quantity)
    def checkout():
        page.locator('#btnFinalizar').click()
        expect(page.locator('#pedidoWhatsAppForm')).to_be_visible()
        expect(page.locator('#pedidoWhatsAppResumen')).to_contain_text(name)
        check(page.locator('[name=pago] option').count() == 4)
    case('U15', 'Checkout summary and agreed payment methods', checkout)
    def checkout_configured():
        page.locator('[name=nombre]').fill('QA sin envio real')
        page.locator('[name=telefono]').fill('6621234567')
        page.locator('[name=pago]').select_option('Transferencia')
        page.locator('#pedidoWhatsAppForm [type=submit]').click()
        expect(page.locator('#pedidoWhatsAppAviso')).not_to_contain_text('aún no está configurado')
    case('U16', 'Current local build is configured for automatic checkout (network blocked)', checkout_configured, 'P01')
    page.locator('#cerrarPedidoWhatsApp').click()
    def empty_cart():
        page.locator('.carrito-item-quitar').first.click()
        expect(page.locator('#carritoVacioCentro')).to_be_visible()
    case('U17', 'Remove last product returns to empty cart', empty_cart)
    def corrupt_cart():
        page.evaluate("localStorage.setItem('carritoMariru','{bad-json')")
        page.reload(wait_until='domcontentloaded')
        page.get_by_role('button', name='Restablecer carrito').wait_for(timeout=20000)
        page.get_by_role('button', name='Restablecer carrito').click()
        expect(page.locator('#carritoVacioCentro')).to_contain_text('Tu carrito está vacío')
    case('U18', 'Corrupt cart can be reset without page crash', corrupt_cart)
    def missing_product():
        page.goto(BASE + '/producto.html?id=qa-nonexistent', wait_until='domcontentloaded')
        expect(page.locator('#productoNombre')).to_have_text('Producto no disponible', timeout=20000)
        expect(page.locator('#btnAgregar')).to_be_disabled()
    case('U19', 'Unknown product has safe unavailable state', missing_product)
    for index, route in enumerate(['envios.html', 'terminos.html', 'privacidad.html', 'cookies.html', 'contacto.html', 'sobre-mi.html', 'cuenta.html', 'categorias.html'], start=20):
        def visit(route=route):
            response = page.goto(BASE + '/' + route, wait_until='domcontentloaded')
            check(response.status == 200)
            expect(page.locator('h1').first).to_be_visible()
        case(f'U{index:02}', 'Public page: ' + route, visit)
    def admin_protected():
        page.goto(BASE + '/admin.html', wait_until='domcontentloaded')
        page.wait_for_url('**/inicio.html', timeout=20000)
    case('U28', 'Admin rejects anonymous browser', admin_protected)
    for index, width in enumerate([320, 390, 768], start=29):
        mobile = browser.new_context(viewport={'width': width, 'height': 844}, reduced_motion='reduce')
        mobile.add_init_script("localStorage.setItem('mariruNotaCompraAceptada-v1','true')")
        mp = mobile.new_page()
        mp.goto(BASE + '/inicio.html', wait_until='domcontentloaded'); ready(mp)
        case(f'U{index:02}', f'No horizontal overflow at {width}px', lambda: check(not mp.evaluate('document.documentElement.scrollWidth>innerWidth')))
        if width == 390:
            def mobile_filter():
                mp.locator('#btnToggleFiltros').click()
                expect(mp.locator('#btnToggleFiltros')).to_have_attribute('aria-expanded', 'true')
                mp.keyboard.press('Escape')
                expect(mp.locator('#btnToggleFiltros')).to_have_attribute('aria-expanded', 'false')
                mp.locator('#productGrid .product-card:not(.skeleton-card)').first.click()
                expect(mp.locator('#productoNombre')).to_have_text(name, timeout=20000)
            case('U32', 'Mobile filters close with Escape and product remains clickable', mobile_filter)
            mp.screenshot(path=str(OUT / 'public-mobile.png'), full_page=True)
        mobile.close()
    case('U33', 'No uncaught JavaScript errors in public journey', lambda: check(not ERRORS, json.dumps(ERRORS)))
    browser.close()
(OUT / 'public-results.json').write_text(json.dumps(RESULTS, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps({'suite': 'public', 'passed': sum(r['status']=='PASS' for r in RESULTS), 'failed': [r for r in RESULTS if r['status']=='FAIL']}, ensure_ascii=True, indent=2))
