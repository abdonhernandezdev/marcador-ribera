/* Matches prepared in advance. In the control, "Ajustes del partido → Partido preparado"
   fills in the form with one of these; then "Nuevo partido" starts it at 0-0.
   Team names up to 14 characters; crest = an id from escudos/escudos.js. */
window.PARTIDOS = [
  {
    label: 'SENIOR MASCULINO · JORNADA 2', cuando: 'Sábado 7 nov · 19:30 · Almendralejo',
    home: { name: 'ALMENDRALEJO', color: '#059e2e', crest: 'cva' },
    away: { name: 'RIBERA', color: '#e3161e', crest: 'ribera' },
    bestOf: 5, target: 25, tieTarget: 15,
  },
  {
    label: 'SENIOR FEMENINO · JORNADA 3', cuando: 'Domingo 8 nov · 18:00 · Ribera del Fresno',
    home: { name: 'RIBERA', color: '#e3161e', crest: 'ribera' },
    away: { name: 'ALMENDRALEJO', color: '#059e2e', crest: 'cva' },
    bestOf: 5, target: 25, tieTarget: 15,
  },
];
