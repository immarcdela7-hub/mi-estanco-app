# ¿Se puede mandar a GetYourGuide una cesta con las tres paradas de un plan?

Investigación, sin tocar código. Consultado el **29 de julio de 2026**.

Cómo leer esto: separo lo que **he verificado abriendo la página** de lo que **he
leído** en documentación o en terceros. Donde no he podido comprobar algo, lo digo.

---

## Resumen en una línea

**No hay forma de mandarle a GetYourGuide una cesta con varias actividades desde
un enlace.** La cesta existe en su web y la Partner API sí sabe de carritos, pero
ninguna de las dos está a nuestro alcance hoy. Lo único aprovechable a corto
plazo es **precargar la fecha** en la ficha, que sí funciona.

---

## Lo único viable hoy: `date_from` (y probablemente `_pc`)

**VERIFICADO en navegador.** Es lo primero porque es lo único que se puede usar ya.

```
https://www.getyourguide.com/barcelona-l45/…-t173643/
  ?partner_id=IBO5PAK&utm_medium=local_partners
  &date_from=2026-08-20        <- la ficha abre con esa fecha puesta
  &_pc=1%2C2                   <- personas (1 adulto, 2 …); lo genera su widget
  &currency=EUR
```

- `date_from=AAAA-MM-DD` **funciona**: cargando la ficha con `date_from=2026-08-20`,
  la página muestra el 20 de agosto. Funciona sola y junto a `_pc`.
- `_pc=1,2` (URL-encoded `1%2C2`) **lo genera el propio widget de GYG** al pulsar
  "Check availability" — o sea, es un parámetro suyo, no inventado. **No he podido
  confirmar visualmente** que cambie el número de personas mostrado: mi detector no
  encontró el texto de participantes. Lo doy por bueno como parámetro real, pero
  su efecto exacto queda **NO VERIFICADO**.

**Qué nos ahorra:** el cliente llega con la fecha puesta. **Qué NO nos ahorra:**
sigue teniendo que pulsar "Check availability" y elegir hora. Ya se comprobó en
una investigación anterior que **ningún parámetro ni ancla abre ese panel**
(se probaron 12 variantes: `#booking-assistant`, `#availability`, `#options`,
`?openAvailability`, `?showOptions`, `?step`, `?scrollTo`, `?expand`, etc.).

**Qué haría falta para usarlo:** nada. Es añadir `date_from` a los enlaces del
plan cuando ya sepamos la fecha del cliente. Hoy no la sabemos, así que primero
habría que preguntársela en nuestra web (un selector de día en el plan).

---

## 1. ¿Existe hoy alguna forma documentada de mandar una cesta con varias actividades?

### Por URL: **NO**

**VERIFICADO en navegador.** Probé estas URLs con Chrome real contra actividades
reales (`t173643`, `t50027`) y miré el DOM resultante, no supuse:

| Probado | Resultado |
|---|---|
| `?tour_ids=173643,50027` en una ficha | Ignorado. Carga la ficha normal. |
| `?bundle=173643,50027` | Ignorado. |
| `?add_to_cart=1` | Ignorado. |
| `/cart/?tour_ids=173643,50027` | Carga la cesta **vacía**. Ignora los ids. |
| `/shopping-cart/` | Existe, cesta vacía. |
| `/checkout/` | **Redirige a `/cart`**. |

### Pero la cesta EXISTE en su web: **SÍ**

**VERIFICADO.** `https://www.getyourguide.com/cart/` es una página real y dice:

> "No activities in your cart. **Activities you add to your cart stay here for up
> to 30 minutes.**"

O sea: GetYourGuide **sí tiene carrito de varias actividades para el cliente
final**, con una retención de 30 minutos. Lo que no hay es forma de llenarlo
desde fuera.

### Y su propio flujo se la salta: dato importante

**VERIFICADO.** Recorrí el flujo como un cliente: abrí la ficha, pulsé "Check
availability", elegí una hora (aparecían 6:30 PM, 6:45 PM, 7:00 PM…) y pulsé el
único botón disponible, **"Continue"**. La URL a la que va es:

```
https://www.getyourguide.com/checkout/personal?skipCart=true
```

**`skipCart=true`**. En el camino normal desde una ficha, GetYourGuide **se salta
su propia cesta** y manda directo al checkout. En ese paso **no se ofrece "Add to
cart"**: las únicas acciones son "Continue with email / Google / Apple / Facebook".

**NO VERIFICADO:** si forzando `skipCart=false` (o entrando por otra ruta) el
cliente podría acumular varias actividades y pagarlas de una vez. No he seguido
más adentro de su checkout a propósito: es su embudo de pago y no me parece
correcto trastearlo. **Es la pista más prometedora que he encontrado** y es una
pregunta concreta y barata para vuestro partner manager.

### En la Partner API: **SÍ, pero fuera de nuestro alcance**

**LEÍDO** en su documentación pública (no verificado, no tenemos credenciales):

- El spec expone `/{version}/carts` y `/{version}/carts/{shopping_cart_hash}`
  (visto en el listado de endpoints de <https://code.getyourguide.com/partner-api-spec/>,
  consultado el 29-07-2026).
- El wiki oficial lo dice explícitamente:
  > "In your first booking of a session, a new cart gets created for a new
  > booking. **You can add more bookings to the same cart by passing the
  > `shopping_cart_id` in the POST @ /bookings request.**"
  — <https://github.com/getyourguide/partner-api-spec/wiki/Making-a-booking>,
  consultado el 29-07-2026.

Es decir: **una cesta multi-actividad es técnicamente posible**, pero solo por API
y solo en el nivel de acceso más alto.

---

## 2. ¿Han sacado algo nuevo en los últimos 12 meses?

**NO SE PUEDE SABER con certeza**, pero no he encontrado nada.

Busqué "multi-activity booking", "cart", "basket", "bundle", "package",
"itinerary" y "combo" en el contexto de su programa de partners, y revisé su sala
de prensa. Lo que hay de 2026:

- **Enero 2026** — "2026 Premium and Advanced Connectivity Partners": es sobre
  *conectividad de proveedores* (Bókun, Ventrata, Rezdy…), no sobre afiliados.
  <https://www.getyourguide.press/blog/getyourguide-announces-2026-premium-and-advanced-connectivity-partners>
- **Abril 2026** — "Spring release": funciones con IA para que el viajero
  encuentre y reserve con confianza. No menciona carrito para partners.
  <https://www.getyourguide.press/blog/springrelease2026>

**Aviso honesto:** ausencia de evidencia no es evidencia de ausencia. Puede haber
notas internas o cambios no anunciados. Lo que sí puedo afirmar es que **no hay
nada documentado públicamente** que permita a un afiliado montar una cesta.

Dato de contexto: el artículo oficial de requisitos de API estaba **"Updated 26
days ago"** el día de la consulta, así que la documentación que cito está viva y
mantenida, no es un resto antiguo.

---

## 3. Requisitos reales de la Partner API hoy

**Vuestra suposición era correcta en el número, pero incompleta en lo importante.**

**LEÍDO** en la fuente oficial:
<https://partner.getyourguide.support/hc/en-us/articles/13981133907613-API-integration-and-requirements>
(consultado el 29-07-2026; la página indicaba "Updated 26 days ago").

| Nivel | Requisitos | ¿Permite reservar? |
|---|---|---|
| **Basic (Teaser)** | **100.000 visitas/mes** (web) o 50.000 descargas (app) | **NO** |
| **Reading** | **1.000.000 visitas/mes** + 300 reservas/mes (siendo ya Basic) | **NO** |
| **Masterbill** | "Only offered by Partnership managers (**deposit and specialised contract required**)" | **SÍ** (eres el comerciante, facturación mensual) |

Y textual, sobre todos los niveles:

> "All partners must have a technical team or capability to integrate with the
> GetYourGuide API. We cannot guarantee full technical onboarding support."

### Lo que esto significa para nosotros

**Llegar a 100.000 visitas/mes NO nos daría una cesta.** El nivel Basic solo da
textos, imágenes, valoraciones y precios: **ni disponibilidad ni reservas**. Para
una cesta real hace falta **Masterbill**, que no es una cifra de tráfico que se
alcance sino un **contrato específico con depósito**, negociado con un partner
manager, y que además nos convertiría en **comerciante de registro** (cobramos
nosotros y nos facturan mensualmente) — otro negocio distinto, con su
responsabilidad legal y financiera.

El wiki de la API lo llama `BOOKING` en vez de `Masterbill` y es el nivel que
incluye `/carts` y `/configuration/payment`
(<https://github.com/getyourguide/partner-api-spec/wiki/Access-levels>). **No
tengo confirmación de que "BOOKING" y "Masterbill" sean exactamente lo mismo**;
lo parecen por las funciones, pero son dos documentos distintos con nombres
distintos.

**¿Hay nivel intermedio o excepción para Local Partners?** **NO SE PUEDE SABER**
por documentación pública: no aparece ninguno. La única puerta que la propia
documentación deja abierta es "reach out to your partner manager". Si os interesa,
esa es la vía, y la pregunta concreta sería: *¿existe algún acceso a
disponibilidad y carrito para Local Partners por debajo de Masterbill?*

---

## 4. Parámetros de URL que precargan cosas

Cubierto arriba. Resumen de veredictos, todo **VERIFICADO en navegador**:

| Parámetro | ¿Funciona? |
|---|---|
| `date_from=AAAA-MM-DD` | **SÍ** — la ficha abre con esa fecha |
| `_pc=1,2` (personas) | **Parámetro real de su widget**; efecto visual NO VERIFICADO |
| `currency=EUR` | Sí, lo usa su propio widget |
| `partner_id`, `cmp`, `utm_medium` | Sí (es nuestra atribución, ya en producción) |
| `tour_ids`, `bundle`, `add_to_cart` | **NO**, ignorados |
| Anclas y flags para abrir el panel de disponibilidad | **NO** (12 variantes probadas) |

Nota metodológica: abrir el panel de disponibilidad o elegir una hora **no cambia
la URL** en ningún momento — todo el estado vive en su JavaScript. Por eso no hay
"URL del paso 2" que copiar.

---

## 5. ¿Qué hacen otros revendedores?

**NO SE PUEDE SABER a fondo.** No he auditado el HTML de competidores; sería otra
investigación. Lo que sí encontré:

- **Ventrata** (plataforma de ticketing) documenta cómo integrar el widget de
  afiliado de GYG dentro de su checkout, y advierte que **las reservas del widget
  se completan en getyourguide.com y no quedan registradas en tu sistema**.
  <https://support.ventrata.com/en/articles/11100406-integrating-getyourguide-affiliate-activity-widget-into-ventrata-checkout>
  (consultado el 29-07-2026). **LEÍDO**, no verificado por mí.

Esto respalda la suposición (b): ni siquiera una plataforma de ticketing con su
propio checkout consigue cerrar la compra en su dominio con el widget de afiliado.

---

## Veredicto sobre las tres suposiciones de partida

| Suposición | Veredicto |
|---|---|
| **a)** No existe URL de GYG que meta varias actividades en una cesta | **CONFIRMADA.** Verificado con 6 variantes de URL. Matiz importante: la cesta **sí existe** en su web (30 min de retención) y su checkout usa `skipCart=true`; lo que no hay es forma de llenarla desde fuera. |
| **b)** Sus widgets no permiten cerrar la compra fuera de su dominio | **CONFIRMADA.** Verificado antes: el CTA del widget navega a getyourguide.com. Respaldado por la documentación de Ventrata. |
| **c)** La Partner API exige 100.000 visitas/mes | **PARCIALMENTE CORRECTA, y en la parte que importa, NO.** 100.000 visitas dan el nivel *Basic*, que **no permite reservar**. La cesta está en *Masterbill*, que no se consigue con tráfico sino con **contrato específico y depósito**, y nos convertiría en comerciante de registro. |

---

## Qué haría yo con esto

1. **Ahora, sin pedir permiso a nadie:** añadir `date_from` a los enlaces del plan.
   Requiere preguntar la fecha en nuestra web (un selector de día en el plan), y a
   cambio el cliente llega a GYG con la fecha puesta en las tres paradas. No es
   una cesta, pero quita un paso en cada una.
2. **Una pregunta al partner manager**, barata y concreta: *¿hay alguna forma de
   entrar por vuestra cesta en vez de `skipCart=true`, o algún acceso a carrito
   para Local Partners por debajo de Masterbill?* Es la única pista real que he
   encontrado.
3. **Lo que ya funciona y no depende de GYG:** las actividades propias se reservan
   enteras en notaxlost.com. Si el objetivo de fondo es "una sola compra para todo
   el plan", el camino que **sí controlamos** es tener más actividades propias, no
   convencer a GetYourGuide.

## Lo que NO he podido comprobar

- El efecto visual de `_pc` en el número de personas.
- Si `skipCart=false` u otra ruta permite acumular varias actividades y pagarlas
  juntas. No he seguido dentro de su checkout a propósito.
- El HTML de competidores que enseñen planes de varias paradas.
- Si existen acuerdos o niveles no publicados para partners pequeños.
