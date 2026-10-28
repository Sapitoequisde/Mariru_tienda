"""Live lifecycle for a disposable customer; never sends email or orders.
Only owns/deletes the fresh QA account and documents under its exact UID.
"""
import json, secrets, sys, tempfile, urllib.request, urllib.error, uuid
from pathlib import Path
sys.path.insert(0, str(Path(tempfile.gettempdir()) / 'mariru-audit-playwright'))
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'reports/full-test-2026-10-25'; OUT.mkdir(parents=True, exist_ok=True)
ENV = {}
for line in (ROOT / '.env').read_text(encoding='utf-8-sig').splitlines():
    if '=' in line and not line.strip().startswith('#'):
        key, value = line.split('=', 1); ENV[key.strip()] = value.strip().strip('"').strip("'")
KEY = ENV['VITE_FIREBASE_API_KEY']; PROJECT = ENV['VITE_FIREBASE_PROJECT_ID']
DB = f'https://firestore.googleapis.com/v1/projects/{PROJECT}/databases/(default)/documents/'
EMAIL = 'qa.mariru.' + uuid.uuid4().hex + '@example.test'
PASSWORD = 'Aa7!' + secrets.token_urlsafe(20)
NEW_PASSWORD = 'Zz9!' + secrets.token_urlsafe(20)
WEAK_PASSWORD = 'Short7!x'
TOKEN = None; UID = None; REMOVED = False
RESULTS = []; ERRORS = []; CLEANUP = {}

class APIError(Exception):
    def __init__(self, status, code):
        self.status = status; self.code = code
        super().__init__(f'HTTP {status}: {code}')

def request(url, method='GET', data=None, token=None):
    headers = {'Content-Type': 'application/json'}
    if token: headers['Authorization'] = 'Bearer ' + token
    req = urllib.request.Request(url, method=method, headers=headers, data=None if data is None else json.dumps(data).encode())
    try:
        with urllib.request.urlopen(req, timeout=25) as response:
            raw = response.read(); return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as exc:
        try: error = json.loads(exc.read()).get('error', {}); code = error.get('message', error.get('status', 'HTTP_ERROR'))
        except Exception: code = 'HTTP_ERROR'
        raise APIError(exc.code, code) from None

def auth(action, data):
    return request(f'https://identitytoolkit.googleapis.com/v1/accounts:{action}?key={KEY}', 'POST', data)

def fields(data):
    return {key: {'booleanValue': value} if isinstance(value, bool) else {'stringValue': str(value)} for key, value in data.items()}

def case(ident, title, fn, pending=None):
    try:
        fn(); RESULTS.append(dict(id=ident, title=title, status='PASS', environment='LIVE_DISPOSABLE_CUSTOMER'))
    except Exception as exc:
        # Never serialize API request bodies, credentials, tokens or arbitrary stack locals.
        RESULTS.append(dict(id=ident, title=title, status='FAIL', environment='LIVE_DISPOSABLE_CUSTOMER', pending=pending, detail=str(exc)[:600]))

def check(condition, message='Assertion failed'):
    if not condition: raise AssertionError(message)

def latest_token(page):
    global TOKEN
    token = page.evaluate("async()=>{const {auth}=await import('/js/services/firebase.js');return auth.currentUser ? await auth.currentUser.getIdToken(true) : null}")
    if token: TOKEN = token

def cleanup():
    global REMOVED, TOKEN
    if not UID or REMOVED:
        CLEANUP.update(created=bool(UID), confirmed=True, method='UI' if REMOVED else 'no-user-created'); return
    # Reauthenticate with either password in case the test failed between password change and local state update.
    for password in [NEW_PASSWORD, PASSWORD, WEAK_PASSWORD]:
        try:
            session = auth('signInWithPassword', {'email': EMAIL, 'password': password, 'returnSecureToken': True})
            check(session['localId'] == UID, 'Cleanup UID mismatch')
            TOKEN = session['idToken']; break
        except APIError as exc:
            if exc.code == 'EMAIL_NOT_FOUND':
                REMOVED = True; CLEANUP.update(created=True, confirmed=True, method='already-removed'); return
    docs = request(DB + f'usuarios/{UID}/direcciones?pageSize=100', token=TOKEN).get('documents', [])
    for doc in docs:
        expected = f'projects/{PROJECT}/databases/(default)/documents/usuarios/{UID}/direcciones/'
        check(doc['name'].startswith(expected), 'Cleanup document outside QA UID')
        request('https://firestore.googleapis.com/v1/' + doc['name'], 'DELETE', token=TOKEN)
    request(DB + f'usuarios/{UID}', 'DELETE', token=TOKEN)
    auth('delete', {'idToken': TOKEN})
    REMOVED = True; CLEANUP.update(created=True, confirmed=True, method='exact-UID-fallback', removedAddresses=len(docs))

try:
    created = auth('signUp', {'email': EMAIL, 'password': PASSWORD, 'returnSecureToken': True})
    UID = created['localId']; TOKEN = created['idToken']
    RESULTS.append(dict(id='A01', title='Create disposable Firebase customer without sending verification email', status='PASS', environment='LIVE_DISPOSABLE_CUSTOMER'))
    request(DB + f'usuarios/{UID}', 'PATCH', {'fields': fields({'uid': UID, 'nombre': 'Cliente QA', 'email': EMAIL, 'admin': False})}, TOKEN)
    RESULTS.append(dict(id='A02', title='Create own non-admin profile under deployed rules', status='PASS', environment='LIVE_DISPOSABLE_CUSTOMER'))
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True, executable_path=str(Path.home() / 'AppData/Local/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-win64/chrome-headless-shell.exe'))
        ctx = browser.new_context(viewport={'width': 1440, 'height': 1000}, reduced_motion='reduce')
        ctx.add_init_script("localStorage.setItem('mariruNotaCompraAceptada-v1','true')")
        ctx.route('**/*cloudfunctions.net/**', lambda route: route.abort())
        # A test must not send verification or password-reset messages.
        ctx.route('**/accounts:sendOobCode*', lambda route: route.abort())
        page = ctx.new_page(); page.on('pageerror', lambda error: ERRORS.append(str(error)))
        page.goto('http://127.0.0.1:4179/inicio.html?login=1', wait_until='domcontentloaded')
        def login(password):
            page.locator('#loginUsuario').fill(EMAIL); page.locator('#loginPass').fill(password)
            page.locator('#formLoginModal [type=submit]').click()
            # CSS keeps a transparent overlay in layout; aria-hidden is the close state.
            expect(page.locator('#loginOverlay')).to_have_attribute('aria-hidden', 'true', timeout=20000)
            check(page.locator('#loginOverlay').evaluate("node=>getComputedStyle(node).pointerEvents") == 'none')
        case('A03', 'Customer login through actual form', lambda: login(PASSWORD))
        page.goto('http://127.0.0.1:4179/cuenta.html', wait_until='domcontentloaded')
        case('A04', 'Authenticated account renders correct customer', lambda: expect(page.locator('#cuentaCorreo')).to_have_text(EMAIL, timeout=20000))
        def update_name():
            page.locator('#cuentaNombreInput').fill('Cliente de pruebas QA')
            page.locator('#formNombre [type=submit]').click()
            expect(page.locator('#mensajeNombre')).to_contain_text('actualizado', timeout=15000)
        case('A05', 'Update own profile name', update_name)
        def address_form(alias='Casa QA', cp='83000'):
            page.locator('#dirAlias').fill(alias); page.locator('#dirDestinatario').fill('Persona ficticia QA')
            page.locator('#dirCalle').fill('Calle de prueba 123'); page.locator('#dirColonia').fill('Colonia ficticia')
            page.locator('#dirCodigoPostal').fill(cp); page.locator('#dirTelefono').fill('6621234567')
        def invalid_cp():
            page.locator('#btnNuevaDireccion').click(); address_form(cp='12')
            page.locator('#formDireccion [type=submit]').click()
            expect(page.locator('#mensajeDireccion')).to_contain_text('5 dígitos')
            check(page.locator('.direccion-card').count() == 0)
        case('A06', 'Invalid postal code does not create address', invalid_cp)
        def first_address():
            address_form(); page.locator('#formDireccion [type=submit]').click()
            expect(page.locator('.direccion-card')).to_have_count(1, timeout=15000)
            expect(page.locator('.direccion-card')).to_contain_text('Principal')
        case('A07', 'Create first address as main', first_address)
        def second_address():
            page.locator('#btnNuevaDireccion').click(); address_form(alias='Trabajo QA')
            page.locator('#formDireccion [type=submit]').click()
            expect(page.locator('.direccion-card')).to_have_count(2, timeout=15000)
        case('A08', 'Create second address', second_address)
        def main_address():
            page.locator('.direccion-card').filter(has_text='Trabajo QA').get_by_role('button', name='Hacer principal').click()
            expect(page.locator('.direccion-card').filter(has_text='Trabajo QA')).to_contain_text('Principal', timeout=15000)
            expect(page.locator('.direccion-card .cuenta-insignia')).to_have_count(1)
        case('A09', 'Switch main address and keep one main', main_address)
        def edit_address():
            page.locator('.direccion-card').filter(has_text='Casa QA').get_by_role('button', name='Editar', exact=True).click()
            page.locator('#dirAlias').fill('Casa QA editada')
            page.locator('#formDireccion [type=submit]').click()
            expect(page.locator('.direccion-card').filter(has_text='Casa QA editada')).to_be_visible(timeout=15000)
        case('A10', 'Edit address without creating duplicate', edit_address)
        def denied_other_data():
            latest_token(page)
            for resource in ['usuarios/qa-nonexistent-other', 'pedidos/qa-nonexistent-other', 'usuarios/qa-nonexistent-other/direcciones/qa-nonexistent']:
                try: request(DB + resource, token=TOKEN)
                except APIError as exc:
                    check(exc.status == 403); continue
                raise AssertionError('Foreign resource was not rejected: ' + resource)
        case('A11', 'Deployed rules reject foreign profile/address/order reads', denied_other_data)
        def reject_extra_fields():
            latest_token(page)
            docs = request(DB + f'usuarios/{UID}/direcciones', token=TOKEN)['documents']
            try: request('https://firestore.googleapis.com/v1/' + docs[0]['name'] + '?updateMask.fieldPaths=extra', 'PATCH', {'fields': fields({'extra': 'qa-test'})}, TOKEN)
            except APIError as exc: check(exc.status == 403); return
            raise AssertionError('Address with unknown field was accepted')
        case('A12', 'Deployed address schema rejects unknown fields', reject_extra_fields)
        def password_fields(actual, new, confirm):
            page.locator('#passActual').fill(actual); page.locator('#passNueva').fill(new); page.locator('#passConfirmar').fill(confirm)
        def weak_password():
            password_fields(PASSWORD, 'abc', 'abc'); page.locator('#formPassword [type=submit]').click()
            expect(page.locator('#mensajePassword')).to_contain_text('necesita')
        case('A13', 'Weak password rejected locally', weak_password)
        def mismatch():
            password_fields(PASSWORD, NEW_PASSWORD, NEW_PASSWORD + 'x'); page.locator('#formPassword [type=submit]').click()
            expect(page.locator('#mensajePassword')).to_contain_text('no coinciden')
        case('A14', 'Password confirmation mismatch rejected', mismatch)
        def wrong_current():
            password_fields('Wrong-only-QA-9!', NEW_PASSWORD, NEW_PASSWORD); page.locator('#formPassword [type=submit]').click()
            expect(page.locator('#mensajePassword')).to_contain_text('no es correcta', timeout=15000)
        case('A15', 'Wrong current password rejected by real Firebase reauthentication', wrong_current)
        def change_password():
            password_fields(PASSWORD, NEW_PASSWORD, NEW_PASSWORD); page.locator('#formPassword [type=submit]').click()
            expect(page.locator('#mensajePassword')).to_contain_text('Contraseña actualizada', timeout=20000)
        case('A16', 'Change password with real reauthentication', change_password)
        def delete_one_address():
            page.once('dialog', lambda dialog: dialog.accept())
            page.locator('.direccion-card').filter(has_text='Casa QA editada').get_by_role('button', name='Eliminar', exact=True).click()
            expect(page.locator('.direccion-card')).to_have_count(1, timeout=15000)
        case('A17', 'Delete own test address', delete_one_address)
        page.screenshot(path=str(OUT / 'customer-account.png'), full_page=True)
        def logout():
            page.locator('#btnCerrarSesion').click(); page.wait_for_url('**/inicio.html', timeout=15000)
        case('A18', 'Logout actual Firebase session', logout)
        def relogin():
            page.goto('http://127.0.0.1:4179/inicio.html?login=1', wait_until='domcontentloaded'); login(NEW_PASSWORD)
        case('A19', 'Login with updated password', relogin)
        page.goto('http://127.0.0.1:4179/cuenta.html', wait_until='domcontentloaded')
        page.locator('#cuentaContenido').wait_for(state='visible', timeout=20000)
        case('A20', 'Profile and address persist across logout', lambda: expect(page.locator('.direccion-card')).to_have_count(1))
        def deny_real_admin():
            # Separate browser storage: guard's deliberate sign-out must not interrupt the account lifecycle.
            guard_ctx = browser.new_context(reduced_motion='reduce')
            guard_ctx.add_init_script("localStorage.setItem('mariruNotaCompraAceptada-v1','true')")
            gp = guard_ctx.new_page()
            try:
                gp.goto('http://127.0.0.1:4179/inicio.html?login=1', wait_until='domcontentloaded')
                gp.locator('#loginUsuario').fill(EMAIL); gp.locator('#loginPass').fill(NEW_PASSWORD)
                gp.locator('#formLoginModal [type=submit]').click()
                expect(gp.locator('#loginOverlay')).to_have_attribute('aria-hidden', 'true', timeout=20000)
                try: gp.goto('http://127.0.0.1:4179/admin.html', wait_until='domcontentloaded')
                except Exception as exc:
                    if 'ERR_ABORTED' not in str(exc): raise
                gp.wait_for_function("location.pathname.endsWith('/inicio.html') && document.querySelector('#loginUsuario') !== null",timeout=20000)
            finally:
                guard_ctx.close()
        case('A25', 'Real authenticated customer is denied administrator access', deny_real_admin)
        def server_password_policy():
            global TOKEN
            latest_token(page)
            try: weak = auth('update', {'idToken': TOKEN, 'password': WEAK_PASSWORD, 'returnSecureToken': True})
            except APIError as exc:
                check(exc.code.startswith('WEAK_PASSWORD') or exc.code.startswith('PASSWORD_DOES_NOT_MEET_REQUIREMENTS')); return
            TOKEN = weak.get('idToken', TOKEN)
            restored = auth('update', {'idToken': TOKEN, 'password': NEW_PASSWORD, 'returnSecureToken': True})
            TOKEN = restored.get('idToken', TOKEN)
            # REST password changes intentionally revoke old SDK refresh tokens.
            # Refresh the actual browser login before subsequent account UI tests.
            page.goto('http://127.0.0.1:4179/inicio.html?login=1', wait_until='domcontentloaded')
            login(NEW_PASSWORD)
            page.goto('http://127.0.0.1:4179/cuenta.html', wait_until='domcontentloaded')
            page.locator('#cuentaContenido').wait_for(state='visible', timeout=20000)
            raise AssertionError('Firebase accepted an eight-character password while the UI requires twelve; strong QA password restored')
        case('A26', 'Server enforces the same twelve-character password policy as UI', server_password_policy, 'P17')
        def max_addresses():
            latest_token(page)
            existing = request(DB + f'usuarios/{UID}/direcciones', token=TOKEN).get('documents', [])
            for index in range(6 - len(existing)):
                data = {'alias': f'QA limit {index}', 'destinatario': 'QA ficticio', 'calle': 'Prueba 1', 'colonia': 'Prueba', 'codigoPostal': '83000', 'telefono': '6621234567', 'referencias': '', 'predeterminada': False}
                try: request(DB + f'usuarios/{UID}/direcciones/qa-limit-{index}', 'PATCH', {'fields': fields(data)}, TOKEN)
                except APIError as exc:
                    if exc.status == 403: return
                    raise
            count = len(request(DB + f'usuarios/{UID}/direcciones', token=TOKEN).get('documents', []))
            check(count <= 5, f'Deployed rules accepted {count} addresses for the QA user')
        case('A21', 'Five-address maximum enforced beyond UI', max_addresses, 'P15')
        def remove_account():
            global REMOVED
            page.reload(wait_until='domcontentloaded'); page.locator('#cuentaContenido').wait_for(state='visible', timeout=20000)
            page.locator('#btnMostrarEliminar').click()
            page.locator('#eliminarPass').fill(NEW_PASSWORD); page.locator('#eliminarConfirmacion').fill('ELIMINAR')
            page.locator('#formEliminar [type=submit]').click()
            expect(page.locator('#cuentaEstado')).to_contain_text('Tu cuenta fue eliminada', timeout=20000)
            REMOVED = True
        case('A22', 'Delete QA account and its own addresses through actual UI', remove_account)
        def deletion_verified():
            try: auth('signInWithPassword', {'email': EMAIL, 'password': NEW_PASSWORD, 'returnSecureToken': True})
            except APIError as exc:
                check(exc.code in ['EMAIL_NOT_FOUND', 'INVALID_LOGIN_CREDENTIALS', 'INVALID_PASSWORD']); return
            raise AssertionError('Deleted QA account can still log in')
        case('A23', 'Deleted QA credentials no longer authenticate', deletion_verified)
        case('A24', 'No uncaught runtime errors in account lifecycle', lambda: check(not ERRORS, str(ERRORS)))
        browser.close()
except Exception as exc:
    RESULTS.append(dict(id='A-SETUP', title='Account test setup or dependent journey', status='BLOCKED', environment='LIVE_DISPOSABLE_CUSTOMER', detail=str(exc)[:500]))
finally:
    try: cleanup()
    except Exception as exc: CLEANUP.update(created=bool(UID), confirmed=False, detail=str(exc)[:300])
    (OUT / 'account-results.json').write_text(json.dumps({'tests': RESULTS, 'cleanup': CLEANUP}, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({'suite': 'account', 'passed': sum(r['status']=='PASS' for r in RESULTS), 'notPassed': [r for r in RESULTS if r['status']!='PASS'], 'cleanup': CLEANUP}, ensure_ascii=True, indent=2))
