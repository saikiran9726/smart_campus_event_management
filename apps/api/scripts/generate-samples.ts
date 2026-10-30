import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import QRCode from 'qrcode';
import { renderOdPdfBuffer } from '../src/modules/od/service';
import { renderOgCardPng } from '../src/modules/verify/og.service';

async function main() {
  console.log('Generating OD PDF and OG PNG samples...');

  // 1. Generate OD PDF
  const qrUrl = 'https://eventora.campus.edu/verify/od/OD-2026-A1B2C3D4';
  const qrBuffer = await QRCode.toBuffer(qrUrl, {
    margin: 2,
    width: 200,
    errorCorrectionLevel: 'M',
  });

  const pdfBuffer = await renderOdPdfBuffer({
    serial: 'OD-2026-A1B2C3D4',
    studentName: 'Sai Kumar',
    rollNumber: 'CS2026_042',
    departmentYear: 'Computer Science & Engineering, Year 3',
    eventTitle: 'HackCampus National Hackathon 2026',
    clubName: 'Google Developer Student Club',
    venueName: 'Kaveri Auditorium',
    sessionWindow: '28 Oct 2026, 09:00 - 29 Oct 2026, 18:00 IST',
    checkedInAt: '28 Oct 2026, 09:15 IST',
    facultyName: 'Dr. Ramesh Sharma',
    signature: '7f9a12c8b4e5f601a2b3c4d5e6f7a8b9',
    validationUrl: qrUrl,
    qrCodeBuffer: qrBuffer,
  });

  // 2. Generate OG PNG
  const ogPngBuffer = await renderOgCardPng({
    certId: '11111111-2222-3333-4444-555555555555',
    holderName: 'Sai Kumar',
    eventTitle: 'HackCampus National Hackathon 2026',
    clubName: 'Google Developer Student Club',
    kind: 'WINNER',
    rank: 1,
    issuedAt: new Date().toISOString(),
  });

  // Target directories: both C:\tmp and os.tmpdir() to cover all platform environments
  const targets = [
    path.resolve('/tmp'),
    os.tmpdir(),
  ];

  for (const dir of targets) {
    if (!fs.existsSync(dir)) {
      try {
        fs.mkdirSync(dir, { recursive: true });
      } catch (e) {
        // Ignore if directory creation fails on root
      }
    }

    try {
      const pdfPath = path.join(dir, 'od-sample.pdf');
      const pngPath = path.join(dir, 'og-sample.png');
      fs.writeFileSync(pdfPath, pdfBuffer);
      fs.writeFileSync(pngPath, ogPngBuffer);
      console.log(`Saved samples to ${dir}:`);
      console.log(`  - ${pdfPath} (${pdfBuffer.length} bytes)`);
      console.log(`  - ${pngPath} (${ogPngBuffer.length} bytes)`);
    } catch (err: any) {
      console.warn(`Could not write to ${dir}:`, err.message);
    }
  }

  // Verification checks
  const isPdf = pdfBuffer.toString('utf8', 0, 4) === '%PDF';
  const isPng =
    ogPngBuffer[0] === 0x89 &&
    ogPngBuffer[1] === 0x50 &&
    ogPngBuffer[2] === 0x4e &&
    ogPngBuffer[3] === 0x47;

  console.log(`Verification:`);
  console.log(`  OD PDF starts with %PDF: ${isPdf} (size: ${pdfBuffer.length} bytes)`);
  console.log(`  OG PNG has PNG magic header: ${isPng} (size: ${ogPngBuffer.length} bytes)`);

  if (!isPdf || !isPng) {
    throw new Error('Generated samples failed verification checks!');
  }

  console.log('Sample generation completed successfully.');
}

main().catch((err) => {
  console.error('Failed to generate samples:', err);
  process.exit(1);
});
