# Marcador en directo · AD Voleibol Ribera

Marcador para poner encima de los directos de YouTube del club cuando se emite **solo con el móvil**, con [PRISM Live Studio](https://prismlive.com). Un móvil graba y emite; otro, en la mesa, lleva el marcador con botones grandes. El resultado llega al vídeo en menos de un segundo.

| Página | Para qué sirve |
| --- | --- |
| `index.html` | Inicio: vista previa, enlaces para copiar y guía paso a paso. |
| `marcador.html` | El marcador. Fondo transparente: se añade en PRISM como widget **Web**. |
| `control.html` | Panel del móvil de la mesa: +1 / −1, cerrar set, deshacer, saque, tiempos muertos, ajustes. |

Qué muestra el marcador: set actual (o TIE-BREAK / FINAL), texto del partido, escudos, quién saca, sets y puntos. Además, avisos automáticos de **punto de set**, **punto de partido**, **set para…**, **tiempo muerto** (con barra de 30 s) y **gana… 3-1** al final, y la tira con el resultado de cada set.

## Cómo funciona

No hay servidor propio ni base de datos: es una web estática (GitHub Pages).

1. Cada toque en el control genera el estado completo del partido (JSON) con una marca de tiempo y un número de secuencia.
2. Ese estado se publica como mensaje MQTT **retenido** por WebSocket seguro en tres brokers públicos y gratuitos a la vez: EMQX, HiveMQ y Mosquitto. Si uno se cae, siguen los otros.
3. El marcador está suscrito a los tres y se queda siempre con el estado más reciente. Al conectarse recibe el último resultado al instante (por eso es *retenido*), y si PRISM recarga el widget a mitad de partido también lo recupera de su almacenamiento local.
4. Si el control pierde la conexión, se puede seguir apuntando: al reconectar vuelve a enviar el estado y el vídeo se pone al día.

Las reglas están en `assets/rules.js`: sets a 25 con dos de diferencia, quinto set a 15, al mejor de 5 o de 3, y el saque inicial se alterna en cada set.

## Parámetros del enlace del marcador

| Parámetro | Qué hace |
| --- | --- |
| *(ninguno)* | Si el widget tiene forma de vídeo (16:9, por ejemplo 1920×1080 en Moblin u OBS), el marcador va en la esquina ocupando un 30 % del ancho. Con cualquier otra forma, llena el widget y se coloca arrastrando y pellizcando (PRISM). |
| `canal=palabra` | Usa otro canal (control y marcador deben llevar el mismo). |
| `pantalla=1` / `pantalla=0` | Fuerza el modo «vídeo entero con el marcador en la esquina» o el modo «llenar el widget». |
| `pos=tl` / `tr` / `bl` / `br` | Esquina del marcador (arriba-izquierda por defecto). |
| `escala=1.2` | Tamaño del marcador en modo vídeo entero (1 = 30 % del ancho). |
| `fondo` | Fondo de cuadros para comprobar la transparencia. |
| `debug` | Muestra el canal y qué servidores están conectados. |
| `demo=1` | Partido simulado, sin conexión (es lo que se ve en la página de inicio). |

## Preparar los partidos de la semana

En `assets/partidos.js` van los partidos que se van a emitir: texto de arriba, equipos (nombre de hasta 14 letras, color y escudo) y formato. En el control salen en **Ajustes del partido → Partido preparado**: al elegir uno se rellena el formulario y con **Nuevo partido** empieza a 0-0.

```js
{
  label: 'SENIOR MASCULINO · JORNADA 2', cuando: 'Sábado 7 nov · 19:30 · Almendralejo',
  home: { name: 'ALMENDRALEJO', color: '#059e2e', crest: 'cva' },
  away: { name: 'RIBERA', color: '#e3161e', crest: 'ribera' },
  bestOf: 5, target: 25, tieTarget: 15,
},
```

## Añadir el escudo de otro equipo

1. Guarda un PNG con fondo transparente, de unos 180 px de alto, en `assets/escudos/` con un nombre en minúsculas y sin espacios, por ejemplo `villafranca.png`.
2. Añade una línea en `assets/escudos/escudos.js`:
   ```js
   { id: 'villafranca', nombre: 'CV Villafranca' },
   ```
3. En el control: **Ajustes del partido → Escudo**.

## Pruebas

```bash
npm install
npm test                                   # reglas: deuce, tie-break, saque, deshacer, mensajes basura
CHROMIUM_PATH=/ruta/a/chrome npm run test:e2e   # de punta a punta con dos brokers MQTT locales
```

La prueba completa levanta un servidor web y dos brokers locales, abre el control como un móvil y el marcador en 16:9, y comprueba: puntos, saque, deshacer, caída de un broker a mitad de partido, recarga del widget, punto de set, tiempo muerto, cierre de set, tie-break, final, ajustes, nuevo partido, un segundo móvil de control y mensajes basura. Guarda capturas en `test/shots/`.

## Seguridad

El canal está en el código, así que quien lo conozca podría publicar un resultado falso. Los mensajes que llegan se reconstruyen campo a campo (no puede colarse HTML) y se ignoran los que vienen «del futuro», así que lo peor que puede pasar es ver un resultado raro hasta el siguiente toque del control. Si ocurriera, cambiad de canal en **Ajustes → Canal** y pegad el nuevo enlace en PRISM.

## Créditos

- Tipografías: Barlow Semi Condensed y Montserrat, con licencia SIL Open Font License 1.1 (`assets/fonts/OFL-*.txt`), recortadas a caracteres latinos.
- [MQTT.js](https://github.com/mqttjs/MQTT.js) 5.16, licencia MIT (`assets/LICENSE-mqtt.md`).
- Escudos: AD Voleibol Ribera, Club Voleibol A7 y CVA Almendralejo, propiedad de cada club.
