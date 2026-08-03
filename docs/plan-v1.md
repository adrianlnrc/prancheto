# Prancheto — Plano v1

## Objetivo

Web app pra organizar pelada/racha de futebol: lista de presença por ordem de chegada e formação automática de times, usada ao vivo, na quadra, pelo celular.

Não é uma prancheta tática (sem desenho de jogadas/formações).

## Modelo de acesso

- **Sem login.** Cada grupo (pelada) tem um link fixo e permanente, gerado ao criar o grupo (botão "criar pelada" na home).
- **Sem papéis.** Qualquer pessoa com o link pode fazer qualquer ação — adicionar nome, sortear, declarar vencedor, editar/remover nomes. Não existe distinção organizador vs jogador.
- **Identificação por nome livre.** Ao abrir o link, a pessoa digita o nome (sem senha); fica salvo no dispositivo pra próxima visita.
- **Plataforma:** web app / PWA. Sem app nativo na v1.
- **Sincronização em tempo real:** mudanças de uma pessoa aparecem na hora pra todo mundo com o link aberto (tipo Google Docs).

## Ciclo de vida: grupo → rodada

Um **grupo** é permanente (uma pelada recorrente, ex: "Pelada de quinta"). Dentro dele, cada dia de jogo é uma **rodada**.

1. Alguém aperta **"iniciar rodada"** e define o **tamanho do time** (ex: 6 jogadores por time). Não se define número de times — isso é dinâmico, a fila cria quantos times forem necessários.
2. Nomes entram na lista **por ordem de chegada**.
3. Quando uma leva de nomes fecha o tamanho de time definido, o app faz um **sorteio aleatório dentro dessa leva**, distribuindo os nomes entre os times daquela leva.
   - Antes de sortear, é possível **fixar manualmente até 1 jogador por time** dentro da leva (ex: separar 2 craques em times diferentes). O resto da leva é sorteado normalmente.
4. Quem sobra da leva (não fechou um time inteiro ainda) fica acumulando pra próxima leva, sorteada quando completar.
5. **Uma quadra, uma fila.** Sem suporte a múltiplas quadras simultâneas na v1.
6. Os dois primeiros times formados jogam a partida. Resultado é registrado com um botão simples: **"Time X venceu"** (sem placar de gols).
   - **Vencedor fica, perdedor vai pro fim da fila.**
   - Sem limite de vitórias seguidas na v1.
   - O próximo time da fila entra pra desafiar o vencedor.
7. **Nomes podem ser removidos/editados a qualquer momento**, mesmo depois do sorteio — a fila se reajusta se necessário.

## Persistência

- **Sem estatísticas agregadas por jogador** na v1 (sem contagem de vitórias/jogos ao longo do tempo).
- **Histórico de rodadas:** cada rodada finalizada fica salva como registro simples (quem jogou, times formados, resultados das partidas) — só pra consulta, não vira placar geral.

## Visual (v1)

Lista simples e direta: colunas de texto com os nomes por time e a fila, sem tema gráfico de campo/prancheta. Prioriza velocidade de leitura na correria da quadra sobre estética.

## Fora de escopo (v1)

- Login/autenticação e papéis de permissão.
- Estatísticas/histórico agregado por jogador.
- Múltiplas quadras simultâneas por rodada.
- Limite de vitórias seguidas.
- App nativo.
- Divisão de custo/pagamento da quadra.
- Prancheta tática (desenho de jogadas/formações).

## Modelo de dados conceitual

```
Grupo
├── id (link/slug único)
├── nome
└── Rodadas[]
     ├── id
     ├── tamanho_do_time
     ├── status (aberta | encerrada)
     ├── Fila_de_chegada[] (nomes ainda não sorteados)
     ├── Times[]
     │    ├── jogadores[] (nomes, com flag opcional "fixado")
     │    └── status (aguardando | jogando | eliminado)
     └── Partidas[] (histórico)
          ├── time_a, time_b
          └── vencedor
```

## Perguntas em aberto pra v2 (não bloqueiam v1)

- Regra de limite de vitórias seguidas.
- Estatísticas agregadas por jogador entre rodadas.
- Suporte a múltiplas quadras.
- Divisão de custo da quadra entre os confirmados.
