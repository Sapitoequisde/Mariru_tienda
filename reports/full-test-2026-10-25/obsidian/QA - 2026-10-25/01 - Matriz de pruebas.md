---
tags: [mariru, web, qa, pruebas]
fecha: 2026-10-25
estado: pendiente-de-produccion
---

# Matriz de pruebas

[[00 - Revisión integral]] · [[02 - Pendientes por completar]]

PASS = aprobada; FAIL = defecto o comportamiento esperado aún no implementado. Los entornos simulados están identificados y no sustituyen una aprobación de producción.

## Backend aislado

| ID | Prueba | Resultado | Pendiente |
|---|---|---|---|
| B01 | App Check enforced on current callable | PASS | — |
| B02 | Invalid request body rejected | PASS | — |
| B03 | Unknown request fields rejected | PASS | — |
| B04 | Invalid request ID rejected | PASS | — |
| B05 | Empty customer name rejected | PASS | — |
| B06 | Invalid phone rejected | PASS | — |
| B07 | Invalid payment rejected | PASS | — |
| B08 | Empty cart rejected | PASS | — |
| B09 | Zero quantity rejected | PASS | — |
| B10 | Fractional quantity rejected | PASS | — |
| B11 | Client supplied price rejected | PASS | — |
| B12 | Missing product rejected | PASS | — |
| B13 | Insufficient stock rejected without reservation | PASS | — |
| B14 | Invalid size rejected | PASS | — |
| B15 | A product with sizes requires a size | FAIL | P08 |
| B16 | Negative price rejected | PASS | — |
| B17 | Valid guest request uses authoritative price and reserves once | PASS | — |
| B18 | Duplicate cart lines aggregate inventory correctly | PASS | — |
| B19 | Replay is idempotent and does not resend | PASS | — |
| B20 | Authenticated order can appear in customer history | FAIL | P03 |
| B21 | Meta failure restores stock and records failure | PASS | — |
| B22 | A failed submission is not counted as a sale | FAIL | P04 |
| B23 | Replay recovers after Meta accepted but final state update failed | FAIL | P06 |
| B24 | Failed compensation can be resolved by replay | FAIL | P06 |
| B25 | Two simultaneous requests do not oversell final unit (serialized model) | PASS | — |
| B26 | Long report is rejected before reserving stock | PASS | — |
| B27 | Legacy callable rejects unauthenticated use | PASS | — |
| B28 | Legacy endpoint enforces the same App Check policy | FAIL | P02 |
| B29 | Legacy endpoint follows delivery by agreement without automatic fee | FAIL | P02 |
| B30 | Quantity above per-product limit rejected | PASS | — |
| B31 | Inventory search normalizes accents | PASS | — |
| B32 | Stock validation rejects empty, fractional, negative and infinite values | PASS | — |

Evidencia completa: [[evidencias/backend-results.json]].

## Navegación pública real

| ID | Prueba | Resultado | Pendiente |
|---|---|---|---|
| U01 | First visit shows purchase note | PASS | — |
| U02 | Close note leaves small post-it | PASS | — |
| U03 | Post-it reopens readable content with pin | PASS | — |
| U04 | Read note stays minimized after reload | PASS | — |
| U05 | Catalog loads actual Firebase product, not skeleton | PASS | — |
| U06 | Product image loads | PASS | — |
| U07 | Search updates catalog and URL | PASS | — |
| U08 | Unknown search has empty state and can recover | PASS | — |
| U09 | Sorting survives reload through URL | PASS | — |
| U10 | Product detail matches product and contains whole image | PASS | — |
| U11 | Favorite toggle persists | PASS | — |
| U12 | Add product to browser cart | PASS | — |
| U13 | Cart shows current product and total | PASS | — |
| U14 | Quantity controls respect lower bound | PASS | — |
| U15 | Checkout summary and agreed payment methods | PASS | — |
| U16 | Current local build is configured for automatic checkout (network blocked) | FAIL | P01 |
| U17 | Remove last product returns to empty cart | PASS | — |
| U18 | Corrupt cart can be reset without page crash | PASS | — |
| U19 | Unknown product has safe unavailable state | PASS | — |
| U20 | Public page: envios.html | PASS | — |
| U21 | Public page: terminos.html | PASS | — |
| U22 | Public page: privacidad.html | PASS | — |
| U23 | Public page: cookies.html | PASS | — |
| U24 | Public page: contacto.html | PASS | — |
| U25 | Public page: sobre-mi.html | PASS | — |
| U26 | Public page: cuenta.html | PASS | — |
| U27 | Public page: categorias.html | PASS | — |
| U28 | Admin rejects anonymous browser | PASS | — |
| U29 | No horizontal overflow at 320px | PASS | — |
| U30 | No horizontal overflow at 390px | PASS | — |
| U32 | Mobile filters close with Escape and product remains clickable | PASS | — |
| U31 | No horizontal overflow at 768px | PASS | — |
| U33 | No uncaught JavaScript errors in public journey | PASS | — |

Evidencia completa: [[evidencias/public-results.json]].

## Cuenta temporal real

| ID | Prueba | Resultado | Pendiente |
|---|---|---|---|
| A01 | Create disposable Firebase customer without sending verification email | PASS | — |
| A02 | Create own non-admin profile under deployed rules | PASS | — |
| A03 | Customer login through actual form | PASS | — |
| A04 | Authenticated account renders correct customer | PASS | — |
| A05 | Update own profile name | PASS | — |
| A06 | Invalid postal code does not create address | PASS | — |
| A07 | Create first address as main | PASS | — |
| A08 | Create second address | PASS | — |
| A09 | Switch main address and keep one main | PASS | — |
| A10 | Edit address without creating duplicate | PASS | — |
| A11 | Deployed rules reject foreign profile/address/order reads | PASS | — |
| A12 | Deployed address schema rejects unknown fields | PASS | — |
| A13 | Weak password rejected locally | PASS | — |
| A14 | Password confirmation mismatch rejected | PASS | — |
| A15 | Wrong current password rejected by real Firebase reauthentication | PASS | — |
| A16 | Change password with real reauthentication | PASS | — |
| A17 | Delete own test address | PASS | — |
| A18 | Logout actual Firebase session | PASS | — |
| A19 | Login with updated password | PASS | — |
| A20 | Profile and address persist across logout | PASS | — |
| A25 | Real authenticated customer is denied administrator access | PASS | — |
| A26 | Server enforces the same twelve-character password policy as UI | FAIL | P17 |
| A21 | Five-address maximum enforced beyond UI | FAIL | P15 |
| A22 | Delete QA account and its own addresses through actual UI | PASS | — |
| A23 | Deleted QA credentials no longer authenticate | PASS | — |
| A24 | No uncaught runtime errors in account lifecycle | PASS | — |

Evidencia completa: [[evidencias/account-results.json]].

## Panel con Firebase simulado

| ID | Prueba | Resultado | Pendiente |
|---|---|---|---|
| M01 | Admin role accepted from mocked admin profile | PASS | — |
| M02 | Inventory paginates at twelve rows | PASS | — |
| M03 | Inventory search finds correct item | PASS | — |
| M04 | Category filter and result count | PASS | — |
| M05 | Low-stock filter excludes exhausted products | PASS | — |
| M06 | Pagination last page and boundary controls | PASS | — |
| M07 | Inventory stock ordering | PASS | — |
| M08 | Open editor with existing fields and media | PASS | — |
| M09 | Edit saves original document, retains media and creates no duplicate | PASS | — |
| M10 | Failed save retains input and allows retry | PASS | — |
| M11 | Retry successful save | PASS | — |
| M12 | Stock-only change supports zero | PASS | — |
| M13 | Editing description preserves a concurrent stock reservation | FAIL | P05 |
| M14 | Closing and reopening keeps unsaved draft | FAIL | P16 |
| M15 | Create new product without media | PASS | — |
| M16 | Delete confirmation removes isolated test product | PASS | — |
| M17 | Product names are inserted as text, not executable HTML | PASS | — |
| M18 | Edit button has visible black label | PASS | — |
| M19 | No uncaught errors in administrator interactions | PASS | — |
| M20 | Admin layout contains horizontal table scrolling on mobile | PASS | — |

Evidencia completa: [[evidencias/admin-results.json]].

## Compilación, dependencias y entorno

| ID | Prueba | Resultado | Pendiente |
|---|---|---|---|
| R01 | Production build | PASS | — |
| R02 | Backend syntax | PASS | — |
| R03 | Built HTML references and unique IDs | PASS | — |
| R04 | Root and functions dependency lock declarations match | PASS | — |
| R05 | Seed utility excluded from production build | PASS | — |
| R06 | Environment file ignored by Git | PASS | — |
| R07 | App Check configured for local production build | FAIL | P01 |
| R08 | Live public product schema | PASS | — |
| R09 | Anonymous access denied: usuarios | PASS | — |
| R10 | Anonymous access denied: pedidos | PASS | — |
| R11 | Current callable route is present | FAIL | P01 |
| R12 | Unused legacy endpoint no longer exposed | FAIL | P02 |
| R13 | Configured security headers active on checked Firebase hosting | FAIL | P09 |
| R14 | Dependency security audit: frontend | FAIL | P07 |
| R15 | Dependency security audit: backend | FAIL | P07 |

Evidencia completa: [[evidencias/checks-results.json]].

## Procesamiento real de imágenes

| ID | Prueba | Resultado | Pendiente |
|---|---|---|---|
| I01 | PNG file name normalization | PASS | — |
| I02 | Actual JPEG-to-PNG fallback | PASS | — |
| I03 | Actual local background removal creates transparent PNG | PASS | — |

Evidencia completa: [[evidencias/image-results.json]].

## Fallos con evidencia detallada

### B15 — P08

A product with sizes requires a size

```text
Missing expected rejection.
```

### B20 — P03

Authenticated order can appear in customer history

```text
Expected values to be strictly equal:
+ actual - expected

+ undefined
- 'qa-customer'

```

### B22 — P04

A failed submission is not counted as a sale

```text
Expected values to be strictly equal:

'$100' !== '$0'

```

### B23 — P06

Replay recovers after Meta accepted but final state update failed

```text
Expected values to be strictly equal:

false !== true

```

### B24 — P06

Failed compensation can be resolved by replay

```text
Expected values to be strictly equal:

false !== true

```

### B28 — P02

Legacy endpoint enforces the same App Check policy

```text
Expected values to be strictly equal:
+ actual - expected

+ undefined
- true

```

### B29 — P02

Legacy endpoint follows delivery by agreement without automatic fee

```text
Expected values to be strictly equal:

180 !== 100

```

### U16 — P01

Current local build is configured for automatic checkout (network blocked)

```text
Locator expected not to contain text 'aún no está configurado'
Actual value: El envío automático aún no está configurado para este sitio. Contacta a Mariru por WhatsApp. 
Call log:
  - Expect "not_to_contain_text" locator("#pedidoWhatsAppAviso") with timeout 5000ms
  - waiting for locator("#pedidoWhatsAppAviso")
    14 × locator resolved to <p role="status" id="pedidoWhatsAppAviso" class="pedido-whatsapp-aviso">El envío automático aún no está configurado para …</p>
       - unexpected value "El envío automático aún no está configurado para este sitio. Contacta a Mariru por WhatsApp."

Aria snapshot:
- status: El envío automático aún no está configurado para este sitio. Contacta a Mariru por 
```

### A26 — P17

Server enforces the same twelve-character password policy as UI

```text
Firebase accepted an eight-character password while the UI requires twelve; strong QA password restored
```

### A21 — P15

Five-address maximum enforced beyond UI

```text
Deployed rules accepted 6 addresses for the QA user
```

### M13 — P05

Editing description preserves a concurrent stock reservation

```text
Editor overwrote a newer reservation with stale absolute stock
```

### M14 — P16

Closing and reopening keeps unsaved draft

```text
Locator expected to have Value 'Unsaved draft'
Actual value:  
Call log:
  - Expect "to_have_value" locator("#nuevoNombre") with timeout 5000ms
  - waiting for locator("#nuevoNombre")
    14 × locator resolved to <input type="text" required="" maxlength="150" id="nuevoNombre" placeholder="Ej. Blusa rosa de manga corta"/>
       - unexpected value ""

Aria snapshot:
- textbox "Nombre del producto":
  - /placeholder: Ej. Blusa rosa de manga corta
```

### R07 — P01

App Check configured for local production build

```text
Public App Check site key is absent
```

### R11 — P01

Current callable route is present

```text
Current callable GET returned 404
```

### R12 — P02

Unused legacy endpoint no longer exposed

```text
Legacy callable still responds
```

### R13 — P09

Configured security headers active on checked Firebase hosting

```text
Missing headers: content-security-policy,x-content-type-options,x-frame-options,permissions-policy
```

### R14 — P07

Dependency security audit: frontend

```text
Unresolved high/critical advisories: {"info": 0, "low": 0, "moderate": 0, "high": 7, "critical": 0, "total": 7}
```

### R15 — P07

Dependency security audit: backend

```text
Unresolved high/critical advisories: {"info": 0, "low": 0, "moderate": 0, "high": 3, "critical": 0, "total": 3}
```
