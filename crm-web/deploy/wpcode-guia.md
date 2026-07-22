# Instalar la atribución de QR en WordPress con WPCode

Guía paso a paso para pegar el fragmento de atribución de NoTaxLost en la web
(`notaxlost.com`) usando el plugin **WPCode**. Al terminar, cada visita que
llegue desde un QR (`?ref=EST-XXXXX`) añadirá `cmp=EST-XXXXX` a todos los
enlaces de GetYourGuide, sin tocar el `partner_id` que ya llevan.

Tiempo estimado: 5 minutos. No hace falta saber programar.

---

## Paso 1 · Instalar el plugin WPCode

1. Entra en el escritorio de WordPress: `https://notaxlost.com/wp-admin`
2. Menú lateral → **Plugins → Añadir nuevo**.
3. En el buscador (arriba a la derecha) escribe: **WPCode**.
4. El primero suele ser **"WPCode – Insert Headers and Footers + Custom Code Snippets"**.
5. Pulsa **Instalar ahora** y luego **Activar**.

> Es un plugin muy usado y gratuito. La versión gratis es más que suficiente
> para esto.

---

## Paso 2 · Crear un nuevo fragmento

1. En el menú lateral aparecerá **Code Snippets** (Fragmentos de código).
2. Entra en **Code Snippets → + Add Snippet** (Añadir fragmento).
3. Verás una galería. Pasa el ratón por **"Add Your Custom Code (New Snippet)"**
   y pulsa **Use snippet** (Usar fragmento).

---

## Paso 3 · Configurar el fragmento

Rellena los campos así:

| Campo | Valor |
|---|---|
| **Nombre / Title** | `NoTaxLost – Atribución QR` |
| **Code Type / Tipo de código** | **HTML Snippet** |

En el recuadro grande de código, pega **todo** este bloque tal cual:

```html
<!-- NoTaxLost: atribución de QR -->
<script>
(function () {
  var ref = new URLSearchParams(location.search).get("ref");
  if (ref) {
    document.cookie = "ntl_ref=" + encodeURIComponent(ref) +
      "; max-age=" + 30 * 24 * 3600 + "; path=/";
  } else {
    var m = document.cookie.match(/(?:^|; )ntl_ref=([^;]*)/);
    if (m) ref = decodeURIComponent(m[1]);
  }
  if (!ref) return;
  document.querySelectorAll('a[href*="getyourguide."]').forEach(function (a) {
    try {
      var u = new URL(a.href);
      u.searchParams.set("cmp", ref);
      a.href = u.toString();
    } catch (e) {}
  });
})();
</script>
```

> **Importante:** el tipo debe ser **HTML Snippet** (no "PHP" ni "JavaScript"),
> porque el bloque ya incluye su propia etiqueta `<script>`.

---

## Paso 4 · Elegir dónde se inserta

Baja hasta la sección **Insertion** (Inserción):

1. **Insert Method**: deja **Auto Insert** (Inserción automática).
2. **Location** (Ubicación): elige **Site Wide Footer** (Pie de página en todo el sitio).

Esto equivale a colocarlo justo antes de `</body>`, que es exactamente donde
tiene que ir.

---

## Paso 5 · Activar y guardar

1. Arriba a la derecha hay un interruptor que pone **Inactive** (Inactivo).
   Púlsalo para dejarlo en **Active** (Activo) — se pondrá verde.
2. Pulsa **Save Snippet** (Guardar fragmento).

¡Listo! El fragmento ya está funcionando en toda la web.

---

## Paso 6 · Comprobar que funciona

1. Abre una **ventana de incógnito** en el navegador.
2. Entra en: `https://notaxlost.com/tickets?ref=PRUEBA1`
3. Sobre cualquier botón/enlace que vaya a GetYourGuide, haz **clic derecho →
   Copiar enlace** (o "Copiar dirección del enlace").
4. Pega el enlace en cualquier sitio (la barra de direcciones, un bloc de notas)
   y revísalo. Debe:
   - **conservar** su `partner_id=…`, y
   - **haber añadido** `&cmp=PRUEBA1` al final.

Si aparece `cmp=PRUEBA1`, la atribución está funcionando correctamente. ✅

Cuando lo pongas en producción de verdad, el `ref` no será `PRUEBA1` sino el
código real de cada establecimiento (`EST-XXXXX`), que es el que generan
automáticamente los QR del CRM.

---

## Cómo encaja todo (recordatorio)

```
QR del cartel (?ref=EST-00012)
        │
        ▼
Web notaxlost.com  ──►  cookie ntl_ref (30 días)
        │
        ▼
Enlaces a GYG con  partner_id=IBO5PAK  +  cmp=EST-00012
        │
        ▼
Reserva en GetYourGuide (queda atribuida a NTL y a ese local)
        │
        ▼
Partner Portal de GYG → informe por campaña (cmp) → exportar CSV
        │
        ▼
CRM → Ventas → Importar CSV → se reparte la comisión al establecimiento
```

- `partner_id` → hace que **GYG pague la comisión a NoTaxLost**. Ya está en los
  enlaces de la web.
- `cmp` → dice **de qué establecimiento** vino cada reserva. Lo añade este
  fragmento.

---

## Preguntas frecuentes

**¿Se pierde al actualizar el tema de WordPress?**
No. Al estar en un plugin (WPCode) y no en el `footer.php` del tema, sobrevive a
las actualizaciones del tema. Por eso es la opción recomendada.

**¿Ralentiza la web?**
No de forma apreciable. Es un script minúsculo que se ejecuta una vez al cargar
la página.

**¿Afecta al SEO o a los enlaces normales?**
No. Solo modifica los enlaces que apuntan a `getyourguide.` y únicamente les
añade el parámetro `cmp`. El resto de la web no se toca.

**¿Y si un visitante llega sin QR (sin `?ref=`)?**
No pasa nada: si nunca hubo un `ref`, el script no añade `cmp` y los enlaces
quedan igual que ahora (con su `partner_id`). Si el visitante ya trae la cookie
de una visita anterior con QR (dentro de los 30 días), se le sigue atribuyendo a
ese establecimiento.

**¿Puedo desactivarlo temporalmente?**
Sí. En **Code Snippets**, pon el interruptor del fragmento en **Inactive**. Para
volver a activarlo, en **Active**.
