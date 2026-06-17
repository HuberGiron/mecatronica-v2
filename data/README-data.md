# Data central de Mecatrónica

Esta carpeta concentra los catálogos generales del sitio `mecatronica-v2`.

## Archivos principales

- `personas.json`: profesores, coordinación y personal relacionado.
- `lineas_investigacion.json`: líneas o temáticas usadas para agrupar contenidos.
- `cursos.json`: cursos/materias/experiencias formativas.
- `proyectos_investigacion.json`: proyectos aplicados, plataformas y desarrollos.
- `publicaciones.json`: producción académica migrada desde el perfil de Huber Girón.
- `recursos.json`: lecciones, guías y materiales abiertos.
- `alumnos_proyectos.json`: proyectos estudiantiles. Actualmente queda vacío para no publicar proyectos inventados.
- `taxonomias.json`: referencia de colecciones y campos comunes.

## Regla de mantenimiento

Cada elemento debe vivir una sola vez. Las páginas generales y las páginas de profesor deben filtrar por `responsables[].personaId`, `lineas[]`, `categorias[]` o `tipoEtiqueta`.

## Relación con profesores

Usa `responsables` para conectar un contenido con una o varias personas:

```json
"responsables": [
  { "personaId": "huber-giron", "rol": "responsable" }
]
```

## Proyectos de alumnos

Usa `_plantillas/alumnos_proyectos.ejemplo.json` como referencia. Copia un objeto al archivo `alumnos_proyectos.json` y cambia `habilitado` a `true` cuando esté listo para publicarse.
