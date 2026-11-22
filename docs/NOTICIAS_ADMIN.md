# Noticias y administrador de Mecatrónica IBERO

Primera etapa: inicio de sesión, administración de noticias y migración del JSON a Cloud Firestore. Frontend en HTML/CSS/JavaScript, Firebase Authentication y Firestore. Las imágenes siguen usando enlaces o rutas del sitio. El backend Python se incorporará para subir archivos y otras operaciones privilegiadas.

Esta entrega parte del commit `4ed20ea2cd88d35e922e10fb614a430833f69282` de `HuberGiron/mecatronica-v2`. Solo sustituye dos archivos existentes: `index.html` y `assets/js/ibero-navbar.js`. Los demás archivos de esta entrega son nuevos. Los planes de estudio y los demás catálogos conservan su contenido y estilos actuales.

## 1. Comprueba tu cuenta

Proyecto Firebase: `mecatronica-ibero`. Firestore Standard, base `(default)`.

En Authentication debe estar activo Correo electrónico/contraseña. Tu cuenta ya tiene este UID:

`qD1rRLq4JAU7xaVZHqeoXLAUsCG2`

En Firestore > Datos debe existir el documento `users/qD1rRLq4JAU7xaVZHqeoXLAUsCG2` con:

| Campo | Tipo | Valor |
| --- | --- | --- |
| nombre | string | Huber Giron |
| correo | string | Tu correo de Authentication |
| role | string | superadmin |
| activo | boolean | true |

El documento se crea o corrige desde la consola de Firebase. Crear una cuenta en Authentication y crear su perfil son dos pasos diferentes. `activo` debe ser booleano, no texto. El ID del documento es el UID exacto.

En Authentication > Configuración > Dominios autorizados, agrega los dominios del sitio donde utilizarás el administrador: `mecatronica-ibero.mx` y `mecatronica.ibero.mx`. Usa solo los nombres, sin protocolo ni rutas.

## 2. Publica las reglas de Firestore

Abre Firestore > Reglas. Sustituye el contenido con el archivo `firebase/firestore.rules` incluido y pulsa Publicar.

Estas reglas pertenecen al proyecto nuevo de Mecatrónica. No deben aplicarse al proyecto del inventario.

Permiten leer noticias publicadas sin iniciar sesión. Solo los perfiles activos con `role: superadmin` pueden crear y editar noticias. Las cuentas sin perfil, inactivas o con otros roles no pueden usar el administrador. Los usuarios no pueden editar sus perfiles ni concederse permisos desde el navegador.

En esta etapa se ocultan noticias de forma reversible; no hay borrado definitivo. El documento que activa la migración no puede reiniciarse desde el navegador.

## 3. Crea el índice de noticias

En Firestore > Índices > Compuestos, pulsa Crear índice:

| Opción | Valor |
| --- | --- |
| ID de colección | noticias |
| Primer campo | estado — Ascendente |
| Segundo campo | fechaISO — Descendente |
| Alcance de consulta | Colección |

Espera a que aparezca habilitado. El índice está definido también en `firebase/firestore.indexes.json`.

Si ya utilizas Firebase CLI, puedes publicar tanto reglas como índices desde la raíz del repositorio:

```bash
firebase deploy --only firestore:rules,firestore:indexes --project mecatronica-ibero
```

La publicación del índice no significa que su construcción haya terminado; comprueba que esté habilitado en la consola.

## 4. Copia los archivos

Extrae el ZIP sobre la raíz de tu repositorio respetando las carpetas. Revisa los dos archivos sustituidos si hiciste nuevos cambios después del commit base. Actualiza los archivos en tu servidor con tu procedimiento habitual.

Abre `/admin/` en el dominio de Mecatrónica e inicia sesión con el correo y contraseña creados en Authentication. El formulario tiene opción para restablecer la contraseña.

La página pública utilizará el JSON mientras no exista la marca de migración. Las reglas de Firebase deben estar publicadas antes de actualizar los archivos del sitio.

## 5. Importa las noticias una vez

En el administrador pulsa Revisar importación. Verás las noticias que se leerán del archivo actual `/assets/data/noticias.json`, con títulos, fechas y cantidad. En el repositorio base hay 47 noticias.

Pulsa Importar noticias. La importación guarda las noticias nuevas y activa su lectura pública en una sola transacción. Si falla, no deja una importación parcial. Si el proceso ya terminó en otra sesión, no vuelve a importar. Los registros con el mismo ID se conservan; los ID se calculan a partir del enlace para impedir duplicados.

Al terminar, abre el inicio y recarga con Ctrl+F5. Conserva el JSON como respaldo de la versión original. Después de migrar, los cambios del administrador serán la fuente del carrusel; editar el JSON ya no actualizará las noticias públicas.

## 6. Crea y edita noticias

Pulsa Nueva noticia y completa título, fecha, resumen, enlace e imagen. El enlace de la noticia debe comenzar con `https://`. La imagen puede usar `https://` o una ruta del sitio como `/assets/img/mi-imagen.jpg`; los espacios deben estar codificados en el enlace. Si no indicas una imagen, se usa la imagen del programa.

Elige un estado antes de guardar:

| Estado | Resultado |
| --- | --- |
| Borrador | Solo administración puede leerlo |
| Publicado | Aparece en el carrusel tras la migración |
| Oculto | Se conserva en la base de datos y deja de aparecer en el sitio |

Las noticias se ordenan por fecha de más reciente a más antigua. El carrusel muestra las 60 publicaciones más recientes como máximo. Si todas están ocultas, muestra que todavía no hay noticias publicadas. Una caída de Firebase no recupera noticias antiguas del JSON después de la migración.

Cada guardado registra autor, fechas, usuario que actualizó, última publicación y número de revisión. Si dos sesiones editan la misma noticia, la segunda debe recargar antes de sobrescribir cambios ajenos. Al actualizar la lista o cambiar de noticia, el formulario avisa si hay cambios sin guardar.

El mismo enlace identifica una noticia nueva para evitar altas duplicadas. Editar el enlace de una noticia existente conserva su ID. Si aparece un error de duplicado, abre la noticia existente desde la lista.

## Alcance y crecimiento

Esta entrega activa Noticias y la cuenta superadministradora. Los demás módulos aparecen identificados como Próximamente. Los perfiles y las reglas se resuelven centralmente para incorporar permisos por sección después.

Las cuentas de colaboradores, sus permisos por sección, el envío a revisión, la bandeja de aprobaciones y las notificaciones se habilitarán en la etapa correspondiente. Hoy los roles diferentes de `superadmin` se rechazan, incluso si se añaden campos de permisos a su documento. Tampoco hay registro público en la interfaz.

Las operaciones futuras de usuarios y archivos podrán conectarse al backend Python. Los perfiles de acceso se mantienen privados: cada usuario puede consultar su propio perfil; el resto del público no puede leerlos.

## Comprobación y diagnóstico

- Inicio de sesión bloqueado: comprueba Authentication, UID y el documento `users/{UID}`, con `role` y `activo` del tipo correcto.
- Error de permisos: publica las reglas en el proyecto `mecatronica-ibero`.
- Índice pendiente: comprueba el índice `estado / fechaISO` y espera a que esté habilitado.
- Noticias no disponibles en el inicio: revisa reglas, índice y conexión. La pantalla ofrece Reintentar.
- Cambios de otra sesión: pulsa Actualizar para revisar la versión más reciente antes de volver a editar.

Se probaron las reglas en el emulador de Firestore con cuentas anónimas, colaboradoras, inactivas y superadministradoras; importación completa, conservación de existentes, repetición de importación, fallos atómicos, duplicados y conflictos de edición. También se probaron fechas, enlaces y el flujo del formulario. La prueba con tu cuenta real se realiza al instalar: la entrega no escribe en tu Firebase automáticamente.
