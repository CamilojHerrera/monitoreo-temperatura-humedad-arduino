# Monitoreo de temperatura y humedad con Arduino MEGA

Dashboard web del proyecto de Electrónica Digital (Ingeniería de Sistemas, Corporación Universitaria Latinoamericana, 2026).

Un Arduino MEGA 2560 lee un sensor DHT11, convierte la temperatura a 8 bits en complemento a dos y la envía por USB. La página la muestra de cuatro formas: en decimal con sus 8 bits, en una matriz de 8 × 8, como color en HEX y RGB, y en un gráfico de la sesión.

## Cómo usarlo

1. Conecta el sensor al Arduino:

   | DHT11 | Arduino MEGA |
   | ----- | ------------ |
   | VCC   | 5V           |
   | GND   | GND          |
   | DATA  | Digital 2    |

2. Abre `arduino/monitor_dht11/monitor_dht11.ino` en el IDE de Arduino. Instala la librería **DHT sensor library** de Adafruit (y **Adafruit Unified Sensor** cuando el IDE lo pida) y carga el sketch en la placa.
3. Cierra el Monitor Serie del IDE: el puerto solo lo puede usar un programa a la vez.
4. Abre `index.html` con doble clic en Chrome o Edge. No hace falta servidor ni conexión a internet.
5. Pulsa **Conectar Arduino** y elige el puerto de la placa.

Sin el Arduino a la mano, el botón **Simular lecturas** genera datos de prueba con el mismo formato.

## Qué muestra

- **Lectura actual.** Temperatura y humedad en decimal, y los 8 bits de la temperatura con el peso de cada posición (b7 pesa −128). Las casillas en 1 se encienden con el color de la lectura.
- **Matriz de bits.** Las últimas 8 lecturas, una por fila. Los 64 bits forman un valor de 16 dígitos hexadecimales. Un clic cambia un bit y también se puede cargar un código hexadecimal.
- **Color en uso.** El color de la lectura en HEX y RGB, con el cálculo de la interpolación canal por canal.
- **Temperatura de la sesión.** Gráfico de los últimos 10 minutos (120 lecturas), de 22 a 38 °C, con el área coloreada por bandas de 1 °C respecto a la referencia de 30 °C y una recta de tendencia por mínimos cuadrados.

El botón **Nueva sesión** empieza otra sesión de medición y cambia la paleta: Térmica, Costa, Bosque y Atardecer, en ciclo.

## Trama serial

El Arduino envía una línea JSON cada 5 segundos, a 115200 baudios:

```json
{"sesion":1,"n":15,"t":32.0,"h":65.0,"bin":"00100000"}
```

Si recibe la letra `N`, empieza una sesión nueva.

## Archivos

```
index.html                 la página
css/estilos.css            estilos
js/formato.js              números y unidades en pantalla
js/color.js                paletas e interpolación de color
js/binario.js              conversión a 8 bits y hexadecimal
js/serial.js               conexión por Web Serial
js/simulador.js            lecturas de prueba
js/grafico.js              gráfico en SVG, sin librerías
js/app.js                  programa principal
arduino/monitor_dht11/     sketch del Arduino
```

## Estado de las pruebas

- Probado en el navegador con datos simulados y con un puerto serial simulado: conexión, lectura de tramas, sesión nueva, error del sensor y pérdida de conexión.
- Comprobado que Edge permite usar el puerto serial con la página abierta como archivo local.
- Pendiente: probar con el Arduino y el sensor reales, y compilar el sketch en el IDE.
