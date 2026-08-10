# Dashboard de Criativos

Painel estático para acompanhar o planejamento de criativos por cliente (social media): status de produção, alertas de antecedência e calendário do mês.

O site em si é 100% HTML/CSS/JS puro (sem Node.js, sem build, sem servidor próprio) e pode ser hospedado no GitHub Pages normalmente. Os dados (clientes e criativos) ficam guardados no Supabase, um banco de dados na nuvem — por isso qualquer edição feita no painel fica salva e visível para todo mundo que abrir o link, em qualquer computador.

## Estrutura

```
/
├── index.html              (pagina principal — abrir este arquivo)
├── css/
│   └── style.css            (todo o visual do painel)
├── js/
│   ├── supabase.min.js       (biblioteca do Supabase, incluída localmente)
│   ├── supabase-config.js    (endereço e chave pública de conexão com o Supabase)
│   └── script.js             (logica do painel: calendario, prioridade, filtros, edicao)
├── assets/                   (reservado para imagens/icones, se forem adicionados no futuro)
└── README.md
```

## Como abrir localmente

Basta dar duplo clique em `index.html`. Não precisa de servidor, instalação ou build — só precisa de internet (para conversar com o Supabase).

## Como publicar no GitHub Pages

1. Crie um repositório novo no GitHub e envie todos estes arquivos para a raiz dele (mantendo a estrutura de pastas acima).
2. No repositório, vá em **Settings → Pages**.
3. Em **Source**, selecione a branch `main` (ou `master`) e a pasta `/ (root)`.
4. Salve. Em alguns minutos o painel estará disponível em `https://SEU-USUARIO.github.io/NOME-DO-REPOSITORIO/`.

Não é necessário nenhum passo de build, configuração de domínio ou instalação de dependências — o GitHub Pages serve os arquivos como estão.

## Como os dados funcionam agora (Supabase)

O painel busca os clientes e os criativos direto do Supabase quando a página abre, e qualquer alteração feita na tela grava a mudança lá na hora — não precisa mais editar arquivo nem reenviar nada. Se duas pessoas estiverem com o painel aberto ao mesmo tempo em computadores diferentes, a alteração feita por uma aparece automaticamente na tela da outra (sincronização em tempo real).

Direto pelo painel dá para:

- **Avançar o status** de um conteúdo: clique no item (a produzir → produzido → agendado → publicado).
- **Cadastrar um cliente novo**: botão "+ Novo cliente" no topo — informe o nome e as datas de publicação; a cota do ciclo é calculada automaticamente pelo número de datas.
- **Adicionar uma nova data de publicação** a um cliente já existente: no fim do card do cliente, escolha a data e clique em "+ Adicionar data" (a cota do cliente sobe automaticamente em 1).
- **Editar a cota** de um cliente: clique em "editar cota", ao lado do número de conteúdos do card.

Não é possível ainda, pelo painel: remover um cliente, remover uma data específica, ou renomear um cliente. Para isso, é só avisar — é feito direto no banco de dados.

O botão **Exportar dados** continua disponível, para quem quiser baixar um retrato (JSON) do estado atual — é só um extra para backup/consulta, não é mais necessário para salvar as edições.

## Importante: sobre acesso e segurança

Este painel não tem tela de login — qualquer pessoa que tiver o link e souber onde encontrar a chave pública do Supabase (visível no arquivo `js/supabase-config.js`) consegue ver e editar os dados. Isso é intencional, para manter o painel simples de usar pela equipe. Se no futuro fizer sentido restringir quem pode editar (por exemplo, exigir um login simples), dá para adicionar depois sem precisar refazer o painel — é só avisar.
