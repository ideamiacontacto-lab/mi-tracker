// Rutina y plan de EJEMPLO para el modo demo. Los datos reales de cada persona
// no van en el código (el repo es público): se cargan desde un archivo .json
// en Ajustes → Datos y quedan en su navegador y en su Drive.
window.RUTINA_DEMO = {
  items: [
    { t: 'Desayuno', h: '08:00', f: '08:30', dias: [1, 2, 3, 4, 5], comida: 'desayuno', plan: 'Tostadas con huevo' },
    { t: 'Almuerzo', h: '13:00', f: '13:30', dias: [1, 2, 3, 4, 5, 6, 0], comida: 'almuerzo', plan: 'Pollo con arroz y ensalada' },
    { t: 'Merienda', h: '17:00', f: '17:20', dias: [1, 2, 3, 4, 5, 6, 0], comida: 'merienda', plan: 'Yogur con granola' },
    { t: 'Gym', h: '18:30', f: '20:00', dias: [1, 3, 5], detalle: 'Ejemplo de actividad que se repite.' },
    { t: 'Cena', h: '21:00', f: '21:30', dias: [1, 2, 3, 4, 5, 6, 0], comida: 'cena', plan: 'Tarta de verduras' },
    { t: 'Desayuno', h: '10:00', f: '10:30', dias: [6, 0], comida: 'desayuno', plan: 'Panqueques de avena' }
  ],
  plan: {
    nombre: 'Plan de ejemplo',
    opciones: {
      desayuno: [{ n: 'Tostadas con huevo', d: '2 tostadas + 2 huevos + café con leche' }, { n: 'Panqueques de avena', d: 'Avena, huevo y banana' }],
      almuerzo: [{ n: 'Pollo con arroz y ensalada', d: '' }, { n: 'Carne con puré', d: '' }],
      merienda: [{ n: 'Yogur con granola', d: '' }, { n: 'Fruta y frutos secos', d: '' }],
      cena: [{ n: 'Tarta de verduras', d: '' }, { n: 'Pescado con verduras', d: '' }]
    },
    cantidades: {}
  }
};
