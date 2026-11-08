const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync('prototypes/cuidado-em-familia-teste-fluxo-corrigido.html', 'utf8');
function context() {
  const ctx = vm.createContext({ localStorage: { getItem: () => null }, FormData: class { constructor(form) { this.form = form; } get(k) { return this.form[k]; } getAll(k) { return this.form[k] || []; } } });
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1].replace(/render\(\);\s*$/, '');
  vm.runInContext(script, ctx);
  vm.runInContext("toast=()=>{};go=()=>{};db.appointments=[{id:1,type:'Consulta',status:'Realizado',name:'Teste',companion:'Ana'}];selected=1;", ctx);
  return ctx;
}
test('consulta não oferece resultados e acompanhante realizado é protegido', () => {
  const ctx = context();
  assert.equal(vm.runInContext("detail().includes('Anexar resultado')", ctx), false);
  assert.equal(vm.runInContext("detail().includes('Substituir acompanhante')", ctx), false);
  vm.runInContext('changeCompanion(1)',ctx);
  assert.equal(vm.runInContext('db.appointments[0].companion',ctx),'Ana');
  assert.match(vm.runInContext('addResult()',ctx), /apenas para exames/);
});
test('pós-atendimento tem texto livre e anexos de receita e pedido somente na consulta', () => {
  const ctx = context();
  const form = vm.runInContext('postAttendance()',ctx);
  assert.match(form, /<textarea/);
  assert.doesNotMatch(form, /minlength|required/);
  assert.match(form, /prescriptionFiles/);
  assert.match(form, /examOrderFiles/);
  vm.runInContext("db.appointments[0].type='Exame'",ctx);
  assert.doesNotMatch(vm.runInContext('postAttendance()',ctx), /prescriptionFiles/);
});
test('salva texto vazio ou curto e preserva documentos e acompanhante', async () => {
  const ctx = context();
  // Supply localStorage persistence without a browser.
  ctx.localStorage.setItem = () => {};
  for (const text of ['', 'a']) {
    ctx.form = { postNotes: text, querySelector: () => ({ disabled: false }) };
    await vm.runInContext('savePost({preventDefault(){},target:form})',ctx);
    assert.equal(vm.runInContext('db.appointments[0].postNotes',ctx),text);
    assert.equal(vm.runInContext('db.appointments[0].companion',ctx),'Ana');
  }
});
test('exame oferece preparo sem observações pré-atendimento; consulta mantém observações', () => {
  const ctx = context();
  vm.runInContext("kind='Exame';db.appointments[0].type='Exame'", ctx);
  const exam = vm.runInContext('newAppointment()', ctx);
  assert.match(exam, /Instruções de preparo/);
  assert.doesNotMatch(exam, /Observações pré-atendimento|name="notes"/);
  assert.doesNotMatch(vm.runInContext('detail()', ctx), /Observações pré-atendimento/);
  vm.runInContext("kind='Consulta';db.appointments[0].type='Consulta'", ctx);
  assert.match(vm.runInContext('newAppointment()', ctx), /name="notes"/);
  assert.match(vm.runInContext('detail()', ctx), /Observações pré-atendimento/);
});
test('conflitos por paciente e acompanhante entre pacientes, sem contar cancelados', () => {
  const ctx = context();
  vm.runInContext("db.activePatientId='p1';db.appointments=[{id:1,date:'2026-12-01',time:'07:00',companion:'Ana',status:'Agendado'}];db.records={p1:{appointments:[]},p2:{appointments:[{id:2,date:'2026-12-02',time:'08:00',companion:' Dióana ',status:'Agendado'}]}}",ctx);
  assert.match(vm.runInContext("appointmentConflict({date:'2026-12-01',time:'07:00',companion:''})",ctx),/paciente já/);
  assert.match(vm.runInContext("appointmentConflict({date:'2026-12-02',time:'08:00',companion:'dioana'})",ctx),/acompanhante já/);
  assert.equal(vm.runInContext("appointmentConflict({date:'2026-12-02',time:'08:00',companion:''})",ctx),'');
  assert.equal(vm.runInContext("appointmentConflict({date:'2026-12-02',time:'08:00',companion:'Maria'})",ctx),'');
  assert.equal(vm.runInContext("appointmentConflict({date:'2026-12-01',time:'07:00',companion:'Ana'},1)",ctx),'');
  vm.runInContext("db.records.p2.appointments[0].status='Cancelado'",ctx);
  assert.equal(vm.runInContext("appointmentConflict({date:'2026-12-02',time:'08:00',companion:'Dioana'})",ctx),'');
  assert.match(vm.runInContext("appointmentConflict({date:'2026-12-03',time:'08:00'},null,[{date:'2026-12-03',time:'08:00'}])",ctx),/exames deste pedido/);
});
test('datas recusam anos longos e dias inexistentes, aceitando ano bissexto', () => {
  const ctx = context();
  for (const date of ['662026-11-06', '12026-11-06', '0000-01-01', '2026-02-29', '2026-04-31']) {
    ctx.date = date;
    assert.equal(vm.runInContext('validCalendarDate(date)',ctx), false);
  }
  for (const date of ['2026-11-06', '2028-02-29', '9999-12-31']) {
    ctx.date = date;
    assert.equal(vm.runInContext('validCalendarDate(date)',ctx), true);
  }
  assert.match(vm.runInContext("field('Data','start',true,'date')",ctx), /max="9999-12-31"/);
});
test('receita extrai campos explícitos por medicamento e ignora identificação', () => {
  const ctx = context();
  ctx.raw = 'Receita médica\nPaciente: Maria\nMédico: Dr. Exemplo\nCRM: 12345\nLosartana 50 mg\nTomar 1 comprimido via oral 2x ao dia pela manhã e noite\nData de início: 06/11/2026\nUso contínuo: Sim\nOutro medicamento 10 mg\nQuantidade: 2 comprimidos\nHorários: 08:00\nEndereço: Rua Exemplo';
  const items = JSON.parse(vm.runInContext('JSON.stringify(extractPrescriptionFields(raw))',ctx));
  assert.equal(items.length,2);
  assert.equal(items[0].name,'Losartana');
  assert.equal(items[0].strength,'50 mg');
  assert.equal(items[0].amount,'1 comprimido');
  assert.equal(items[0].route,'via oral');
  assert.equal(items[0].frequency,'2x ao dia');
  assert.equal(items[0].schedule,'manhã, noite');
  assert.equal(items[0].start,'2026-11-06');
  assert.equal(items[1].amount,'2 comprimidos');
  assert.equal(items[1].schedule,'08:00');
  vm.runInContext("importDraft={mode:'prescription',raw:'Documento',items:extractPrescriptionFields(raw)}",ctx);
  const form=vm.runInContext('reviewImport()',ctx);
  assert.match(form,/value="1 comprimido"/);
  assert.match(form,/onclick="cancelImport\(\)"/);
  vm.runInContext("formDrafts.reviewImport={name_0:'Teste'};cancelImport()",ctx);
  assert.equal(vm.runInContext('importDraft',ctx),null);
  assert.equal(vm.runInContext('db.meds.length',ctx),0);
});
test('medicamentos suspensos são somente leitura', () => {
  const ctx = context();
  vm.runInContext("db.meds=[{id:1,name:'Exemplo',amount:'1 comprimido',status:'Suspenso'}];selected=1",ctx);
  assert.doesNotMatch(vm.runInContext('medDetail()',ctx), /Alterar posologia/);
  vm.runInContext('editMed(1)',ctx);
  assert.equal(vm.runInContext('db.meds[0].amount',ctx),'1 comprimido');
  assert.equal(vm.runInContext('db.history.length',ctx),0);
  vm.runInContext("db.meds[0].status='Em uso'",ctx);
  assert.match(vm.runInContext('medDetail()',ctx), /Alterar posologia/);
});
test('relatório contém somente observações pós-consultas realizadas do paciente ativo', () => {
  const ctx = context();
  vm.runInContext("db.patient='Paciente teste';db.appointments=[{id:1,type:'Consulta',status:'Realizado',date:'2026-11-01',name:'Clínica',postNotes:'Primeira observação'}, {id:2,type:'Consulta',status:'Realizado',date:'2026-11-02',name:'Retorno',postNotes:'Texto <seguro>\\nSegunda linha'}, {id:3,type:'Exame',status:'Realizado',postNotes:'Não incluir exame'}, {id:4,type:'Consulta',status:'Agendado',postNotes:'Não incluir agendada'}, {id:5,type:'Consulta',status:'Realizado',postNotes:'  '}]",ctx);
  assert.equal(vm.runInContext('postConsultationRecords().length',ctx),2);
  assert.equal(vm.runInContext('postConsultationRecords()[0].id',ctx),2);
  const report=vm.runInContext('reports()',ctx);
  assert.match(report,/Texto &lt;seguro&gt;/);
  assert.match(report,/Primeira observação/);
  assert.doesNotMatch(report,/Não incluir/);
  vm.runInContext('db.appointments=[]',ctx);
  assert.match(vm.runInContext('reports()',ctx),/Nenhuma observação pós-consulta/);
});
test('reagendamento preserva dados, registra histórico e bloqueia realizado ou conflito', () => {
  const ctx = context();
  ctx.localStorage.setItem=()=>{};
  vm.runInContext("db.activePatientId='p1';db.appointments=[{id:1,type:'Exame',status:'Agendado',name:'Exame teste',date:'2026-12-01',time:'07:00',companion:'Ana',location:'Local',prep:'Preparo'}];validateFormDates=()=>true",ctx);
  ctx.form={reportValidity:()=>true,elements:{date:{value:'2026-12-02'},time:{value:'08:00'}}};
  vm.runInContext('saveReschedule({preventDefault(){},target:form},1)',ctx);
  assert.equal(vm.runInContext('db.appointments[0].date',ctx),'2026-12-02');
  assert.equal(vm.runInContext('db.appointments[0].prep',ctx),'Preparo');
  assert.equal(vm.runInContext('db.appointments[0].companion',ctx),'Ana');
  assert.equal(vm.runInContext('db.history.length',ctx),1);
  vm.runInContext("db.appointments[0].status='Realizado'",ctx);
  ctx.form.elements.date.value='2026-12-03';
  vm.runInContext('saveReschedule({preventDefault(){},target:form},1)',ctx);
  assert.equal(vm.runInContext('db.appointments[0].date',ctx),'2026-12-02');
  assert.doesNotMatch(vm.runInContext('detail()',ctx), />Reagendar</);
  vm.runInContext("db.appointments[0].status='Agendado';db.appointments.push({id:2,date:'2026-12-03',time:'08:00',status:'Agendado'});showConflict=()=>{}",ctx);
  vm.runInContext('saveReschedule({preventDefault(){},target:form},1)',ctx);
  assert.equal(vm.runInContext('db.appointments[0].date',ctx),'2026-12-02');
});
test('pedido de exames ignora clínica e identificação, separa itens e preenche só dados explícitos', () => {
  const ctx=context();
  ctx.raw='Clínica «, (41) 3333-0000\nPaciente: Exemplo\nData: 05/11/2026\nSolicito os seguintes exames:\n1) Hemograma completo\nData do exame: 01/12/2026\nHorário: 07:00\nLocal: Unidade de coleta\nPreparo: Conforme orientação do pedido\n2) Glicemia\nDRA. EXEMPLO\nCRM: 000000';
  const items=JSON.parse(vm.runInContext('JSON.stringify(extractExamFields(raw))',ctx));
  assert.equal(items.length,2);
  assert.equal(items[0].name,'Hemograma completo');
  assert.equal(items[0].date,'2026-12-01');
  assert.equal(items[0].time,'07:00');
  assert.equal(items[0].location,'Unidade de coleta');
  assert.equal(items[1].name,'Glicemia');
  assert.equal(items[1].date,'');
  assert.equal(items[1].companion,'');
  vm.runInContext("importDraft={mode:'exam',raw,items:extractExamFields(raw)}",ctx);
  assert.match(vm.runInContext('reviewImport()',ctx),/value="2026-12-01"/);
  ctx.raw='Clínica (41) 3333-0000\nPaciente: Maria\nCRM: 1234';
  assert.equal(vm.runInContext('extractExamFields(raw)[0].name',ctx),'');
});
test('cancelar novo agendamento descarta apenas o rascunho sem criar registros', () => {
  const ctx=context();
  vm.runInContext("formDrafts.appointment={name:'Rascunho'};kind='Exame';companionReturn='appointment';discardAppointment()",ctx);
  assert.equal(vm.runInContext('formDrafts.appointment',ctx),undefined);
  assert.equal(vm.runInContext('companionReturn',ctx),null);
  assert.equal(vm.runInContext('db.appointments.length',ctx),1);
  assert.match(vm.runInContext('newAppointment()',ctx),/onclick="discardAppointment\(\)">Cancelar/);
});
test('novo agendamento limpa rascunho antigo e retorno do acompanhante preserva campos', () => {
  const ctx = context();
  // Recover the real navigation function, since context() stubs it for isolated tests.
  const goSource = html.match(/function go\(p,id,resumeAppointment=false\)\{[^\n]+/)[0];
  vm.runInContext(goSource, ctx);
  vm.runInContext("render=()=>{};window={scrollTo(){}};formDrafts.appointment={name:'Ortopedista',companion:'Ana'};kind='Exame';go('newAppointment')", ctx);
  assert.equal(vm.runInContext('formDrafts.appointment', ctx), undefined);
  assert.equal(vm.runInContext('kind', ctx), 'Consulta');
  vm.runInContext("formDrafts.appointment={name:'Cardiologista',companion:'Maria'};go('newAppointment',undefined,true)", ctx);
  assert.equal(vm.runInContext('formDrafts.appointment.name', ctx), 'Cardiologista');
  assert.equal(vm.runInContext('formDrafts.appointment.companion', ctx), 'Maria');
  vm.runInContext("go('agenda');go('newAppointment')", ctx);
  assert.equal(vm.runInContext('formDrafts.appointment', ctx), undefined);
});
