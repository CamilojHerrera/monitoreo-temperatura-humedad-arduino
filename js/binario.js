/*
  Lógica binaria: 8 bits con signo en complemento a dos.

  En el sistema real la conversión la hace el Arduino y el dashboard solo
  recibe el patrón en el campo "bin" de la trama. Estas funciones sirven para
  leer ese patrón, para la matriz editable y para el modo de simulación.
*/
(function () {
  'use strict';

  const M = (window.Monitor = window.Monitor || {});

  /* Peso de cada posición, de b7 a b0. En complemento a dos b7 pesa −128. */
  const PESOS = [-128, 64, 32, 16, 8, 4, 2, 1];

  /* Redondea y limita al rango de 8 bits con signo, igual que (int8_t) round(t). */
  function aEntero8(valor) {
    return Math.max(-128, Math.min(127, Math.round(valor)));
  }

  /*
    Mismo procedimiento que el Arduino: se desplaza el valor a la derecha y se
    toma el bit menos significativo. 32 -> '00100000', −5 -> '11111011'.
  */
  function aBits(valor) {
    let bits = '';
    for (let i = 7; i >= 0; i--) {
      bits += ((valor >> i) & 1) ? '1' : '0';
    }
    return bits;
  }

  /* '00100000' -> 32 (byte sin signo, de 0 a 255) */
  function bitsAByte(bits) {
    return parseInt(bits, 2);
  }

  /* 251 -> −5: un byte mayor que 127 tiene encendido el bit de signo. */
  function conSigno(byte) {
    return byte > 127 ? byte - 256 : byte;
  }

  /* '11111011' -> −5 */
  function bitsAEntero8(bits) {
    return conSigno(bitsAByte(bits));
  }

  /* 32 -> '00100000' (para los bytes de la matriz) */
  function byteABits(byte) {
    return byte.toString(2).padStart(8, '0');
  }

  /* 32 -> '20' */
  function byteAHex(byte) {
    return byte.toString(16).toUpperCase().padStart(2, '0');
  }

  /* '0010' -> '2' */
  function nibbleAHex(cuatroBits) {
    return parseInt(cuatroBits, 2).toString(16).toUpperCase();
  }

  /* Pesos de las posiciones que valen 1. '00011101' -> [16, 8, 4, 1] */
  function pesosActivos(bits) {
    return PESOS.filter(function (_, i) {
      return bits[i] === '1';
    });
  }

  /*
    Convierte un código hexadecimal de hasta 16 dígitos en los 8 bytes de la
    matriz. Si tiene menos dígitos se completa con ceros a la izquierda.
    Acepta espacios y el prefijo 0x. Devuelve null si el texto no es válido.
  */
  function hexAMatriz(texto) {
    const limpio = String(texto).replace(/\s+/g, '').replace(/^0x/i, '');
    if (!/^[0-9a-fA-F]{1,16}$/.test(limpio)) {
      return null;
    }
    const completo = limpio.toUpperCase().padStart(16, '0');
    const bytes = [];
    for (let i = 0; i < 16; i += 2) {
      bytes.push(parseInt(completo.slice(i, i + 2), 16));
    }
    return bytes;
  }

  M.binario = {
    PESOS: PESOS,
    aEntero8: aEntero8,
    aBits: aBits,
    bitsAByte: bitsAByte,
    conSigno: conSigno,
    bitsAEntero8: bitsAEntero8,
    byteABits: byteABits,
    byteAHex: byteAHex,
    nibbleAHex: nibbleAHex,
    pesosActivos: pesosActivos,
    hexAMatriz: hexAMatriz
  };
})();
