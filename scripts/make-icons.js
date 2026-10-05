'use strict';

/**
 * Gera os ícones do app a partir de assets/icon-source.png (quadrado, >=512px).
 * Produz:
 *   assets/icon.ico  -> usado no instalador e na janela (Windows)
 *   assets/icon.png  -> 512x512 (fallback multiplataforma)
 *
 * Usa sharp + png-to-ico apenas em tempo de build (não vão para o app).
 */

const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const pngToIco = require('png-to-ico');

async function main() {
  const assets = path.join(__dirname, '..', 'assets');
  const src = path.join(assets, 'icon-source.png');

  if (!fs.existsSync(src)) {
    throw new Error('assets/icon-source.png não encontrado.');
  }

  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const buffers = await Promise.all(
    sizes.map((s) =>
      sharp(src)
        .resize(s, s, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toBuffer()
    )
  );

  const ico = await pngToIco(buffers);
  fs.writeFileSync(path.join(assets, 'icon.ico'), ico);

  await sharp(src)
    .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(path.join(assets, 'icon.png'));

  console.log('✓ Ícones gerados: assets/icon.ico e assets/icon.png');
}

main().catch((err) => {
  console.error('Erro ao gerar ícones:', err);
  process.exit(1);
});
