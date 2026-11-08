import test from 'node:test';
import assert from 'node:assert/strict';
import { preserveAppointment, validateAppointment, confirmImport, attachResult } from '../src/domain.mjs';
const appointment = { patientId: 'p1', kind: 'exam', title: 'Hemograma', startsAt: '2026-11-10T10:00:00-03:00', location: 'Laboratório', notes: 'Levar pedido' };
test('acompanhante opcional e preservação integral do rascunho', () => {
  assert.equal(validateAppointment(appointment).companionId, null);
  assert.deepEqual(preserveAppointment(appointment, { id: 'c1', patientId: 'p1' }), { ...appointment, companionId: 'c1' });
  assert.equal(appointment.companionId, undefined);
  assert.throws(() => preserveAppointment(appointment, { id: 'c2', patientId: 'p2' }));
});
test('leitura nunca confirma sem pessoa e revisão atual', () => {
  const draft = { kind: 'exam_order', patientId: 'p1', status: 'pending_review', revision: 2, items: [appointment] };
  assert.throws(() => confirmImport(draft));
  assert.throws(() => confirmImport(draft, { actorId: 'u1', confirmed: true, revision: 1 }));
  assert.equal(confirmImport(draft, { actorId: 'u1', confirmed: true, revision: 2 }).status, 'confirmed');
  assert.equal(draft.status, 'pending_review');
});
test('receita exige posologia conferida', () => {
  const draft = { kind: 'prescription', patientId: 'p1', status: 'pending_review', revision: 1, items: [{ patientId: 'p1', name: 'Exemplo' }] };
  assert.throws(() => confirmImport(draft, { actorId: 'u1', confirmed: true, revision: 1 }));
});
test('resultados apenas em exames, com isolamento de paciente', () => {
  assert.throws(() => attachResult({ ...appointment, kind: 'consultation' }, { id: 'r1', name: 'Resultado', patientId: 'p1' }));
  for (const kind of ['exam']) {
    const a = { ...appointment, kind };
    assert.deepEqual(attachResult(a, { id: 'r1', name: 'Resultado', patientId: 'p1' }).resultIds, ['r1']);
    assert.throws(() => attachResult(a, { id: 'r2', name: 'Resultado', patientId: 'p2' }));
  }
});
