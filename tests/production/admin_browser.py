"""Actual admin DOM and handlers with explicitly isolated Firebase mocks."""
import json, sys, tempfile
from pathlib import Path
sys.path.insert(0, str(Path(tempfile.gettempdir()) / 'mariru-audit-playwright'))
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'reports/full-test-2026-10-25'; OUT.mkdir(parents=True, exist_ok=True)
RESULTS = []; ERRORS = []
MOCK = (ROOT / 'tests/production/firebase_mock.js').read_text(encoding='utf-8')
USER = {'uid': 'qa-admin', 'email': 'qa-admin@example.test', 'displayName': 'QA Admin'}
DOCS = {'usuarios/qa-admin': {'admin': True}}
for i in range(25):
    DOCS[f'productos/p{i:02}'] = {'nombre': f'Producto QA {i:02}', 'categoria': 'ropa' if i%2 else 'accesorios', 'stock': i%9, 'precio': 100+i, 'descripcion': 'QA inicial', 'tallas': ['M'], 'imagenes': ['data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="40" height="50"><rect width="40" height="50" fill="pink"/></svg>'], 'videos': []}
DOCS['pedidos/order-ok'] = {'subtotal': 100, 'estado': 'Enviado a WhatsApp', 'items': [{'id': 'p01', 'cantidad': 1}]}
DOCS['pedidos/order-fail'] = {'subtotal': 200, 'estado': 'Error de envío a WhatsApp', 'items': [{'id': 'p02', 'cantidad': 2}]}

def install(context, admin=True):
    docs = json.loads(json.dumps(DOCS)); docs['usuarios/qa-admin']['admin'] = admin
    context.add_init_script('window.__qa=' + json.dumps({'user': USER, 'docs': docs, 'counter': 0, 'writes': [], 'uploads': [], 'mediaDeletes': [], 'failSave': False}) + ';')
    context.route('**/qa/mock-firebase.js', lambda route: route.fulfill(status=200, content_type='application/javascript', body=MOCK))
    context.route('**/js/services/firebase.js*', lambda route: route.fulfill(status=200, content_type='application/javascript', body="export {auth,db,storage,functions,appCheck} from '/qa/mock-firebase.js'"))
    for name in ['auth', 'firestore', 'storage']:
        context.route(f'**/node_modules/.vite/deps/firebase_{name}.js*', lambda route: route.fulfill(status=200, content_type='application/javascript', body="export * from '/qa/mock-firebase.js'"))

def case(ident, title, fn, pending=None):
    try: fn(); RESULTS.append(dict(id=ident, title=title, status='PASS', environment='ACTUAL_ADMIN_UI_MOCK_FIREBASE'))
    except Exception as exc: RESULTS.append(dict(id=ident, title=title, status='FAIL', environment='ACTUAL_ADMIN_UI_MOCK_FIREBASE', pending=pending, detail=str(exc)[:600]))

def check(value, message='Assertion failed'):
    if not value: raise AssertionError(message)

with sync_playwright() as pw:
    browser = pw.chromium.launch(headless=True, executable_path=str(Path.home() / 'AppData/Local/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-win64/chrome-headless-shell.exe'))
    context = browser.new_context(viewport={'width':1440,'height':1000}, reduced_motion='reduce'); install(context)
    page = context.new_page(); page.set_default_timeout(8000); page.on('pageerror', lambda error: ERRORS.append(str(error)))
    page.goto('http://127.0.0.1:4179/admin.html', wait_until='domcontentloaded')
    case('M01', 'Admin role accepted from mocked admin profile', lambda: expect(page.locator('#adminEstadoDatos')).to_contain_text('Actualización', timeout=20000))
    case('M02', 'Inventory paginates at twelve rows', lambda: expect(page.locator('#tablaStockBody tr')).to_have_count(12))
    def search():
        page.locator('#adminBuscar').fill('QA 01'); expect(page.locator('#tablaStockBody tr')).to_have_count(1)
        expect(page.locator('#tablaStockBody')).to_contain_text('Producto QA 01')
    case('M03', 'Inventory search finds correct item', search)
    page.locator('#adminLimpiarFiltros').click()
    def categories():
        page.locator('#adminCategoria').select_option('ropa'); expect(page.locator('#adminResultados')).to_contain_text('12 de 25')
    case('M04', 'Category filter and result count', categories)
    page.locator('#adminLimpiarFiltros').click()
    def low_stock():
        page.locator('#adminStockFiltro').select_option('bajo')
        values=page.locator('.input-stock').evaluate_all('nodes=>nodes.map(n=>Number(n.value))')
        check(all(0<v<=5 for v in values) and len(values)>0)
    case('M05', 'Low-stock filter excludes exhausted products', low_stock)
    page.locator('#adminLimpiarFiltros').click()
    def pagination():
        page.locator('#adminPaginaSiguiente').click(); expect(page.locator('#adminPaginaDetalle')).to_have_text('13–24 de 25')
        page.locator('#adminPaginaSiguiente').click(); expect(page.locator('#tablaStockBody tr')).to_have_count(1)
        expect(page.locator('#adminPaginaSiguiente')).to_be_disabled()
    case('M06', 'Pagination last page and boundary controls', pagination)
    page.locator('#adminLimpiarFiltros').click()
    def sort_stock():
        page.locator('#adminOrden').select_option('stock')
        values=page.locator('.input-stock').evaluate_all('nodes=>nodes.map(n=>Number(n.value))')
        check(values==sorted(values))
    case('M07', 'Inventory stock ordering', sort_stock)
    page.locator('#adminLimpiarFiltros').click()
    def edit():
        page.locator('#tablaStockBody tr').nth(1).locator('.btn-fila-editar').click()
        expect(page.locator('#nuevoNombre')).to_have_value('Producto QA 01')
        expect(page.locator('#previewImagenes .media-item')).to_have_count(1)
    case('M08', 'Open editor with existing fields and media', edit)
    def update():
        page.locator('#nuevoPrecio').fill('199.50'); page.locator('#btnGuardarProducto').click()
        expect(page.locator('#adminFeedback')).to_contain_text('guardado')
        check(page.evaluate("__qa.docs['productos/p01'].precio") == 199.5)
        check(page.evaluate("Object.keys(__qa.docs).filter(k=>k.startsWith('productos/')).length") == 25)
        check(page.evaluate("__qa.docs['productos/p01'].imagenes.length") == 1)
    case('M09', 'Edit saves original document, retains media and creates no duplicate', update)
    def offline():
        page.locator('#tablaStockBody tr').nth(1).locator('.btn-fila-editar').click()
        page.locator('#nuevaDescripcion').fill('Draft after failure'); page.evaluate('__qa.failSave=true')
        page.locator('#btnGuardarProducto').click()
        expect(page.locator('#formStatus')).to_contain_text('No se pudo guardar')
        expect(page.locator('#nuevaDescripcion')).to_have_value('Draft after failure')
        expect(page.locator('#btnGuardarProducto')).to_be_enabled()
        page.evaluate('__qa.failSave=false')
    case('M10', 'Failed save retains input and allows retry', offline)
    def retry():
        page.locator('#btnGuardarProducto').click()
        expect(page.locator('#formAgregar')).not_to_be_visible()
        check(page.evaluate("__qa.docs['productos/p01'].descripcion")=='Draft after failure')
    case('M11', 'Retry successful save', retry)
    def stock_save():
        row=page.locator('#tablaStockBody tr').nth(1)
        row.locator('.input-stock').fill('0'); row.locator('.btn-fila-guardar').click()
        expect(page.locator('#adminFeedback')).to_contain_text('Existencias')
        check(page.evaluate("__qa.docs['productos/p01'].stock")==0)
    case('M12', 'Stock-only change supports zero', stock_save)
    def stale_stock():
        page.locator('#tablaStockBody tr').nth(2).locator('.btn-fila-editar').click()
        page.evaluate("__qa.docs['productos/p02'].stock=1;__qaNotify()")
        page.locator('#nuevaDescripcion').fill('Only description changed'); page.locator('#btnGuardarProducto').click()
        expect(page.locator('#formAgregar')).not_to_be_visible()
        check(page.evaluate("__qa.docs['productos/p02'].stock")==1, 'Editor overwrote a newer reservation with stale absolute stock')
    case('M13', 'Editing description preserves a concurrent stock reservation', stale_stock, 'P05')
    def draft_close():
        page.locator('#btnMostrarFormAgregar').click(); page.locator('#nuevoNombre').fill('Unsaved draft')
        page.locator('#btnCerrarFormAgregar').click(); page.locator('#btnMostrarFormAgregar').click()
        expect(page.locator('#nuevoNombre')).to_have_value('Unsaved draft')
    case('M14', 'Closing and reopening keeps unsaved draft', draft_close, 'P16')
    page.locator('#nuevoNombre').fill('Nuevo producto QA'); page.locator('#nuevoPrecio').fill('33.50'); page.locator('#nuevoStock').fill('2')
    def create():
        page.locator('#btnGuardarProducto').click(); expect(page.locator('#formAgregar')).not_to_be_visible()
        check(page.evaluate("Object.keys(__qa.docs).filter(k=>k.startsWith('productos/')).length")==26)
    case('M15', 'Create new product without media', create)
    def remove():
        page.locator('#adminBuscar').fill('Nuevo producto QA'); page.once('dialog',lambda dialog:dialog.accept())
        page.locator('.btn-fila-eliminar').click(); expect(page.locator('#adminFeedback')).to_contain_text('eliminado')
        check(page.evaluate("Object.keys(__qa.docs).filter(k=>k.startsWith('productos/')).length")==25)
    case('M16', 'Delete confirmation removes isolated test product', remove)
    def xss():
        page.locator('#adminLimpiarFiltros').click()
        page.evaluate("__qa.docs['productos/p00'].nombre='<img src=x onerror=window.__xss=1>';__qaNotify()")
        expect(page.locator('#tablaStockBody')).to_contain_text('<img src=x')
        check(page.evaluate('window.__xss===undefined'))
    case('M17', 'Product names are inserted as text, not executable HTML', xss)
    def edit_contrast():
        check(page.locator('.btn-fila-editar').first.evaluate("b=>getComputedStyle(b).color")=='rgb(0, 0, 0)')
    case('M18', 'Edit button has visible black label', edit_contrast)
    page.screenshot(path=str(OUT/'admin-desktop-simulated.png'),full_page=True)
    case('M19', 'No uncaught errors in administrator interactions',lambda:check(not ERRORS,str(ERRORS)))
    mobile=browser.new_context(viewport={'width':390,'height':844},reduced_motion='reduce');install(mobile)
    mp=mobile.new_page();mp.goto('http://127.0.0.1:4179/admin.html',wait_until='domcontentloaded')
    mp.locator('#tablaStockBody .btn-fila-editar').first.wait_for()
    case('M20','Admin layout contains horizontal table scrolling on mobile',lambda:check(not mp.evaluate('document.documentElement.scrollWidth>innerWidth')))
    mp.screenshot(path=str(OUT/'admin-mobile-simulated.png'),full_page=True)
    # Authenticated customer denial is verified against real Firebase in A25.
    browser.close()
(OUT/'admin-results.json').write_text(json.dumps(RESULTS,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'suite':'admin','passed':sum(r['status']=='PASS' for r in RESULTS),'failed':[r for r in RESULTS if r['status']=='FAIL']},ensure_ascii=True,indent=2))
