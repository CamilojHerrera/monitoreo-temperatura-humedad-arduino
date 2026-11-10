/*
  Sistema de monitoreo de temperatura y humedad
  Arduino MEGA 2560 + sensor DHT11 (módulo)

  Conexiones (Tabla 3 de la propuesta):
    DHT11 VCC  -> 5V
    DHT11 GND  -> GND
    DHT11 DATA -> pin digital 2

  Librería necesaria: "DHT sensor library" de Adafruit.
  En el IDE: Programa > Incluir Librería > Administrar Bibliotecas, buscar
  "DHT sensor library" e instalarla junto con "Adafruit Unified Sensor".

  Cada 5 segundos envía por el puerto serial, a 115200 baudios, una línea JSON:
    {"sesion":1,"n":15,"t":32.0,"h":65.0,"bin":"00100000"}

  Si recibe la letra N por el puerto serial empieza una sesión nueva.
  El dashboard la envía con el botón "Nueva sesión".
*/

#include <DHT.h>

const uint8_t PIN_DHT = 2;
const unsigned long INTERVALO_MS = 5000UL;

DHT dht(PIN_DHT, DHT11);  // sensor en el pin digital 2

unsigned int sesion = 1;
unsigned long n = 0;
unsigned long ultimaLectura = 0;
bool lecturaPendiente = true;

void setup() {
  Serial.begin(115200);
  dht.begin();
  delay(2000);  // el DHT11 necesita un momento después de encenderse
}

void loop() {
  atenderComandos();

  unsigned long ahora = millis();
  if (lecturaPendiente || ahora - ultimaLectura >= INTERVALO_MS) {
    lecturaPendiente = false;
    ultimaLectura = ahora;
    leerYEnviar();
  }
}

// Una N recibida por el puerto serial empieza una sesión nueva.
void atenderComandos() {
  while (Serial.available() > 0) {
    char comando = Serial.read();
    if (comando == 'N' || comando == 'n') {
      sesion++;
      n = 0;
      lecturaPendiente = true;  // la primera lectura de la sesión sale de inmediato
    }
  }
}

void leerYEnviar() {
  float h = dht.readHumidity();
  float t = dht.readTemperature();

  if (isnan(h) || isnan(t)) {
    Serial.println(F("{\"error\":\"sensor\"}"));
    return;
  }

  n++;

  // Conversión a lógica binaria: 8 bits con signo en complemento a dos.
  // Cada bit se obtiene desplazando el valor a la derecha y tomando el
  // bit menos significativo. 32 °C -> 00100000
  int8_t valor = (int8_t) round(t);
  String bits = "";
  for (int i = 7; i >= 0; i--) {
    bits += ((valor >> i) & 1) ? '1' : '0';
  }

  Serial.print(F("{\"sesion\":"));
  Serial.print(sesion);
  Serial.print(F(",\"n\":"));
  Serial.print(n);
  Serial.print(F(",\"t\":"));
  Serial.print(t, 1);
  Serial.print(F(",\"h\":"));
  Serial.print(h, 1);
  Serial.print(F(",\"bin\":\""));
  Serial.print(bits);
  Serial.println(F("\"}"));
}
