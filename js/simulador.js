/*
  Simulador de lecturas, para probar el dashboard sin el Arduino conectado.

  Genera temperaturas enteras como las del DHT11 y arma la misma trama JSON
  que envía el Arduino, así el resto del programa no nota la diferencia.
  Los datos simulados no vienen del sensor: la página lo avisa mientras dura.
*/
(function () {
  'use strict';

  const M = (window.Monitor = window.Monitor || {});

  function limitar(valor, minimo, maximo) {
    return Math.max(minimo, Math.min(maximo, valor));
  }

  /* alEmitir(linea): se llama con cada trama, igual que con el puerto serial. */
  function crearSimulador(alEmitir) {
    let sesion = 1;
    let n = 0;
    let deriva = 0;
    let periodo = 500;
    let temporizador = null;

    function emitir() {
      n += 1;

      // Dos ondas lentas más un paseo aleatorio suave, alrededor de 30 °C.
      deriva = (deriva + (Math.random() - 0.5) * 0.9) * 0.96;
      const curva = 30.4 + 3.1 * Math.sin(n / 17) + 1.4 * Math.sin(n / 5.5 + 1.3) + deriva;

      const t = limitar(Math.round(curva), 0, 50);                     // rango del DHT11
      const h = limitar(Math.round(66 - 1.7 * (t - 30) + (Math.random() - 0.5) * 4), 20, 90);
      const bits = M.binario.aBits(M.binario.aEntero8(t));

      alEmitir(
        '{"sesion":' + sesion +
        ',"n":' + n +
        ',"t":' + t.toFixed(1) +
        ',"h":' + h.toFixed(1) +
        ',"bin":"' + bits + '"}'
      );
    }

    function programar() {
      clearInterval(temporizador);
      temporizador = setInterval(emitir, periodo);
    }

    return {
      iniciar: function (periodoMs) {
        sesion = 1;
        n = 0;
        deriva = 0;
        periodo = periodoMs;
        emitir();
        programar();
      },
      detener: function () {
        clearInterval(temporizador);
        temporizador = null;
      },
      /* Igual que el Arduino al recibir una N: sesión siguiente y lectura inmediata. */
      nuevaSesion: function () {
        sesion += 1;
        n = 0;
        emitir();
        programar();
      },
      cambiarPeriodo: function (periodoMs) {
        periodo = periodoMs;
        if (temporizador !== null) {
          programar();
        }
      },
      activo: function () {
        return temporizador !== null;
      },
      periodo: function () {
        return periodo;
      }
    };
  }

  M.crearSimulador = crearSimulador;
})();
