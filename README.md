# Cuidado em Família

Projeto local organizado em 05/11/2026 a partir da conversa “Criar regras do aplicativo médico”.

## Entrega e estado real

- `prototypes/cuidado-em-familia-teste-fluxo-corrigido.html`: protótipo recuperado de Downloads e atualizado conforme os ajustes registrados na especificação. Abra no navegador para testar com dados fictícios.
- `docs/regras-funcionais.md`: especificação consolidada, critérios de aceite e decisões propostas.
- `docs/arquitetura.md`: modelo de dados, serviços e sequência de desenvolvimento.
- `docs/proveniencia.md`: origem dos arquivos, integridade e limitações da recuperação.
- `App.js`, `app.json`, `package.json`: ponto de partida React Native/Expo para Android e iOS, com tela inicial de pacientes em memória. Não é a conversão completa do HTML.
- `src/domain.mjs`: regras isoladas para acompanhante, revisão de documentos e anexação de resultados; ainda sem integração à interface nativa ou a servidor.
- `tests/`: testes automatizados das regras centrais.

Foi acrescentado um servidor local de autenticação, cadastro e gestão da conta. Para testar o novo fluxo, abra `http://localhost:3000` enquanto `node server/auth.mjs` estiver em execução; consulte [Acesso e conta](docs/acesso-e-conta.md). O HTML direto permanece demonstração legada sem login. Não há API clínica completa, OCR de produção ou publicação nas lojas. A leitura compartilhada de metadados exige convite aceito; push externo ainda depende de configuração e integração móvel. Google e envio de e-mail dependem de configuração externa. Não há repositório remoto conectado ou envio verificado para GitHub.

Atualização: o [módulo de notificações](docs/modulo-notificacoes.md) acrescenta sino, histórico persistido, cópia de metadados de atendimento no servidor, convites de leitura e filas de push/lembretes. Não é uma API clínica completa; arquivos permanecem no navegador de origem. Push externo exige configuração e integração móvel, ainda sem envio real homologado.

## Desenvolvimento

Execute `npm test` para validar as regras, sem instalar bibliotecas.

Para desenvolver a interface nativa: `npm install`, `npx expo install --check`, `npm start`. Depois, use `npm run android` com ambiente Android configurado. O simulador iOS local requer macOS/Xcode; builds remotos precisam de serviço e credenciais próprios. A instalação de dependências e a execução em dispositivos ainda não foram verificadas nesta entrega; gerar e versionar o lockfile após instalação.

A base usa Expo SDK 54, React 19.1 e React Native 0.81, combinação documentada em https://expo.dev/changelog/sdk-54. É uma base explícita, não uma afirmação de que seja a versão mais recente. Validar atualização e requisitos das lojas antes de distribuição.

## Próxima implementação

1. Instalar e validar a base nos dois sistemas; definir identificadores e contas de distribuição.
2. Implementar servidor, login e permissões por paciente antes de usar dados reais.
3. Migrar telas e fluxos do HTML para componentes nativos, com testes de navegação.
4. Integrar armazenamento seguro, documentos e revisão humana transacional.
5. Implementar notificações, relatórios e direitos de privacidade; executar homologação e revisão de segurança.

Os detalhes e cenários de aceite estão na documentação. Inicialização de Git, commit e associação a remoto podem ser feitos quando o ambiente Git estiver configurado; nenhum commit ou push foi realizado.
