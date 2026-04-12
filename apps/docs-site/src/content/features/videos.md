# Vídeos

Scripts de vídeo com capítulos, B-roll e thumbnails.

## Funcionalidades

- 3 opções de título por vídeo
- Script com capítulos (timestamps, falas, B-roll, sound design)
- Conceito de thumbnail (JSON)
- Duração estimada
- Seletor de estilo de vídeo
- Export para markdown

## Variantes (planejadas)

| Variante | Descrição | Status |
|---|---|---|
| Canal normal | Com rosto, educativo | ✅ |
| Canal dark | Narração + stock footage | 🔲 |
| Cursos | Módulos + aulas sequenciais | 🔲 |

## Páginas

| Rota | Descrição |
|---|---|
| `/videos` | Lista de scripts |
| `/videos/[id]` | Editor de script |

## Componentes

| Componente | Descrição |
|---|---|
| `VideoPreview` | Preview do script |
| `VideoStyleSelector` | Seletor de estilo |
| `AssetsTabVideo` | Assets do vídeo (thumbnails, chapter images) |
