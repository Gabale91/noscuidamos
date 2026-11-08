import React, { useState } from 'react';
import { SafeAreaView, ScrollView, Text, TextInput, Pressable, StyleSheet } from 'react-native';

// Native starting screen. The full historical experience is preserved in prototypes/.
export default function App() {
  const [patients, setPatients] = useState([]);
  const [name, setName] = useState('');
  const [active, setActive] = useState(null);
  return <SafeAreaView style={s.page}><ScrollView contentContainerStyle={s.body}>
    <Text style={s.title}>Cuidado em Família</Text>
    <Text style={s.note}>Base de desenvolvimento • use dados fictícios. Dados desta tela ficam apenas na memória.</Text>
    <Text style={s.heading}>Pacientes</Text>
    {patients.map(p => <Pressable accessibilityRole="button" key={p.id} style={s.card} onPress={() => setActive(p.id)}>
      <Text>{p.name}{active === p.id ? ' • Selecionado' : ''}</Text>
    </Pressable>)}
    {!patients.length && <Text>Nenhum paciente cadastrado.</Text>}
    <TextInput accessibilityLabel="Nome fictício do paciente" placeholder="Nome fictício do paciente" value={name} onChangeText={setName} style={s.input}/>
    <Pressable accessibilityRole="button" style={s.button} onPress={() => {
      if (!name.trim()) return;
      const id = `${Date.now()}-${patients.length}`;
      setPatients([...patients, { id, name: name.trim() }]); setActive(id); setName('');
    }}><Text style={s.buttonText}>Adicionar paciente de demonstração</Text></Pressable>
    <Text style={s.heading}>Próximas etapas</Text>
    <Text>Agenda, medicamentos, documentos e familiares estão especificados na documentação. Esta tela inicial ainda não implementa esses módulos.</Text>
  </ScrollView></SafeAreaView>;
}
const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#f5fbf9' }, body: { padding: 24, gap: 16 },
  title: { fontSize: 28, fontWeight: '700', color: '#087b67' }, heading: { fontSize: 21, fontWeight: '600' },
  note: { color: '#52666a' }, card: { padding: 16, backgroundColor: '#e0f7f2', borderRadius: 12 },
  input: { borderWidth: 1, borderColor: '#98bcb4', padding: 14, borderRadius: 10 },
  button: { backgroundColor: '#087b67', padding: 16, borderRadius: 12 }, buttonText: { color: 'white', fontWeight: '600' }
});
