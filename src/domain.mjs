// Pure domain rules. Production authorization and audit must run on the server.
export function preserveAppointment(draft, companion) {
  if (!companion.id || !companion.patientId || companion.patientId !== draft.patientId) {
    throw new Error('Acompanhante não pertence ao paciente.');
  }
  return { ...draft, companionId: companion.id };
}

export function validateAppointment(draft) {
  if (!draft.patientId || !['consultation', 'exam'].includes(draft.kind) ||
      !draft.title?.trim() || !draft.startsAt || !Number.isFinite(Date.parse(draft.startsAt)) ||
      !draft.location?.trim()) throw new Error('Preencha paciente, tipo, título, data, horário e local.');
  return { ...draft, companionId: draft.companionId || null };
}

export function confirmImport(draft, review) {
  if (draft.status !== 'pending_review' || !review?.actorId || review.confirmed !== true ||
      review.revision !== draft.revision || !draft.items?.length) {
    throw new Error('Revisão humana explícita da versão atual é obrigatória.');
  }
  if (!['prescription', 'exam_order'].includes(draft.kind)) throw new Error('Tipo inválido.');
  const items = draft.items.map(item => {
    if (item.patientId !== draft.patientId) throw new Error('Paciente divergente.');
    if (draft.kind === 'exam_order') return validateAppointment({ ...item, kind: 'exam' });
    if (!item.name?.trim() || !item.dosage?.trim()) throw new Error('Revise medicamento e posologia prescrita.');
    return { ...item };
  });
  return { ...draft, items, status: 'confirmed', reviewedBy: review.actorId };
}

export function attachResult(appointment, attachment) {
  if (appointment.kind !== 'exam' ||
      attachment.patientId !== appointment.patientId || !attachment.id || !attachment.name?.trim()) {
    throw new Error('Resultado inválido ou paciente divergente.');
  }
  return { ...appointment, resultIds: [...new Set([...(appointment.resultIds || []), attachment.id])] };
}
