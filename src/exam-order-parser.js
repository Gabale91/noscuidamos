// Conservative text extraction: unknown text stays available for manual review.
function extractExamFields(raw) {
  const blank = () => ({name:'',date:'',time:'',location:'',companion:'',prep:''});
  const normalized = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const items=[];let current=null,inSection=false;
  for(const original of raw.split(/\r?\n/)){
    let line=original.trim();if(!line)continue;
    let text=normalized(line);
    const field=line.match(/^(data do exame|data do agendamento|hor[aá]rio(?: do exame)?|local(?: do exame| do agendamento)?|preparo|prepara[cç][aã]o|instru[cç][oõ]es de preparo)\s*:\s*(.+)$/i);
    if(field){
      if(!current)continue;
      const label=normalized(field[1]),value=field[2].trim();
      if(label.startsWith('data')){const parts=value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);const date=parts?`${parts[3]}-${parts[2]}-${parts[1]}`:value;if(validCalendarDate(date))current.date=date;}
      else if(label.startsWith('horario')){if(/^([01]\d|2[0-3]):[0-5]\d$/.test(value))current.time=value;}
      else if(label.startsWith('local'))current.location=value;
      else current.prep=value;
      continue;
    }
    if(/^(paciente|nome do paciente|nome\s*:|clinica|hospital|laboratorio|centro medico|medic[oa]|dr[.\s]|dra[.\s]|crm|cnpj|cpf|rg\b|telefone|tel\b|contato|endereco|rua\b|avenida|av\.|cep|email|e-mail|data\b|cidade|assinatura|documento ficticio|convenio)/.test(text))continue;
    if(/^(indicacao|justificativa|hipotese|diagnostico|observacoes)\b/.test(text)){inSection=false;continue;}
    const section=line.match(/^(?:solicito(?:\s+os)?|solicita[cç][aã]o(?: de exames)?|pedido(?: de exames)?|exames(?: solicitados)?)\s*:?\s*(.*)$/i);
    if(section){inSection=true;line=section[1].replace(/^(?:os seguintes exames|seguintes exames|exames|os seguintes)\s*:?\s*/i,'').trim();if(!line)continue;}
    const numbered=/^(?:\d+[.)-]|[-•–])\s*/.test(line);
    const explicit=/^exame\s*:/i.test(line);
    line=line.replace(/^(?:\d+[.)-]|[-•–])\s*/,'').replace(/^exame\s*:\s*/i,'').trim();
    text=normalized(line);
    // Do not turn phone numbers, dates, addresses or signature debris into exams.
    if(!line||!/[\p{L}]/u.test(line)||/\(?\d{2}\)?\s*\d{4,5}[-\s]\d{4}|\d{2}\/\d{2}\/\d{4}|@/.test(line))continue;
    if(/^(clinica|telefone|tel\b|crm|paciente|dr\b|dra\b|assinatura)/.test(text))continue;
    if(!(numbered||explicit||inSection))continue;
    for(const name of line.split(/\s*;\s*/).filter(Boolean)){
      if(name.length>160)continue;
      current={...blank(),name};items.push(current);
    }
  }
  return items.length?items:[blank()];
}
