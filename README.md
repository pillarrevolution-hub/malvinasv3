# M.A.L.V.I.N.A.S 2.0 — Nueva Farmacia Badra (PILL.AR)

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
