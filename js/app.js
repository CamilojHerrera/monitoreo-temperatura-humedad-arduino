/*
  Programa principal del dashboard.

  Recibe las tramas (del Arduino o del simulador), guarda el estado y reparte
  cada lectura entre las tres zonas de la página: la lectura actual, la matriz
  de bits con sus indicadores de color y el gráfico de temperatura.
*/
(function () {
  'use strict';

  const M = window.Monitor;
  const C = M.color;
  const B = M.binario;
  const F = M.formato;
  const G = M.grafico;

  // El Arduino envía una lectura cada 5 s; más de dos intervalos sin datos ya es raro.
  const SILENCIO_MAXIMO_S = 12;
  const formatoFactor = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 3 });
  const reducirMovimiento = window.matchMedia('(prefers-reduced-motion: reduce)');

  function $(selector) {
    return document.querySelector(selector);
  }

  function crear(etiqueta, clase, texto) {
    const elemento = document.createElement(etiqueta);
    if (clase) {
      elemento.className = clase;
    }
    if (texto !== undefined) {
      elemento.textContent = texto;
    }
    return elemento;
  }

  const ui = {
    estadoMarca: $('#estado-marca'),
    estadoTexto: $('#estado-texto'),
    ritmo: $('#ritmo'),
    btnSimular: $('#btn-simular'),
    btnConectar: $('#btn-conectar'),
    ayuda: $('#ayuda'),
    sinSerial: $('#sin-serial'),

    sesionNumero: $('#sesion-numero'),
    sesionPaleta: $('#sesion-paleta'),
    btnSesion: $('#btn-sesion'),
    temperatura: $('#temperatura'),
    tempCifra: $('#temp-cifra'),
    humedad: $('#humedad'),
    numeroLectura: $('#numero-lectura'),
    byteRejilla: $('#byte-rejilla'),
    byteSuma: $('#byte-suma'),
    byteHex: $('#byte-hex'),
    tramaRotulo: $('#trama-rotulo'),
    trama: $('#trama'),

    edicion: $('#edicion'),
    btnReanudar: $('#btn-reanudar'),
    matriz: $('#matriz'),
    valorHex: $('#valor-hex'),
    valorBits: $('#valor-bits'),
    btnCopiar: $('#btn-copiar'),
    formHex: $('#form-hex'),
    campoHex: $('#campo-hex'),
    cargaError: $('#carga-error'),
    colorMuestra: $('#color-muestra'),
    colorHex: $('#color-hex'),
    colorRgb: $('#color-rgb'),
    colorExplica: $('#color-explica'),
    canales: $('#canales'),
    canalA: $('#canal-a'),
    canalB: $('#canal-b'),
    canalC: $('#canal-c'),
    canalesCuerpo: $('#canales-cuerpo'),
    colorBase16: $('#color-base16'),

    resPromedio: $('#res-promedio'),
    resMaxima: $('#res-maxima'),
    resMinima: $('#res-minima'),
    resTendencia: $('#res-tendencia'),
    leyendaSobre: $('#leyenda-sobre'),
    leyendaBajo: $('#leyenda-bajo'),
    grafico: $('#grafico'),
    graficoVoz: $('#grafico-voz'),
    detalleTabla: $('#detalle-tabla'),
    tablaCuerpo: $('#tabla-cuerpo'),
    tablaVacia: $('#tabla-vacia')
  };

  const estado = {
    fuente: 'ninguna',       // 'ninguna', 'arduino' o 'simulador'
    sesion: 1,
    lecturas: [],            // lecturas de la sesión en curso que caben en la ventana
    filas: [null, null, null, null, null, null, null, null], // matriz: un byte por fila; null = fila vacía
    edicionManual: false,
    ultimaTrama: '',
    ultimaLlegada: 0,        // momento de la última trama o de la conexión
    descartadas: 0,          // líneas seguidas que no eran una trama válida
    paletaDibujada: '',      // paleta con la que está pintada la leyenda
    claveDeTabla: ''         // sesión y paleta con las que está llena la tabla
  };

  const byte = { celdas: [], pesos: [], digitos: [] };
  const matriz = { filas: [], pista: null };

  function ultimaLectura() {
    return estado.lecturas.length ? estado.lecturas[estado.lecturas.length - 1] : null;
  }

  function paletaActual() {
    return C.paletaDeSesion(estado.sesion);
  }

  /* ------------------------------------------------------------------------
     Entrada de datos
     ------------------------------------------------------------------------ */

  function esTramaValida(trama) {
    return trama !== null && typeof trama === 'object' &&
      Number.isInteger(trama.sesion) && trama.sesion >= 1 &&
      Number.isInteger(trama.n) && trama.n >= 1 &&
      typeof trama.t === 'number' && isFinite(trama.t) &&
      typeof trama.h === 'number' && isFinite(trama.h) &&
      typeof trama.bin === 'string' && /^[01]{8}$/.test(trama.bin);
  }

  /* Llega una línea de texto: {"sesion":1,"n":15,"t":32.0,"h":65.0,"bin":"00100000"} */
  function procesarLinea(linea) {
    estado.ultimaLlegada = Date.now();

    let trama = null;
    try {
      trama = JSON.parse(linea);
    } catch (_) {
      trama = null;
    }

    if (trama && trama.error === 'sensor') {
      mostrarAyuda('El Arduino no pudo leer el sensor. Revisa el cableado del DHT11: VCC a 5V, GND a GND y DATA al pin digital 2.');
      return;
    }

    if (!esTramaValida(trama)) {
      estado.descartadas += 1;
      if (estado.descartadas >= 3) {
        mostrarAyuda('Llegan datos por el puerto, pero no tienen el formato esperado. Revisa que el Arduino tenga cargado el sketch de la carpeta «arduino» y que transmita a 115200' + F.ESPACIO_FIJO + 'baudios.');
      }
      return;
    }

    estado.descartadas = 0;
    ocultarAyuda();
    recibirLectura(trama, linea);
  }

  function recibirLectura(trama, linea) {
    const anterior = ultimaLectura();
    const cambioDeSesion = trama.sesion !== estado.sesion;
    const reinicio = !cambioDeSesion && anterior !== null && trama.n <= anterior.n;

    if (cambioDeSesion || reinicio) {
      estado.sesion = trama.sesion;
      estado.lecturas = [];
    }

    // El patrón binario llega ya convertido desde el Arduino; aquí solo se lee.
    const valor = B.bitsAEntero8(trama.bin);
    estado.lecturas.push({
      n: trama.n,
      t: trama.t,
      h: trama.h,
      bin: trama.bin,
      valor: valor,
      coherente: valor === B.aEntero8(trama.t)
    });
    if (estado.lecturas.length > G.VENTANA) {
      estado.lecturas.shift();
    }
    estado.ultimaTrama = linea;

    if (!estado.edicionManual) {
      estado.filas.unshift(B.bitsAByte(trama.bin));
      estado.filas.length = 8;
      ui.matriz.classList.remove('matriz--directa');
      renderMatriz();
      deslizarMatriz();
    } else if (cambioDeSesion) {
      // La matriz editada a mano no recibe lecturas, pero sí cambia de paleta.
      renderMatriz();
    }

    renderEstado();
    renderSesion();
    renderLectura();
    renderColor();
    renderGrafico();
  }

  /* ------------------------------------------------------------------------
     Fuentes de datos: Arduino por USB o simulador
     ------------------------------------------------------------------------ */

  const simulador = M.crearSimulador(procesarLinea);

  const conexion = M.crearConexion(procesarLinea, function (nuevoEstado) {
    if (nuevoEstado === 'conectado') {
      estado.fuente = 'arduino';
      estado.ultimaLlegada = Date.now();
      estado.descartadas = 0;
      reiniciarDatos();
    } else {
      estado.fuente = 'ninguna';
      if (nuevoEstado === 'perdido') {
        mostrarAyuda('Se perdió la conexión con el Arduino. Revisa el cable USB y vuelve a conectar.');
      } else {
        ocultarAyuda();
      }
    }
    renderTodo();
  });

  /* Al cambiar de fuente empieza una serie nueva: sesión 1 y gráfico vacío. */
  function reiniciarDatos() {
    estado.sesion = 1;
    estado.lecturas = [];
    estado.ultimaTrama = '';
    if (!estado.edicionManual) {
      estado.filas = [null, null, null, null, null, null, null, null];
    }
  }

  function periodoSeleccionado() {
    const marcado = document.querySelector('input[name="ritmo"]:checked');
    return marcado ? Number(marcado.value) : 500;
  }

  function iniciarSimulacion() {
    ocultarAyuda();
    estado.fuente = 'simulador';
    reiniciarDatos();
    renderTodo();
    simulador.iniciar(periodoSeleccionado());
  }

  function detenerSimulacion() {
    simulador.detener();
    estado.fuente = 'ninguna';
    renderEstado();
    renderLectura();
  }

  async function conectarArduino() {
    ocultarAyuda();
    if (estado.fuente === 'simulador') {
      detenerSimulacion();
    }
    ui.btnConectar.disabled = true;
    try {
      await conexion.conectar();
    } catch (error) {
      const nombre = error && error.name;
      if (nombre === 'NotFoundError') {
        // Se cerró el selector de puertos sin elegir ninguno: no es un error.
      } else if (nombre === 'NetworkError' || nombre === 'InvalidStateError') {
        mostrarAyuda('No se pudo abrir el puerto. Si el Monitor Serie del IDE de Arduino está abierto, ciérralo y vuelve a conectar.');
      } else {
        mostrarAyuda('No se pudo conectar con el Arduino. Desconecta el cable USB, vuelve a conectarlo e inténtalo otra vez.');
      }
    } finally {
      ui.btnConectar.disabled = !conexion.disponible;
    }
  }

  function pedirNuevaSesion() {
    if (estado.fuente === 'arduino') {
      const sesionAntes = estado.sesion;
      // El sketch empieza una sesión nueva cuando recibe una N.
      conexion.enviar('N\n');
      setTimeout(function () {
        if (estado.fuente === 'arduino' && estado.sesion === sesionAntes) {
          mostrarAyuda('El Arduino no respondió al pedido de sesión nueva. Revisa que tenga cargado el sketch de la carpeta «arduino».');
        }
      }, 8000);
    } else if (estado.fuente === 'simulador') {
      simulador.nuevaSesion();
    } else {
      estado.sesion += 1;
      estado.lecturas = [];
      renderTodo();
    }
  }

  function mostrarAyuda(texto) {
    ui.ayuda.textContent = texto;
    ui.ayuda.hidden = false;
  }

  function ocultarAyuda() {
    ui.ayuda.hidden = true;
    ui.ayuda.textContent = '';
  }

  /* ------------------------------------------------------------------------
     Construcción de las piezas que se repiten
     ------------------------------------------------------------------------ */

  function construirByte() {
    ui.byteRejilla.append(crear('span', 'byte__tira'));

    B.PESOS.forEach(function (peso, i) {
      // La columna 5 queda libre: separa los dos grupos de cuatro bits.
      const columna = String(i < 4 ? i + 1 : i + 2);
      const nombre = crear('span', 'byte__nombre', 'b' + (7 - i));
      const celda = crear('span', 'celda byte__celda');
      const etiquetaPeso = crear('span', 'byte__peso', F.numero(peso));

      celda.dataset.bit = '0';
      [nombre, celda, etiquetaPeso].forEach(function (elemento) {
        elemento.style.gridColumn = columna;
      });

      ui.byteRejilla.append(nombre, celda, etiquetaPeso);
      byte.celdas.push(celda);
      byte.pesos.push(etiquetaPeso);
    });

    ['1 / 5', '6 / 10'].forEach(function (columnas) {
      const corchete = crear('span', 'byte__corchete');
      const digito = crear('span', 'byte__digito', '–');
      corchete.style.gridColumn = columnas;
      digito.style.gridColumn = columnas;
      ui.byteRejilla.append(corchete, digito);
      byte.digitos.push(digito);
    });
  }

  function construirMatriz() {
    const cabeza = crear('div', 'matriz__cabeza');
    cabeza.setAttribute('role', 'row');

    const rotuloValor = crear('span', 'matriz__nombre matriz__nombre--valor', 'Valor');
    rotuloValor.setAttribute('role', 'columnheader');
    cabeza.append(rotuloValor);
    for (let c = 0; c < 8; c++) {
      const nombre = crear('span', 'matriz__nombre', 'b' + (7 - c));
      nombre.setAttribute('role', 'columnheader');
      cabeza.append(nombre);
    }
    const rotuloHex = crear('span', 'matriz__nombre matriz__nombre--hex', 'Hex');
    rotuloHex.setAttribute('role', 'columnheader');
    cabeza.append(rotuloHex);

    const marco = crear('div', 'matriz__filas');
    marco.setAttribute('role', 'presentation');
    const pista = crear('div', 'matriz__pista');
    pista.setAttribute('role', 'rowgroup');
    marco.append(pista);

    for (let f = 0; f < 8; f++) {
      const fila = crear('div', 'matriz__fila');
      fila.setAttribute('role', 'row');

      const valor = crear('span', 'matriz__valor', '–');
      valor.setAttribute('role', 'rowheader');
      fila.append(valor);

      const celdas = [];
      for (let c = 0; c < 8; c++) {
        const casilla = crear('span', 'matriz__casilla');
        casilla.setAttribute('role', 'gridcell');

        const boton = crear('button', 'celda matriz__celda', '0');
        boton.type = 'button';
        boton.tabIndex = f === 0 && c === 0 ? 0 : -1;
        boton.dataset.fila = String(f);
        boton.dataset.columna = String(c);
        boton.dataset.bit = '0';
        boton.setAttribute('aria-pressed', 'false');
        boton.setAttribute('aria-label', 'Fila ' + (f + 1) + ', bit b' + (7 - c));

        casilla.append(boton);
        fila.append(casilla);
        celdas.push(boton);
      }

      const hex = crear('span', 'matriz__hex', '00');
      hex.setAttribute('role', 'gridcell');
      fila.append(hex);

      pista.append(fila);
      matriz.filas.push({ fila: fila, valor: valor, celdas: celdas, hex: hex });
    }

    matriz.pista = pista;
    ui.matriz.append(cabeza, marco);
  }

  /* ------------------------------------------------------------------------
     Zona 1: lectura actual
     ------------------------------------------------------------------------ */

  function renderEstado() {
    let marca = 'sin-conexion';
    let texto = 'Sin conexión con el Arduino.';

    if (estado.fuente === 'arduino') {
      const silencio = Math.round((Date.now() - estado.ultimaLlegada) / 1000);
      if (silencio > SILENCIO_MAXIMO_S) {
        marca = 'espera';
        texto = 'Arduino conectado, pero lleva ' + silencio + F.ESPACIO_FIJO + 's sin enviar lecturas.';
      } else if (!ultimaLectura()) {
        marca = 'espera';
        texto = 'Arduino conectado. Esperando la primera lectura…';
      } else {
        marca = 'arduino';
        texto = 'Recibiendo lecturas del Arduino cada 5' + F.ESPACIO_FIJO + 's.';
      }
    } else if (estado.fuente === 'simulador') {
      marca = 'simulacion';
      texto = 'Simulación: estas lecturas las genera el computador, no vienen del sensor.';
    }

    if (ui.estadoTexto.textContent !== texto) {
      ui.estadoTexto.textContent = texto;
    }
    ui.estadoMarca.dataset.estado = marca;

    ui.btnConectar.textContent = estado.fuente === 'arduino' ? 'Desconectar' : 'Conectar Arduino';
    ui.btnConectar.disabled = !conexion.disponible;
    ui.btnSimular.textContent = estado.fuente === 'simulador' ? 'Detener simulación' : 'Simular lecturas';
    ui.btnSimular.disabled = estado.fuente === 'arduino';
    ui.ritmo.hidden = estado.fuente !== 'simulador';
    ui.sinSerial.hidden = conexion.disponible;
  }

  function renderSesion() {
    ui.sesionNumero.textContent = 'Sesión de medición ' + estado.sesion;
    ui.sesionPaleta.textContent = 'Paleta ' + paletaActual().nombre;
  }

  function fraseDeSuma(bits, valor) {
    const activos = B.pesosActivos(bits);
    if (!activos.length) {
      return 'Ningún bit está en 1, así que el valor es 0.';
    }
    if (activos.length === 1) {
      return 'Solo está en 1 el bit de peso ' + F.numero(activos[0]) +
        ', así que el valor es ' + F.numero(valor) + '.';
    }
    const suma = activos.map(function (peso, i) {
      return i === 0 ? F.numero(peso) : '+ ' + peso;
    }).join(' ');
    return 'Suma de los pesos en 1: ' + suma + ' = ' + F.numero(valor) + '.';
  }

  function fraseDeHex(bits) {
    const alto = bits.slice(0, 4);
    const bajo = bits.slice(4);
    return 'En hexadecimal, ' + alto + ' es ' + B.nibbleAHex(alto) + ' y ' + bajo + ' es ' +
      B.nibbleAHex(bajo) + ': el byte es 0x' + B.nibbleAHex(alto) + B.nibbleAHex(bajo) + '.';
  }

  function renderLectura() {
    const ultima = ultimaLectura();

    ui.tramaRotulo.textContent = estado.fuente === 'simulador' ? 'Última trama simulada' : 'Última trama recibida';
    ui.trama.textContent = estado.ultimaTrama || 'ninguna todavía';

    if (!ultima) {
      ui.tempCifra.textContent = '––';
      ui.temperatura.setAttribute('aria-label', 'Temperatura: sin lectura');
      ui.humedad.textContent = '–';
      ui.numeroLectura.textContent = '–';
      byte.celdas.forEach(function (celda) {
        celda.textContent = '';
        celda.dataset.bit = '0';
        celda.style.backgroundColor = '';
        celda.style.color = '';
      });
      byte.pesos.forEach(function (peso) {
        peso.dataset.activo = 'false';
      });
      byte.digitos.forEach(function (digito) {
        digito.textContent = '–';
      });
      ui.byteRejilla.setAttribute('aria-label', 'Patrón de 8 bits: sin lectura');
      ui.byteSuma.textContent = estado.fuente === 'ninguna'
        ? 'Todavía no hay lecturas. Conecta el Arduino por USB o inicia la simulación.'
        : 'Esperando la primera lectura de esta sesión.';
      ui.byteHex.textContent = '';
      return;
    }

    const decimales = Number.isInteger(ultima.t) ? 0 : 1;
    ui.tempCifra.textContent = F.numero(ultima.t, decimales);
    ui.temperatura.setAttribute('aria-label', 'Temperatura: ' + F.grados(ultima.t, decimales));
    ui.humedad.textContent = F.porcentaje(ultima.h);
    ui.numeroLectura.textContent = 'n.º' + F.ESPACIO_FIJO + ultima.n;

    const color = C.interpolar(paletaActual(), ultima.valor);
    const tinta = C.tintaSobre(color.rgb);
    byte.celdas.forEach(function (celda, i) {
      const bit = ultima.bin[i];
      celda.textContent = bit;
      celda.dataset.bit = bit;
      // Las casillas en 1 toman el color de la lectura; las que valen 0 quedan en gris.
      celda.style.backgroundColor = bit === '1' ? color.hex : '';
      celda.style.color = bit === '1' ? tinta : '';
      byte.pesos[i].dataset.activo = String(bit === '1');
    });
    byte.digitos[0].textContent = B.nibbleAHex(ultima.bin.slice(0, 4));
    byte.digitos[1].textContent = B.nibbleAHex(ultima.bin.slice(4));
    ui.byteRejilla.setAttribute('aria-label', 'Patrón de 8 bits: ' + F.bitsEnNibbles(ultima.bin));

    let suma = fraseDeSuma(ultima.bin, ultima.valor);
    if (decimales) {
      suma += ' La lectura de ' + F.grados(ultima.t, 1) + ' se redondea a ' + F.numero(ultima.valor) + ' antes de convertirla.';
    }
    if (!ultima.coherente) {
      suma += ' Atención: el patrón recibido no corresponde a la temperatura de la trama.';
    }
    ui.byteSuma.textContent = suma;
    ui.byteHex.textContent = fraseDeHex(ultima.bin);
  }

  /* ------------------------------------------------------------------------
     Zona 2: matriz de bits y color en uso
     ------------------------------------------------------------------------ */

  function renderMatriz() {
    const paleta = paletaActual();

    estado.filas.forEach(function (fila, f) {
      const piezas = matriz.filas[f];
      const vacia = fila === null;
      const valorByte = vacia ? 0 : fila;
      const bits = B.byteABits(valorByte);
      const temperatura = B.conSigno(valorByte);

      // Cada fila toma su color según la temperatura que representa su byte.
      const color = vacia ? null : C.interpolar(paleta, temperatura);
      const tinta = vacia ? '' : C.tintaSobre(color.rgb);

      piezas.valor.textContent = vacia ? '–' : F.grados(temperatura);
      piezas.hex.textContent = B.byteAHex(valorByte);

      piezas.celdas.forEach(function (boton, c) {
        const bit = bits[c];
        boton.textContent = bit;
        boton.dataset.bit = bit;
        boton.setAttribute('aria-pressed', String(bit === '1'));

        if (vacia) {
          boton.style.backgroundColor = '';
          boton.style.color = '';
        } else if (bit === '1') {
          boton.style.backgroundColor = color.hex;   // bit en 1: color completo
          boton.style.color = tinta;
        } else {
          boton.style.backgroundColor = 'rgb(' + color.rgb.join(' ') + ' / 0.18)'; // bit en 0: tono tenue
          boton.style.color = '';
        }
      });
    });

    const bytes = estado.filas.map(function (fila) {
      return fila === null ? 0 : fila;
    });
    ui.valorHex.textContent = bytes.map(B.byteAHex).join(' ');
    ui.valorBits.textContent = bytes.map(B.byteABits).join(' ');
  }

  /* La fila nueva entra por arriba y las demás bajan una posición. */
  function deslizarMatriz() {
    const periodo = estado.fuente === 'simulador' ? simulador.periodo() : 5000;
    if (reducirMovimiento.matches || periodo < 2000 || !matriz.pista.animate) {
      return;
    }
    const paso = matriz.filas[1].fila.offsetTop - matriz.filas[0].fila.offsetTop;
    matriz.pista.animate(
      [{ transform: 'translateY(' + (-paso) + 'px)' }, { transform: 'translateY(0)' }],
      { duration: 180, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' }
    );
  }

  function alternarBit(f, c) {
    const actual = estado.filas[f] === null ? 0 : estado.filas[f];
    estado.filas[f] = actual ^ (1 << (7 - c));
    entrarEnEdicion();
    // El cambio lo hizo la persona: se muestra al instante, sin transición de color.
    ui.matriz.classList.add('matriz--directa');
    renderMatriz();
  }

  function moverFoco(f, c) {
    matriz.filas.forEach(function (piezas) {
      piezas.celdas.forEach(function (boton) {
        boton.tabIndex = -1;
      });
    });
    const destino = matriz.filas[f].celdas[c];
    destino.tabIndex = 0;
    destino.focus();
  }

  function entrarEnEdicion() {
    if (estado.edicionManual) {
      return;
    }
    estado.edicionManual = true;
    ui.edicion.hidden = false;
  }

  /* Deja la edición manual y vuelve a llenar la matriz con las últimas 8 lecturas. */
  function volverALasLecturas() {
    estado.edicionManual = false;
    ui.edicion.hidden = true;

    const recientes = estado.lecturas.slice(-8).reverse().map(function (lectura) {
      return B.bitsAByte(lectura.bin);
    });
    while (recientes.length < 8) {
      recientes.push(null);
    }
    estado.filas = recientes;

    ui.matriz.classList.remove('matriz--directa');
    renderMatriz();
    const enfocable = ui.matriz.querySelector('.matriz__celda[tabindex="0"]');
    if (enfocable) {
      enfocable.focus();
    }
  }

  function muestra(hex) {
    const cuadro = crear('span', 'muestra');
    cuadro.style.backgroundColor = hex;
    cuadro.setAttribute('aria-hidden', 'true');
    return cuadro;
  }

  function renderColor() {
    const ultima = ultimaLectura();
    if (!ultima) {
      ui.colorMuestra.style.backgroundColor = '';
      ui.colorMuestra.setAttribute('aria-label', 'Sin color: todavía no hay lecturas');
      ui.colorHex.textContent = '–';
      ui.colorRgb.textContent = '–';
      ui.colorExplica.textContent = 'El color sale de la temperatura de la última lectura y de la paleta de la sesión.';
      ui.canales.hidden = true;
      ui.colorBase16.hidden = true;
      return;
    }

    const paleta = paletaActual();
    const c = C.interpolar(paleta, ultima.valor);

    ui.colorMuestra.style.backgroundColor = c.hex;
    ui.colorMuestra.setAttribute('aria-label', 'Muestra del color ' + c.hex);
    ui.colorHex.textContent = c.hex;
    ui.colorRgb.textContent = 'rgb(' + c.rgb.join(', ') + ')';

    // C = Ca + (Cb − Ca) · (T − Ta) / (Tb − Ta), canal por canal.
    const recorrido = c.temperatura - c.ta;
    const tramo = c.tb - c.ta;
    const factor = formatoFactor.format(c.factor);
    let explica = F.grados(ultima.valor) + ' está entre ' + F.grados(c.ta) + ' y ' + F.grados(c.tb) +
      ', a ' + recorrido + '/' + tramo + ' = ' + factor + ' del recorrido. Cada canal vale Ca + (Cb ' +
      F.MENOS + ' Ca) × ' + factor + '.';
    if (c.fueraDeEscala) {
      explica = F.grados(ultima.valor) + ' queda fuera de la escala de 22 a 38' + F.ESPACIO_FIJO +
        '°C, así que se usa el tono del extremo.';
    } else if (c.factor === 0 || c.factor === 1) {
      explica = F.grados(ultima.valor) + ' es uno de los tres tonos fijos de la paleta ' + paleta.nombre +
        ', así que no hace falta interpolar.';
    }
    ui.colorExplica.textContent = explica;

    ui.canalA.replaceChildren(muestra(c.hexA), document.createTextNode(F.grados(c.ta)));
    ui.canalB.replaceChildren(muestra(c.hexB), document.createTextNode(F.grados(c.tb)));
    ui.canalC.replaceChildren(muestra(c.hex), document.createTextNode(F.grados(ultima.valor)));

    ui.canalesCuerpo.replaceChildren();
    ui.colorBase16.replaceChildren();
    ['R', 'G', 'B'].forEach(function (nombre, i) {
      const valor = c.rgb[i];
      // Cada par hexadecimal vuelve al decimal: E6 = 14 × 16 + 6 = 230.
      const comprobacion = Math.floor(valor / 16) + ' × 16 + ' + (valor % 16) + ' = ' + valor;

      const fila = crear('tr');
      const canal = crear('th', '', nombre);
      canal.scope = 'row';
      fila.append(
        canal,
        crear('td', 'num', String(c.ca[i])),
        crear('td', 'num', String(c.cb[i])),
        crear('td', 'num canales__resultado', String(valor)),
        crear('td', 'num codigo', C.parAHex(valor)),
        crear('td', '', comprobacion)
      );
      ui.canalesCuerpo.append(fila);
      ui.colorBase16.append(crear('li', '', C.parAHex(valor) + ' = ' + comprobacion));
    });
    ui.canales.hidden = false;
    ui.colorBase16.hidden = false;
  }

  /* ------------------------------------------------------------------------
     Zona 3: gráfico, resumen y tabla
     ------------------------------------------------------------------------ */

  const grafico = G.crear(ui.grafico, ui.graficoVoz);

  function renderLeyenda() {
    const paleta = paletaActual();
    if (estado.paletaDibujada === paleta.nombre) {
      return;
    }
    estado.paletaDibujada = paleta.nombre;

    ui.leyendaSobre.replaceChildren();
    ui.leyendaBajo.replaceChildren();
    for (let paso = 1; paso <= 8; paso++) {
      const sobre = crear('i');
      const bajo = crear('i');
      sobre.style.backgroundColor = C.interpolar(paleta, C.T_REF + paso).hex;
      bajo.style.backgroundColor = C.interpolar(paleta, C.T_REF - paso).hex;
      ui.leyendaSobre.append(sobre);
      ui.leyendaBajo.append(bajo);
    }
  }

  function renderGrafico() {
    renderLeyenda();
    grafico.dibujar({ lecturas: estado.lecturas, paleta: paletaActual() });

    const datos = G.resumen(estado.lecturas);
    ui.resPromedio.textContent = datos ? F.grados(datos.promedio, 1) : '–';
    ui.resMaxima.textContent = datos ? F.grados(datos.maxima) : '–';
    ui.resMinima.textContent = datos ? F.grados(datos.minima) : '–';
    ui.resTendencia.textContent = datos && datos.tendencia
      ? F.conSigno(datos.tendencia.porMinuto, 2) + F.ESPACIO_FIJO + '°C/min'
      : '–';

    if (ui.detalleTabla.open) {
      renderTabla();
    }
  }

  function filaDeTabla(lectura, paleta) {
    const hex = C.interpolar(paleta, lectura.valor).hex;
    const fila = crear('tr');
    const color = crear('td', 'codigo');
    color.append(muestra(hex), document.createTextNode(hex));
    fila.dataset.n = String(lectura.n);
    fila.append(
      crear('td', 'num', String(lectura.n)),
      crear('td', 'num', F.tiempoDeLectura(lectura.n)),
      crear('td', 'num', F.grados(lectura.valor)),
      crear('td', 'num', F.porcentaje(lectura.h)),
      crear('td', 'codigo', F.bitsEnNibbles(lectura.bin)),
      crear('td', 'codigo', '0x' + B.byteAHex(B.bitsAByte(lectura.bin))),
      color
    );
    return fila;
  }

  /*
    Las mismas lecturas del gráfico, de la más reciente a la más antigua.
    Mientras no cambien la sesión ni la paleta solo se agregan las filas nuevas
    arriba y se quitan abajo las que salieron de la ventana.
  */
  function renderTabla() {
    const paleta = paletaActual();
    const visibles = G.enVentana(estado.lecturas);
    const clave = estado.sesion + ' ' + paleta.nombre;
    const primera = ui.tablaCuerpo.firstElementChild;
    const ultimaEnTabla = primera ? Number(primera.dataset.n) : 0;
    const ultimaVisible = visibles.length ? visibles[visibles.length - 1].n : 0;

    if (clave !== estado.claveDeTabla || ultimaEnTabla > ultimaVisible) {
      estado.claveDeTabla = clave;
      ui.tablaCuerpo.replaceChildren();
      for (let i = visibles.length - 1; i >= 0; i--) {
        ui.tablaCuerpo.append(filaDeTabla(visibles[i], paleta));
      }
    } else {
      visibles.forEach(function (lectura) {
        if (lectura.n > ultimaEnTabla) {
          ui.tablaCuerpo.prepend(filaDeTabla(lectura, paleta));
        }
      });
      while (ui.tablaCuerpo.children.length > visibles.length) {
        ui.tablaCuerpo.lastElementChild.remove();
      }
    }
    ui.tablaVacia.hidden = visibles.length > 0;
  }

  function renderTodo() {
    renderEstado();
    renderSesion();
    renderLectura();
    renderMatriz();
    renderColor();
    renderGrafico();
  }

  /* ------------------------------------------------------------------------
     Acciones de la persona
     ------------------------------------------------------------------------ */

  ui.btnConectar.addEventListener('click', function () {
    if (estado.fuente === 'arduino') {
      conexion.desconectar();
    } else {
      conectarArduino();
    }
  });

  ui.btnSimular.addEventListener('click', function () {
    if (estado.fuente === 'simulador') {
      detenerSimulacion();
    } else {
      iniciarSimulacion();
    }
  });

  ui.ritmo.addEventListener('change', function () {
    simulador.cambiarPeriodo(periodoSeleccionado());
  });

  ui.btnSesion.addEventListener('click', pedirNuevaSesion);
  ui.btnReanudar.addEventListener('click', volverALasLecturas);

  ui.matriz.addEventListener('click', function (evento) {
    const boton = evento.target.closest('.matriz__celda');
    if (!boton) {
      return;
    }
    const f = Number(boton.dataset.fila);
    const c = Number(boton.dataset.columna);
    moverFoco(f, c);
    alternarBit(f, c);
  });

  ui.matriz.addEventListener('keydown', function (evento) {
    const boton = evento.target.closest('.matriz__celda');
    if (!boton) {
      return;
    }
    let f = Number(boton.dataset.fila);
    let c = Number(boton.dataset.columna);

    if (evento.key === 'ArrowLeft') {
      c = Math.max(0, c - 1);
    } else if (evento.key === 'ArrowRight') {
      c = Math.min(7, c + 1);
    } else if (evento.key === 'ArrowUp') {
      f = Math.max(0, f - 1);
    } else if (evento.key === 'ArrowDown') {
      f = Math.min(7, f + 1);
    } else if (evento.key === 'Home') {
      c = 0;
    } else if (evento.key === 'End') {
      c = 7;
    } else {
      return;
    }
    evento.preventDefault();
    moverFoco(f, c);
  });

  ui.formHex.addEventListener('submit', function (evento) {
    evento.preventDefault();
    const texto = ui.campoHex.value.trim();
    const bytes = B.hexAMatriz(texto);

    if (!bytes) {
      ui.cargaError.textContent = texto === ''
        ? 'Escribe un código de 1 a 16 dígitos hexadecimales.'
        : 'Ese código no es válido. Usa solo dígitos del 0 al 9 y letras de la A a la F, 16 como máximo.';
      ui.campoHex.setAttribute('aria-invalid', 'true');
      ui.campoHex.focus();
      return;
    }

    ui.cargaError.textContent = '';
    ui.campoHex.removeAttribute('aria-invalid');
    estado.filas = bytes;
    entrarEnEdicion();
    ui.matriz.classList.add('matriz--directa');
    renderMatriz();
  });

  ui.campoHex.addEventListener('input', function () {
    ui.cargaError.textContent = '';
    ui.campoHex.removeAttribute('aria-invalid');
  });

  ui.btnCopiar.addEventListener('click', function () {
    const codigo = ui.valorHex.textContent.replace(/\s+/g, '');

    function avisar(texto) {
      ui.btnCopiar.textContent = texto;
      setTimeout(function () {
        ui.btnCopiar.textContent = 'Copiar código';
      }, 1800);
    }

    function sinPermiso() {
      // Queda seleccionado para copiarlo con Ctrl + C.
      const rango = document.createRange();
      rango.selectNodeContents(ui.valorHex);
      const seleccion = window.getSelection();
      seleccion.removeAllRanges();
      seleccion.addRange(rango);
      avisar('Seleccionado: usa Ctrl + C');
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(codigo).then(function () {
        avisar('Código copiado');
      }, sinPermiso);
    } else {
      sinPermiso();
    }
  });

  ui.detalleTabla.addEventListener('toggle', function () {
    if (ui.detalleTabla.open) {
      renderTabla();
    }
  });

  /* ------------------------------------------------------------------------
     Arranque
     ------------------------------------------------------------------------ */

  construirByte();
  construirMatriz();
  renderTodo();

  // Vigila que el Arduino no se quede callado.
  setInterval(function () {
    if (estado.fuente === 'arduino') {
      renderEstado();
    }
  }, 1000);
})();
