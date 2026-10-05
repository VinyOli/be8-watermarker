# Be8 WaterMarker

Aplicativo desktop (Windows) para aplicar marca d'água em lote nas fotos, com interface escura no estilo Apple e identidade visual da **Be8 Agência de Marketing**.

## Recursos

- Seleciona uma pasta de fotos e cria uma pasta nova **ao lado da original** com as fotos marcadas (nunca sobrescreve os originais).
- Marca d'água por imagem (PNG com transparência recomendado).
- Posicionamento livre arrastando a marca sobre a foto, com **alças** para redimensionar mantendo a proporção.
- Sliders de **tamanho** e **opacidade**, botões de **posição rápida** (9 pontos).
- Saída em **JPG** (com controle de qualidade) ou **PNG**.
- Aceita fotos de iPhone, incluindo **HEIC/HEIF**, além de JPG, PNG, WebP, GIF e BMP.
- Lembra a última marca d'água e os ajustes usados.

## Requisitos de desenvolvimento

- Node.js 18+ (testado no Node 24)

## Scripts

```bash
npm install        # instala as dependências
npm start          # roda o app em modo desenvolvimento
npm run icons      # gera assets/icon.ico a partir de assets/icon-source.png
npm run dist       # gera o instalador .exe em dist/
```

## Gerar o instalador (sem publicar)

```bash
npm run dist
```

O instalador é criado em `dist/Be8-WaterMarker-Setup-<versao>.exe`. É só enviar esse arquivo para o cliente — ele instala como qualquer programa do Windows (com atalho na área de trabalho e no menu Iniciar).

## Publicar uma atualização (auto-update)

O app se atualiza sozinho via **GitHub Releases** (`electron-updater`). Fluxo para lançar uma nova versão:

1. Faça as alterações no código.
2. **Suba o número da versão** em `package.json` (ex.: `1.0.2` → `1.0.3`).
3. Rode:

```bash
npm run release
```

Isso compila e publica o instalador + metadados no repositório `VinyOli/be8-watermarker` (Releases). Precisa de um token do GitHub no ambiente — com o GitHub CLI logado, use:

```bash
GH_TOKEN="$(gh auth token)" npm run release
```

Quem já tem o programa instalado recebe automaticamente uma **notificação no canto inferior** ("Atualização disponível"), o download acontece em segundo plano e, ao clicar em **Reiniciar**, o app atualiza sozinho. Também atualiza no próximo fechamento do programa.

> Importante: cada release precisa de um **número de versão maior** que o anterior, senão o app não reconhece como atualização.

## Trocar a identidade visual

Os arquivos em `assets/` controlam a marca:

- `icon-source.png` — origem do ícone do app/instalador (quadrado, ideal 1000×1000). Após trocar, rode `npm run icons`.
- `mark-white.png` — marca branca usada no cabeçalho e na tela de progresso.
- `logo-white.png` — logo horizontal branca (reserva).

A cor amarela da marca (`#FDBE28`) está definida em `src/styles.css` na variável `--be8-yellow`.

---

© 2026 Be8 Agência de Marketing. Todos os direitos reservados.
