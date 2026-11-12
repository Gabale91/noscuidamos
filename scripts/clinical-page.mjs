// Compile the existing web templates into event bindings for the PHP build.
// Handler expressions are read only from source files and never evaluated at runtime.
export function compileClinicalHandlers(source) {
    const actions = new Set();
    const replacements = new Map([
        ["$('prep').style.display=this.value==='Sim'?'block':'none'", 'ncShowPreparation(this.value)'],
        ["document.getElementById('treatmentDialog').close();document.getElementById('treatmentDialog').remove()", 'ncCloseTreatment()'],
        ["if(confirm('Restaurar os dados fictícios?')){db=JSON.parse(JSON.stringify(initial));formDrafts={};companionReturn=null;save();go('home')}", 'ncResetDemo()'],
    ]);
    const compiled = source
        .replace('[onclick="sendFamilyEmailInvite(this.form)"]', '[data-nc-click="sendFamilyEmailInvite"]')
        .replace(/\bon(click|submit|change|input)="([^"]+)"/g, (_, event, raw) => {
            const handler = replacements.get(raw) ?? raw.replace(/^tab=('.*');render\(\)$/, 'ncSetTab($1)');
            const call = /^([A-Za-z_$][\w$]*)\((.*)\)$/.exec(handler);
            if (!call) throw new Error('Ação clínica requer adaptação explícita.');
            const [, name, args] = call;
            actions.add(name);
            const fields = [];
            const types = args ? args.split(',').map((argument, index) => {
                if (argument === 'event') return 'event';
                if (argument === 'this') return 'element';
                if (argument === 'this.value') return 'value';
                if (argument === 'this.form') return 'form';
                const literal = /^'([^']*)'$/.exec(argument);
                const value = literal ? literal[1] : argument;
                const interpolation = /^\$\{(.+)\}$/.exec(value);
                if (interpolation) {
                    const expression = interpolation[1].replace(/^esc\((.*)\)$/, '$1');
                    fields.push('data-nc-arg'+index+'="${esc(String('+expression+'))}"');
                } else if (literal && /^[\p{L}\p{N}_ -]+$/u.test(value)) {
                    fields.push('data-nc-arg'+index+'="'+value+'"');
                } else {
                    throw new Error('Argumento de ação clínica requer adaptação explícita.');
                }
                return literal ? 'string' : 'number';
            }) : [];
            return ['data-nc-'+event+'="'+name+'"', 'data-nc-types="'+types.join(',')+'"', ...fields].join(' ');
        });
    return {compiled, actions};
}

export function clinicalEventCode(actions) {
    return `
function ncSetTab(value) { tab = value; render(); }
function ncShowPreparation(value) { $('prep').style.display = value === 'Sim' ? 'block' : 'none'; }
function ncCloseTreatment() {
    const dialog = document.getElementById('treatmentDialog');
    dialog.close();
    dialog.remove();
}
function ncResetDemo() {
    if (!confirm('Restaurar os dados fictícios?')) return;
    db = JSON.parse(JSON.stringify(initial));
    formDrafts = {};
    companionReturn = null;
    save();
    go('home');
}
const ncActions = new Set(${JSON.stringify([...actions].sort())});
for (const eventName of ['click','submit','change','input']) {
    const attribute = 'data-nc-' + eventName;
    document.addEventListener(eventName, event => {
        const element = event.target.closest?.('[' + attribute + ']');
        if (!element || (!document.getElementById('root').contains(element) && !element.closest('dialog'))) return;
        const name = element.getAttribute(attribute);
        if (!ncActions.has(name) || typeof window[name] !== 'function') return;
        if (eventName === 'submit') event.preventDefault();
        const types = element.dataset.ncTypes ? element.dataset.ncTypes.split(',') : [];
        const args = types.map((type, index) => {
            const value = element.getAttribute('data-nc-arg' + index);
            if (type === 'event') return event;
            if (type === 'element') return element;
            if (type === 'value') return element.value;
            if (type === 'form') return element.form;
            return type === 'number' ? Number(value) : value;
        });
        window[name](...args);
    });
}
`;
}
