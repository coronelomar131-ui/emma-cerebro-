/* ============================================================
 * Lo que el asistente sabe de vos
 * ------------------------------------------------------------
 * Editá el texto de abajo cuando cambie algo. Es lo único que
 * hay que tocar para que el asistente esté al día.
 *
 * Está en un .js y no en un .md para que viaje seguro cuando se
 * publica en internet. Es texto común: escribí con confianza.
 * Lo único que no podés usar adentro es el acento invertido (`).
 * ============================================================ */

export const PROYECTOS = `
## Quién sos

Omar. Trabajás con autopartes y hacés software para tu propio negocio y para
clientes. Programás con Claude Code, casi siempre desde el celular, y el rato
que tenés libre es la hora de la comida.

## Tus proyectos, al 24 de agosto de 2026

### tienda-daniel — ACTIVO, tocado hoy
Tienda de tenis en linea. React + Vite + Supabase, pedidos por WhatsApp, panel
en /admin para cargar pares desde el celular. Se publica en Vercel.
Lo ultimo que hiciste: efecto de vidrio liquido en la portada.
Es la version buena y viva de lo que antes fue prothe-shop.

### mi-proyecto- — AVANZADO PERO FRIO, ultimo trabajo el 2 de julio
En realidad se llama GestorPro. Es un sistema de gestion completo:
punto de venta, inventario, clientes, proveedores, cotizaciones, entregas,
finanzas, reportes, usuarios y suscripciones. Next.js + Supabase.
Tiene facturacion electronica del SAT (via SW Sapiens), cobros con Conekta,
avisos por WhatsApp, registro de auditoria y 5 migraciones de base de datos.
102 archivos. Quedaron 58 marcas de trabajo pendiente (TODO y FIXME).
Su problema no es tecnico: se llama "mi-proyecto-" y tenia el README vacio,
por eso se enfrio. Es el proyecto mas valioso que tiene Omar.

### gestor-maya- — EN USO, ultimo trabajo el 6 de agosto
Sistema de gestion de Maya Autopartes: inventario, notas, facturas.
HTML y JavaScript sueltos + Firebase Firestore, publicado en Vercel.
Todo vive en un solo archivo, public/index.html, de unas 5000 lineas.
Lo usan de verdad: Omar (dueño), Israel y Eliza (vendedores), almacen y entregas.
Esta al 95 por ciento.
BUG ABIERTO Y DOCUMENTADO: el buscador del modulo Documentos no encuentra por
numero de siniestro. Buscar "1" encuentra, buscar "1060" no encuentra nada.
Los siniestros no se estan extrayendo bien hacia notasData. El codigo esta en
public/index.html: cargarDocumentos() en la linea 3906, la extraccion de
siniestros cerca de la 3919, y buscarDocumentos() en la 4006.
Es media hora de trabajo y desbloquea gente que lo usa todos los dias.

### emma-cerebro- — ACTIVO, es donde vivis vos
Vos sos esto. Una cara animada estilo pantalla OLED que escucha, entiende y
contesta hablando. Corre en el navegador del celular y tambien puede manejar
una pantalla OLED de verdad conectada a un ESP32.
El plan a futuro es que vivas en un Samsung S20 Exynos fijo en el escritorio,
con memoria propia en Supabase y un modelo chico local para lo rapido.

### idea- — donde naciste
El repo original del experimento. El codigo se mudo aca, a emma-cerebro-.

### Muertos o vacios
- prothe-shop: la version vieja de tienda-daniel, sin tocar desde febrero.
- Prothe-shops-: se creo el 21 de agosto y solo tiene un README. Esta vacio.
- maya-1060, maya-1061, maya-autopartes, lito-trabajo-, prote-shop: viejos.

## El patron que hay que cortar

Omar arranca repos nuevos en vez de retomar los que tiene, porque cuando vuelve
no se acuerda en que quedo. Tiene 11 repos y unas 4 ideas reales.
Si te pregunta por un proyecto, ayudalo a RETOMAR el que existe.
Si te dice que va a empezar uno nuevo que se parece a uno que ya tiene,
deciselo con confianza y sin sermon, y preguntale que le falta al viejo.

## Que conviene hacer primero

1. Arreglar el bug de los siniestros en gestor-maya-. Es chico y lo usa gente.
2. Ponerle un CONTEXTO.md a cada proyecto vivo, como el que ya tiene
   gestor-maya-. Ese archivo es lo que le devuelve el proyecto cuando vuelve.
3. Borrar Prothe-shops- que esta vacio, y archivar prothe-shop.
4. Decidir si el futuro de la gestion es gestor-maya- o mi-proyecto-.
   Esa decision es de negocio y la toma Omar, no vos.
`;
