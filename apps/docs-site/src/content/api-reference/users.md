# Users API (Admin)

Gestão de usuários — apenas admin.

## Endpoints

| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/users` | Listar usuários (com KPIs, sparklines) |
| GET | `/api/users/:id` | Perfil do usuário |
| PATCH | `/api/users/:id` | Atualizar (nome, avatar, status, premium) |
| PATCH | `/api/users/:id/role` | Mudar role (admin/user) |
| DELETE | `/api/users/:id` | Deletar usuário |

## Modelo

```json
{
  "id": "uuid",
  "firstName": "Rafael",
  "lastName": "Figueiredo",
  "email": "rafael@brighttale.io",
  "avatarUrl": "https://...",
  "isPremium": true,
  "premiumPlan": "monthly",
  "premiumStartedAt": "2026-03-01T...",
  "premiumExpiresAt": "2026-04-01T...",
  "isActive": true,
  "role": "admin"
}
```

## Roles

| Role | Permissões |
|---|---|
| `admin` | Tudo + gestão de usuários |
| `user` | CRUD dos próprios recursos |
