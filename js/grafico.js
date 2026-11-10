/*
  Gráfico de temperatura de la sesión, dibujado en SVG sin librerías.

  - Eje horizontal: tiempo de la sesión. Una lectura cada 5 s y una ventana de
    10 minutos, es decir, 120 lecturas.
  - Eje vertical: de 22 a 38 °C, con una línea de cuadrícula por cada grado.
  - La curva es escalonada, como una señal digital: cada lectura se mantiene
    hasta que llega la siguiente. El DHT11 entrega grados enteros, así que cada
    escalón cae sobre una línea de la cuadrícula.
  - El área entre la curva y la referencia de 30 °C se rellena con un degradado
    de paradas fijas: son bandas horizontales de 1 °C y cada una toma el color
    que el mapa de la sesión le asigna a su temperatura.
  - La recta de tendencia se calcula por mínimos cuadrados.
*/
(function () {
  'use strict';

  const M = (window.Monitor = window.Monitor || {});
  const NS = 'http://www.w3.org/2000/svg';

  const T_MIN = 22;
  const T_MAX = 38;
  const T_REF = 30;
  const VENTANA = 120;             // lecturas visibles: 10 minutos
  const LECTURAS_POR_MINUTO = 12;  // una cada 5 segundos

  const MARGEN = { izq: 48, der: 66, sup: 24, inf: 30 };

  function nodo(nombre, atributos, padre) {
    const elemento = document.createElementNS(NS, nombre);
    Object.keys(atributos || {}).forEach(function (clave) {
      elemento.setAttribute(clave, atributos[clave]);
    });
    if (padre) {
      padre.appendChild(elemento);
    }
    return elemento;
  }

  function rotulo(contenido, atributos, padre) {
    const elemento = nodo('text', atributos, padre);
    elemento.textContent = contenido;
    return elemento;
  }

  /* Coloca una línea de 1 px justo sobre un píxel para que se vea nítida. */
  function nitido(valor) {
    return Math.round(valor) + 0.5;
  }

  function limitar(valor, minimo, maximo) {
    return Math.max(minimo, Math.min(maximo, valor));
  }

  /* Lecturas que caben en la ventana de 10 minutos, contando desde la última. */
  function enVentana(lecturas) {
    if (!lecturas.length) {
      return [];
    }
    const ultima = lecturas[lecturas.length - 1];
    const primera = Math.max(1, ultima.n - (VENTANA - 1));
    return lecturas.filter(function (lectura) {
      return lectura.n >= primera && lectura.n <= ultima.n;
    });
  }

  /*
    Recta de mínimos cuadrados T = b + m·x, donde x es el número de la lectura:

        m = Σ (x − x̄)(T − T̄) / Σ (x − x̄)²

    Como hay 12 lecturas por minuto, 12·m es la tendencia en °C por minuto.
  */
  function tendencia(lecturas) {
    const cantidad = lecturas.length;
    if (cantidad < 2) {
      return null;
    }

    let sumaX = 0;
    let sumaT = 0;
    lecturas.forEach(function (lectura) {
      sumaX += lectura.n;
      sumaT += lectura.valor;
    });
    const mediaX = sumaX / cantidad;
    const mediaT = sumaT / cantidad;

    let numerador = 0;
    let denominador = 0;
    lecturas.forEach(function (lectura) {
      numerador += (lectura.n - mediaX) * (lectura.valor - mediaT);
      denominador += (lectura.n - mediaX) * (lectura.n - mediaX);
    });
    if (denominador === 0) {
      return null;
    }

    const m = numerador / denominador;
    return { m: m, b: mediaT - m * mediaX, porMinuto: m * LECTURAS_POR_MINUTO };
  }

  /* Promedio, máxima, mínima y tendencia de las lecturas de la ventana. */
  function resumen(lecturas) {
    const visibles = enVentana(lecturas);
    if (!visibles.length) {
      return null;
    }
    let suma = 0;
    let maxima = -Infinity;
    let minima = Infinity;
    visibles.forEach(function (lectura) {
      suma += lectura.valor;
      maxima = Math.max(maxima, lectura.valor);
      minima = Math.min(minima, lectura.valor);
    });
    return {
      cantidad: visibles.length,
      promedio: suma / visibles.length,
      maxima: maxima,
      minima: minima,
      tendencia: tendencia(visibles)
    };
  }

  /*
    Color de la banda de 1 °C cuyo borde superior es `arriba`. Cada banda toma
    el color de su borde más alejado de la referencia; así la banda que toca
    la curva en una lectura de 32 °C tiene exactamente el color de 32 °C.
  */
  function colorDeBanda(paleta, arriba) {
    const abajo = arriba - 1;
    const temperatura = abajo >= T_REF ? arriba : abajo;
    return M.color.interpolar(paleta, temperatura).hex;
  }

  /*
    raiz: elemento que contiene el <svg> y la pista flotante.
    voz: región que los lectores de pantalla leen al recorrer con el teclado.
  */
  function crearGrafico(raiz, voz) {
    const F = M.formato;
    const svg = raiz.querySelector('svg');
    const pista = raiz.querySelector('.grafico__pista');

    let lecturas = [];
    let paleta = M.color.PALETAS[0];
    let visibles = [];
    let escala = null;
    let senalada = null;   // número de la lectura señalada con el puntero o el teclado
    let capaCruz = null;

    function dibujar(datos) {
      if (datos) {
        lecturas = datos.lecturas;
        paleta = datos.paleta;
      }

      const caja = svg.getBoundingClientRect();
      if (caja.width < 10) {
        return;
      }
      const ancho = Math.round(caja.width);
      const alto = Math.round(caja.height);
      svg.setAttribute('viewBox', '0 0 ' + ancho + ' ' + alto);
      svg.textContent = '';

      visibles = enVentana(lecturas);
      const ultima = visibles.length ? visibles[visibles.length - 1] : null;
      const base = ultima ? Math.max(1, ultima.n - (VENTANA - 1)) : 1;

      const izq = MARGEN.izq;
      const sup = MARGEN.sup;
      const der = ancho < 560 ? 54 : MARGEN.der;
      const W = ancho - izq - der;
      const H = alto - MARGEN.sup - MARGEN.inf;
      const paso = W / VENTANA;   // ancho que ocupa una lectura

      function x(n) {
        return izq + (n - base) * paso;
      }
      function yLibre(t) {
        return sup + ((T_MAX - t) / (T_MAX - T_MIN)) * H;
      }
      function y(t) {
        return yLibre(limitar(t, T_MIN, T_MAX));
      }
      escala = { x: x, y: y, izq: izq, sup: sup, W: W, H: H, ancho: ancho, paso: paso, base: base };

      const yRef = yLibre(T_REF);

      /*
        Curva escalonada: cada lectura ocupa su casilla de 5 s y la última se
        prolonga una casilla más, hasta el momento actual.
      */
      let trazo = '';
      let area = '';
      if (ultima) {
        const inicio = x(visibles[0].n).toFixed(1);
        trazo = 'M' + inicio + ',' + y(visibles[0].valor).toFixed(1);
        for (let i = 1; i < visibles.length; i++) {
          trazo += ' H' + x(visibles[i].n).toFixed(1) + ' V' + y(visibles[i].valor).toFixed(1);
        }
        trazo += ' H' + x(ultima.n + 1).toFixed(1);
        area = 'M' + inicio + ',' + yRef.toFixed(1) + ' L' + trazo.slice(1) + ' V' + yRef.toFixed(1) + ' Z';
      }

      /* Degradado de paradas fijas: 16 bandas de 1 °C, de 38 arriba a 22 abajo. */
      const defs = nodo('defs', {}, svg);
      const bandas = nodo('linearGradient', {
        id: 'grafico-bandas',
        gradientUnits: 'userSpaceOnUse',
        x1: 0, y1: yLibre(T_MAX),
        x2: 0, y2: yLibre(T_MIN)
      }, defs);
      for (let j = 0; j < T_MAX - T_MIN; j++) {
        const color = colorDeBanda(paleta, T_MAX - j);
        nodo('stop', { offset: j / (T_MAX - T_MIN), 'stop-color': color }, bandas);
        nodo('stop', { offset: (j + 1) / (T_MAX - T_MIN), 'stop-color': color }, bandas);
      }
      const recorte = nodo('clipPath', { id: 'grafico-recorte' }, defs);
      nodo('rect', { x: izq, y: sup, width: W, height: H }, recorte);
      if (area) {
        const recorteArea = nodo('clipPath', { id: 'grafico-silueta' }, defs);
        nodo('path', { d: area }, recorteArea);
      }

      nodo('rect', { class: 'grafico__fondo', x: izq, y: sup, width: W, height: H }, svg);

      /* Cuadrícula: una línea por grado y una por minuto. */
      for (let t = T_MIN; t <= T_MAX; t++) {
        if (t === T_REF) {
          continue;
        }
        const yt = nitido(yLibre(t));
        nodo('line', {
          class: t % 2 === 0 ? 'grafico__rejilla grafico__rejilla--mayor' : 'grafico__rejilla',
          x1: izq, x2: izq + W, y1: yt, y2: yt
        }, svg);
      }

      const minutoInicial = Math.ceil((base - 1) / LECTURAS_POR_MINUTO);
      const minutoFinal = Math.floor((base - 1 + VENTANA) / LECTURAS_POR_MINUTO);
      const rotularCadaDos = W / 10 < 58;
      const marcasDeTiempo = [];
      for (let m = minutoInicial; m <= minutoFinal; m++) {
        const xm = x(m * LECTURAS_POR_MINUTO + 1);
        nodo('line', {
          class: 'grafico__rejilla grafico__rejilla--mayor',
          x1: nitido(xm), x2: nitido(xm), y1: sup, y2: sup + H
        }, svg);
        if (!rotularCadaDos || m % 2 === 0) {
          marcasDeTiempo.push({ minuto: m, x: xm });
        }
      }

      /* Área por bandas. Encima, una línea clara en cada grado separa las bandas. */
      if (area) {
        nodo('path', { class: 'grafico__area', d: area, fill: 'url(#grafico-bandas)' }, svg);
        const separadores = nodo('g', { 'clip-path': 'url(#grafico-silueta)' }, svg);
        for (let t = T_MIN + 1; t < T_MAX; t++) {
          if (t === T_REF) {
            continue;
          }
          const yt = nitido(yLibre(t));
          nodo('line', { class: 'grafico__separador', x1: izq, x2: izq + W, y1: yt, y2: yt }, separadores);
        }
      }

      /* La misma escala de color, como una tira pegada al eje vertical. */
      nodo('rect', {
        class: 'grafico__escala',
        x: izq - 10, y: sup, width: 5, height: H,
        fill: 'url(#grafico-bandas)'
      }, svg);

      nodo('line', {
        class: 'grafico__referencia',
        x1: izq, x2: izq + W, y1: nitido(yRef), y2: nitido(yRef)
      }, svg);

      if (ultima) {
        const recta = tendencia(visibles);
        if (recta) {
          // La recta pasa por el centro de la casilla de cada lectura.
          const n0 = visibles[0].n + 0.5;
          const n1 = ultima.n + 0.5;
          nodo('line', {
            class: 'grafico__tendencia',
            'clip-path': 'url(#grafico-recorte)',
            x1: x(n0), y1: yLibre(recta.b + recta.m * (n0 - 0.5)),
            x2: x(n1), y2: yLibre(recta.b + recta.m * (n1 - 0.5))
          }, svg);
        }

        nodo('path', { class: 'grafico__curva', d: trazo }, svg);

        rotularExtremos(svg, x, y, izq, sup, W, H);

        /*
          Lectura actual: un punto al final de la curva, una línea de nivel y
          una marca en el margen con el valor y el color que el mapa le asigna.
        */
        const cx = x(ultima.n + 1);
        const cy = y(ultima.valor);
        const borde = izq + W;
        const colorActual = M.color.interpolar(paleta, ultima.valor);
        const anchoMarca = der - 12;
        const altoMarca = 22;

        if (borde - cx > 1) {
          nodo('line', {
            class: 'grafico__nivel',
            x1: cx, x2: borde + 6, y1: nitido(cy), y2: nitido(cy)
          }, svg);
        }
        nodo('circle', { class: 'grafico__halo', cx: cx, cy: cy, r: 6.5 }, svg);
        nodo('circle', { class: 'grafico__punto', cx: cx, cy: cy, r: 4.5, fill: colorActual.hex }, svg);
        nodo('rect', {
          class: 'grafico__marca',
          x: borde + 6.5, y: Math.round(cy - altoMarca / 2) + 0.5,
          width: anchoMarca, height: altoMarca, rx: 3,
          fill: colorActual.hex
        }, svg);
        rotulo(F.grados(ultima.valor), {
          class: 'grafico__marca-texto',
          x: borde + 6.5 + anchoMarca / 2, y: cy, dy: '0.36em',
          'text-anchor': 'middle',
          fill: M.color.tintaSobre(colorActual.rgb)
        }, svg);
      } else {
        rotulo('Aún no hay lecturas en esta sesión.', {
          class: 'grafico__vacio',
          x: izq + W / 2, y: sup + H * 0.28,
          'text-anchor': 'middle'
        }, svg);
      }

      /* Rótulos de los ejes. */
      rotulo('°C', { class: 'grafico__eje', x: izq - 16, y: sup - 10, 'text-anchor': 'end' }, svg);
      for (let t = T_MIN; t <= T_MAX; t += 2) {
        rotulo(F.numero(t), {
          class: t === T_REF ? 'grafico__eje grafico__eje--referencia' : 'grafico__eje',
          x: izq - 16, y: yLibre(t), dy: '0.35em', 'text-anchor': 'end'
        }, svg);
      }
      let finDelAnterior = -Infinity;
      marcasDeTiempo.forEach(function (marca) {
        const texto = marca.minuto + F.ESPACIO_FIJO + 'min';
        const anchoTexto = texto.length * 6.4;   // estimado, a 12 px
        let ancla = 'middle';
        let desde = marca.x - anchoTexto / 2;
        if (marca.x - izq < 18) {
          ancla = 'start';
          desde = marca.x;
        } else if (izq + W - marca.x < 18) {
          ancla = 'end';
          desde = marca.x - anchoTexto;
        }
        // Se omite el rótulo que quedaría pegado al anterior.
        if (desde < finDelAnterior + 10) {
          return;
        }
        finDelAnterior = desde + anchoTexto;
        rotulo(texto, {
          class: 'grafico__eje',
          x: marca.x, y: sup + H + 20, 'text-anchor': ancla
        }, svg);
      });

      capaCruz = nodo('g', {}, svg);
      pintarCruz();

      svg.setAttribute('aria-label', describir());
    }

    /*
      Rotula la máxima y la mínima de la ventana sobre el primer tramo donde
      aparecen. No se rotulan si la curva es plana ni si el extremo es la
      lectura actual, que ya tiene su marca en el margen.
    */
    function rotularExtremos(capa, x, y, izq, sup, W, H) {
      const datos = resumen(lecturas);
      if (!datos || datos.maxima === datos.minima) {
        return;
      }

      [
        { valor: datos.maxima, texto: 'máx ', arriba: true },
        { valor: datos.minima, texto: 'mín ', arriba: false }
      ].forEach(function (extremo) {
        const desde = visibles.findIndex(function (lectura) {
          return lectura.valor === extremo.valor;
        });
        let hasta = desde;
        while (hasta + 1 < visibles.length && visibles[hasta + 1].valor === extremo.valor) {
          hasta += 1;
        }
        if (hasta === visibles.length - 1) {
          return;
        }

        const centro = (x(visibles[desde].n) + x(visibles[hasta].n + 1)) / 2;
        const yv = y(extremo.valor);
        let ty = extremo.arriba ? yv - 8 : yv + 17;
        if (extremo.arriba && ty < sup + 12) {
          ty = yv + 17;
        }
        if (!extremo.arriba && ty > sup + H - 6) {
          ty = yv - 8;
        }
        rotulo(extremo.texto + F.grados(extremo.valor), {
          class: 'grafico__extremo',
          x: limitar(centro, izq + 34, izq + W - 34), y: ty,
          'text-anchor': 'middle'
        }, capa);
      });
    }

    /* Resumen en texto para quien no ve el gráfico. */
    function describir() {
      const datos = resumen(lecturas);
      if (!datos) {
        return 'Gráfico de temperatura de la sesión. Aún no hay lecturas.';
      }
      const ultima = visibles[visibles.length - 1];
      return 'Gráfico de temperatura de la sesión: ' + datos.cantidad + ' lecturas, entre ' +
        F.grados(datos.minima) + ' y ' + F.grados(datos.maxima) +
        '. La última es de ' + F.grados(ultima.valor) + '.';
    }

    /* Franja, línea vertical, punto y pista flotante de la lectura señalada. */
    function pintarCruz() {
      if (!capaCruz) {
        return;
      }
      capaCruz.textContent = '';

      const lectura = visibles.find(function (candidata) {
        return candidata.n === senalada;
      });
      if (!lectura) {
        senalada = null;
        pista.hidden = true;
        return;
      }

      const x0 = escala.x(lectura.n);
      const cx = x0 + escala.paso / 2;
      const cy = escala.y(lectura.valor);
      const color = M.color.interpolar(paleta, lectura.valor).hex;

      nodo('rect', {
        class: 'grafico__franja',
        x: x0, y: escala.sup, width: escala.paso, height: escala.H
      }, capaCruz);
      nodo('line', {
        class: 'grafico__cruz',
        x1: nitido(cx), x2: nitido(cx), y1: escala.sup, y2: escala.sup + escala.H
      }, capaCruz);
      nodo('circle', { class: 'grafico__halo', cx: cx, cy: cy, r: 6.5 }, capaCruz);
      nodo('circle', { class: 'grafico__punto', cx: cx, cy: cy, r: 4.5, fill: color }, capaCruz);

      llenarPista(lectura, color);
      pista.hidden = false;
      const anchoPista = pista.offsetWidth;
      let izquierda = cx + 14;
      if (izquierda + anchoPista > escala.izq + escala.W) {
        izquierda = cx - 14 - anchoPista;
      }
      pista.style.transform = 'translate(' + Math.round(Math.max(4, izquierda)) + 'px, ' + (escala.sup + 6) + 'px)';
    }

    function llenarPista(lectura, color) {
      pista.textContent = '';

      const valor = document.createElement('p');
      valor.className = 'pista__valor';
      const clave = document.createElement('span');
      clave.className = 'pista__clave';
      clave.style.backgroundColor = color;
      valor.append(clave, document.createTextNode(F.grados(lectura.valor)));

      const datos = document.createElement('dl');
      datos.className = 'pista__datos';
      [
        ['Lectura', 'n.º' + F.ESPACIO_FIJO + lectura.n],
        ['Tiempo', F.tiempoDeLectura(lectura.n)],
        ['Humedad', F.porcentaje(lectura.h)],
        ['Binario', F.bitsEnNibbles(lectura.bin)],
        ['Hex', '0x' + M.binario.byteAHex(M.binario.bitsAByte(lectura.bin))],
        ['Color', color]
      ].forEach(function (par) {
        const fila = document.createElement('div');
        const termino = document.createElement('dt');
        const dato = document.createElement('dd');
        termino.textContent = par[0];
        dato.textContent = par[1];
        fila.append(termino, dato);
        datos.append(fila);
      });

      pista.append(valor, datos);
    }

    function quitarSenal() {
      if (senalada === null) {
        return;
      }
      senalada = null;
      pintarCruz();
    }

    /* Con el puntero: se señala la lectura sobre cuya casilla está el cursor. */
    svg.addEventListener('pointermove', function (evento) {
      if (!escala || !visibles.length) {
        return;
      }
      const caja = svg.getBoundingClientRect();
      const px = evento.clientX - caja.left;
      const py = evento.clientY - caja.top;
      const dentro = px >= escala.izq && px <= escala.izq + escala.W &&
                     py >= escala.sup && py <= escala.sup + escala.H;
      if (!dentro) {
        quitarSenal();
        return;
      }

      const buscada = escala.base + Math.floor((px - escala.izq) / escala.paso);
      let cercana = visibles[0];
      let distancia = Infinity;
      visibles.forEach(function (lectura) {
        const d = Math.abs(lectura.n - buscada);
        if (d < distancia) {
          distancia = d;
          cercana = lectura;
        }
      });
      if (cercana.n !== senalada) {
        senalada = cercana.n;
        pintarCruz();
      }
    });
    svg.addEventListener('pointerleave', quitarSenal);

    /* Con el teclado: las flechas recorren las lecturas una por una. */
    svg.addEventListener('keydown', function (evento) {
      if (!visibles.length) {
        return;
      }
      const actual = visibles.findIndex(function (lectura) {
        return lectura.n === senalada;
      });
      const ultimo = visibles.length - 1;
      let destino = null;

      if (evento.key === 'ArrowLeft') {
        destino = actual < 0 ? ultimo : Math.max(0, actual - 1);
      } else if (evento.key === 'ArrowRight') {
        destino = actual < 0 ? ultimo : Math.min(ultimo, actual + 1);
      } else if (evento.key === 'Home') {
        destino = 0;
      } else if (evento.key === 'End') {
        destino = ultimo;
      } else if (evento.key === 'Escape') {
        quitarSenal();
        return;
      }
      if (destino === null) {
        return;
      }

      evento.preventDefault();
      const lectura = visibles[destino];
      senalada = lectura.n;
      pintarCruz();
      voz.textContent = 'Lectura ' + lectura.n + ', minuto ' + F.tiempoDeLectura(lectura.n) + ': ' +
        F.grados(lectura.valor) + ', humedad ' + F.porcentaje(lectura.h) +
        ', binario ' + F.bitsEnNibbles(lectura.bin) + '.';
    });
    svg.addEventListener('blur', quitarSenal);

    /* El gráfico se vuelve a dibujar cuando cambia el ancho disponible. */
    if ('ResizeObserver' in window) {
      let cuadroPendiente = 0;
      new ResizeObserver(function () {
        cancelAnimationFrame(cuadroPendiente);
        cuadroPendiente = requestAnimationFrame(function () {
          dibujar();
        });
      }).observe(svg);
    }

    return { dibujar: dibujar };
  }

  M.grafico = {
    T_MIN: T_MIN,
    T_MAX: T_MAX,
    T_REF: T_REF,
    VENTANA: VENTANA,
    crear: crearGrafico,
    enVentana: enVentana,
    tendencia: tendencia,
    resumen: resumen,
    colorDeBanda: colorDeBanda
  };
})();
