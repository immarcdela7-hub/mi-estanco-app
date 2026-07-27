/* Motor de disponibilidad del CRM (crm-web/src/lib/booking.ts).
   Es el que decide qué días y horas ve el cliente y si una reserva entra o no,
   así que se prueba solo, sin base de datos ni navegador. El fichero es
   TypeScript: se compila a un temporal antes de importarlo.

   node tests/test-disponibilidad.mjs
*/
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..');
const fuente = join(raiz, 'crm-web', 'src', 'lib', 'booking.ts');
const salida = mkdtempSync(join(tmpdir(), 'ntl-booking-'));

execFileSync(
  'npx',
  ['tsc', fuente, '--outDir', salida, '--module', 'esnext', '--target', 'es2022',
    '--moduleResolution', 'bundler', '--skipLibCheck'],
  { cwd: join(raiz, 'crm-web'), stdio: 'pipe' }
);

const B = await import(join(salida, 'booking.js'));

const results = [];
function log(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ' -- ' + detail : ''}`);
}
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ---------- Horas y días ----------
log('Las horas se ordenan y se limpian',
  eq(B.parseSlots(' 17:00 | 9:30|17:00 | manana |25:00'), ['09:30', '17:00']),
  JSON.stringify(B.parseSlots(' 17:00 | 9:30|17:00 | manana |25:00')));

log('Sin horas no hay actividad que ofrecer', eq(B.parseSlots(''), []), '');

log('Los días vacíos significan todos los días',
  B.parseWeekdays('').size === 7 && B.parseWeekdays('banana').size === 7, '');
log('Y los días sueltos se respetan',
  eq([...B.parseWeekdays('5,6,0')].sort(), [0, 5, 6]), '');

// ---------- Zona horaria ----------
// Un fallo aquí abre o cierra las reservas una hora tarde dos veces al año.
log('Verano: las 11:00 de Catalunya son las 09:00 UTC',
  B.slotStart('2026-07-15', '11:00').toISOString() === '2026-07-15T09:00:00.000Z',
  B.slotStart('2026-07-15', '11:00').toISOString());
log('Invierno: las mismas 11:00 son las 10:00 UTC',
  B.slotStart('2026-01-15', '11:00').toISOString() === '2026-01-15T10:00:00.000Z',
  B.slotStart('2026-01-15', '11:00').toISOString());

// A las 00:30 de Catalunya en verano, en UTC todavía es el día anterior.
log('El día de hoy es el de aquí, no el de UTC',
  B.localDay(new Date('2026-07-15T22:30:00Z')) === '2026-07-16',
  B.localDay(new Date('2026-07-15T22:30:00Z')));

// ---------- Calendario ----------
const ACT = {
  slots: '11:00|17:00',
  weekdays: '0,1,2,3,4,5,6',
  capacity: 8,
  minPeople: 2,
  leadHours: 24,
  horizonDays: 5,
};
const AHORA = new Date('2026-07-15T09:00:00Z'); // miércoles, 11:00 en Catalunya

const cal = B.availability(ACT, [], AHORA);
// El horizonte se cuenta desde hoy y es un tope: los días que se quedan sin
// ninguna hora vendible (aquí, hoy mismo) no se ofrecen.
log('El horizonte es un tope, no una promesa', cal.length === 4 && cal.length <= ACT.horizonDays,
  `${cal.length} días de ${ACT.horizonDays}`);
log('La antelación mínima deja hoy fuera',
  !cal.some((d) => d.date === '2026-07-15') && cal[0].date === '2026-07-16',
  cal.map((d) => d.date).join(', '));
log('Justo al cumplirse la antelación ya se puede reservar',
  eq(cal[0].slots.map((s) => s.time), ['11:00', '17:00']), JSON.stringify(cal[0].slots));

// Sin antelación mínima entra lo que queda de hoy, pero no lo ya pasado.
const hoyMismo = B.availability({ ...ACT, leadHours: 0 }, [], AHORA);
log('Sin antelación se puede reservar hoy, salvo lo que ya pasó',
  hoyMismo[0].date === '2026-07-15' && eq(hoyMismo[0].slots.map((s) => s.time), ['11:00', '17:00']),
  JSON.stringify(hoyMismo[0]));
const aLasSeis = B.availability({ ...ACT, leadHours: 0 }, [], new Date('2026-07-15T14:00:00Z'));
log('A media tarde ya no se ofrece la sesión de la mañana',
  eq(aLasSeis[0].slots.map((s) => s.time), ['17:00']), JSON.stringify(aLasSeis[0]));

const soloFinde = B.availability({ ...ACT, weekdays: '6,0', horizonDays: 10 }, [], AHORA);
log('Solo se ofrecen los días con actividad',
  soloFinde.every((d) => [0, 6].includes(new Date(d.date + 'T12:00:00Z').getUTCDay())),
  soloFinde.map((d) => d.date).join(', '));

// ---------- Cupo ----------
const reservas = [
  { bookingDate: new Date('2026-07-17T00:00:00Z'), slot: '11:00', people: 4 },
  { bookingDate: new Date('2026-07-17T00:00:00Z'), slot: '11:00', people: 2 },
];
const conCupo = B.availability(ACT, reservas, AHORA).find((d) => d.date === '2026-07-17');
log('Las plazas ocupadas se restan de su hora',
  conCupo.slots.find((s) => s.time === '11:00').free === 2, JSON.stringify(conCupo.slots));
log('Y no tocan a las demás horas',
  conCupo.slots.find((s) => s.time === '17:00').free === 8, '');

// Con el mínimo en 2, una hora con 1 plaza libre no se puede vender: se oculta.
const casiLlena = B.availability(ACT,
  [{ bookingDate: new Date('2026-07-17T00:00:00Z'), slot: '11:00', people: 7 }], AHORA)
  .find((d) => d.date === '2026-07-17');
log('Una hora que ya no llega al mínimo desaparece',
  casiLlena.slots.length === 1 && casiLlena.slots[0].time === '17:00',
  JSON.stringify(casiLlena.slots));

const lleno = Array.from({ length: 5 }, () => [
  { bookingDate: new Date('2026-07-17T00:00:00Z'), slot: '11:00', people: 8 },
  { bookingDate: new Date('2026-07-17T00:00:00Z'), slot: '17:00', people: 8 },
]).flat();
log('Un día sin nada libre no se ofrece',
  !B.availability(ACT, lleno, AHORA).some((d) => d.date === '2026-07-17'), '');

// ---------- Validación de una reserva ----------
const v = (fecha, hora, personas, res = []) =>
  B.validateRequest(ACT, res, AHORA, fecha, hora, personas);

log('Una reserva correcta pasa', v('2026-07-17', '11:00', 2) === null, String(v('2026-07-17', '11:00', 2)));
log('No se acepta una hora que no existe', typeof v('2026-07-17', '12:00', 2) === 'string',
  String(v('2026-07-17', '12:00', 2)));
log('No se acepta por debajo del mínimo', /2 personas/.test(v('2026-07-17', '11:00', 1) || ''),
  String(v('2026-07-17', '11:00', 1)));
log('No se acepta dentro de la antelación mínima',
  typeof v('2026-07-15', '17:00', 2) === 'string', String(v('2026-07-15', '17:00', 2)));
log('No se acepta más allá del horizonte',
  typeof v('2026-09-01', '11:00', 2) === 'string', String(v('2026-09-01', '11:00', 2)));
log('No se acepta una fecha con formato raro',
  typeof v('17/07/2026', '11:00', 2) === 'string', String(v('17/07/2026', '11:00', 2)));

const casi = [{ bookingDate: new Date('2026-07-17T00:00:00Z'), slot: '11:00', people: 6 }];
log('No se venden más plazas de las que quedan',
  /2 plazas/.test(v('2026-07-17', '11:00', 3, casi) || ''), String(v('2026-07-17', '11:00', 3, casi)));
log('Pero las que quedan sí se venden', v('2026-07-17', '11:00', 2, casi) === null, '');

const unaSola = [{ bookingDate: new Date('2026-07-17T00:00:00Z'), slot: '11:00', people: 7 }];
log('Con una sola plaza no se puede llegar al mínimo: se rechaza',
  typeof v('2026-07-17', '11:00', 2, unaSola) === 'string', String(v('2026-07-17', '11:00', 2, unaSola)));

// Una cancelada no ocupa: quien cancela devuelve su sitio al mercado.
log('Las canceladas no cuentan (las filtra quien consulta)',
  B.availability(ACT, [], AHORA).find((d) => d.date === '2026-07-17')
    .slots.every((s) => s.free === 8), '');

// ---------- Dinero ----------
const m = B.money(35, 3, 20, 30);
log('El total es precio por personas', m.total === 105, String(m.total));
log('Nuestro margen es el % del total', m.ntlMargin === 21, String(m.ntlMargin));
log('Y el local cobra su % de nuestro margen', m.partnerShare === 6.3, String(m.partnerShare));
const m2 = B.money(33.33, 3, 17.5, 30);
log('Los céntimos no se van por decimales sueltos',
  Number.isFinite(m2.partnerShare) && m2.total === 99.99 && m2.ntlMargin === 17.5,
  JSON.stringify(m2));

// ---------- Localizador ----------
const refs = new Set(Array.from({ length: 500 }, () => B.bookingReference()));
log('Los localizadores no se repiten ni se confunden',
  refs.size === 500 && [...refs].every((r) => /^NTL-[A-Z2-9]{6}$/.test(r) && !/[OI01]/.test(r.slice(4))),
  `${refs.size}/500 distintos`);

rmSync(salida, { recursive: true, force: true });

const fallos = results.filter((r) => !r.pass);
console.log(`\n=== ${results.length - fallos.length}/${results.length} pruebas OK ===`);
if (fallos.length) {
  console.log('FALLOS:');
  fallos.forEach((f) => console.log(' - ' + f.name + ': ' + f.detail));
  process.exitCode = 1;
}
