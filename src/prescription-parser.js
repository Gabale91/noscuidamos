// Extract only explicit prescription text. Never calculate doses or invent schedules.
function extractPrescriptionFields(raw) {
  const blank = () => ({ name:'', strength:'', amount:'', route:'', frequency:'', schedule:'', start:'', continuous:'' });
  const lines = raw.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
  const items = [];
  let current = null;
  const normalize = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const labels = { medicamento:'name', nome:'name', concentracao:'strength', quantidade:'amount', 'quantidade por administracao':'amount', via:'route', 'via de administracao':'route', frequencia:'frequency', horario:'schedule', horarios:'schedule', 'horarios ou periodos':'schedule', inicio:'start', 'data de inicio':'start', 'uso continuo':'continuous' };
  for (const line of lines) {
    const normalized = normalize(line);
    if (/^(receita|prescricao|paciente|nome do paciente|medico|prescritor|dr\b|dra\b|crm|cpf|rg\b|endereco|telefone|contato|clinica|hospital|assinatura|data\s*:)/.test(normalized)) continue;
    const labeled = line.match(/^([^:]+):\s*(.*)$/);
    const key = labeled && labels[normalize(labeled[1].trim())];
    if (key) {
      if (key === 'name') { current = blank(); items.push(current); }
      if (!current) continue;
      let value = labeled[2].trim();
      if (key === 'start') {
        const date = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
        if (date) value = `${date[3]}-${date[2]}-${date[1]}`;
        if (!validCalendarDate(value)) value = '';
      }
      if (key === 'continuous') value = /^sim$/i.test(value) ? 'Sim' : /^n[aã]o$/i.test(value) ? 'Não' : '';
      current[key] = value;
      continue;
    }
    // A drug header must contain an explicit strength; unrelated lines are ignored.
    const header = line.match(/^(?:\d+[.)-]\s*)?([\p{L}][\p{L}\d\s()+.-]*?)\s+(\d+(?:[.,]\d+)?\s*(?:mg|mcg|µg|g|ml|UI)(?:\s*\/\s*\d*\s*(?:ml|g))?)(?:\s*[-–—].*)?$/iu);
    if (header) { current = blank(); current.name = header[1].trim(); current.strength = header[2].trim(); items.push(current); continue; }
    if (!current) continue;
    const amount = line.match(/(?:tomar|usar|administrar|aplicar)\s+(\d+(?:[.,]\d+)?\s*(?:comprimidos?|c[aá]psulas?|gotas?|ml|doses?|sach[eê]s?))/i);
    if (amount && !current.amount) current.amount = amount[1];
    const route = line.match(/\b(?:via\s+(?:oral|sublingual|intravenosa|intramuscular|subcut[aâ]nea|t[oó]pica)|uso\s+(?:oral|t[oó]pico)|VO|SL)\b/i);
    if (route && !current.route) current.route = route[0];
    const frequency = line.match(/\b(?:de\s+\d+\s+em\s+\d+\s*horas?|a cada\s+\d+\s*horas?|\d+\s*\/\s*\d+\s*h|\d+\s*(?:x|vezes?)\s*(?:ao|por)?\s*dia|uma vez ao dia)\b/i);
    if (frequency && !current.frequency) current.frequency = frequency[0];
    const times = line.match(/\b\d{1,2}:\d{2}\b/g);
    const periods = line.match(/(?<![\p{L}])(?:manh[ãa]|tarde|noite|ao deitar|em jejum)(?![\p{L}])/giu);
    if (!current.schedule && (times || periods)) current.schedule = (times || periods).join(', ');
    if (/\buso cont[ií]nuo\b/i.test(line)) current.continuous = 'Sim';
  }
  return items.length ? items : [blank()];
}
