# Refactor CSS · Mecatrónica V2

## Nueva organización propuesta

```text
assets/
  bootstrap.min.css              # Bootstrap, se mantiene separado como dependencia externa/local
  css/
    ibero-site.css               # Tema activo común: navbar, home, páginas internas, footer
    plan-estudios.css            # Solo componentes dinámicos del plan de estudios
    _archive/                    # Respaldo de CSS anterior, no cargar en producción
      styles.legacy.css
      ibero-home.legacy.css
      ibero-pages.legacy.css
      ibero-institucional.unused.css
```

## Cambios realizados en los HTML

Todas las páginas dejan de cargar:

```html
<link href="/assets/styles.css" rel="stylesheet">
<link href="/assets/css/ibero-home.css" rel="stylesheet">
<link href="/assets/css/ibero-pages.css" rel="stylesheet">
```

Y ahora cargan:

```html
<link href="/assets/css/ibero-site.css" rel="stylesheet">
```

La página `vida_universitaria/plan_estudios.html` además carga:

```html
<link href="/assets/css/plan-estudios.css" rel="stylesheet">
```

## Qué se puede dejar de usar

- `/assets/css/ibero-institucional.css`: no aparece referenciado en las páginas revisadas; parece ser un tema alternativo anterior.
- `/assets/styles.css`: mezclaba navbar antigua, carruseles, plan de estudios, galería, timeline, flip cards, mapa y otros bloques. En esta propuesta solo se extrajo lo necesario para el plan de estudios.
- `/assets/css/ibero-home.css` y `/assets/css/ibero-pages.css`: quedan sustituidos por `/assets/css/ibero-site.css`.

## Recomendación operativa

1. Copia `assets/css/ibero-site.css` y `assets/css/plan-estudios.css` a tu repositorio.
2. Sustituye los cuatro HTML incluidos por estas versiones actualizadas.
3. Prueba primero localmente con Live Server.
4. Si todo se ve bien, elimina de carga los CSS antiguos. No los borres hasta confirmar que otras páginas del sitio no los usan.

## Nota

Este refactor es conservador: mantiene la apariencia actual y reduce la confusión de archivos activos. Para una limpieza más agresiva, habría que revisar todas las páginas del repositorio, no solo las cuatro enviadas.
