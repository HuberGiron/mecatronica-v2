# Integración del plan MANRESA en mecatronica-v2

Copia estas rutas sobre la raíz del repositorio `mecatronica-v2`.

Archivos incluidos:

- `vida_universitaria/plan_estudios.html`: conserva la introducción y descargas de folletos; reemplaza el visor anterior por el plan MANRESA interactivo.
- `vida_universitaria/avance_curricular.html`: nueva página para cargar histórico PDF y consultar avance curricular.
- `assets/css/plan-estudios-manresa.css`: estilos del nuevo visor, encapsulados bajo `.manresa-app`.
- `assets/js/plan-estudios-manresa.js`: lógica del plan, bloques, avance y exportaciones.
- `assets/data/plan-enriquecido.js`: datos consolidados del plan.

Dependencias externas cargadas por CDN en las páginas:

- PDF.js para lectura del histórico en PDF.
- html2canvas para exportar el mapa a PNG.
- jsPDF para generar reportes PDF.


## v3
- Se alinearon los fondos del módulo MANRESA con el formato original del sitio de Mecatrónica.
- Se quitó el degradado interno del módulo para evitar cambios visuales extraños antes del footer.
- Se suavizaron tarjetas y contenedores para que respeten el fondo blanco y el footer gris institucional.


## v4
- Ajuste visual de botones para seguir el estilo `btn-ibero` del sitio.
- Tipografía del módulo alineada a las variables del tema (`--ibero-serif` y `--ibero-sans`).
- Panel de detalle de materias más compacto y con jerarquía visual más cercana a las páginas internas.


## v5
- Se corrigió la transparencia de los botones del módulo MANRESA y de las descargas.
- Se reemplazó el uso circular de variables CSS por colores explícitos para evitar que el navegador descartara el fondo de los botones.
- Cache busting actualizado a `?v=5`.


## v6
- Correcciones específicas para móvil: tablas apiladas, panel de materia a ancho completo, control de overflow horizontal y plan con scroll lateral contenido.
- Ajustes de carga de PDF, tarjetas de electivas y reportes para evitar cortes en pantallas pequeñas.


## v7
- En móvil, las tarjetas de electivas/ARU usan el mismo ancho compacto del mapa curricular y se navegan con scroll horizontal interno.
- Se evita que las electivas ocupen todo el ancho de pantalla dentro de su sección.
- Cache busting actualizado a `?v=7`.


## v8
- En móvil, las tarjetas de Electivas y ARU conservan el ancho de las tarjetas del plan, pero ahora bajan a una nueva línea cuando no caben.
- Las tablas móviles se convierten en fichas verticales para evitar cortes laterales, especialmente en laboratorios asociados, avance por coordinación y materias pendientes.
- Cache busting actualizado a `?v=8`.

## v11
- Se quitó el botón **Limpiar selección** de la página general del plan MANRESA.
- Se agregó una segunda página de plan: `vida_universitaria/plan_estudios_suj.html`.
- Se agregó una segunda página de avance: `vida_universitaria/avance_curricular_suj.html`.
- Se agregó el archivo de datos `assets/data/plan-suj-mecatronica-produccion.js` para el plan SUJ de Ingeniería en Mecatrónica y Producción.
- El plan SUJ deja vacíos prerrequisitos, descripción y contenido cuando no existen en el JSON.
- Se enriquecieron las relaciones teoría/laboratorio del plan SUJ para que los laboratorios de 0 créditos se muestren ligados a su materia correspondiente.
- Cache busting actualizado a `?v=11`.


## v12 - Plan SUJ con carátulas

- Se enriqueció `assets/data/plan-suj-mecatronica-produccion.js` con información extraída de las carátulas PDF: objetivos generales, temario, prerrequisitos, bibliografía y ruta de descarga.
- Se agregaron las carátulas en `assets/pdf/caratulas/suj/`.
- En la ficha de materia del plan SUJ aparece el botón `Descargar carátula PDF` cuando existe archivo asociado.
- Los laboratorios de 0 créditos heredan la carátula de su materia teórica relacionada.
- Cache busting actualizado a `?v=12`.


## v13
- Se agregaron carátulas PDF para el plan MANRESA en `assets/pdf/caratulas/manresa/`.
- `assets/data/plan-enriquecido.js` ahora incluye `caratulaPdf`, `caratulaFile` y `caratulaClave` en materias con carátula disponible.
- Las materias de laboratorio ocultas heredan la carátula de su teoría asociada cuando corresponde.


## v14
- Se corrigió la iluminación de prerrequisitos en el plan SUJ.
- La selección ahora resuelve prerrequisitos desde `resolvedPrereqIds`, `prereqInfo` y claves en `prerequisitos`.
- Los laboratorios ocultos se normalizan hacia la tarjeta visible correspondiente cuando aplica.
- Cache busting actualizado a `?v=14`.
