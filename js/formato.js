/*
  Formato de números y unidades para mostrarlos en pantalla:
  coma decimal, signo menos tipográfico y espacio fijo antes de la unidad.
*/
(function () {
  'use strict';

  const M = (window.Monitor = window.Monitor || {});

  const ESPACIO_FIJO = ' '; // no deja que "32 °C" se parta en dos líneas
  const MENOS = '−';

  const formatos = [0, 1, 2].map(function (decimales) {
    return new Intl.NumberFormat('es-CO', {
      minimumFractionDigits: decimales,
      maximumFractionDigits: decimales
    });
  });

  /* numero(-5) -> '−5'; numero(31.25, 1) -> '31,3' */
  function numero(valor, decimales) {
    return formatos[decimales || 0].format(valor).replace('-', MENOS);
  }

  /* Siempre con signo, para la tendencia: '+0,21', '−0,40', '0,00' */
  function conSigno(valor, decimales) {
    const redondeado = Number(valor.toFixed(decimales || 0));
    if (redondeado === 0) {
      return numero(0, decimales);
    }
    return (redondeado < 0 ? MENOS : '+') + numero(Math.abs(redondeado), decimales);
  }

  /* grados(32) -> '32 °C' */
  function grados(valor, decimales) {
    return numero(valor, decimales) + ESPACIO_FIJO + '°C';
  }

  /* porcentaje(65) -> '65 %' */
  function porcentaje(valor) {
    return numero(valor) + ESPACIO_FIJO + '%';
  }

  /* Minuto y segundo de la sesión en que se tomó la lectura n (una cada 5 s). */
  function tiempoDeLectura(n) {
    const segundos = (n - 1) * 5;
    return Math.floor(segundos / 60) + ':' + String(segundos % 60).padStart(2, '0');
  }

  /* '00100000' -> '0010 0000' */
  function bitsEnNibbles(bits) {
    return bits.slice(0, 4) + ESPACIO_FIJO + bits.slice(4);
  }

  M.formato = {
    ESPACIO_FIJO: ESPACIO_FIJO,
    MENOS: MENOS,
    numero: numero,
    conSigno: conSigno,
    grados: grados,
    porcentaje: porcentaje,
    tiempoDeLectura: tiempoDeLectura,
    bitsEnNibbles: bitsEnNibbles
  };
})();
