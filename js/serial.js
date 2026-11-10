/*
  Conexión con el Arduino por USB usando la Web Serial API (Chrome o Edge).

  El Arduino envía una línea de texto por cada lectura. Aquí se abre el puerto
  a 115200 baudios, se juntan los fragmentos que van llegando y se entrega cada
  línea completa a quien la pidió.
*/
(function () {
  'use strict';

  const M = (window.Monitor = window.Monitor || {});

  const BAUDIOS = 115200;
  const LINEA_MAXIMA = 2048; // si llega más que esto sin salto de línea, es ruido

  /*
    alRecibirLinea(texto): se llama con cada línea completa.
    alCambiarEstado(estado, error): 'conectado', 'desconectado' o 'perdido'.
  */
  function crearConexion(alRecibirLinea, alCambiarEstado) {
    const disponible = 'serial' in navigator;

    let puerto = null;
    let lector = null;
    let tuberia = null;
    let cierrePedido = false;

    async function conectar() {
      // Abre el selector de puertos del navegador; solo funciona tras un clic.
      const elegido = await navigator.serial.requestPort();
      await elegido.open({ baudRate: BAUDIOS });

      puerto = elegido;
      cierrePedido = false;
      alCambiarEstado('conectado');
      leer();
    }

    async function leer() {
      const decodificador = new TextDecoderStream();
      tuberia = puerto.readable.pipeTo(decodificador.writable).catch(function () {});
      lector = decodificador.readable.getReader();

      let pendiente = '';
      let fallo = null;

      try {
        for (;;) {
          const paso = await lector.read();
          if (paso.done) {
            break;
          }
          pendiente += paso.value;

          let fin = pendiente.indexOf('\n');
          while (fin >= 0) {
            const linea = pendiente.slice(0, fin).trim();
            pendiente = pendiente.slice(fin + 1);
            if (linea) {
              alRecibirLinea(linea);
            }
            fin = pendiente.indexOf('\n');
          }

          if (pendiente.length > LINEA_MAXIMA) {
            pendiente = '';
          }
        }
      } catch (error) {
        fallo = error;
      } finally {
        try {
          lector.releaseLock();
        } catch (_) { /* el lector ya estaba liberado */ }
      }

      if (!cierrePedido) {
        // La lectura terminó sin que nadie lo pidiera: se soltó el cable o el
        // puerto dejó de responder.
        await cerrarPuerto();
        alCambiarEstado('perdido', fallo);
      }
    }

    async function cerrarPuerto() {
      const cerrado = puerto;
      puerto = null;
      lector = null;
      if (!cerrado) {
        return;
      }
      try {
        await tuberia;
      } catch (_) { /* la tubería ya se cerró con error */ }
      try {
        await cerrado.close();
      } catch (_) { /* el puerto ya no existe */ }
    }

    async function desconectar() {
      if (!puerto) {
        return;
      }
      cierrePedido = true;
      try {
        await lector.cancel();
      } catch (_) { /* no había lectura en curso */ }
      await cerrarPuerto();
      alCambiarEstado('desconectado');
    }

    /* Envía texto al Arduino. Devuelve false si no hay puerto abierto. */
    async function enviar(texto) {
      if (!puerto || !puerto.writable) {
        return false;
      }
      const escritor = puerto.writable.getWriter();
      try {
        await escritor.write(new TextEncoder().encode(texto));
      } finally {
        escritor.releaseLock();
      }
      return true;
    }

    return {
      disponible: disponible,
      conectar: conectar,
      desconectar: desconectar,
      enviar: enviar,
      estaAbierta: function () {
        return puerto !== null;
      }
    };
  }

  M.crearConexion = crearConexion;
})();
