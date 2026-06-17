# Paquete: catálogos centrales para `mecatronica-v2`

Este paquete agrega las páginas faltantes del menú y centraliza los datos de cursos, proyectos, publicaciones, recursos, personas, líneas de investigación y proyectos de alumnos.

## Qué incluye

```text
mecatronica-v2-catalogos/
├── data/
│   ├── personas.json
│   ├── lineas_investigacion.json
│   ├── taxonomias.json
│   ├── cursos.json
│   ├── proyectos_investigacion.json
│   ├── publicaciones.json
│   ├── recursos.json
│   ├── alumnos_proyectos.json
│   └── _plantillas/alumnos_proyectos.ejemplo.json
├── assets/
│   ├── css/catalogos.css
│   └── js/catalogos.js
├── academia/
│   ├── proyectos_investigacion.html
│   ├── publicaciones.html
│   ├── recursos.html
│   └── detalle.html
├── vida_universitaria/
│   ├── materias.html
│   └── alumnos/
│       ├── index.html
│       └── proyecto.html
└── fragmentos/navbar-actualizado.html
```

## Instalación en tu repositorio

1. Descomprime el ZIP.
2. Copia el contenido de la carpeta `mecatronica-v2-catalogos/` dentro de la raíz de tu repositorio `mecatronica-v2`.
3. No borres tus carpetas existentes. Solo se agregan archivos nuevos y una hoja/JS nuevos.
4. Verifica que existan estas rutas:
   - `/vida_universitaria/materias.html`
   - `/vida_universitaria/alumnos/`
   - `/academia/proyectos_investigacion.html`
   - `/academia/publicaciones.html`
   - `/academia/recursos.html`
   - `/academia/detalle.html`
5. Actualiza el menú de tus páginas usando `fragmentos/navbar-actualizado.html` si tu versión local aún no tiene todas las ligas.

## Importante sobre las imágenes

Los datos migrados desde el perfil de Huber apuntan a imágenes bajo `/huber-giron/assets/...` porque esos recursos ya viven en la página del profesor. Así no se duplican imágenes grandes.

## Proyectos de alumnos

`data/alumnos_proyectos.json` queda vacío a propósito para no publicar proyectos inventados. Usa `data/_plantillas/alumnos_proyectos.ejemplo.json` como plantilla.

## Cómo se relaciona con profesores

Cada elemento tiene:

```json
"responsables": [
  { "personaId": "huber-giron", "rol": "responsable" }
]
```

Después, una página de profesor puede filtrar el catálogo central por `personaId` en lugar de mantener su propio `data/` duplicado.

## Prueba local

Por seguridad del navegador, no abras las páginas con doble clic (`file://`), porque `fetch()` puede bloquear la carga de JSON. Prueba con un servidor local:

```bash
python -m http.server 8080
```

Luego abre:

```text
http://localhost:8080/academia/proyectos_investigacion.html
```

## Nota de integración

Este paquete no modifica `index.html`, `academia/academicos.html`, `vida_universitaria/plan_estudios.html` ni `vida_universitaria/grupos_estudiantiles.html`. Solo agrega las páginas nuevas y el fragmento de menú actualizado para que tú decidas dónde reemplazar el navbar.
