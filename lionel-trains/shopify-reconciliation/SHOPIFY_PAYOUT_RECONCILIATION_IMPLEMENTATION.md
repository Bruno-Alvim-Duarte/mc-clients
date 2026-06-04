# Shopify Payout Reconciliation

## Objetivo

Implementar na Gravity um workflow recorrente que lê Shopify Payouts e cria `Journal Entries` no NetSuite para reconciliar:

- valor líquido do payout
- fees do Shopify Payments
- baixa da conta de clearing do Shopify

O workflow deve ser determinístico, idempotente e orientado a reconciliação contábil.

## Escopo

Este documento cobre o workflow:

- `Shopify Payout Reconciliation`

Este workflow:

- lê payouts da Shopify
- normaliza os dados em `map steps`
- calcula os valores contábeis
- monta o payload do `Journal Entry`
- cria o `Journal Entry` no NetSuite
- evita duplicidade
- registra sucesso e falha

Este workflow não precisa reconciliar pedidos individualmente dentro do payout. A lógica confirmada é agregada por payout.

## Contexto de Negócio

O projeto integra Shopify com NetSuite. O payout reconciliation depende da arquitetura contábil definida pelo cliente:

### No fluxo de orders

O cliente confirmou que o resultado contábil no NetSuite deve ser `Cash Sale`, não `Invoice`.

Implementação atual confirmada:

- o workflow de `create orders` cria a `Sales Order`
- o workflow de `update shipments` faz o fulfillment no Shopify e converte o registro para `Cash Sale` no NetSuite

Lançamento esperado no estado final do fluxo de orders:

- `Debit` Shopify Clearing `#1099`
- `Credit` Sales `#6000` department `#300`

### No payout do Shopify

Lançamento esperado:

- `Debit` East West Receivables `#1095`
- `Debit` Credit Card Fees `#8616` department `#810`
- `Credit` Shopify Clearing `#1099`

Isso mostra que o workflow de payout existe para baixar o saldo acumulado em `Shopify Clearing #1099`.

## Decisões Já Confirmadas

- O record de orders no NetSuite deve ser `Cash Sale`.
- O payout workflow cria `Journal Entry`.
- O workflow roda para `Big Country Toys` e `Auto World Store`.
- A diferença de header por loja será resolvida com base no `environment` da Gravity.
- A data do `Journal Entry` deve ser a `issuedAt` do payout.
- O memo deve seguir o formato `Shopify payout reconciliation [date]`.
- A linha de receivable usa `East West Receivables #1095`.
- A linha de fees usa `Credit Card Fees #8616` com `department #810`.
- A contrapartida usa `Shopify Clearing #1099`.
- O header do JE deve incluir `subsidiary internalId 3`.
- O header do JE deve incluir `currency internalId 1`.
- O header do JE deve incluir `division 30` para `Auto World` e `40` para `BCT`.
- A soma de fees deve considerar campos do `summary` que terminam com `Fee` e também campos em `Fees`, incluindo `advanceFees`.
- `refundsFeeGross` não deve entrar na soma.
- Devem ser usados `map steps` para parse, cálculo e reestruturação.
- Devem ser usados steps nativos dos sistemas para busca e escrita via API.

## Resultado Esperado

Para cada payout elegível da Shopify, o workflow deve criar exatamente um `Journal Entry` balanceado no NetSuite.

## Desenho de Alto Nível

Fluxo recomendado:

1. `Scheduler Trigger`
2. `Shopify Step: Search/Get Payouts`
3. `Loop: For Each Payout`
4. `NetSuite Step: Search Existing Journal Entry`
5. `Map Step: Normalize Shopify payout`
6. `Map Step: Calculate accounting values`
7. `Map Step: Build NetSuite Journal Entry payload`
8. `NetSuite Step: Create Journal Entry`
9. `Log success/failure`

Blueprint curto:

`fetch -> filter -> loop -> normalize -> calculate -> build payload -> create -> log`

## Estratégia de Build na Gravity

Separação recomendada:

- `map steps` apenas para lógica JavaScript e transformação
- steps Shopify apenas para leitura de payouts
- steps NetSuite apenas para busca e criação

Benefícios:

- fluxo mais fácil de testar
- menor acoplamento entre conectores e regra contábil
- debug mais simples
- menor risco de duplicidade

## Configuração por Store/Environment

O workflow deve atender as duas lojas:

- `Auto World Store`
- `Big Country Toys`

A recomendação é manter uma configuração por `environment` na Gravity para preencher os campos variáveis de header e contexto da loja.

Configuração atualmente conhecida:

| Store | Division |
| --- | --- |
| Auto World Store | `30` |
| Big Country Toys | `40` |

Campos fixos de header já confirmados:

| Campo | Valor |
| --- | --- |
| Subsidiary | `3` |
| Currency | `1` |
| Date | `issuedAt` do payout |
| Memo | `Shopify payout reconciliation [YYYY-MM-DD]` |

Campo ainda pendente:

| Campo | Status |
| --- | --- |
| Approval Status | confirmar se entra `approved` ou `pending` |

## Workflow Detalhado

### 1. Trigger

Tipo:

- `Scheduler`

Cadência:

- `hourly` para operação
- `manual` ou `daily` durante fase de validação

Observação:

- a cadência final depende do SLA aceito pelo negócio
- como é reconciliação financeira, não há necessidade aparente de near-real-time

### 2. Shopify Step: Buscar payouts

Objetivo:

- buscar payouts emitidos desde o último checkpoint

Campos mínimos necessários:

- `id`
- `legacyResourceId` se disponível
- `issuedAt`
- `status`
- `transactionType`
- `net.amount`
- `summary`
- `currencyCode`, se disponível

Filtros recomendados:

- `status = PAID` para depósitos concluídos
- janela temporal baseada em checkpoint

Observações:

- se houver suporte, guardar também `transactionType`
- se o conector permitir, usar paginação explícita
- o workflow não deve depender só da data sem algum critério de desempate

### 3. Loop por payout

Executar um loop por payout retornado.

Cada payout deve ser tratado de forma isolada, com erro local sem derrubar os demais itens do lote.

### 4. NetSuite Step: Verificar idempotência

Antes de criar o `Journal Entry`, buscar se ele já existe.

Estratégia recomendada:

- `externalId = shopify_payout_[legacyResourceId]`

Fallback se `legacyResourceId` não estiver disponível:

- `externalId = shopify_payout_[payout.id]`

Se existir:

- marcar payout como `skipped_already_processed`
- seguir para o próximo item

Não confiar apenas no memo para idempotência.

## Estrutura dos Map Steps

### Map 1: Normalize Shopify payout

Objetivo:

- padronizar o payload do payout
- extrair data
- gerar memo
- preparar identificadores

Exemplo:

```javascript
const payout = input.payout;

const payoutId = payout.id;
const legacyResourceId = payout.legacyResourceId || null;
const issuedDate = String(payout.issuedAt || "").split("T")[0];
const memo = `Shopify payout reconciliation ${issuedDate}`;

return {
  payoutId,
  legacyResourceId,
  externalId: `shopify_payout_${legacyResourceId || payoutId}`,
  issuedAt: payout.issuedAt,
  issuedDate,
  memo,
  status: payout.status || null,
  transactionType: payout.transactionType || payout.type || null,
  currencyCode: payout.currencyCode || null,
  netAmount: Number(payout.net?.amount ?? payout.netAmount ?? 0),
  summary: payout.summary || {}
};
```

### Map 2: Calculate accounting values

Objetivo:

- somar fees elegíveis
- calcular contrapartida do clearing
- transformar sinal em débito/crédito

Regra funcional:

- somar todas as propriedades do `summary` cujo nome termina com `Fee`
- excluir `refundsFeeGross`
- o JE precisa sempre fechar com `debits = credits`

Implementação recomendada:

```javascript
const summary = input.summary || {};

const feeTotal = Object.entries(summary)
  .filter(([key]) => (key.endsWith("Fee") || key.endsWith("Fees")) && key !== "refundsFeeGross")
  .reduce((sum, [, value]) => {
    return sum + Number(value?.amount ?? value ?? 0);
  }, 0);

const netAmount = Number(input.netAmount || 0);
const clearingSignedAmount = -(netAmount + feeTotal);

function toJournalLine(account, signedAmount, memo, extra = {}) {
  const amount = Math.round(Math.abs(Number(signedAmount || 0)) * 100) / 100;

  if (amount === 0) return null;

  if (signedAmount >= 0) {
    return { account, debit: amount, memo, ...extra };
  }

  return { account, credit: amount, memo, ...extra };
}

const lines = [
  toJournalLine("1095", netAmount, input.memo),
  toJournalLine("8616", feeTotal, input.memo, { department: "810" }),
  toJournalLine("1099", clearingSignedAmount, input.memo)
].filter(Boolean);

const totalDebits = lines.reduce((sum, line) => sum + Number(line.debit || 0), 0);
const totalCredits = lines.reduce((sum, line) => sum + Number(line.credit || 0), 0);

const roundMoney = (n) => Math.round(Number(n) * 100) / 100;

return {
  ...input,
  feeTotal: roundMoney(feeTotal),
  clearingAmount: roundMoney(Math.abs(clearingSignedAmount)),
  clearingSignedAmount: roundMoney(clearingSignedAmount),
  lines,
  totalDebits: roundMoney(totalDebits),
  totalCredits: roundMoney(totalCredits),
  isBalanced: roundMoney(totalDebits) === roundMoney(totalCredits)
};
```

### Map 3: Build NetSuite Journal Entry payload

Objetivo:

- montar o payload final para criação no NetSuite

Exemplo:

```javascript
if (!input.isBalanced) {
  throw new Error(`Unbalanced journal entry for payout ${input.externalId}`);
}

return {
  externalId: input.externalId,
  subsidiary: "3",
  currency: "1",
  division: input.storeConfig.division,
  tranDate: input.issuedDate,
  memo: input.memo,
  lines: input.lines
};
```

## Lógica Contábil

### Caso normal: deposit

Se:

- `netAmount = 980`
- `feeTotal = 20`

Resultado:

- `Debit 1095 = 980`
- `Debit 8616 = 20`
- `Credit 1099 = 1000`

### Caso withdrawal

Se:

- `netAmount = -50`
- `feeTotal = 5`

Resultado:

- `Credit 1095 = 50`
- `Debit 8616 = 5`
- `Debit 1099 = 45`

Observação importante:

- o JE não deve usar valores negativos nas colunas `debit` ou `credit`
- o sinal deve decidir o lado contábil da linha

## Regras de Negócio

### Regras confirmadas

- `tranDate` do JE = data de `issuedAt`
- `memo = Shopify payout reconciliation [YYYY-MM-DD]`
- `Debit 1095 = net payout`
- `Debit 8616 dept 810 = total fees`
- `Credit 1099 = net payout + fees`

### Regras implícitas

- o workflow opera no nível de payout, não de order
- payouts já processados não devem gerar novo JE
- o JE deve ser criado apenas quando balanceado
- falha em um payout não deve bloquear o lote inteiro

## Dependência Importante com o Workflow de Orders

Existe uma dependência funcional importante:

- o payout reconciliation assume que o saldo de `Shopify Clearing #1099` já está sendo alimentado corretamente pelo fluxo de orders

Estado atualmente confirmado:

- o workflow de `create orders` cria inicialmente `Sales Order`
- o workflow de `update shipments` converte para `Cash Sale`
- o lançamento contábil final esperado continua sendo `Debit Shopify Clearing #1099` e `Credit Sales #6000 department #300`

Ponto de atenção:

- o payout workflow continua dependendo de essa conversão para `Cash Sale` ocorrer corretamente antes da reconciliação do clearing

## Idempotência

Estratégia recomendada:

- `externalId = shopify_payout_[legacyResourceId]`

Fallback:

- `externalId = shopify_payout_[payout.id]`

Comportamento:

- se já existir JE com esse `externalId`, o payout é ignorado
- não recriar JE por memo ou por data

## Checkpoint e Incremental

Como o workflow é recorrente, ele deve ser incremental.

Estratégia recomendada:

- manter checkpoint do último payout processado com sucesso
- idealmente armazenar:
  - `lastIssuedAt`
  - `lastPayoutId` ou `lastLegacyResourceId`

Motivo:

- múltiplos payouts podem compartilhar a mesma data
- checkpoint apenas por data aumenta risco de duplicidade ou perda

## Critérios de Elegibilidade do Payout

Payout elegível:

- status compatível com payout concluído
- payout ainda não reconciliado

Recomendação atual:

- usar `PAID` como status principal

Itens que não devem gerar JE automaticamente sem validação adicional:

- `FAILED`
- `CANCELED`
- `SCHEDULED`

## Tratamento de Erro

O workflow deve tratar falhas por payout.

Cenários de falha relevantes:

- payout sem `issuedAt`
- payout sem `net.amount`
- erro ao buscar payouts
- erro ao consultar JE existente
- payload não balanceado
- período contábil fechado no NetSuite
- erro ao criar `Journal Entry`
- falta de permissão no Shopify Payments

Comportamento recomendado:

- registrar o erro com contexto do payout
- seguir para o próximo payout
- consolidar notificação ao final do lote ou por item crítico

## Logging e Observabilidade

Campos recomendados de log:

- `store`
- `payoutId`
- `legacyResourceId`
- `externalId`
- `issuedAt`
- `issuedDate`
- `status`
- `transactionType`
- `currencyCode`
- `netAmount`
- `feeTotal`
- `clearingAmount`
- `journalEntryId`
- `resultStatus`
- `errorStep`
- `errorMessage`

## Pontas Soltas que Ainda Precisam de Definição

### 1. Header fields ainda não confirmados por completo

Já confirmados:

- `subsidiary = 3`
- `currency = 1`
- `division = 30` para `Auto World`
- `division = 40` para `BCT`

Ainda pendente:

- `approvalStatus`
- `location`, `class` ou qualquer outro campo que o connector exija no ambiente final

### 2. Withdrawal com payload real

Precisamos de pelo menos um exemplo real de payout `withdrawal` para validar:

- sinal de `net.amount`
- sinal dos campos de fee no `summary`
- se a fórmula atual fecha corretamente sem ajuste manual

### 3. Período contábil fechado

Definir comportamento:

- falhar e alertar
- ou postar no próximo período aberto

### 4. Estratégia de alerta

Definir:

- quem recebe alertas
- em qual canal
- se o alerta é por item ou por lote

## Recomendações de Implementação

### Recomendação 1

Começar com payouts `deposit` apenas, se ainda não houver sample confiável de `withdrawal`.

### Recomendação 2

Implementar o cálculo com base em sinal, não com branch fixa só por tipo.

Isso torna o fluxo mais robusto contra:

- `deposit` com ajustes
- `withdrawal` com composição mista

### Recomendação 3

Adicionar uma validação obrigatória antes do create:

- `debits === credits`

Se não fechar:

- não criar o JE
- registrar erro

### Recomendação 4

Buscar primeiro criar o JE usando step nativo do NetSuite.

Só migrar para SuiteScript se o connector não suportar bem:

- `externalId`
- `line items`
- `department`
- demais header fields obrigatórios

## Sequência Recomendada de Build

1. Confirmar stores e header fields do JE.
2. Obter 1 sample real de `deposit`.
3. Obter 1 sample real de `withdrawal`, se existir.
4. Implementar busca incremental de payouts.
5. Implementar checagem de idempotência por `externalId`.
6. Resolver o `storeConfig` por `environment` na Gravity.
7. Implementar `Map 1` de normalização.
8. Implementar `Map 2` de cálculo contábil e balanceamento.
9. Implementar `Map 3` de payload para NetSuite.
10. Criar `Journal Entry` no sandbox.
11. Validar 3 cenários: payout normal, payout com múltiplas fees e payout com withdrawal.
12. Adicionar logs e alertas.
13. Promover para operação recorrente.

## Casos de Teste Mínimos

### Caso 1: Deposit simples

- `netAmount > 0`
- uma fee
- JE balanceado

### Caso 2: Deposit com múltiplas fees

- `chargesFee`
- `refundsFee`
- exclusão de `refundsFeeGross`

### Caso 3: Withdrawal

- `netAmount < 0`
- validação do lado débito/crédito

### Caso 4: Duplicidade

- payout já processado
- workflow deve pular

### Caso 5: Payload inválido

- payout sem `issuedAt` ou sem `net`
- workflow deve logar erro

### Caso 6: JE desbalanceado

- bloqueio antes do create

## Resumo Executivo

O workflow `Shopify Payout Reconciliation` deve ser construído como um fluxo recorrente e determinístico na Gravity, usando:

- steps de Shopify para buscar payouts
- `map steps` para parse e cálculo contábil
- steps de NetSuite para busca e criação de `Journal Entry`

O desenho principal já está claro. As maiores dependências restantes são:

- confirmação final do `approvalStatus` e de eventuais campos extras do JE
- validação de um sample real de `withdrawal`
- definição de comportamento para período contábil fechado
