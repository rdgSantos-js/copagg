# Copa.gg

Estágio de desenvolvimento: API somente de leitura para Counter-Strike. O serviço sincroniza os dados da
PandaScore com o SQLite e atende às rotas locais sem fazer uma chamada à API externa
a cada solicitação do usuário.

## Modelo do banco de dados

Os dados das competições são armazenados de forma relacional, seguindo a hierarquia
da PandaScore: `leagues -> series -> tournaments -> matches -> games`. As equipes e
seus placares ficam nas tabelas `teams`, `match_teams` e `game_teams`. No Counter-Strike,
cada registro em `games` representa um mapa da partida. A tabela antiga
`csgo_live_matches` não é mais usada. A tabela `leagues` referencia `videogames`,
que identifica o e-sport de cada liga; os registros existentes são associados a
Counter-Strike durante a migração do banco.

## Configuração

Crie um arquivo `.env` na raiz do projeto:

```env
PANDASCORE_TOKEN=seu_token_pandascore
PORT=3000
```

Mantenha o `.env` privado; ele está excluído pelo `.gitignore`.

## Execução

```bash
npm run dev
```

O servidor carrega o cache de placares do SQLite e, em seguida, sincroniza:

- Partidas em andamento a cada 30 segundos.
- Próximas partidas a cada 5 minutos.
- Partidas passadas dos últimos 30 dias a cada hora.
- Videogames, ligas, séries e próximos torneios a cada 24 horas. O catálogo de
  videogames é sincronizado pelo endpoint público `/videogames` da PandaScore.

O banco SQLite fica no diretório `data/`, que é ignorado pelo Git. Falhas de
sincronização são registradas e não substituem os dados da última sincronização
bem-sucedida.

## Rota de placares ao vivo

```text
GET /api/csgo/live-scores
```

A resposta contém as partidas em andamento, o placar atual de cada equipe, o horário
da última atualização bem-sucedida e a propriedade `isStale`, que indica se os dados
estão desatualizados. Essa rota lê o cache local e não consulta a PandaScore.

O agendador solicita até 100 partidas por página. Uma página de partidas em andamento
a cada 30 segundos equivale a aproximadamente 120 chamadas à PandaScore por hora.
As páginas de próximas e partidas passadas, além da paginação dos catálogos, aumentam
esse total. Monitore os logs de requisições e mantenha margem para novas tentativas
dentro do limite por hora do plano Free.

## Rotas locais dos catálogos

Todas as rotas abaixo consultam somente o SQLite. Elas não acessam os endpoints
restritos de detalhes de partidas ou de jogos da PandaScore. Um detalhe ou jogo só
estará disponível se tiver vindo em uma resposta já sincronizada de um endpoint
disponível no plano Free.

| Rota | Descrição |
| --- | --- |
| `GET /api/csgo/leagues[?page=1&per_page=50&search=...]` | Lista as ligas sincronizadas |
| `GET /api/csgo/leagues/:id` | Consulta uma liga |
| `GET /api/csgo/leagues/:id/series` | Lista as séries de uma liga |
| `GET /api/csgo/leagues/:id/matches` | Lista partidas associadas a uma liga |
| `GET /api/csgo/series[?page=1&per_page=50&search=...]` | Lista as séries sincronizadas |
| `GET /api/csgo/series/:id` | Consulta uma série |
| `GET /api/csgo/series/:id/tournaments` | Lista os torneios de uma série |
| `GET /api/csgo/series/:id/matches` | Lista partidas associadas a uma série |
| `GET /api/csgo/tournaments` | Lista os torneios sincronizados |
| `GET /api/csgo/tournaments/upcoming` | Lista os próximos torneios |
| `GET /api/csgo/tournaments/:id` | Consulta um torneio |
| `GET /api/csgo/tournaments/:id/matches` | Lista partidas associadas a um torneio |
| `GET /api/csgo/matches?state=upcoming\|running\|past` | Lista partidas, opcionalmente por estado |
| `GET /api/csgo/matches/upcoming\|running\|past` | Lista partidas por estado |
| `GET /api/csgo/matches/:id` | Consulta uma partida sincronizada localmente |
| `GET /api/csgo/matches/:id/games` | Lista os jogos/mapas incluídos nos dados da partida |
| `GET /api/csgo/games/:id` | Consulta um jogo/mapa sincronizado localmente |
| `GET /api/csgo/live-scores` | Consulta os placares em andamento armazenados no cache |

As rotas de coleção aceitam `page` (ou `page[number]`) e `per_page` (ou
`page[size]`), com no máximo 100 itens por página. As listas de ligas, séries e
torneios também aceitam o parâmetro `search`, que pesquisa por nome ou slug. As
respostas das listas incluem `data` e `pagination`. As partidas passadas ficam
limitadas aos últimos 30 dias.

Rotas de séries, torneios, partidas, jogos/mapas e placares ao vivo aceitam
intervalos inclusivos para os campos de data-hora disponíveis em cada entidade.
Use timestamps ISO 8601 com fuso horário e informe os limites inicial e final:

```text
GET /api/csgo/matches?range[begin_at]=2026-11-27T00:00:00Z,2026-11-30T23:59:59Z
```

Também é possível ordenar por um campo de data-hora com `sort=campo` (crescente)
ou `sort=-campo` (decrescente). Por exemplo, `sort=-begin_at` mostra primeiro as
partidas mais recentes. Séries e torneios aceitam `begin_at` e `end_at`; partidas
aceitam `begin_at`, `expected_begin_at` e `end_at`; jogos/mapas aceitam `begin_at`
e `end_at`. Esses parâmetros podem ser combinados com paginação e filtros de estado.

## Registros de erros

Erros HTTP, de rede, timeout e respostas inválidas da PandaScore são armazenados na
tabela SQLite `api_error_logs`. Os registros incluem endpoint, página, categoria,
status HTTP, código de erro seguro e mensagem sanitizada. Tokens, cabeçalhos de
requisição e corpos de resposta não são armazenados. Os registros com mais de 30 dias
são removidos na inicialização e quando um novo erro é registrado. Se o SQLite não
conseguir salvar um erro, a falha é informada no log do servidor e o erro original da
sincronização é preservado.

## Registros de requisições

Todas as requisições enviadas pelo cliente Axios compartilhado da PandaScore são
registradas na tabela SQLite `api_request_logs`, incluindo as que tiveram sucesso e
as que falharam. Os registros contêm horários, método, endpoint, página, status HTTP,
duração, resultado e um código de erro seguro. Credenciais, cabeçalhos e corpos de
requisição ou resposta não são armazenados. Os registros com mais de 30 dias são
removidos na inicialização e durante o registro das requisições.

## Testes

Por padrão, os testes usam dados locais e mocks; não fazem chamadas à PandaScore.

```bash
npm test
```

Para executar também um teste de integração com a API real, defina
`PANDASCORE_USE_REAL_API=true` no `.env` e execute `npm test` novamente. O teste
precisa de `PANDASCORE_TOKEN` e faz uma única requisição autenticada e somente de
leitura, solicitando no máximo uma partida de Counter-Strike em andamento. Essa
requisição consome uma chamada da API. Remova a opção ou defina-a como `false` para
desativar o teste real.
