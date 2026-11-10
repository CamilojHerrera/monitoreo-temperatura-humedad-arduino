/*
  Paletas de sesión y mapa de color (Tabla 6 de la propuesta).

  Cada paleta tiene tres tonos: el de 22 °C, el de 30 °C (centro) y el de 38 °C.
  El color de cualquier temperatura intermedia sale de una interpolación lineal,
  canal por canal, entre los dos tonos que la rodean:

      C = Ca + (Cb − Ca) · (T − Ta) / (Tb − Ta)
*/
(function () {
  'use strict';

  const M = (window.Monitor = window.Monitor || {});

  const T_FRIO = 22;   // extremo frío del mapa
  const T_REF = 30;    // centro del mapa y referencia del gráfico
  const T_CALOR = 38;  // extremo cálido del mapa

  const PALETAS = [
    { nombre: 'Térmica',   frio: '#2166AC', centro: '#F7F7F7', calor: '#B2182B' },
    { nombre: 'Costa',     frio: '#01665E', centro: '#F5F5F5', calor: '#8C510A' },
    { nombre: 'Bosque',    frio: '#762A83', centro: '#F7F7F7', calor: '#1B7837' },
    { nombre: 'Atardecer', frio: '#5E3C99', centro: '#F7F7F7', calor: '#E66101' }
  ];

  const TINTA_OSCURA = '#1E2227';
  const TINTA_CLARA = '#FFFFFF';

  /* '#E6BFC4' -> [230, 191, 196] */
  function hexARgb(hex) {
    const numero = parseInt(hex.slice(1), 16);
    return [(numero >> 16) & 255, (numero >> 8) & 255, numero & 255];
  }

  /* [230, 191, 196] -> '#E6BFC4' */
  function rgbAHex(rgb) {
    return '#' + rgb.map(parAHex).join('');
  }

  /* 230 -> 'E6' */
  function parAHex(canal) {
    return canal.toString(16).toUpperCase().padStart(2, '0');
  }

  /* La sesión 1 usa la primera paleta; después de la cuarta el ciclo vuelve a empezar. */
  function paletaDeSesion(sesion) {
    const total = PALETAS.length;
    return PALETAS[(((sesion - 1) % total) + total) % total];
  }

  /*
    Devuelve el color de una temperatura junto con todos los pasos del cálculo,
    para que el indicador pueda mostrarlos.
    Fuera de 22–38 °C el color se queda en el extremo del mapa.
  */
  function interpolar(paleta, temperatura) {
    const t = Math.min(T_CALOR, Math.max(T_FRIO, temperatura));
    const ladoCalido = t > T_REF;

    const ta = ladoCalido ? T_REF : T_FRIO;
    const tb = ladoCalido ? T_CALOR : T_REF;
    const hexA = ladoCalido ? paleta.centro : paleta.frio;
    const hexB = ladoCalido ? paleta.calor : paleta.centro;
    const ca = hexARgb(hexA);
    const cb = hexARgb(hexB);

    const factor = (t - ta) / (tb - ta);
    const rgb = ca.map(function (canalA, i) {
      return Math.round(canalA + (cb[i] - canalA) * factor);
    });

    return {
      temperatura: t,
      fueraDeEscala: t !== temperatura,
      ta: ta,
      tb: tb,
      hexA: hexA,
      hexB: hexB,
      ca: ca,
      cb: cb,
      factor: factor,
      rgb: rgb,
      hex: rgbAHex(rgb)
    };
  }

  /* Luminancia relativa (WCAG), de 0 a 1. */
  function luminancia(rgb) {
    const lineal = rgb.map(function (canal) {
      const c = canal / 255;
      return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * lineal[0] + 0.7152 * lineal[1] + 0.0722 * lineal[2];
  }

  /* Tinta (oscura o clara) que mejor se lee encima de un color de relleno. */
  function tintaSobre(rgb) {
    const fondo = luminancia(rgb);
    const oscura = luminancia(hexARgb(TINTA_OSCURA));
    const contrasteOscura = (fondo + 0.05) / (oscura + 0.05);
    const contrasteClara = 1.05 / (fondo + 0.05);
    return contrasteOscura >= contrasteClara ? TINTA_OSCURA : TINTA_CLARA;
  }

  M.color = {
    T_FRIO: T_FRIO,
    T_REF: T_REF,
    T_CALOR: T_CALOR,
    PALETAS: PALETAS,
    hexARgb: hexARgb,
    rgbAHex: rgbAHex,
    parAHex: parAHex,
    paletaDeSesion: paletaDeSesion,
    interpolar: interpolar,
    tintaSobre: tintaSobre
  };
})();
