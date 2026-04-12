# Testes

## Framework

Vitest 4 com jsdom.

## Comandos

```bash
npm run test            # Todos os workspaces
npm run test:api        # Só API
npm run test:app        # Só App
npx vitest run <file>   # Arquivo específico
```

## Categorias

| Categoria | Descrição | Requer DB |
|---|---|---|
| **A/B** | Unit tests | Não |
| **C** | Integration tests (DB) | Sim — marcados com `describe.skip` |

## Estrutura

Testes ficam em diretórios `__tests__/` próximos ao código testado.

```
src/
├── lib/
│   ├── crypto.ts
│   └── __tests__/
│       └── crypto.test.ts
```

## Convenções

- Mock de DB: não usar (exceto para Category A/B)
- Nomear testes descritivamente: `it('should return 400 for invalid input')`
- Testar happy path + edge cases + erros
