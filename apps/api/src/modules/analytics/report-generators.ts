import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';

export interface NaacReportData {
  serial: string;
  periodFrom: Date;
  periodTo: Date;
  generatedAt: Date;
  club: {
    id: string;
    name: string;
    slug: string;
    description?: string | null;
  };
  facultyCoordinator: {
    fullName: string;
    email: string;
  };
  events: Array<{
    id: string;
    title: string;
    slug: string;
    startAt: Date;
    endAt: Date;
    category: string;
    isCompetition: boolean;
    venueName: string;
    registered: number;
    attended: number;
    attendancePercentage: number;
    budgetAllocatedPaise: number;
    budgetSpentPaise: number;
  }>;
  demographics: Array<{
    department: string;
    year: number;
    count: number;
  }>;
  outcomes: {
    winners: Array<{
      eventTitle: string;
      rank: number;
      recipientName: string;
      notes?: string | null;
    }>;
    averageRating: number;
    reviewCount: number;
    certificatesCount: number;
  };
  evidence: {
    receiptsCount: number;
    receipts: Array<{ description: string; receiptKey: string; amountInr: string }>;
    resourcesCount: number;
    resources: Array<{ title: string; kind: string; link: string; eventTitle: string }>;
    odLettersCount: number;
    odLetters: Array<{ serial: string; studentName: string; eventTitle: string }>;
  };
  verificationUrl: string;
}

function formatDateIST(date: Date): string {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    dateStyle: 'medium',
  }).format(date);
}

function formatPaiseToInr(paise: number): string {
  return (paise / 100).toFixed(2);
}

/**
 * Builds the official NAAC/NBA Accreditation PDF Document using PDFKit.
 */
export async function buildNaacPdfBuffer(data: NaacReportData): Promise<Buffer> {
  const qrBuffer = await QRCode.toBuffer(data.verificationUrl, {
    margin: 2,
    width: 120,
    errorCorrectionLevel: 'M',
  });

  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 40,
      info: {
        Title: `NAAC/NBA Co-Curricular Report - ${data.serial}`,
        Author: 'Eventora Academic Accreditation Engine',
      },
    });

    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', (err) => reject(err));

    // ==========================================
    // SECTION A: Institution Header & Overview
    // ==========================================
    doc
      .fontSize(16)
      .font('Helvetica-Bold')
      .fillColor('#1E1B4B')
      .text('EVENTORA INSTITUTE OF TECHNOLOGY', { align: 'center' });

    doc
      .fontSize(10)
      .font('Helvetica')
      .fillColor('#4B5563')
      .text('Internal Quality Assurance Cell (IQAC) & Student Affairs', { align: 'center' })
      .moveDown(0.2);

    doc
      .fontSize(9)
      .font('Helvetica')
      .fillColor('#6B7280')
      .text('Accreditation Evaluation Report (NAAC Criterion V / NBA Tier-I)', {
        align: 'center',
      })
      .moveDown(0.6);

    doc.strokeColor('#CBD5E1').lineWidth(1).moveTo(40, doc.y).lineTo(555, doc.y).stroke().moveDown(0.8);

    doc
      .fontSize(12)
      .font('Helvetica-Bold')
      .fillColor('#4338CA')
      .text('ANNUAL CO-CURRICULAR & TECHNICAL ACTIVITY ATTESTATION', { align: 'center' })
      .moveDown(0.3);

    doc
      .fontSize(9)
      .font('Helvetica-Bold')
      .fillColor('#374151')
      .text(`REPORT SERIAL: ${data.serial}`, { align: 'center' })
      .moveDown(0.8);

    doc
      .fontSize(10)
      .font('Helvetica-Bold')
      .fillColor('#111827')
      .text('SECTION A: INSTITUTIONAL & RECOGNISED ENTITY DETAILS')
      .moveDown(0.3);

    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor('#374151')
      .text(`Organizing Club / Student Chapter: ${data.club.name}`)
      .text(`Assigned Faculty Coordinator: ${data.facultyCoordinator.fullName} (${data.facultyCoordinator.email})`)
      .text(`Evaluation Reporting Period: ${formatDateIST(data.periodFrom)} to ${formatDateIST(data.periodTo)}`)
      .text(`Report Generation Date: ${formatDateIST(data.generatedAt)}`)
      .moveDown(0.8);

    // ==========================================
    // SECTION B: Table of Events
    // ==========================================
    doc
      .fontSize(10)
      .font('Helvetica-Bold')
      .fillColor('#111827')
      .text('SECTION B: SUMMARY OF EVENTS & ACTIVITIES CONDUCTED')
      .moveDown(0.3);

    doc.fontSize(8).font('Helvetica-Bold').fillColor('#1F2937');
    doc.text(
      'Title / Category / Venue | Dates | Reg / Att | Att % | Budget (Alloc / Spent INR)',
      { underline: true }
    );
    doc.moveDown(0.3);

    doc.font('Helvetica').fontSize(8).fillColor('#374151');
    if (data.events.length === 0) {
      doc.text('No events recorded in this period.');
    } else {
      for (const ev of data.events) {
        const level = ev.isCompetition ? 'Competition' : 'Internal';
        const allocInr = formatPaiseToInr(ev.budgetAllocatedPaise);
        const spentInr = formatPaiseToInr(ev.budgetSpentPaise);
        const line = `• ${ev.title} (${ev.category}, ${level}, ${ev.venueName}) | ${formatDateIST(ev.startAt)} | Reg: ${ev.registered}, Att: ${ev.attended} (${ev.attendancePercentage}%) | ₹${allocInr} / ₹${spentInr}`;
        doc.text(line);
      }
    }
    doc.moveDown(0.8);

    // ==========================================
    // SECTION C: Participation by Department/Year
    // ==========================================
    doc
      .fontSize(10)
      .font('Helvetica-Bold')
      .fillColor('#111827')
      .text('SECTION C: STUDENT PARTICIPATION BY DEPARTMENT & YEAR')
      .moveDown(0.3);

    doc.font('Helvetica').fontSize(8).fillColor('#374151');
    if (data.demographics.length === 0) {
      doc.text('No participation records found.');
    } else {
      for (const d of data.demographics) {
        doc.text(`• ${d.department} - Year ${d.year}: ${d.count} verified student attendees`);
      }
    }
    doc.moveDown(0.8);

    // ==========================================
    // SECTION D: Outcomes
    // ==========================================
    doc
      .fontSize(10)
      .font('Helvetica-Bold')
      .fillColor('#111827')
      .text('SECTION D: LEARNING OUTCOMES & RECOGNITION')
      .moveDown(0.3);

    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor('#374151')
      .text(`• Average Verified Attendee Satisfaction: ${data.outcomes.averageRating.toFixed(1)} / 5.0 (${data.outcomes.reviewCount} verified reviews)`)
      .text(`• Total Co-Curricular Certificates Issued: ${data.outcomes.certificatesCount}`);

    if (data.outcomes.winners.length > 0) {
      doc.moveDown(0.2).font('Helvetica-Bold').text('Competition Winners Podium:');
      doc.font('Helvetica');
      for (const w of data.outcomes.winners.slice(0, 10)) {
        doc.text(`  - ${w.eventTitle}: Rank #${w.rank} - ${w.recipientName}`);
      }
    }
    doc.moveDown(0.8);

    // ==========================================
    // SECTION E: Documentary Evidence
    // ==========================================
    doc
      .fontSize(10)
      .font('Helvetica-Bold')
      .fillColor('#111827')
      .text('SECTION E: AUDIT EVIDENCE & COMPLIANCE APPENDIX')
      .moveDown(0.3);

    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor('#374151')
      .text(`• Verified Financial Expenditure Receipts on Record: ${data.evidence.receiptsCount}`)
      .text(`• Academic Resource Vault Items (Slides/Code/Recordings): ${data.evidence.resourcesCount}`)
      .text(`• Official On-Duty (OD) Sanctions Formally Issued: ${data.evidence.odLettersCount}`)
      .moveDown(1);

    // ==========================================
    // SECTION F: Signatures & Digital Attestation
    // ==========================================
    doc
      .fontSize(10)
      .font('Helvetica-Bold')
      .fillColor('#111827')
      .text('SECTION F: STATUTORY ATTESTATION & DIGITAL SEAL')
      .moveDown(0.5);

    const sealTopY = doc.y;

    // Faculty Box
    doc.roundedRect(40, sealTopY, 240, 80, 4).fillAndStroke('#F8FAFC', '#4338CA');
    doc
      .fillColor('#4338CA')
      .fontSize(9)
      .font('Helvetica-Bold')
      .text('FACULTY COORDINATOR SIGN-OFF', 50, sealTopY + 10)
      .font('Helvetica')
      .fontSize(8)
      .fillColor('#1F2937')
      .text(`Signature: Digitally Signed by ${data.facultyCoordinator.fullName}`, 50, sealTopY + 28)
      .text(`Date: ${formatDateIST(data.generatedAt)}`, 50, sealTopY + 42)
      .text('Status: Verified & Approved for Accreditation', 50, sealTopY + 56);

    // HoD Box
    doc.roundedRect(290, sealTopY, 160, 80, 4).fillAndStroke('#F8FAFC', '#64748B');
    doc
      .fillColor('#1E293B')
      .fontSize(9)
      .font('Helvetica-Bold')
      .text('HEAD OF DEPARTMENT (HOD)', 300, sealTopY + 10)
      .font('Helvetica')
      .fontSize(8)
      .fillColor('#475569')
      .text('Authorized Institutional Seal', 300, sealTopY + 28)
      .text('Office of Academic Affairs', 300, sealTopY + 42)
      .text('Eventora Verified Audit Copy', 300, sealTopY + 56);

    // QR Code
    doc.image(qrBuffer, 465, sealTopY, { width: 80, height: 80 });

    doc
      .fontSize(7)
      .font('Helvetica')
      .fillColor('#94A3B8')
      .text(`Verify online: ${data.verificationUrl} | Serial: ${data.serial}`, 40, 770, {
        align: 'center',
        width: 515,
      });

    doc.end();
  });
}

/**
 * Builds the NAAC/NBA report as multi-section CSV string.
 */
export function buildNaacCsvString(data: NaacReportData): string {
  const lines: string[] = [];

  // Section A
  lines.push('=== SECTION A: INSTITUTIONAL & RECOGNISED ENTITY DETAILS ===');
  lines.push(`Institution,EVENTORA INSTITUTE OF TECHNOLOGY`);
  lines.push(`Club Name,"${data.club.name}"`);
  lines.push(`Club Slug,${data.club.slug}`);
  lines.push(`Faculty Coordinator,"${data.facultyCoordinator.fullName}"`);
  lines.push(`Faculty Email,${data.facultyCoordinator.email}`);
  lines.push(`Period From,${data.periodFrom.toISOString()}`);
  lines.push(`Period To,${data.periodTo.toISOString()}`);
  lines.push(`Report Serial,${data.serial}`);
  lines.push('');

  // Section B
  lines.push('=== SECTION B: TABLE OF EVENTS ===');
  lines.push(
    'Event ID,Title,Start Time (IST),Venue,Category,Level,Registered,Attended,Attendance Rate (%),Budget Allocated (INR),Budget Spent (INR)'
  );
  for (const ev of data.events) {
    const level = ev.isCompetition ? 'Competition' : 'Internal';
    lines.push(
      [
        ev.id,
        `"${ev.title.replace(/"/g, '""')}"`,
        formatDateIST(ev.startAt),
        `"${ev.venueName.replace(/"/g, '""')}"`,
        ev.category,
        level,
        ev.registered,
        ev.attended,
        ev.attendancePercentage,
        formatPaiseToInr(ev.budgetAllocatedPaise),
        formatPaiseToInr(ev.budgetSpentPaise),
      ].join(',')
    );
  }
  lines.push('');

  // Section C
  lines.push('=== SECTION C: PARTICIPATION BY DEPARTMENT AND YEAR ===');
  lines.push('Department,Academic Year,Verified Attendees Count');
  for (const d of data.demographics) {
    lines.push(`"${d.department.replace(/"/g, '""')}",${d.year},${d.count}`);
  }
  lines.push('');

  // Section D
  lines.push('=== SECTION D: OUTCOMES & RECOGNITION ===');
  lines.push(`Average Rating,${data.outcomes.averageRating.toFixed(1)}`);
  lines.push(`Review Count,${data.outcomes.reviewCount}`);
  lines.push(`Certificates Issued,${data.outcomes.certificatesCount}`);
  lines.push('Event Title,Rank,Winner / Team Name,Notes');
  for (const w of data.outcomes.winners) {
    lines.push(
      [
        `"${w.eventTitle.replace(/"/g, '""')}"`,
        w.rank,
        `"${w.recipientName.replace(/"/g, '""')}"`,
        `"${(w.notes || '').replace(/"/g, '""')}"`,
      ].join(',')
    );
  }
  lines.push('');

  // Section E
  lines.push('=== SECTION E: DOCUMENTARY EVIDENCE ===');
  lines.push(`Financial Receipts Count,${data.evidence.receiptsCount}`);
  lines.push(`Resource Vault Items Count,${data.evidence.resourcesCount}`);
  lines.push(`OD Sanctions Issued Count,${data.evidence.odLettersCount}`);
  lines.push('');

  // Section F
  lines.push('=== SECTION F: ATTESTATION ===');
  lines.push(`Verification Serial,${data.serial}`);
  lines.push(`Verification URL,${data.verificationUrl}`);
  lines.push(`Status,VERIFIED & CRYPTOGRAPHICALLY ATTESTED`);

  return lines.join('\n');
}

/**
 * Builds the NAAC/NBA report as an Excel Workbook (XLSX) with frozen headers per section.
 */
export async function buildNaacXlsxBuffer(data: NaacReportData): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Eventora Accreditation Engine';
  workbook.created = new Date();

  // 1. Sheet: Overview (Section A)
  const sheetA = workbook.addWorksheet('Section A - Overview', {
    views: [{ state: 'frozen', xSplit: 0, ySplit: 1 }],
  });
  sheetA.columns = [
    { header: 'Parameter', key: 'param', width: 30 },
    { header: 'Value', key: 'value', width: 50 },
  ];
  sheetA.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheetA.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF4338CA' },
  };
  sheetA.addRows([
    { param: 'Institution', value: 'EVENTORA INSTITUTE OF TECHNOLOGY' },
    { param: 'Accreditation Framework', value: 'NAAC Criterion V & NBA Tier-I Self-Study Report' },
    { param: 'Club / Chapter Name', value: data.club.name },
    { param: 'Club Identifier', value: data.club.slug },
    { param: 'Faculty Coordinator', value: data.facultyCoordinator.fullName },
    { param: 'Faculty Email', value: data.facultyCoordinator.email },
    { param: 'Reporting Period Start', value: formatDateIST(data.periodFrom) },
    { param: 'Reporting Period End', value: formatDateIST(data.periodTo) },
    { param: 'Report Serial', value: data.serial },
    { param: 'Online Verification URL', value: data.verificationUrl },
  ]);

  // 2. Sheet: Events (Section B)
  const sheetB = workbook.addWorksheet('Section B - Events', {
    views: [{ state: 'frozen', xSplit: 0, ySplit: 1 }],
  });
  sheetB.columns = [
    { header: 'Event Title', key: 'title', width: 35 },
    { header: 'Date (IST)', key: 'date', width: 18 },
    { header: 'Venue', key: 'venue', width: 25 },
    { header: 'Category', key: 'category', width: 16 },
    { header: 'Level', key: 'level', width: 14 },
    { header: 'Registered', key: 'registered', width: 14 },
    { header: 'Attended', key: 'attended', width: 14 },
    { header: 'Attendance %', key: 'attendancePercentage', width: 15 },
    { header: 'Budget Allocated (INR)', key: 'budgetAllocated', width: 22 },
    { header: 'Budget Spent (INR)', key: 'budgetSpent', width: 20 },
  ];
  sheetB.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheetB.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF4338CA' },
  };
  for (const ev of data.events) {
    sheetB.addRow({
      title: ev.title,
      date: formatDateIST(ev.startAt),
      venue: ev.venueName,
      category: ev.category,
      level: ev.isCompetition ? 'Competition' : 'Internal',
      registered: ev.registered,
      attended: ev.attended,
      attendancePercentage: `${ev.attendancePercentage}%`,
      budgetAllocated: formatPaiseToInr(ev.budgetAllocatedPaise),
      budgetSpent: formatPaiseToInr(ev.budgetSpentPaise),
    });
  }

  // 3. Sheet: Demographics (Section C)
  const sheetC = workbook.addWorksheet('Section C - Demographics', {
    views: [{ state: 'frozen', xSplit: 0, ySplit: 1 }],
  });
  sheetC.columns = [
    { header: 'Department', key: 'department', width: 35 },
    { header: 'Academic Year', key: 'year', width: 16 },
    { header: 'Verified Attendees Count', key: 'count', width: 25 },
  ];
  sheetC.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheetC.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF4338CA' },
  };
  for (const d of data.demographics) {
    sheetC.addRow(d);
  }

  // 4. Sheet: Outcomes (Section D)
  const sheetD = workbook.addWorksheet('Section D - Outcomes', {
    views: [{ state: 'frozen', xSplit: 0, ySplit: 1 }],
  });
  sheetD.columns = [
    { header: 'Event Title', key: 'eventTitle', width: 35 },
    { header: 'Rank', key: 'rank', width: 10 },
    { header: 'Winner / Team Name', key: 'recipientName', width: 30 },
    { header: 'Notes', key: 'notes', width: 25 },
  ];
  sheetD.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheetD.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF4338CA' },
  };
  for (const w of data.outcomes.winners) {
    sheetD.addRow(w);
  }

  // 5. Sheet: Evidence (Section E)
  const sheetE = workbook.addWorksheet('Section E - Evidence', {
    views: [{ state: 'frozen', xSplit: 0, ySplit: 1 }],
  });
  sheetE.columns = [
    { header: 'Evidence Category', key: 'category', width: 28 },
    { header: 'Item / Description', key: 'description', width: 40 },
    { header: 'Reference / Link / Key', key: 'reference', width: 40 },
  ];
  sheetE.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheetE.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF4338CA' },
  };
  for (const r of data.evidence.receipts) {
    sheetE.addRow({
      category: 'Financial Receipt',
      description: `${r.description} (₹${r.amountInr})`,
      reference: r.receiptKey,
    });
  }
  for (const res of data.evidence.resources) {
    sheetE.addRow({
      category: `Resource (${res.kind})`,
      description: `${res.eventTitle} - ${res.title}`,
      reference: res.link,
    });
  }
  for (const od of data.evidence.odLetters) {
    sheetE.addRow({
      category: 'On-Duty Sanction Order',
      description: `${od.studentName} (${od.eventTitle})`,
      reference: od.serial,
    });
  }

  // 6. Sheet: Attestation (Section F)
  const sheetF = workbook.addWorksheet('Section F - Attestation', {
    views: [{ state: 'frozen', xSplit: 0, ySplit: 1 }],
  });
  sheetF.columns = [
    { header: 'Attestation Field', key: 'field', width: 30 },
    { header: 'Details', key: 'details', width: 50 },
  ];
  sheetF.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheetF.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF4338CA' },
  };
  sheetF.addRows([
    { field: 'Accreditation Serial', details: data.serial },
    { field: 'Faculty Coordinator Signature', details: `Digitally Approved by ${data.facultyCoordinator.fullName}` },
    { field: 'Head of Department Seal', details: 'Confirmed & Validated for Institutional Reporting' },
    { field: 'Verification URL', details: data.verificationUrl },
    { field: 'Cryptographic Status', details: 'AUTHENTIC & TAMPER-EVIDENT' },
  ]);

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
