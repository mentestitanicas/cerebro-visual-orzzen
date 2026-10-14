# Cerebro Visual ORZZEN

Visor visual estático para explorar el mapa del cerebro ORZZEN en Vercel.

## Incluye
- Vista visual del grafo
- Búsqueda global
- Filtros por tipo y grado de confirmación
- Vistas: Resumen / Conexiones / Recorrido
- Panel de detalles para nodos y relaciones
- Exportación de selección
- Datos locales desde `data/mapa.json`

## Estructura
- `index.html`
- `styles.css`
- `app.js`
- `data/mapa.json`
- `data/evolucion.jsonl`
- `vercel.json`

## Deploy en Vercel
1. Entra a Vercel.
2. `Add New` → `Project`.
3. Importa esta carpeta o súbela a un repositorio GitHub.
4. Framework preset: `Other`.
5. Build command: vacío.
6. Output directory: vacío.
7. Deploy.

## Nota
Es un MVP visual. Se puede extender con:
- búsqueda semántica
- resúmenes automáticos por IA
- consultas guiadas
- timelines por producto
- modo móvil mejorado
