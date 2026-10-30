import { createHash } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { PNG } from 'pngjs';
import { sql as connection, db } from './src/db';
import { files, fileVersions, folders, shareLinks, users } from './src/db/schema';
import { logActivity } from './src/lib/activity';
import { hashPassword } from './src/lib/password';
import {
  buildStorageKey,
  deleteObjectPrefix,
  ensureBucket,
  generateShareToken,
  hashToken,
  putObject,
} from './src/lib/storage';

const DEMO_PASSWORD = {
  admin: 'Admin!2026',
  editor: 'Editor!2026',
  viewer: 'Lector!2026',
} as const;

function daysAgo(days: number, hours = 0) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000 - hours * 60 * 60 * 1000);
}

async function makePdf(lines: string[]) {
  const document = await PDFDocument.create();
  const page = document.addPage([595, 842]);
  const font = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);

  page.drawRectangle({
    x: 0,
    y: 0,
    width: 595,
    height: 842,
    color: rgb(0.976, 0.957, 0.922),
  });
  page.drawRectangle({
    x: 48,
    y: 760,
    width: 499,
    height: 3,
    color: rgb(0.706, 0.325, 0.165),
  });
  page.drawText('ARCHIVERO', {
    x: 48,
    y: 782,
    size: 18,
    font: bold,
    color: rgb(0.11, 0.098, 0.09),
  });
  page.drawText('Documento de demostración', {
    x: 48,
    y: 735,
    size: 10,
    font,
    color: rgb(0.42, 0.39, 0.35),
  });

  let y = 685;
  for (const [index, line] of lines.entries()) {
    const isTitle = index === 0;
    page.drawText(line, {
      x: 48,
      y,
      size: isTitle ? 17 : 10,
      font: isTitle ? bold : font,
      color: rgb(0.11, 0.098, 0.09),
      maxWidth: 499,
      lineHeight: isTitle ? 22 : 15,
    });
    y -= isTitle ? 40 : 20;
  }

  page.drawText('Datos ficticios creados para la demostración de Archivero.', {
    x: 48,
    y: 60,
    size: 8,
    font,
    color: rgb(0.51, 0.47, 0.42),
  });

  return document.save();
}

function makePng() {
  const width = 960;
  const height = 600;
  const png = new PNG({ width, height });

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (width * y + x) << 2;
      const light = Math.round(214 + 24 * Math.sin(x / 150) * Math.cos(y / 110));
      png.data[index] = light;
      png.data[index + 1] = Math.round(light * 0.93);
      png.data[index + 2] = Math.round(light * 0.82);
      png.data[index + 3] = 255;
    }
  }

  for (let y = 90; y < height - 90; y += 1) {
    for (let x = 90; x < width - 90; x += 1) {
      const border = x < 94 || x >= width - 94 || y < 94 || y >= height - 94;
      if (!border) continue;
      const index = (width * y + x) << 2;
      png.data[index] = 179;
      png.data[index + 1] = 83;
      png.data[index + 2] = 42;
      png.data[index + 3] = 255;
    }
  }

  return PNG.sync.write(png);
}

function checksum(body: Uint8Array) {
  return createHash('sha256').update(body).digest('hex');
}

async function createSeedFile(input: {
  folderId: string | null;
  name: string;
  ownerId: string;
  createdAt: Date;
  versions: Array<{ body: Uint8Array; mimeType: string; createdAt: Date }>;
  deletedAt?: Date;
}) {
  const [file] = await db
    .insert(files)
    .values({
      folderId: input.folderId,
      name: input.name,
      ownerId: input.ownerId,
      status: 'pending',
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
      deletedAt: input.deletedAt ?? null,
    })
    .returning();

  if (!file) throw new Error(`No se pudo crear el archivo ${input.name}`);

  let currentVersionId: string | null = null;
  for (const [index, version] of input.versions.entries()) {
    const versionNumber = index + 1;
    const key = buildStorageKey(file.id, versionNumber, input.name);
    await putObject(key, version.body, version.mimeType);
    const [created] = await db
      .insert(fileVersions)
      .values({
        fileId: file.id,
        versionNumber,
        storageKey: key,
        size: version.body.byteLength,
        mimeType: version.mimeType,
        checksum: checksum(version.body),
        createdBy: input.ownerId,
        createdAt: version.createdAt,
      })
      .returning();
    currentVersionId = created?.id ?? null;
  }

  await db
    .update(files)
    .set({
      status: 'ready',
      currentVersionId,
      updatedAt: input.versions.at(-1)?.createdAt ?? input.createdAt,
    })
    .where(eq(files.id, file.id));

  await logActivity({
    userId: input.ownerId,
    action: 'file.upload',
    targetType: 'file',
    targetId: file.id,
    metadata: { name: input.name, versions: input.versions.length },
  });

  if (input.versions.length > 1) {
    await logActivity({
      userId: input.ownerId,
      action: 'file.version.create',
      targetType: 'file',
      targetId: file.id,
      metadata: {
        name: input.name,
        version: input.versions.length,
      },
    });
  }

  return file;
}

async function main() {
  console.log('Preparando almacenamiento…');
  await ensureBucket();
  await deleteObjectPrefix('files/');

  await db.execute(
    sql`TRUNCATE TABLE activity_log, share_links, file_versions, files, folders, users CASCADE`,
  );

  console.log('Creando cuentas de demostración…');
  const passwordHashes = {
    admin: await hashPassword(DEMO_PASSWORD.admin),
    editor: await hashPassword(DEMO_PASSWORD.editor),
    viewer: await hashPassword(DEMO_PASSWORD.viewer),
  };

  const [admin, editor, viewer] = await db
    .insert(users)
    .values([
      {
        name: 'Elena Vásquez',
        email: 'elena@archivero.demo',
        passwordHash: passwordHashes.admin,
        role: 'admin',
        createdAt: daysAgo(120),
      },
      {
        name: 'Mateo Ríos',
        email: 'mateo@archivero.demo',
        passwordHash: passwordHashes.editor,
        role: 'editor',
        createdAt: daysAgo(95),
      },
      {
        name: 'Sofía Ledezma',
        email: 'sofia@archivero.demo',
        passwordHash: passwordHashes.viewer,
        role: 'viewer',
        createdAt: daysAgo(70),
      },
    ])
    .returning();

  if (!admin || !editor || !viewer) throw new Error('No se pudieron crear los usuarios.');

  console.log('Creando carpetas…');
  const [contracts, invoices, people, manuals, suppliers] = await db
    .insert(folders)
    .values([
      { name: 'Contratos 2026', ownerId: editor.id, createdAt: daysAgo(60) },
      { name: 'Facturas', ownerId: editor.id, createdAt: daysAgo(55) },
      { name: 'Recursos Humanos', ownerId: admin.id, createdAt: daysAgo(50) },
      { name: 'Manuales', ownerId: editor.id, createdAt: daysAgo(45) },
    ])
    .returning()
    .then(async (rows) => {
      const [contractsRow, invoicesRow, peopleRow, manualsRow] = rows;
      if (!contractsRow || !invoicesRow || !peopleRow || !manualsRow) {
        throw new Error('No se pudieron crear las carpetas.');
      }
      const [suppliersRow] = await db
        .insert(folders)
        .values({
          name: 'Proveedores',
          parentId: contractsRow.id,
          ownerId: editor.id,
          createdAt: daysAgo(40),
        })
        .returning();
      return [contractsRow, invoicesRow, peopleRow, manualsRow, suppliersRow] as const;
    });

  if (!suppliers) throw new Error('No se pudo crear la subcarpeta.');

  console.log('Generando archivos de muestra…');
  const contractV1 = await makePdf([
    'Contrato de servicios',
    'Partes: Estudio Lumen y Aurora Digital.',
    'Objeto: mantenimiento del archivo documental durante el año 2026.',
    'Duración: doce meses desde la firma.',
    'Este documento es ficticio y forma parte de la demostración.',
  ]);
  const contractV2 = await makePdf([
    'Contrato de servicios (revisión 2)',
    'Partes: Estudio Lumen y Aurora Digital.',
    'Objeto: mantenimiento del archivo documental durante el año 2026.',
    'Se añade una cláusula de custodia digital y copias de respaldo mensuales.',
    'Duración: doce meses desde la firma.',
    'Este documento es ficticio y forma parte de la demostración.',
  ]);
  const nda = await makePdf([
    'Acuerdo de confidencialidad',
    'Partes: Norte Verde y Estudio Lumen.',
    'La información compartida tendrá carácter reservado durante tres años.',
    'Documento ficticio para la demostración de Archivero.',
  ]);
  const framework = await makePdf([
    'Contrato marco',
    'Partes: Estudio Lumen y Bruma Creativa.',
    'Condiciones generales para encargos de diseño editorial.',
    'Documento ficticio para la demostración de Archivero.',
  ]);
  const addendum = await makePdf([
    'Addenda de servicios cloud',
    'Proveedor: Nube Clara.',
    'Se amplía la capacidad de respaldo y se define una ventana de mantenimiento.',
    'Documento ficticio para la demostración de Archivero.',
  ]);
  const invoiceA = await makePdf([
    'Factura 2026-014',
    'Papelera Central · Servicios de encuadernación.',
    'Subtotal: 420,00 USD. Impuesto: 28,00 USD. Total: 448,00 USD.',
    'Documento ficticio para la demostración de Archivero.',
  ]);
  const invoiceB = await makePdf([
    'Factura 2026-015',
    'Taller Bruma · Restauración de planos.',
    'Subtotal: 680,00 USD. Impuesto: 48,00 USD. Total: 728,00 USD.',
    'Documento ficticio para la demostración de Archivero.',
  ]);
  const manual = await makePdf([
    'Guía de uso del archivo',
    'Cómo organizar carpetas, subir versiones y compartir documentos.',
    'Esta guía acompaña a la demostración de Archivero.',
  ]);
  const room = makePng();

  const contract = await createSeedFile({
    folderId: contracts.id,
    name: 'Contrato de servicios - Aurora Digital.pdf',
    ownerId: editor.id,
    createdAt: daysAgo(32),
    versions: [
      { body: contractV1, mimeType: 'application/pdf', createdAt: daysAgo(32) },
      { body: contractV2, mimeType: 'application/pdf', createdAt: daysAgo(12, 3) },
    ],
  });

  await createSeedFile({
    folderId: contracts.id,
    name: 'Acuerdo de confidencialidad - Norte Verde.pdf',
    ownerId: admin.id,
    createdAt: daysAgo(28),
    versions: [{ body: nda, mimeType: 'application/pdf', createdAt: daysAgo(28) }],
  });

  await createSeedFile({
    folderId: contracts.id,
    name: 'Contrato marco - Bruma Creativa.pdf',
    ownerId: editor.id,
    createdAt: daysAgo(24),
    versions: [{ body: framework, mimeType: 'application/pdf', createdAt: daysAgo(24) }],
  });

  await createSeedFile({
    folderId: suppliers.id,
    name: 'Addenda - Servicios cloud.pdf',
    ownerId: editor.id,
    createdAt: daysAgo(18),
    versions: [{ body: addendum, mimeType: 'application/pdf', createdAt: daysAgo(18) }],
  });

  await createSeedFile({
    folderId: invoices.id,
    name: 'Factura 2026-014 - Papelera Central.pdf',
    ownerId: editor.id,
    createdAt: daysAgo(22),
    versions: [{ body: invoiceA, mimeType: 'application/pdf', createdAt: daysAgo(22) }],
  });

  await createSeedFile({
    folderId: invoices.id,
    name: 'Factura 2026-015 - Taller Bruma.pdf',
    ownerId: editor.id,
    createdAt: daysAgo(16),
    versions: [{ body: invoiceB, mimeType: 'application/pdf', createdAt: daysAgo(16) }],
  });

  const quarterlyCsv = Buffer.from(
    'concepto,periodo,monto_usd\nEncuadernación,2026-T1,1240\nRestauración,2026-T1,980\nSuministros,2026-T1,315\n',
  );
  await createSeedFile({
    folderId: invoices.id,
    name: 'Resumen trimestral.csv',
    ownerId: editor.id,
    createdAt: daysAgo(10),
    versions: [{ body: quarterlyCsv, mimeType: 'text/csv', createdAt: daysAgo(10) }],
  });

  const welcome = Buffer.from(
    `# Manual de bienvenida\n\nBienvenida al equipo de Archivo y Documentación.\n\n## Primeros pasos\n\n1. Revisa la estructura de carpetas.\n2. Solicita permisos de edición a Elena.\n3. Consulta la guía de versiones antes de reemplazar un documento.\n\nEste texto es ficticio y forma parte de la demostración.\n`,
  );
  await createSeedFile({
    folderId: people.id,
    name: 'Manual de bienvenida.md',
    ownerId: admin.id,
    createdAt: daysAgo(20),
    versions: [{ body: welcome, mimeType: 'text/markdown', createdAt: daysAgo(20) }],
  });

  const directory = Buffer.from(
    'nombre,area,extension\nElena Vásquez,Dirección,101\nMateo Ríos,Archivo,204\nSofía Ledezma,Consulta,118\n',
  );
  await createSeedFile({
    folderId: people.id,
    name: 'Directorio interno.csv',
    ownerId: admin.id,
    createdAt: daysAgo(15),
    versions: [{ body: directory, mimeType: 'text/csv', createdAt: daysAgo(15) }],
  });

  await createSeedFile({
    folderId: manuals.id,
    name: 'Guía de uso del archivo.pdf',
    ownerId: editor.id,
    createdAt: daysAgo(14),
    versions: [{ body: manual, mimeType: 'application/pdf', createdAt: daysAgo(14) }],
  });

  await createSeedFile({
    folderId: manuals.id,
    name: 'Fotografía de la sala principal.png',
    ownerId: editor.id,
    createdAt: daysAgo(9),
    versions: [{ body: room, mimeType: 'image/png', createdAt: daysAgo(9) }],
  });

  const notes = Buffer.from(
    `# Notas de inventario\n\n- Revisar cajas 12 a 18.\n- Etiquetar los planos restaurados.\n- Confirmar el préstamo solicitado por Bruma Creativa.\n\nDatos ficticios para la demostración.\n`,
  );
  await createSeedFile({
    folderId: manuals.id,
    name: 'Notas de inventario.md',
    ownerId: editor.id,
    createdAt: daysAgo(6),
    versions: [{ body: notes, mimeType: 'text/markdown', createdAt: daysAgo(6) }],
  });

  const meeting = Buffer.from(
    `# Acta de reunión · Comité de archivo\n\nFecha ficticia: 12 de octubre de 2026.\n\n## Acuerdos\n\n- Revisar la política de retención.\n- Programar una copia de respaldo adicional.\n- Archivar esta acta después de su aprobación.\n`,
  );
  const trashed = await createSeedFile({
    folderId: people.id,
    name: 'Acta de reunión - Comité de archivo.md',
    ownerId: admin.id,
    createdAt: daysAgo(5),
    deletedAt: daysAgo(2),
    versions: [{ body: meeting, mimeType: 'text/markdown', createdAt: daysAgo(5) }],
  });

  await logActivity({
    userId: admin.id,
    action: 'file.delete',
    targetType: 'file',
    targetId: trashed.id,
    metadata: { name: trashed.name },
  });

  console.log('Registrando enlace público…');

  const shareToken = generateShareToken();
  const [share] = await db
    .insert(shareLinks)
    .values({
      fileId: contract.id,
      tokenHash: hashToken(shareToken),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      maxDownloads: 5,
      createdBy: editor.id,
      createdAt: daysAgo(1),
    })
    .returning();

  if (share) {
    await logActivity({
      userId: editor.id,
      action: 'share.create',
      targetType: 'share',
      targetId: share.id,
      metadata: { fileName: contract.name, maxDownloads: 5 },
    });
  }

  const appOrigin = process.env.APP_ORIGIN ?? 'http://localhost:5173';
  console.log('\nDatos de demostración listos.\n');
  console.log('Administradora  elena@archivero.demo  / Admin!2026');
  console.log('Editor          mateo@archivero.demo  / Editor!2026');
  console.log('Lector          sofia@archivero.demo  / Lector!2026');
  if (share) {
    console.log(`\nEnlace público de ejemplo:\n${appOrigin}/s/${shareToken}\n`);
  }

  await connection.end();
}

main().catch(async (error) => {
  console.error(error);
  await connection.end();
  process.exit(1);
});
