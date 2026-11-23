# Actualización de caché en Mecatrónica IBERO

Este paquete parte de `1de9326684f8302e0d9a97a7599d6b8ab5d345cb`, la versión actual del repositorio revisada para esta entrega. Los 22 archivos HTML y JavaScript modificados solo renuevan referencias a archivos locales con `v=cache-20261122`. No cambian el contenido, los estilos ni el comportamiento del administrador. Los archivos de CSS conservan su contenido y los planes mantienen las materias de 150 x 100 px.

El cambio de NGINX se realiza una vez en el droplet, antes de publicar este paquete. El ZIP se extrae en la raíz del repositorio, no en `/etc/nginx`.

## 1. Guarda una copia y abre la configuración

```bash
sudo cp -a /etc/nginx/sites-available/mecatronica.ibero.mx /etc/nginx/sites-available/mecatronica.ibero.mx.bak-$(date +%Y%m%d-%H%M%S)
sudo nano /etc/nginx/sites-available/mecatronica.ibero.mx
```

## 2. Cambia únicamente esta línea

Dentro del bloque que empieza con `location ~*` y agrupa css, js, jpg, jpeg, gif, png, webp, svg, ico y woff, sustituye:

```nginx
add_header Cache-Control "public, max-age=2592000, immutable" always;
```

por:

```nginx
add_header Cache-Control "no-cache" always;
```

El bloque completo queda así:

```nginx
location ~* \.(?:css|js|jpg|jpeg|gif|png|webp|svg|ico|woff2?)$ {
    include /etc/nginx/snippets/security-headers.conf;
    add_header Cache-Control "no-cache" always;
    try_files $uri =404;
}
```

Guarda con Ctrl+O, Enter y sal con Ctrl+X. Conserva las demás reglas, certificados, inclusiones y alias como están en tu configuración actual.

`no-cache` permite guardar copias, pero exige comprobar con el servidor si siguen vigentes antes de reutilizarlas. Si no cambiaron, se pueden reutilizar mediante la validación HTTP, sin volver a descargar el archivo completo. Esta política también cubre las imágenes y fuentes que coinciden con este bloque.

## 3. Valida y recarga

```bash
sudo nginx -t && sudo systemctl reload nginx
```

La recarga solo se ejecuta si la prueba de configuración termina correctamente.

## 4. Comprueba los encabezados

```bash
curl -sSI 'https://mecatronica.ibero.mx/assets/js/noticias-public.js?v=cache-20261122'
curl -sSI 'https://mecatronica.ibero.mx/assets/css/ibero-site.css?v=cache-20261122'
```

En ambos debe aparecer `Cache-Control: no-cache` (el nombre del encabezado puede mostrarse en minúsculas). El código de respuesta debe ser 200.

## 5. Publica los archivos del paquete

Extrae el ZIP sobre la raíz del repositorio, respeta las carpetas y actualiza el servidor con tu procedimiento habitual. Entra al sitio normalmente. El HTML ya tiene la política de actualización adecuada; las nuevas referencias obligan a descargar por primera vez el código y CSS con los encabezados corregidos.

También se renuevan las importaciones internas del administrador y de Firebase para impedir que una página nueva importe una copia antigua de otro módulo. Se conservan las versiones de bibliotecas externas, como el SDK de Firebase servido por Google.

Esta actualización de referencias se hace para superar las copias antiguas que ya tenían vigencia de 30 días. Las respuestas nuevas del servidor se revalidarán en las siguientes visitas. Actualizar el contenido de un archivo en el servidor no cambia retroactivamente los encabezados de una copia antigua que el navegador todavía considera vigente.

## Alcance

El bloque modificado corresponde al sitio principal y a sus recursos bajo `/assets/`, incluido el administrador. Las aplicaciones de inventario, MQTT, DXF, STL, COMRob y otras subcarpetas con `location ^~` tienen reglas propias: no pasan por este bloque. Sus políticas se revisan por separado.

Las noticias se consultan desde Firebase al cargar o recargar la página. Las pestañas ya abiertas no se actualizan en tiempo real con este ajuste. La navegación Atrás/Adelante también puede restaurar una página desde la memoria del navegador; no equivale necesariamente a una nueva consulta al servidor.

No se modifican las reglas de Firestore ni se repite la importación de noticias.
