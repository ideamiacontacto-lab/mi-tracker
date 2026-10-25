// Rutina semanal base (sacada de rutina-semanal-v17.ics). Se usa cuando el
// calendario no está conectado o no tiene comidas cargadas ese día.
(function () {
  const D = {
    tostada: { n: 'Tostada con huevos', d: '1 tostada integral + 2 huevos + 2 cdas de queso crema light + 1 vaso de café con leche batido + 1/2 banana + 10 almendras' },
    panq: { n: 'Panqueques de avena', d: '3 cdas de harina de avena + 1 scoop + 1 huevo + 1 banana pisada + 1 cda de miel + 1 cda de pasta de maní. Café con leche' },
    rapido: { n: 'Rápido', d: '1 tostada integral con 1 feta de queso + 2 huevos duros (del domingo) + 1 vaso de café con leche + 1 fruta + 10 almendras' },
    nollegas: { n: 'No llegás', d: 'Scoop + leche + 1 banana + 10 almendras' }
  };
  const M = {
    clasica: { n: 'Clásica', d: '2 tostadas integrales + 2 huevos (duros si estás en la oficina) + 1 vaso de café con leche + 1/2 banana + 20 almendras' },
    yogur: { n: 'Yogur', d: '200 g de yogur proteico + 1/4 taza de granola + 1 fruta + 1 cda de pasta de maní' },
    tqc: { n: 'Tostadas con queso crema', d: '2 tostadas integrales con 2 cdas de queso crema light + 1 huevo + café con leche + 1 fruta + 20 almendras' },
    yt: { n: 'Yogur con tostadas', d: '200 g de yogur proteico + 2 tostadas integrales con 2 cdas de queso crema light + 1 huevo duro + 1/2 banana + 20 almendras' }
  };
  const P = {
    p1: { n: 'Pollo con arroz, zanahoria rallada y hojas verdes', d: '' },
    p2: { n: 'Costeleta de cerdo con arroz y verduras salteadas', d: 'Morrón y cebolla' },
    p3: { n: 'Pollo al curry con arroz, morrón y zapallito', d: '' },
    p4: { n: 'Milanesa de pollo al horno con wok de verduras y fideos integrales', d: '' },
    p5: { n: 'Costeleta de cerdo al horno con papa, cebolla y morrón', d: '' },
    p6: { n: 'Ensalada de pollo, lentejas, zanahoria, hojas y 1/4 palta', d: 'Con la palta, usá 1 cdita de aceite menos' }
  };
  const CANT_ALM = 'Cantidades: 1 mano completa de cerdo o pollo (100 a 120 g sin hueso, sin la grasa del borde) + 2/3 taza de arroz o lentejas cocidos (o 1 taza chica de fideos, o 1 papa mediana) + 1/2 plato de verdura + 2 cditas de aceite. Postre: 1 fruta o la otra 1/2 banana.';
  const CANT_CENA = 'Cantidades: 1 mano completa de cerdo o pollo (sin hueso, sin la grasa del borde) + 1 huevo + 1/3 taza de arroz o lentejas cocidos (o 1/2 taza chica de fideos, o 1/2 papa) + 1/2 plato de verdura + 3 cditas de aceite.';

  const VAR = {
    desayuno: [D.tostada, D.panq, D.rapido, D.nollegas],
    merienda: [M.clasica, M.yogur, M.tqc, M.yt],
    almuerzo: Object.values(P),
    cena: Object.values(P)
  };

  const des = (h, f, x) => ({ h, f, t: 'Desayuno + creatina', comida: 'desayuno', plan: x.n, detalle: x.d });
  const mer = (h, f, x) => ({ h, f, t: 'Merienda', comida: 'merienda', plan: x.n, detalle: x.d });
  const alm = (h, f, x) => ({ h, f, t: 'Almuerzo', comida: 'almuerzo', plan: x.n, detalle: (x.d ? x.d + '. ' : '') + CANT_ALM });
  const cen = (h, f, x) => ({ h, f, t: 'Cena', comida: 'cena', plan: x.n, detalle: (x.d ? x.d + '. ' : '') + CANT_CENA });
  const ev = (h, f, t, d) => ({ h, f, t, detalle: d || '' });

  const GYM = ev('17:20', '18:50', 'Gym', 'Salí de la oficina 17:00 en punto (20 min hasta el gym). En casa 19:00. Mochila lista desde la noche anterior.');
  const LISTO = ev('21:30', '21:40', 'Dejar listo: mochila + tupper', 'Mochila del gym, tupper del almuerzo y merienda en la heladera.');
  const LIBRE = 'Sin trabajo.';

  const DIAS = {
    0: [des('10:00', '10:30', D.panq), alm('13:30', '14:00', P.p5), mer('16:15', '16:35', M.clasica),
      ev('17:00', '18:30', 'Cocinar para la semana', '1 taza de arroz integral crudo + 1 taza de lentejas secas. 1 kg de pechuga a la plancha o al horno (separar 4 milanesas y freezarlas). 4 costeletas de cerdo al horno con papas. 6 huevos duros. Rallar zanahorias, cortar morrón y cebolla. Armar los tuppers de lunes a miércoles.'),
      cen('20:30', '21:00', P.p1), LISTO],
    1: [des('07:30', '08:00', D.tostada), alm('13:00', '13:30', P.p1), mer('16:30', '16:45', M.clasica), GYM, cen('20:00', '20:30', P.p5), LISTO],
    2: [des('07:30', '08:00', D.tostada), alm('13:00', '13:30', P.p2), mer('16:30', '16:45', M.yogur), GYM, cen('20:00', '20:30', P.p4), LISTO],
    3: [des('07:30', '08:00', D.tostada), alm('13:00', '13:30', P.p3), mer('16:30', '16:45', M.clasica), GYM, cen('20:00', '20:30', P.p6),
      ev('20:30', '21:10', 'Reponer comida', 'Arroz y pollo para jueves y viernes. Armar el tupper frío del jueves.'), LISTO],
    5: [des('07:30', '08:00', D.tostada), alm('13:00', '13:30', P.p1), mer('16:30', '16:45', M.tqc), GYM,
      ev('19:00', '23:00', 'Tiempo para vos', LIBRE), cen('20:00', '20:30', P.p4)],
    6: [des('08:00', '08:30', D.tostada), alm('13:30', '14:00', P.p5),
      ev('14:15', '15:15', 'Compras del súper', 'Proteínas, carbohidratos, fruta y verdura, grasas. Revisar si queda pan integral, queso crema light, proteína, creatina y curry.'),
      ev('15:30', '20:00', 'Tiempo para vos', LIBRE), mer('17:00', '17:20', M.yt),
      { h: '21:00', f: '22:00', t: 'Cena libre', comida: 'cena', plan: 'Cena libre', detalle: 'Tarta, pizza o salida. Una por semana, sin culpa.' }]
  };
  // Jueves: semana por medio. El 29/10/2026 es jueves de Santa Fe todo el día.
  const JUEVES = {
    santafe: [ev('08:00', '08:50', 'Gym (rutina corta)', 'Salí de casa 7:50. Salís del gym 8:50, en casa 9:00, baño 10 min y desayuno rápido.'),
      des('09:10', '09:30', D.rapido), ev('09:30', '09:40', 'Te buscan para Santa Fe', 'Mochila del viaje, tupper del almuerzo y merienda.'),
      alm('13:00', '13:30', P.p6), mer('16:30', '16:50', M.yogur), cen('20:45', '21:15', P.p2), LISTO],
    curso: [des('07:30', '08:00', D.tostada), alm('13:00', '13:30', P.p6),
      ev('15:30', '15:40', 'Salís para Santa Fe', 'Llevá la merienda. Curso de 17 a 20.'),
      mer('16:30', '16:50', M.yogur), cen('20:45', '21:15', P.p2), LISTO]
  };
  const REF_SANTAFE = new Date(2026, 9, 29);

  function delDia(fecha) {
    const d = fecha.getDay();
    if (d !== 4) return DIAS[d] || [];
    const sem = Math.round((new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate()) - REF_SANTAFE) / (7 * 864e5));
    return Math.abs(sem) % 2 === 0 ? JUEVES.santafe : JUEVES.curso;
  }

  window.RUTINA = { delDia, VAR };
})();
