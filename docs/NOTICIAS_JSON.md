# Agregar noticias pegando JSON

Actualización basada en `42a2fb0dedb40ead696b60303b4a5f2694903c47` de mecatronica-v2, revisada el 24 de noviembre de 2026.

## Instalación

Copia el contenido del ZIP en la raíz del repositorio, respetando las carpetas `admin/`, `assets/` y `docs/`. Reemplaza solamente los archivos incluidos. No hace falta cambiar Firebase, sus reglas ni NGINX. Las noticias existentes permanecen en Firestore.

Entra al administrador con tu cuenta habitual. Junto a **Nueva noticia** aparecerá **Pegar JSON**.

## Uso

1. Pulsa **Pegar JSON** y pega un objeto para una noticia o una lista para varias.
2. Elige **Borrador** (valor inicial) o **Publicado** para todas las noticias nuevas del lote.
3. Pulsa **Validar y revisar**. Se muestran títulos, fechas, resúmenes y enlaces, con las noticias nuevas, existentes y repetidas.
4. Revisa y pulsa **Guardar como borrador…** o **Publicar…**. Validar por sí solo no guarda nada.

Se acepta el formato anterior: `titulo`, `fecha`, `resumen`, `url` e `imagen`. `fecha` puede ser `2026-11-24` o `Mar, 24 Nov 2026`; también se admite `fechaISO`. El resumen y la imagen son opcionales. Los enlaces de noticias deben comenzar con `https://`; para imágenes también se aceptan rutas del sitio que empiecen con `/`.

Para una noticia:

```json
{
  "titulo": "Título de la noticia",
  "fecha": "2026-11-24",
  "resumen": "Resumen de la noticia.",
  "url": "https://prensa.ibero.mx/es-MX/nota/ejemplo",
  "imagen": "/assets/img/home/video-preview.png"
}
```

Para varias, pega una lista como la del archivo `docs/noticias-ejemplo.json`. Sustituye sus textos y enlaces antes de importar. También puedes copiar un bloque de código JSON completo de ChatGPT.

## Comportamiento

- Máximo de 200 noticias y 2 MB de texto por lote.
- Una noticia inválida bloquea la validación del lote completo e indica su posición. No se guardan filas parciales.
- Las noticias se comparan por enlace, ignorando el fragmento `#…` y la barra final. Se conserva la primera aparición del enlace en el lote. Una noticia existente, incluso oculta o en borrador, nunca se sobrescribe ni se vuelve a publicar al pegar el JSON.
- El estado se elige en el administrador; cualquier estado, autor, permiso o fecha de sistema enviado dentro del JSON se ignora.
- Cambiar el texto o el estado exige volver a validar antes de guardar.
- Si falla el guardado, el texto se conserva para reintentar. Si cierras el diálogo, el texto sigue disponible hasta cerrar sesión o salir de la página.
- Solo la cuenta superadministradora activa puede importar. Se mantienen las reglas actuales de Firestore.
- Esta opción es independiente de la migración inicial y no modifica su marcador. El sitio sigue mostrando solo las noticias publicadas una vez completada aquella migración.

## Archivos de la actualización

- `admin/index.html`
- `assets/css/admin.css`
- `assets/js/admin.js`
- `assets/js/admin-controller.js`
- `assets/js/noticias-repository.js`
- `assets/js/noticias-json.js` (nuevo)
- Este documento y `docs/noticias-ejemplo.json`.

Los módulos y estilos modificados usan la versión `json-20261124` en sus enlaces.

## Verificación

Pruebas de formato, fechas, enlaces, duplicados y controles del administrador, más pruebas con Firebase SDK 12.11.0 y las reglas existentes en el emulador local de Firestore: creación como borrador/publicado, conservación de noticias previas, permisos, importación concurrente y lote de 200 filas. No se escribieron noticias en la base real.
