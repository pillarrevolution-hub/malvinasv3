# M.A.L.V.I.N.A.S 2.0 — Nueva Farmacia Badra (PILL.AR)
## v2.0.5 (15-jul-2026) — documento y usabilidad

1. **Sin URL del navegador en los documentos**: CSS de impresión con `@page` sin margen vertical — Chrome ya no dibuja su encabezado/pie (URL vercel.app, fecha, Nº de página).
2. **Registros de PI con nombre limpio**: el activo y el nombre del producto se derivan sin concentración/apodos ("Melatonina", no "Melatonina para 1 mg"); los registros de PI ya creados conservan su texto pero el campo "Nombre del producto" es editable.
3. **"Nombre del producto" editable** en la sección 4 · Producción (default "CÁPSULAS MULTICAPA DE MANUFACTURA ADITIVA", agregable p.ej. "… para migraña").
4. **Fechas en formato argentino corto** (15/07/26) en documentos, rótulos y listados.
5. **Celdas vacías del proceso muestran "-"** (Otros, unidades) en ambos documentos.
6. **Buscadores** en Producto Terminado, Producto Intermedio y Terminados: por paciente, médico, lote, tinta, activo, fecha — sin distinción de mayúsculas ni tildes.

Sin migración de base: esta versión es solo código.

## v2.0.4 (15-jul-2026) — documento final y excipientes

1. **Nº POE en el documento del lote**: se deriva solo del lote de PI usado (parte antes de la barra: `FPI.01.PI013/P006` → POE `FPI.01.PI013`). No hay que cargar nada.
2. **Nombre con validez documental**: en el documento, los productos intermedios figuran como "Tinta de {Activo}" (ej: *Tinta de Melatonina*); el nombre interno con concentración queda solo dentro de la app.
3. **mL totales por capa**: al lado de "Extrusión/cáps" se muestra el volumen de tinta para todo el lote (extrusión × cápsulas totales).
4. **Excipientes como % del total de la tinta**: activo + excipientes = 100% (ej: Pregnenolona 5,7% + PEG 4000 94,3%). El modal valida contra ese objetivo y tiene botón "Completar restante" (c.s.p.). Las pesadas teóricas de los lotes de PI se calculan con la nueva semántica.

**Antes de deployar: correr `migration-v2.0.4.sql` en Neon** — convierte las fracciones guardadas a la nueva semántica. Es a prueba de Runs repetidos (tabla `_migraciones`).

## v2.0.3 (13-jul-2026) — correcciones de producción

1. **Los cambios ya no desaparecen al cambiar de paciente o de solapa**: cada edición actualiza también la lista en memoria de la app (antes solo iba a la base y la pantalla volvía a mostrar datos viejos hasta recargar).
2. **La tapa solo se llena si el cuerpo supera 0.9 mL**: las tintas marcadas "apta para tapa" (PEG, CoQ10, Idebenona) arrancan en el cuerpo y pasan a la tapa automáticamente solo cuando el cuerpo se excede. La ubicación se puede fijar a mano por capa (botón "↺ auto" para volver al automático).
3. **Gestión de tintas → excipientes**: el campo del nombre del excipiente volvió a ser usable (bug de CSS que lo colapsaba a un cuadradito), con encabezados "Cuál excipiente es / % del total" y sugerencias.
4. **Arrastrar el PDF de la receta al lector ya funciona** (además del click).
5. **Conversión de dosis por tinta**: cada tinta puede definir "unidad de receta" + "mg de materia prima por unidad" (Gestión → editar tinta). Levadura de selenio ya viene configurada (100 µg Se → 50 mg de levadura). Para Vitamina D en UI, cargar el factor cuando tengan la potencia de la materia prima.

**Antes de deployar esta versión: correr `migration-v2.0.3.sql` en el SQL Editor de Neon (una sola vez).**


Fusión de MALVINAS (motor de cálculo de extrusiones por IP) con el sistema de
registro de lotes: lectura de recetas, cálculo automático de extrusiones por
capa, división de cápsulas, dilución sugerida, y registros legales de
Producto Terminado y Producto Intermedio.

## Qué hace

### 📄 Lector de recetas
Subís el PDF de la receta electrónica (CFC) y extrae paciente, médico,
matrícula, diagnóstico y todas las fórmulas. **Cada activo se mapea
automáticamente a su tinta** (por keywords editables) y la extrusión de cada
capa queda precalculada. Modo "Pegar texto" para recetas por foto. Las
recetas no se guardan nunca.

### 💊 Producto Terminado
Tarjetas por paciente (color propio, nombre en grande). Editor con:
- **Motor en vivo**: extrusión = (dosis ÷ concentración) ÷ 1000 ÷ IP
- **División automática** de cápsulas por toma (volumen > 0.95 mL), con
  **aviso en ROJO** y override manual
- **Selector de tintas sugeridas** por activo (criterio: imprimible ≥ 0.03 mL
  y menor volumen), con todas las opciones visibles
- **Concentración editable en vivo** (el IP se mantiene) y **sugerencia de
  dilución** con un click para llenar 0.8 mL
- Panel **Resultados** estilo MALVINAS: cápsula visual por capas, ocupación,
  cuerpo (0.9) / tapa (0.1), alertas químicas, parámetros de impresora
- Validación estricta antes de TERMINAR + documento legal + rótulo copiable

### 🧪 Producto Intermedio
Elegís la tinta → lote automático `POE/NFB/FF/FPI.01.PIxxx/P###` (contador
propio por tinta) → cargás gramos a producir → **pesadas teóricas calculadas**
(activo + excipientes por fracciones exactas) → pesadas reales → registro
legal idéntico al documento oficial. Detecta cuando una materia prima es a su
vez un PI (ej. oleogel) y pide su lote FPI.

### 🗂️ Gestión (principio I+D: TODO editable)
Las 65 tintas migradas de MALVINAS con: concentración, IP, keywords de mapeo,
ubicación cuerpo/tapa, **excipientes con fracciones exactas** (se acabó el
reparto en partes iguales), parámetros de impresora, alertas químicas y POE.
Más médicos, operadores y excipientes del rótulo. Sin duplicados.

## Instalación (igual que el sistema anterior)

1. **GitHub**: repo nuevo → subir todo el contenido de esta carpeta
2. **Vercel**: Add New → Project → importar el repo → agregar variable
   `APP_PASSWORD` → en Storage → Create Database → **Neon** (crear base NUEVA)
3. **Tablas**: en la base Neon → SQL Editor → pegar TODO el contenido de
   `neon-setup-malvinas2.sql` → **antes de Run, cambiar el 165 del final por
   el último lote PT real** → Run
4. **Redeploy** en Vercel (Deployments → ⋯ → Redeploy)

### Local (opcional)
```bash
npm install
cp .env.example .env   # DATABASE_URL + APP_PASSWORD
npm run db:push && npm run db:seed
npm run dev
```

## Constantes del motor (src/lib/engine.ts)
- Capacidad de trabajo: 0.95 mL (cuerpo 0.9 + tapa 0.1, margen por expansión)
- Extrusión mínima de impresora: 0.03 mL
- Objetivo de llenado al diluir: 0.8 mL · Mínimo aceptado: 0.55 mL
- Vencimiento PT y PI: elaboración + 3 meses

## Estructura
```
src/lib/engine.ts       ← MOTOR: IP, división, dilución, capacidades, mapeo
src/lib/parser.ts       ← parser de recetas CFC (probado con recetas reales)
src/db/schema.ts        ← tintas completas, registros PT y PI
src/components/         ← 5 solapas + ResultadosPanel + editor de tintas
scripts/tintas-seed.json← las 65 tintas extraídas de MALVINAS
neon-setup-malvinas2.sql← setup completo sin terminal (en el zip de entrega)
```
